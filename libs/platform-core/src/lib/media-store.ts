import { createHash } from 'node:crypto'

import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Phase01MediaLimits } from 'contracts'

import { purgeObjectVersions } from './media-retention.js'

export interface MediaStore {
	createUploadGrant(
		key: string,
		bytes: number,
		expiresIn: number,
		contentType: string,
	): Promise<{ url: string; method: 'PUT'; headers: Record<string, string> }>
	sealUpload(uploadKey: string, sealedKey: string, bytes: number, sha256: string, contentType: string): Promise<void>
	readPrivate(key: string, maxBytes: number, contentType?: string): Promise<Buffer>
	writePrivate(key: string, body: Buffer, contentType: string): Promise<void>
	deletePrivate(key: string): Promise<void>
	listPrivate(prefix: string): AsyncIterable<{ key: string; lastModified: Date }>
	createReadGrant(key: string, expiresIn: number): Promise<string>
}

export class S3MediaStore implements MediaStore {
	private readonly client: S3Client
	constructor(
		private readonly bucket: string,
		endpoint: string,
		region: string,
		accessKeyId: string,
		secretAccessKey: string,
	) {
		this.client = new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } })
	}

	static fromEnvironment(env: NodeJS.ProcessEnv = process.env): S3MediaStore | undefined {
		const bucket = env['MEDIA_S3_BUCKET']
		const endpoint = env['MEDIA_S3_ENDPOINT']
		const region = env['MEDIA_S3_REGION']
		const accessKeyId = env['MEDIA_S3_ACCESS_KEY_ID']
		const secretAccessKey = env['MEDIA_S3_SECRET_ACCESS_KEY']
		if (!bucket || !endpoint || !region || !accessKeyId || !secretAccessKey) return undefined
		return new S3MediaStore(bucket, endpoint, region, accessKeyId, secretAccessKey)
	}

	async createUploadGrant(key: string, bytes: number, expiresIn: number, contentType: string) {
		const url = await getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: bytes }), {
			expiresIn,
			signableHeaders: new Set(['content-type', 'content-length']),
		})
		return { url, method: 'PUT' as const, headers: { 'Content-Type': contentType } }
	}

	async sealUpload(uploadKey: string, sealedKey: string, bytes: number, sha256: string, contentType: string) {
		const body = await this.readPrivate(uploadKey, bytes, contentType)
		if (bytes > Phase01MediaLimits.maxUploadBytes || body.length !== bytes) throw new Error('Quarantine object admission failed.')
		if (contentType === 'video/mp4' && (body.length < 12 || body.toString('ascii', 4, 8) !== 'ftyp')) throw new Error('Quarantine object is not MP4.')
		if (contentType === 'image/jpeg' && (body.length < 4 || body[0] !== 0xff || body[1] !== 0xd8)) throw new Error('Quarantine object is not JPEG.')
		if (contentType === 'image/png' && (body.length < 8 || !body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))))
			throw new Error('Quarantine object is not PNG.')
		if (createHash('sha256').update(body).digest('hex') !== sha256) throw new Error('Quarantine object checksum mismatch.')
		await this.writePrivate(sealedKey, body, contentType)
	}

	async readPrivate(key: string, maxBytes: number, contentType = 'video/mp4') {
		const source = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
		if (!source.Body || source.ContentType !== contentType || !source.ContentLength || source.ContentLength > maxBytes)
			throw new Error('Private media object admission failed.')
		const chunks: Buffer[] = []
		let observedBytes = 0
		for await (const chunk of source.Body as AsyncIterable<Uint8Array>) {
			const part = Buffer.from(chunk)
			observedBytes += part.length
			if (observedBytes > maxBytes) throw new Error('Private media object exceeds limit.')
			chunks.push(part)
		}
		if (observedBytes !== source.ContentLength) throw new Error('Private media object size mismatch.')
		return Buffer.concat(chunks, observedBytes)
	}

	async writePrivate(key: string, body: Buffer, contentType: string) {
		await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }))
	}

	async deletePrivate(key: string) {
		await purgeObjectVersions(this.client, this.bucket, key)
	}

	async *listPrivate(prefix: string) {
		let continuationToken: string | undefined
		do {
			const page = await this.client.send(
				new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: continuationToken, MaxKeys: 1000 }),
			)
			for (const item of page.Contents ?? []) if (item.Key && item.LastModified) yield { key: item.Key, lastModified: item.LastModified }
			continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
		} while (continuationToken)
	}

	createReadGrant(key: string, expiresIn: number) {
		return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn })
	}
}
