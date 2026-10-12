import { createHash, randomUUID } from 'node:crypto'

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { S3MediaStore } from './media-store.js'

const endpoint = process.env['MEDIA_S3_ENDPOINT']
const bucket = process.env['MEDIA_S3_BUCKET']
const region = process.env['MEDIA_S3_REGION']
const accessKeyId = process.env['MEDIA_S3_ACCESS_KEY_ID']
const secretAccessKey = process.env['MEDIA_S3_SECRET_ACCESS_KEY']
const suite = process.env['FOUNDATION_INTEGRATION'] === '1' && endpoint && bucket && region && accessKeyId && secretAccessKey ? describe : describe.skip

suite('local S3 media quarantine', () => {
	it('rejects incorrect signed PUT size and seals only a checksum-matched private MP4 object', async () => {
		if (!endpoint || !bucket || !region || !accessKeyId || !secretAccessKey) throw new Error('Media store configuration missing.')
		const url = new URL(endpoint)
		if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Media integration requires loopback object storage.')
		const client = new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } })
		const store = new S3MediaStore(bucket, endpoint, region, accessKeyId, secretAccessKey)
		const id = randomUUID()
		const uploadKey = `quarantine/uploads/integration/${id}`
		const sealedKey = `quarantine/sealed/integration/${id}`
		const body = Buffer.from([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0])
		const sha256 = createHash('sha256').update(body).digest('hex')
		try {
			expect((await fetch(`${endpoint}/${bucket}?list-type=2&prefix=quarantine/`)).status).toBe(403)
			expect((await fetch(`${endpoint}/${bucket}/${uploadKey}`, { method: 'PUT', body: new Uint8Array(body) })).status).toBe(403)
			const upload = await store.createUploadGrant(uploadKey, body.length, 120, 'video/mp4')
			const put = (data: Buffer) => fetch(upload.url, { method: upload.method, headers: upload.headers, body: new Uint8Array(data) })
			expect((await put(Buffer.concat([body, body]))).ok).toBe(false)
			expect((await put(body)).ok).toBe(true)
			await expect(store.sealUpload(uploadKey, sealedKey, body.length, '0'.repeat(64), 'video/mp4')).rejects.toThrow('checksum')
			await store.sealUpload(uploadKey, sealedKey, body.length, sha256, 'video/mp4')
			const sealed = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: sealedKey }))
			expect(sealed.ContentLength).toBe(body.length)
			const listed: string[] = []
			for await (const object of store.listPrivate('quarantine/sealed/integration/')) listed.push(object.key)
			expect(listed).toContain(sealedKey)
			expect((await fetch(`${endpoint}/${bucket}/${sealedKey}`)).status).toBe(403)
			const readUrl = await store.createReadGrant(sealedKey, 120)
			const download = await fetch(readUrl)
			expect(download.status).toBe(200)
			expect(Buffer.from(await download.arrayBuffer())).toEqual(body)
			const tampered = new URL(readUrl)
			tampered.searchParams.set('X-Amz-Signature', '0'.repeat(64))
			expect((await fetch(tampered)).status).toBe(403)
			const expired = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: sealedKey }), {
				expiresIn: 60,
				signingDate: new Date(Date.now() - 120_000),
			})
			expect((await fetch(expired)).status).toBe(403)
			await store.deletePrivate(sealedKey)
			expect((await fetch(readUrl)).status).toBe(404)
		} finally {
			try {
				await Promise.all([uploadKey, sealedKey].map((Key) => client.send(new DeleteObjectCommand({ Bucket: bucket, Key }))))
				for (const Key of [uploadKey, sealedKey])
					await expect(client.send(new HeadObjectCommand({ Bucket: bucket, Key }))).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } })
			} finally {
				client.destroy()
			}
		}
	})
})
