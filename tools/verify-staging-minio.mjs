import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../libs/platform-core/package.json', import.meta.url))
const { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

function required(name) {
	const value = process.env[name]?.trim()
	if (!value) throw new Error(`${name} is required for MinIO verification.`)
	return value
}

function assertPrivateStagingEndpoint(value) {
	const endpoint = new URL(value)
	const hostname = endpoint.hostname.toLowerCase()
	if (endpoint.protocol !== 'https:' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')) {
		throw new Error('MEDIA_S3_ENDPOINT must be the private staging HTTPS MinIO origin.')
	}
	return endpoint.toString()
}

if (process.env['JUNCTION_RUNTIME_MODE'] !== 'staging') throw new Error('MinIO verification runs only in private staging.')

const client = new S3Client({
	endpoint: assertPrivateStagingEndpoint(required('MEDIA_S3_ENDPOINT')),
	region: required('MEDIA_S3_REGION'),
	forcePathStyle: true,
	credentials: {
		accessKeyId: required('MEDIA_S3_ACCESS_KEY_ID'),
		secretAccessKey: required('MEDIA_S3_SECRET_ACCESS_KEY'),
	},
})
const bucket = required('MEDIA_S3_BUCKET')
const key = `staging-verification/${randomUUID()}.txt`
const payload = 'Project Junction private staging MinIO verification\n'

try {
	const putUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: 'text/plain' }), { expiresIn: 60 })
	const upload = await fetch(putUrl, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: payload })
	if (!upload.ok) throw new Error(`Presigned MinIO upload failed with HTTP ${upload.status}.`)

	const getUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 60 })
	const download = await fetch(getUrl)
	if (!download.ok || (await download.text()) !== payload) throw new Error(`Presigned MinIO download failed with HTTP ${download.status}.`)

	await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
	const afterDelete = await fetch(getUrl)
	if (afterDelete.status !== 404) throw new Error(`Deleted MinIO object remained readable with HTTP ${afterDelete.status}.`)

	console.log('Staging MinIO presigned upload, download, and deletion verification passed.')
} finally {
	await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined)
}
