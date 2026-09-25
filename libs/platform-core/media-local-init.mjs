import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'

const endpoint = process.env.MEDIA_S3_ENDPOINT
const bucket = process.env.MEDIA_S3_BUCKET
const accessKeyId = process.env.MEDIA_S3_ACCESS_KEY_ID
const secretAccessKey = process.env.MEDIA_S3_SECRET_ACCESS_KEY
const region = process.env.MEDIA_S3_REGION
if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !region) throw new Error('Local media S3 configuration is incomplete.')
const url = new URL(endpoint)
if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('This initializer only operates on a loopback object store.')

const client = new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } })
try {
	try {
		await client.send(new HeadBucketCommand({ Bucket: bucket }))
	} catch (error) {
		if (error?.$metadata?.httpStatusCode !== 404) throw error
		await client.send(new CreateBucketCommand({ Bucket: bucket }))
	}
	process.stdout.write(`Local private media bucket ${bucket} is ready.\n`)
} finally {
	client.destroy()
}
