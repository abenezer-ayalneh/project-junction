import { createRequire } from 'node:module'
import { PostgresFoundation, S3DeletionJournal, purgeMediaCopy } from '../libs/platform-core/dist/index.js'

const require = createRequire(new URL('../libs/platform-core/package.json', import.meta.url))
const { S3Client } = require('@aws-sdk/client-s3')
const operation = process.argv[2]
if (!['rotate', 'restore'].includes(operation) || process.argv.length !== 3) throw new Error('Usage: node tools/reconcile-media-backups.mjs rotate|restore')
function loopback(value, name) {
	if (!value || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname)) throw new Error(`${name} must target local loopback storage.`)
}
loopback(process.env.MEDIA_S3_ENDPOINT, 'MEDIA_S3_ENDPOINT')
loopback(process.env.MEDIA_DELETION_JOURNAL_ENDPOINT ?? process.env.MEDIA_S3_ENDPOINT, 'MEDIA_DELETION_JOURNAL_ENDPOINT')
const journal = S3DeletionJournal.fromEnvironment()
if (!journal) throw new Error('Independent deletion journal configuration is required.')
const bucket = operation === 'rotate' ? process.env.MEDIA_BACKUP_BUCKET : process.env.MEDIA_S3_BUCKET
if (!bucket || bucket === process.env.MEDIA_DELETION_JOURNAL_BUCKET) throw new Error('Use a media-copy bucket distinct from the deletion journal.')
if (operation === 'rotate' && bucket === process.env.MEDIA_S3_BUCKET) throw new Error('Rotation requires a distinct MEDIA_BACKUP_BUCKET.')
if (operation === 'restore') {
	loopback(process.env.DATABASE_URL, 'DATABASE_URL')
	if (process.env.MEDIA_RECOVERY_ISOLATED !== '1')
		throw new Error('Fence all application/worker traffic and set MEDIA_RECOVERY_ISOLATED=1 before restore reconciliation.')
	const schema = new URL(process.env.DATABASE_URL).searchParams.get('schema')
	if (!schema || schema === 'public') throw new Error('Local restore reconciliation requires an explicit disposable recovery schema.')
}
const client = new S3Client({
	endpoint: process.env.MEDIA_S3_ENDPOINT,
	region: process.env.MEDIA_S3_REGION,
	forcePathStyle: true,
	credentials: { accessKeyId: process.env.MEDIA_S3_ACCESS_KEY_ID, secretAccessKey: process.env.MEDIA_S3_SECRET_ACCESS_KEY },
})
let db
try {
	const copies = await purgeMediaCopy(client, bucket, journal)
	if (operation === 'restore') {
		db = new PostgresFoundation(process.env.DATABASE_URL, undefined, undefined, undefined, journal)
		console.log(JSON.stringify({ operation, ...copies, ...(await db.reconcileRestoredMedia()) }))
	} else console.log(JSON.stringify({ operation, ...copies }))
} finally {
	await db?.close()
	client.destroy()
}
