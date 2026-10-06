import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { Phase01MediaLimits } from 'contracts'

const execFileAsync = promisify(execFile)
const probeTimeoutMs = 15_000
const transformTimeoutMs = 120_000
const maxProcessedBytes = 25 * 1024 * 1024
const maxPosterBytes = 2 * 1024 * 1024

export class MediaRejectedError extends Error {}

export interface MalwareScanner {
	scan(body: Buffer): Promise<'clean' | 'infected'>
}

export class ClamdScanner implements MalwareScanner {
	constructor(
		private readonly host: string,
		private readonly port: number,
	) {}

	scan(body: Buffer): Promise<'clean' | 'infected'> {
		return new Promise((resolve, reject) => {
			const socket = createConnection({ host: this.host, port: this.port })
			let settled = false
			let reply = Buffer.alloc(0)
			const finish = (error?: Error, verdict?: 'clean' | 'infected') => {
				if (settled) return
				settled = true
				socket.destroy()
				if (error) reject(error)
				else if (verdict) resolve(verdict)
				else reject(new Error('Malware scanner returned no verdict.'))
			}
			socket.setTimeout(90_000, () => finish(new Error('Malware scanner timed out.')))
			socket.once('error', (error) => finish(error))
			socket.once('close', () => finish(new Error('Malware scanner closed without a verdict.')))
			socket.on('data', (chunk: Buffer) => {
				reply = Buffer.concat([reply, chunk])
				if (reply.length > 4096) return finish(new Error('Malware scanner reply exceeded limit.'))
				const end = reply.indexOf(0)
				if (end < 0) return
				const verdict = reply.toString('utf8', 0, end)
				if (verdict === 'stream: OK') finish(undefined, 'clean')
				else if (/^stream: .+ FOUND$/.test(verdict)) finish(undefined, 'infected')
				else finish(new Error('Malware scanner returned an error.'))
			})
			socket.once('connect', () => {
				socket.write('zINSTREAM\0')
				for (let offset = 0; offset < body.length; offset += 1024 * 1024) {
					const part = body.subarray(offset, Math.min(offset + 1024 * 1024, body.length))
					const length = Buffer.alloc(4)
					length.writeUInt32BE(part.length)
					socket.write(length)
					socket.write(part)
				}
				socket.write(Buffer.alloc(4))
			})
		})
	}
}

interface VideoProbe {
	format?: { format_name?: string; duration?: string }
	streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; avg_frame_rate?: string }>
}

function seconds(value: string): number {
	const [hours, minutes, rest] = value.split(':')
	return Number(hours) * 3600 + Number(minutes) * 60 + Number(rest)
}

function validateCaptions(captions: string, duration: number) {
	if (!captions.startsWith('WEBVTT') || Buffer.byteLength(captions) > Phase01MediaLimits.maxCaptionBytes)
		throw new MediaRejectedError('Timed captions are invalid.')
	const lines = captions.replaceAll('\r\n', '\n').split('\n')
	const cueLines = lines.map((line, index) => ({ line, index })).filter(({ line }) => line.includes('-->'))
	if (cueLines.length === 0) throw new MediaRejectedError('Timed captions have no cues.')
	let previousEnd = 0
	for (const { line, index } of cueLines) {
		const match = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}\.\d{3})(?:\s+.*)?$/.exec(line)
		if (!match || !lines[index + 1]?.trim()) throw new MediaRejectedError('Timed caption cue is invalid.')
		const start = seconds(match[1])
		const end = seconds(match[2])
		if (start < previousEnd || end <= start || end > duration + 0.25) throw new MediaRejectedError('Timed caption cue is outside video duration.')
		previousEnd = end
	}
}

export class VideoProcessor {
	constructor(
		private readonly scanner: MalwareScanner,
		private readonly ffprobePath = 'ffprobe',
		private readonly ffmpegPath = 'ffmpeg',
	) {}

	static fromEnvironment(env: NodeJS.ProcessEnv = process.env): VideoProcessor | undefined {
		const host = env['MEDIA_CLAMD_HOST']
		const port = Number(env['MEDIA_CLAMD_PORT'])
		if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return undefined
		return new VideoProcessor(new ClamdScanner(host, port), env['MEDIA_FFPROBE_PATH'] || 'ffprobe', env['MEDIA_FFMPEG_PATH'] || 'ffmpeg')
	}

	private async probe(path: string): Promise<VideoProbe> {
		try {
			const { stdout } = await execFileAsync(
				this.ffprobePath,
				['-v', 'error', '-protocol_whitelist', 'file', '-show_format', '-show_streams', '-of', 'json', path],
				{ timeout: probeTimeoutMs, maxBuffer: 256 * 1024 },
			)
			return JSON.parse(stdout) as VideoProbe
		} catch {
			throw new MediaRejectedError('Video probe failed.')
		}
	}

	async process(input: { body: Buffer; captionText: string | null; noSpeechDeclared: boolean; description: string | null }) {
		if (input.body.length < 12 || input.body.length > Phase01MediaLimits.maxUploadBytes || input.body.toString('ascii', 4, 8) !== 'ftyp')
			throw new MediaRejectedError('Source is not an admitted MP4.')
		const scan = await this.scanner.scan(input.body)
		if (scan === 'infected') throw new MediaRejectedError('Malware was detected.')
		const directory = await mkdtemp(join(tmpdir(), 'junction-media-'))
		try {
			const sourcePath = join(directory, 'source.mp4')
			const outputPath = join(directory, 'processed.mp4')
			const posterPath = join(directory, 'poster.jpg')
			await writeFile(sourcePath, input.body, { mode: 0o600 })
			const probe = await this.probe(sourcePath)
			const streams = probe.streams ?? []
			const video = streams.filter((stream) => stream.codec_type === 'video')
			const audio = streams.filter((stream) => stream.codec_type === 'audio')
			const duration = Number(probe.format?.duration)
			if (
				!probe.format?.format_name?.split(',').includes('mp4') ||
				video.length !== 1 ||
				video[0].codec_name !== 'h264' ||
				audio.length > 1 ||
				audio.some((stream) => stream.codec_name !== 'aac') ||
				streams.length !== video.length + audio.length ||
				!Number.isFinite(duration) ||
				duration <= 0 ||
				duration > Phase01MediaLimits.maxDurationSeconds
			)
				throw new MediaRejectedError('Video format or duration exceeds the accepted profile.')
			const width = video[0].width ?? 0
			const height = video[0].height ?? 0
			const fps = video[0].avg_frame_rate?.split('/').map(Number) ?? []
			const framesPerSecond = fps.length === 2 && fps[1] > 0 ? fps[0] / fps[1] : 0
			if (
				Math.max(width, height) > Phase01MediaLimits.maxSourceWidth ||
				Math.min(width, height) > Phase01MediaLimits.maxSourceHeight ||
				width < 2 ||
				height < 2 ||
				framesPerSecond <= 0 ||
				framesPerSecond > 60
			)
				throw new MediaRejectedError('Video dimensions or frame rate exceed the accepted profile.')
			if (audio.length && !input.captionText) throw new MediaRejectedError('Audio requires timed captions.')
			if (!audio.length && !input.captionText && !(input.noSpeechDeclared && input.description?.length && input.description.length >= 10))
				throw new MediaRejectedError('Silent video requires a no-speech description.')
			if (input.captionText) validateCaptions(input.captionText, duration)
			const landscape = width >= height
			const maxWidth = landscape ? Phase01MediaLimits.maxProcessedLongEdge : Phase01MediaLimits.maxProcessedShortEdge
			const maxHeight = landscape ? Phase01MediaLimits.maxProcessedShortEdge : Phase01MediaLimits.maxProcessedLongEdge
			await execFileAsync(
				this.ffmpegPath,
				[
					'-hide_banner',
					'-nostdin',
					'-loglevel',
					'error',
					'-protocol_whitelist',
					'file',
					'-i',
					sourcePath,
					'-map',
					'0:v:0',
					'-map',
					'0:a:0?',
					'-vf',
					`scale=${maxWidth}:${maxHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
					'-c:v',
					'libx264',
					'-preset',
					'veryfast',
					'-crf',
					'26',
					'-pix_fmt',
					'yuv420p',
					'-c:a',
					'aac',
					'-b:a',
					'96k',
					'-threads',
					'1',
					'-filter_threads',
					'1',
					'-map_metadata',
					'-1',
					'-map_chapters',
					'-1',
					'-movflags',
					'+faststart',
					'-y',
					outputPath,
				],
				{ timeout: transformTimeoutMs, maxBuffer: 256 * 1024 },
			)
			await execFileAsync(
				this.ffmpegPath,
				[
					'-hide_banner',
					'-nostdin',
					'-loglevel',
					'error',
					'-protocol_whitelist',
					'file',
					'-i',
					outputPath,
					'-frames:v',
					'1',
					'-q:v',
					'4',
					'-map_metadata',
					'-1',
					'-y',
					posterPath,
				],
				{ timeout: probeTimeoutMs, maxBuffer: 256 * 1024 },
			)
			const [processed, poster] = await Promise.all([readFile(outputPath), readFile(posterPath)])
			if (processed.length < 12 || processed.length > maxProcessedBytes || processed.toString('ascii', 4, 8) !== 'ftyp')
				throw new MediaRejectedError('Processed video exceeded the output limit.')
			if (poster.length < 4 || poster.length > maxPosterBytes || poster[0] !== 0xff || poster[1] !== 0xd8)
				throw new MediaRejectedError('Poster failed safe output validation.')
			const outputProbe = await this.probe(outputPath)
			const outputVideo = outputProbe.streams?.find((stream) => stream.codec_type === 'video')
			if (
				!outputVideo ||
				outputVideo.codec_name !== 'h264' ||
				!outputVideo.width ||
				!outputVideo.height ||
				Math.max(outputVideo.width, outputVideo.height) > Phase01MediaLimits.maxProcessedLongEdge ||
				Math.min(outputVideo.width, outputVideo.height) > Phase01MediaLimits.maxProcessedShortEdge
			)
				throw new MediaRejectedError('Processed video did not meet the rendition profile.')
			return {
				processed,
				poster,
				durationSeconds: duration,
				sourceWidth: width,
				sourceHeight: height,
				outputWidth: outputVideo.width,
				outputHeight: outputVideo.height,
				hasAudio: audio.length > 0,
			}
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	}
}
