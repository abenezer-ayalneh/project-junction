import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { PostgresFoundation, S3DeletionJournal, S3MediaStore, purgeMediaCopy } from '../libs/platform-core/dist/index.js'

const require = createRequire(new URL('../libs/platform-core/package.json', import.meta.url))
const { S3Client, CreateBucketCommand, DeleteBucketCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3')

export async function createMediaRestoreFixture(pool, databaseUrl, ids) {
	const endpoint = process.env.MEDIA_S3_ENDPOINT
	if (!endpoint || !['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname)) throw new Error('Media restore rehearsal requires loopback MinIO.')
	const store = S3MediaStore.fromEnvironment()
	if (!store) throw new Error('Media restore rehearsal requires local MinIO configuration.')
	const client = new S3Client({
		endpoint,
		region: process.env.MEDIA_S3_REGION,
		forcePathStyle: true,
		credentials: { accessKeyId: process.env.MEDIA_S3_ACCESS_KEY_ID, secretAccessKey: process.env.MEDIA_S3_SECRET_ACCESS_KEY },
	})
	const bucket = `restore-journal-${randomUUID()}`
	const mediaId = randomUUID()
	const listingId = randomUUID()
	const key = `quarantine/uploads/${mediaId}`
	const journal = new S3DeletionJournal(client, bucket)
	const foundation = new PostgresFoundation(databaseUrl, undefined, store, undefined, journal)
	const body = Buffer.from('Disposable rejected-media restore fixture')
	let created = false
	async function dispose() {
		try {
			await store.deletePrivate(key)
			if (created) {
				const page = await client.send(new ListObjectsV2Command({ Bucket: bucket }))
				for (const object of page.Contents ?? []) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: object.Key }))
				await client.send(new DeleteBucketCommand({ Bucket: bucket }))
			}
		} finally {
			await foundation.close()
			client.destroy()
		}
	}
	try {
		await client.send(new CreateBucketCommand({ Bucket: bucket }))
		created = true
		await foundation.db.listing.create({
			data: {
				id: listingId,
				vendorId: ids.vendor,
				kind: 'product',
				category: 'goods',
				title: 'Restore fixture',
				description: 'Synthetic rejected-media restore fixture',
				priceCents: 1000,
			},
		})
		await foundation.db.mediaAsset.create({
			data: {
				id: mediaId,
				listingId,
				kind: 'listing_image',
				state: 'rejected',
				uploadKey: key,
				rejectedAt: new Date(Date.now() - 31 * 86400000),
				retentionDueAt: new Date(Date.now() - 86400000),
				retentionPolicy: 'rejected-media-v1',
			},
		})
		await store.writePrivate(key, body, 'application/octet-stream')
		return {
			async deleteAfterBackup() {
				assert.deepEqual(await foundation.cleanupRejectedMedia(), { deleted: 1, failed: 0 })
				assert.ok(await journal.get(mediaId))
			},
			async reconcileAfterRestore() {
				// Rehydrate bytes from the older media copy after the DB dump is restored.
				await store.writePrivate(key, body, 'application/octet-stream')
				await purgeMediaCopy(client, process.env.MEDIA_S3_BUCKET, journal)
				assert.deepEqual(await foundation.reconcileRestoredMedia(), { reconciled: 1 })
				assert.deepEqual(await foundation.reconcileRestoredMedia(), { reconciled: 0 })
				const { rows } = await pool.query('SELECT state,upload_key,retention_deleted_at FROM media_assets WHERE id=$1', [mediaId])
				assert.equal(rows[0].state, 'rejected')
				assert.equal(rows[0].upload_key, null)
				assert.ok(rows[0].retention_deleted_at)
				await assert.rejects(store.readPrivate(key, body.length, 'application/octet-stream'))
				process.stdout.write('Pre-deletion PostgreSQL dump and media restore reconciled against independent current journal.\n')
			},
			dispose,
		}
	} catch (error) {
		await dispose()
		throw error
	}
}
