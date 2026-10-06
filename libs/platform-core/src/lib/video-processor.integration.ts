import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { ClamdScanner, MediaRejectedError, VideoProcessor } from './video-processor.js'

const execFileAsync = promisify(execFile)
const host = process.env['MEDIA_CLAMD_HOST']
const port = Number(process.env['MEDIA_CLAMD_PORT'])
const suite = process.env['FOUNDATION_INTEGRATION'] === '1' && host && Number.isInteger(port) && port > 0 ? describe : describe.skip

suite('local ClamAV and bounded video processing', () => {
	it('requires timed captions for an AAC track and accepts a cue within duration', async () => {
		if (!host || !port) throw new Error('Local malware scanner is not configured.')
		const directory = await mkdtemp(join(tmpdir(), 'junction-caption-test-'))
		try {
			const sourcePath = join(directory, 'audio.mp4')
			await execFileAsync(
				'ffmpeg',
				[
					'-hide_banner',
					'-nostdin',
					'-loglevel',
					'error',
					'-f',
					'lavfi',
					'-i',
					'testsrc2=size=320x180:rate=24',
					'-f',
					'lavfi',
					'-i',
					'sine=frequency=440:sample_rate=44100',
					'-t',
					'1',
					'-c:v',
					'libx264',
					'-pix_fmt',
					'yuv420p',
					'-c:a',
					'aac',
					'-threads',
					'1',
					'-y',
					sourcePath,
				],
				{ timeout: 15_000 },
			)
			const body = await readFile(sourcePath)
			const processor = new VideoProcessor(new ClamdScanner(host, port))
			await expect(processor.process({ body, captionText: null, noSpeechDeclared: true, description: 'The source has an audio track.' })).rejects.toThrow(
				MediaRejectedError,
			)
			const output = await processor.process({
				body,
				captionText: 'WEBVTT\n\n00:00:00.000 --> 00:00:00.800\nA short tone.',
				noSpeechDeclared: false,
				description: null,
			})
			expect(output.hasAudio).toBe(true)
			expect(output.processed.toString('ascii', 4, 8)).toBe('ftyp')
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	})

	it('scans and transcodes a silent MP4 while rejecting infected and invalid-caption inputs', async () => {
		if (!host || !port) throw new Error('Local malware scanner is not configured.')
		const scanner = new ClamdScanner(host, port)
		const directory = await mkdtemp(join(tmpdir(), 'junction-video-test-'))
		try {
			const sourcePath = join(directory, 'fixture.mp4')
			await execFileAsync(
				'ffmpeg',
				[
					'-hide_banner',
					'-nostdin',
					'-loglevel',
					'error',
					'-f',
					'lavfi',
					'-i',
					'testsrc2=size=320x180:rate=24',
					'-t',
					'1',
					'-c:v',
					'libx264',
					'-pix_fmt',
					'yuv420p',
					'-threads',
					'1',
					'-y',
					sourcePath,
				],
				{ timeout: 15_000 },
			)
			const body = await readFile(sourcePath)
			const processor = new VideoProcessor(scanner)
			const output = await processor.process({ body, captionText: null, noSpeechDeclared: true, description: 'A silent color pattern demonstration.' })
			expect(output.processed.toString('ascii', 4, 8)).toBe('ftyp')
			expect(output.poster.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
			expect(output.hasAudio).toBe(false)
			expect(output.outputWidth).toBeLessThanOrEqual(1280)
			expect(output.outputHeight).toBeLessThanOrEqual(720)
			await expect(
				processor.process({ body, captionText: 'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nToo long', noSpeechDeclared: false, description: null }),
			).rejects.toThrow(MediaRejectedError)
			const eicar = Buffer.from(['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(''))
			expect(await scanner.scan(eicar)).toBe('infected')
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	})
})
