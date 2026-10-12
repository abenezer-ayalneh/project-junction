import { randomUUID } from 'node:crypto'

import {
	CreateBucketCommand,
	DeleteBucketCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	ListObjectVersionsCommand,
	PutBucketVersioningCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3'

import { purgeMediaCopy, S3DeletionJournal } from './media-retention.js'

const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('local rejected-media backup propagation', () => {
	it('preserves an independent immutable journal and removes all restored backup versions', async () => {
		const endpoint = process.env['MEDIA_S3_ENDPOINT']
		const accessKeyId = process.env['MEDIA_S3_ACCESS_KEY_ID']
		const secretAccessKey = process.env['MEDIA_S3_SECRET_ACCESS_KEY']
		if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error('Local MinIO configuration required.')
		if (!['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname)) throw new Error('Requires loopback MinIO.')
		const client = new S3Client({
			endpoint,
			region: process.env['MEDIA_S3_REGION'],
			forcePathStyle: true,
			credentials: { accessKeyId, secretAccessKey },
		})
		const journalBucket = `journal-${randomUUID()}`
		const backupBucket = `backup-${randomUUID()}`
		const mediaId = randomUUID()
		const key = `private/processed/${mediaId}/image`
		const neighbour = `private/processed/${randomUUID()}/image`
		const entry = {
			format: 1 as const,
			policy: 'rejected-media-v1' as const,
			mediaId,
			workspaceId: randomUUID(),
			decidedAt: new Date().toISOString(),
			keys: [key],
		}
		const journal = new S3DeletionJournal(client, journalBucket)
		const created: string[] = []
		try {
			for (const Bucket of [journalBucket, backupBucket]) {
				await client.send(new CreateBucketCommand({ Bucket }))
				created.push(Bucket)
			}
			await client.send(new PutBucketVersioningCommand({ Bucket: backupBucket, VersioningConfiguration: { Status: 'Enabled' } }))
			await journal.record(entry)
			await journal.record({ ...entry, decidedAt: new Date(Date.now() + 1000).toISOString() })
			expect(await journal.get(mediaId)).toEqual(entry)
			await expect(journal.record({ ...entry, keys: [`${key}-other`] })).rejects.toThrow('scope conflict')
			for (const Body of ['old backup', 'new backup']) await client.send(new PutObjectCommand({ Bucket: backupBucket, Key: key, Body }))
			await client.send(new PutObjectCommand({ Bucket: backupBucket, Key: neighbour, Body: 'Approved unaffected copy' }))
			await client.send(
				new PutObjectCommand({ Bucket: backupBucket, Key: `private/processed/${mediaId}/older-hash.jpg`, Body: 'Older rendition of rejected asset' }),
			)
			expect(await purgeMediaCopy(client, backupBucket, journal)).toEqual({ deletedVersions: 3 })
			expect(await purgeMediaCopy(client, backupBucket, journal)).toEqual({ deletedVersions: 0 })
			const remaining = await client.send(new ListObjectVersionsCommand({ Bucket: backupBucket }))
			expect(remaining.Versions?.map((object) => object.Key)).toEqual([neighbour])
			expect(remaining.DeleteMarkers ?? []).toHaveLength(0)
			expect(await journal.get(mediaId)).toEqual(entry)
			// Copying an older archive back in cannot resurrect the deleted key.
			await client.send(new PutObjectCommand({ Bucket: backupBucket, Key: key, Body: 'Restored old bytes' }))
			await purgeMediaCopy(client, backupBucket, journal)
			await expect(client.send(new GetObjectCommand({ Bucket: backupBucket, Key: key }))).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } })
		} finally {
			for (const Bucket of created) {
				const page = await client.send(new ListObjectVersionsCommand({ Bucket }))
				for (const object of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])])
					await client.send(new DeleteObjectCommand({ Bucket, Key: object.Key, VersionId: object.VersionId }))
				await client.send(new DeleteBucketCommand({ Bucket }))
			}
			client.destroy()
		}
	})
	it('refuses to report a locked backup as purged', async () => {
		const endpoint = process.env['MEDIA_S3_ENDPOINT']
		const accessKeyId = process.env['MEDIA_S3_ACCESS_KEY_ID']
		const secretAccessKey = process.env['MEDIA_S3_SECRET_ACCESS_KEY']
		if (!endpoint || !accessKeyId || !secretAccessKey || !['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname))
			throw new Error('Requires loopback MinIO configuration.')
		const client = new S3Client({ endpoint, region: process.env['MEDIA_S3_REGION'], forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } })
		const bucket = `locked-backup-${randomUUID()}`
		const key = `private/processed/${randomUUID()}/image`
		const entry = {
			format: 1 as const,
			policy: 'rejected-media-v1' as const,
			mediaId: randomUUID(),
			workspaceId: randomUUID(),
			decidedAt: new Date().toISOString(),
			keys: [key],
		}
		const journal = {
			record: () => Promise.reject(new Error('Read-only fixture journal')),
			get: () => Promise.resolve(entry),
			entries: async function* () {
				await Promise.resolve()
				yield entry
			},
		}
		let created = false
		try {
			await client.send(new CreateBucketCommand({ Bucket: bucket, ObjectLockEnabledForBucket: true }))
			created = true
			await client.send(
				new PutObjectCommand({
					Bucket: bucket,
					Key: key,
					Body: 'Disposable locked fixture',
					ObjectLockMode: 'GOVERNANCE',
					ObjectLockRetainUntilDate: new Date(Date.now() + 86400000),
				}),
			)
			await expect(purgeMediaCopy(client, bucket, journal)).rejects.toThrow(/locked|retention|WORM|protected/i)
			expect((await client.send(new ListObjectVersionsCommand({ Bucket: bucket }))).Versions?.map((object) => object.Key)).toEqual([key])
		} finally {
			// Bypass is used only to remove this test's synthetic governance-locked fixture.
			// The operational implementation never requests this permission.
			if (created) {
				const page = await client.send(new ListObjectVersionsCommand({ Bucket: bucket }))
				for (const object of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])])
					await client.send(
						new DeleteObjectCommand({ Bucket: bucket, Key: object.Key, VersionId: object.VersionId, BypassGovernanceRetention: true }),
					)
				await client.send(new DeleteBucketCommand({ Bucket: bucket }))
			}
			client.destroy()
		}
	})
})
