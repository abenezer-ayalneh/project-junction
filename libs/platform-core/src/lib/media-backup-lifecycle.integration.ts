import { execFile, spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

import {
	AbortMultipartUploadCommand,
	CreateBucketCommand,
	CreateMultipartUploadCommand,
	DeleteBucketCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	ListMultipartUploadsCommand,
	ListObjectVersionsCommand,
	ListPartsCommand,
	PutBucketVersioningCommand,
	PutObjectCommand,
	S3Client,
	UploadPartCommand,
} from '@aws-sdk/client-s3'
import { Pool } from 'pg'

import { decryptBackupArchive, MediaBackupLifecycle, type MediaBackupPolicy, mediaBackupPrefix } from './media-backup-lifecycle.js'
import { type DeletionJournal, S3DeletionJournal } from './media-retention.js'
import { PostgresFoundation } from './postgres-foundation.js'

const day = 86400000
const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip

async function fixture() {
	const endpoint = process.env['MEDIA_S3_ENDPOINT']
	if (!endpoint || !['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname)) throw new Error('Loopback MinIO required.')
	const client = new S3Client({
		endpoint,
		region: process.env['MEDIA_S3_REGION'],
		forcePathStyle: true,
		credentials: { accessKeyId: process.env['MEDIA_S3_ACCESS_KEY_ID'] ?? '', secretAccessKey: process.env['MEDIA_S3_SECRET_ACCESS_KEY'] ?? '' },
	})
	const sourceBucket = `backup-source-${randomUUID()}`
	const backupBucket = `backup-archive-${randomUUID()}`
	const catalogBucket = `backup-catalog-${randomUUID()}`
	const journalBucket = `backup-journal-${randomUUID()}`
	const recoveryBucket = `backup-recovery-${randomUUID()}`
	const key = randomBytes(32)
	const policy: MediaBackupPolicy = {
		version: 'local-test-v1',
		approvalReference: 'synthetic-fixture',
		maxAgeDays: 1,
		intervalSeconds: 1,
		lockDays: 0,
		keyId: 'test-key-v1',
	}
	const eligible = new Set<string>()
	const journal = new S3DeletionJournal(client, journalBucket)
	function controller(journalOverride: DeletionJournal = journal) {
		return new MediaBackupLifecycle(client, sourceBucket, client, backupBucket, catalogBucket, journalOverride, policy, key, journalBucket, () =>
			Promise.resolve(eligible),
		)
	}
	const created: string[] = []
	async function dispose() {
		try {
			for (const Bucket of created) {
				const uploads = await client.send(new ListMultipartUploadsCommand({ Bucket }))
				for (const upload of uploads.Uploads ?? []) {
					try {
						await client.send(new ListPartsCommand({ Bucket, Key: upload.Key, UploadId: upload.UploadId, MaxParts: 1 }))
						await client.send(new AbortMultipartUploadCommand({ Bucket, Key: upload.Key, UploadId: upload.UploadId }))
					} catch (error) {
						if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw error
					}
				}
				let marker: string | undefined
				let versionMarker: string | undefined
				const objects: { Key: string; VersionId?: string }[] = []
				do {
					const page = await client.send(new ListObjectVersionsCommand({ Bucket, KeyMarker: marker, VersionIdMarker: versionMarker }))
					for (const object of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])])
						if (object.Key) objects.push({ Key: object.Key, VersionId: object.VersionId })
					marker = page.IsTruncated ? page.NextKeyMarker : undefined
					versionMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined
				} while (marker)
				for (const object of objects) {
					// Only fixture teardown may bypass its synthetic governance lock.
					await client.send(new DeleteObjectCommand({ Bucket, ...object, ...(Bucket === backupBucket ? { BypassGovernanceRetention: true } : {}) }))
				}
				await client.send(new DeleteBucketCommand({ Bucket }))
			}
		} finally {
			client.destroy()
		}
	}
	try {
		for (const Bucket of [sourceBucket, backupBucket, catalogBucket, journalBucket, recoveryBucket]) {
			await client.send(new CreateBucketCommand({ Bucket, ...(Bucket === backupBucket ? { ObjectLockEnabledForBucket: true } : {}) }))
			created.push(Bucket)
		}
		await client.send(new PutBucketVersioningCommand({ Bucket: recoveryBucket, VersioningConfiguration: { Status: 'Enabled' } }))
		return {
			client,
			sourceBucket,
			backupBucket,
			catalogBucket,
			journalBucket,
			recoveryBucket,
			key,
			policy,
			eligible,
			journal,
			controller,
			dispose,
			async source(mediaId = randomUUID(), body = 'Synthetic media') {
				const sourceKey = `private/processed/${mediaId}/image.jpg`
				await client.send(new PutObjectCommand({ Bucket: sourceBucket, Key: sourceKey, Body: body }))
				eligible.add(sourceKey)
				return sourceKey
			},
			async read(bucket: string, objectKey: string) {
				const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }))
				if (!object.Body) throw new Error('Fixture object body missing.')
				return Buffer.from(await object.Body.transformToByteArray())
			},
		}
	} catch (error) {
		await dispose()
		throw error
	}
}

suite('local media backup lifecycle', () => {
	it('schedules encrypted copies, restores original bytes and excludes journaled and unowned source keys', async () => {
		const f = await fixture()
		try {
			const now = new Date()
			const deletedId = randomUUID()
			const deletedKey = await f.source(deletedId, 'Already deleted source restored from an old copy')
			await f.journal.record({
				format: 1,
				policy: 'rejected-media-v1',
				mediaId: deletedId,
				workspaceId: randomUUID(),
				decidedAt: now.toISOString(),
				keys: [deletedKey],
			})
			const goodKey = await f.source(undefined, 'Approved source bytes')
			await f.client.send(
				new PutObjectCommand({ Bucket: f.sourceBucket, Key: `private/processed/${randomUUID()}/unowned.jpg`, Body: 'Orphan or another namespace' }),
			)
			const controller = f.controller()
			expect(await controller.runScheduled(now)).toMatchObject({ created: true, failed: 0 })
			expect(await f.controller().runScheduled(now)).toMatchObject({ created: false, failed: 0 })
			const [generation] = await controller.generations()
			expect(generation.objectCount).toBe(1)
			const encryptedKey = `${mediaBackupPrefix(generation.id)}media/${goodKey}`
			expect((await f.read(f.backupBucket, encryptedKey)).includes(Buffer.from('Approved source bytes'))).toBe(false)
			expect(await controller.restore(generation.id, f.client, f.recoveryBucket, f.key, f.policy.keyId, now)).toEqual({ restored: 1 })
			expect((await f.read(f.recoveryBucket, goodKey)).toString()).toBe('Approved source bytes')
			const ciphertext = await f.read(f.backupBucket, encryptedKey)
			await f.client.send(new DeleteObjectCommand({ Bucket: f.backupBucket, Key: encryptedKey }))
			await expect(controller.restore(generation.id, f.client, f.recoveryBucket, f.key, f.policy.keyId, now)).rejects.toThrow()
			await f.client.send(new PutObjectCommand({ Bucket: f.backupBucket, Key: encryptedKey, Body: ciphertext }))
			await expect(controller.restore(generation.id, f.client, f.sourceBucket, f.key, f.policy.keyId, now)).rejects.toThrow('separate fenced')
			await expect(controller.restore(generation.id, f.client, f.recoveryBucket, f.key, 'wrong-key-id', now)).rejects.toThrow('another encryption key')
			await expect(controller.restore(generation.id, f.client, f.recoveryBucket, randomBytes(32), f.policy.keyId, now)).rejects.toThrow()
			const encrypted = await f.read(f.backupBucket, encryptedKey)
			encrypted[encrypted.length - 1] ^= 1
			await f.client.send(new PutObjectCommand({ Bucket: f.backupBucket, Key: encryptedKey, Body: encrypted }))
			await expect(controller.restore(generation.id, f.client, f.recoveryBucket, f.key, f.policy.keyId, now)).rejects.toThrow()
		} finally {
			await f.dispose()
		}
	})
	it('keeps a partial generation failed when referenced source bytes are absent and retries on the next schedule', async () => {
		const f = await fixture()
		try {
			const now = new Date()
			await f.source()
			const missingKey = `private/processed/${randomUUID()}/missing.jpg`
			f.eligible.add(missingKey)
			expect(await f.controller().runScheduled(now)).toMatchObject({ created: false, failed: 1 })
			const [failed] = await f.controller().generations()
			expect(failed.state).toBe('failed')
			await expect(f.controller().restore(failed.id, f.client, f.recoveryBucket, f.key, f.policy.keyId, now)).rejects.toThrow('incomplete')
			await f.client.send(new PutObjectCommand({ Bucket: f.sourceBucket, Key: missingKey, Body: 'Recovered synthetic bytes' }))
			expect(await f.controller().runScheduled(new Date(now.getTime() + 1000))).toMatchObject({ created: true, failed: 0 })
			expect((await f.controller().generations()).filter((entry) => entry.state === 'ready')).toHaveLength(1)
		} finally {
			await f.dispose()
		}
	})
	it('propagates new journal decisions into historical versions and expires media and opaque archives without deleting the source or journal', async () => {
		const f = await fixture()
		try {
			const now = new Date()
			const mediaId = randomUUID()
			const sourceKey = await f.source(mediaId)
			const controller = f.controller()
			const generation = await controller.createCopy(now)
			const archive = await controller.importArchive(Buffer.from('Opaque database/media bundle'), now)
			expect((await f.read(f.backupBucket, `${mediaBackupPrefix(archive.id)}archive.enc`)).includes(Buffer.from('Opaque database/media bundle'))).toBe(
				false,
			)
			const copyKey = `${mediaBackupPrefix(generation.id)}media/${sourceKey}`
			await f.client.send(new PutObjectCommand({ Bucket: f.backupBucket, Key: copyKey, Body: 'Older copied version' }))
			await f.client.send(new DeleteObjectCommand({ Bucket: f.backupBucket, Key: copyKey }))
			await f.journal.record({
				format: 1,
				policy: 'rejected-media-v1',
				mediaId,
				workspaceId: randomUUID(),
				decidedAt: now.toISOString(),
				keys: [sourceKey],
			})
			expect(await f.controller().sweep(now)).toMatchObject({ reconciled: 1, expired: 0, failed: 0 })
			expect((await f.client.send(new ListObjectVersionsCommand({ Bucket: f.backupBucket, Prefix: copyKey }))).Versions ?? []).toHaveLength(0)
			await expect(controller.restore(archive.id, f.client, f.recoveryBucket, f.key, f.policy.keyId, now)).rejects.toThrow('unavailable')
			const expires = new Date(now.getTime() + day)
			await expect(controller.restore(generation.id, f.client, f.recoveryBucket, f.key, f.policy.keyId, expires)).rejects.toThrow('expired')
			expect(await f.controller().sweep(expires)).toMatchObject({ expired: 2, failed: 0 })
			expect(await f.controller().sweep(expires)).toMatchObject({ expired: 0, failed: 0 })
			// Recopying bytes under an already expired generation never renews its lifetime.
			await f.client.send(
				new PutObjectCommand({ Bucket: f.backupBucket, Key: `${mediaBackupPrefix(archive.id)}archive.enc`, Body: 'Stale external recopy' }),
			)
			expect(await f.controller().sweep(expires)).toMatchObject({ expired: 1, failed: 0 })
			expect((await f.client.send(new ListObjectVersionsCommand({ Bucket: f.backupBucket }))).Versions ?? []).toHaveLength(0)
			expect(await f.journal.get(mediaId)).toBeDefined()
			expect((await f.read(f.sourceBucket, sourceKey)).toString()).toBe('Synthetic media')
		} finally {
			await f.dispose()
		}
	})
	it('preserves held generations, audits release and expires them against their original deadline', async () => {
		const f = await fixture()
		try {
			const now = new Date()
			const controller = f.controller()
			const held = await controller.importArchive(Buffer.from('Scoped synthetic evidence archive'), now)
			const other = await controller.importArchive(Buffer.from('Unheld synthetic archive'), now)
			await controller.setHold(held.id, 'Active evidence case', 'Preserve case 123', now)
			const afterExpiry = new Date(now.getTime() + day + 1)
			expect(await f.controller().sweep(afterExpiry)).toMatchObject({ expired: 1, held: 1, failed: 0 })
			expect((await f.controller().generations()).find((entry) => entry.id === other.id)?.state).toBe('expired')
			const released = await controller.setHold(held.id, null, 'Case 123 resolved', afterExpiry)
			expect(released.expiresAt).toBe(held.expiresAt)
			expect(await f.controller().sweep(afterExpiry)).toMatchObject({ expired: 1, failed: 0 })
			await expect(controller.setHold(held.id, 'Too late', 'Too late', afterExpiry)).rejects.toThrow('irreversible')
		} finally {
			await f.dispose()
		}
	})
	it('persists blocked expiry and retries after real Object Lock expiry without a governance bypass', async () => {
		const f = await fixture()
		try {
			const now = new Date()
			const old = new Date(now.getTime() - 2 * day)
			const controller = f.controller()
			const generation = await controller.importArchive(Buffer.from('Locked synthetic archive'), old)
			const objectKey = `${mediaBackupPrefix(generation.id)}archive.enc`
			const until = new Date(Date.now() + 4000)
			await f.client.send(
				new PutObjectCommand({
					Bucket: f.backupBucket,
					Key: objectKey,
					Body: await f.read(f.backupBucket, objectKey),
					ObjectLockMode: 'GOVERNANCE',
					ObjectLockRetainUntilDate: until,
				}),
			)
			expect(await controller.sweep(now)).toMatchObject({ expired: 0, failed: 1 })
			const [blocked] = await f.controller().generations()
			expect(blocked).toMatchObject({ state: 'expiring', lastError: 'storage-operation-failed' })
			expect(blocked.nextAttemptAt).not.toBeNull()
			await expect(controller.setHold(generation.id, 'Late hold', 'Late hold')).rejects.toThrow('irreversible')
			await delay(Math.max(1, until.getTime() - Date.now() + 300))
			expect(await f.controller().sweep()).toMatchObject({ expired: 1, failed: 0 })
			expect((await f.client.send(new ListObjectVersionsCommand({ Bucket: f.backupBucket }))).Versions ?? []).toHaveLength(0)
		} finally {
			await f.dispose()
		}
	}, 15000)
	it('fails closed on journal outage and invalid manifest lifetimes', async () => {
		const f = await fixture()
		try {
			const unavailable: DeletionJournal = {
				record: () => Promise.reject(new Error('Journal offline')),
				get: () => Promise.reject(new Error('Journal offline')),
				entries: async function* () {
					await Promise.resolve()
					yield* []
					throw new Error('Journal offline')
				},
			}
			await expect(f.controller(unavailable).runScheduled()).rejects.toThrow('Journal offline')
			expect(await f.controller().generations()).toHaveLength(0)
			const generation = await f.controller().importArchive(Buffer.from('Unrelated retained archive'), new Date())
			const unknownKey = `${mediaBackupPrefix(randomUUID())}archive.enc`
			const unknown = await f.client.send(new PutObjectCommand({ Bucket: f.backupBucket, Key: unknownKey, Body: 'Unregistered scope' }))
			await expect(f.controller().sweep()).rejects.toThrow('Unregistered backup generation')
			await f.client.send(new DeleteObjectCommand({ Bucket: f.backupBucket, Key: unknownKey, VersionId: unknown.VersionId }))
			generation.expiresAt = new Date(Date.parse(generation.expiresAt) + day).toISOString()
			await f.client.send(
				new PutObjectCommand({ Bucket: f.catalogBucket, Key: `media-backup-catalog-v1/${generation.id}.json`, Body: JSON.stringify(generation) }),
			)
			await expect(f.controller().sweep()).rejects.toThrow('Invalid backup generation')
			expect((await f.client.send(new ListObjectVersionsCommand({ Bucket: f.backupBucket }))).Versions).toHaveLength(1)
		} finally {
			await f.dispose()
		}
	})
	it('streams archives larger than media limits, authenticates them and aborts interrupted multipart uploads', async () => {
		const f = await fixture()
		try {
			const now = new Date()
			const block = Buffer.alloc(1024 * 1024, 's')
			const stream = async function* () {
				for (let i = 0; i < 65; i++) {
					await Promise.resolve()
					yield block
				}
			}
			const generation = await f.controller().importArchive(stream(), now)
			const encrypted = await f.read(f.backupBucket, `${mediaBackupPrefix(generation.id)}archive.enc`)
			expect(encrypted.length).toBe(65 * block.length + 32)
			const original = decryptBackupArchive(encrypted, f.key, generation)
			expect(original.length).toBe(65 * block.length)
			expect(original.subarray(-block.length).equals(block)).toBe(true)
			encrypted[encrypted.length - 1] ^= 1
			expect(() => decryptBackupArchive(encrypted, f.key, generation)).toThrow()
			const broken = async function* () {
				await Promise.resolve()
				yield block
				throw new Error('Interrupted source stream')
			}
			await expect(f.controller().importArchive(broken(), now)).rejects.toThrow('Interrupted source stream')
			const ids = (await f.controller().generations()).map((entry) => entry.id)
			expect(
				((await f.client.send(new ListMultipartUploadsCommand({ Bucket: f.backupBucket }))).Uploads ?? []).filter((upload) =>
					ids.some((id) => upload.Key?.startsWith(mediaBackupPrefix(id))),
				),
			).toHaveLength(0)
			// Simulate abrupt process death with staged parts under a durable, failed generation.
			const failed = (await f.controller().generations()).find((entry) => entry.state === 'failed')
			if (!failed) throw new Error('Interrupted generation manifest missing.')
			const unfinishedKey = `${mediaBackupPrefix(failed.id)}interrupted.enc`
			const upload = await f.client.send(new CreateMultipartUploadCommand({ Bucket: f.backupBucket, Key: unfinishedKey }))
			await f.client.send(new UploadPartCommand({ Bucket: f.backupBucket, Key: unfinishedKey, UploadId: upload.UploadId, PartNumber: 1, Body: block }))
			expect(await f.controller().sweep(new Date(now.getTime() + day))).toMatchObject({ expired: 2, failed: 0 })
			await expect(f.client.send(new ListPartsCommand({ Bucket: f.backupBucket, Key: unfinishedKey, UploadId: upload.UploadId }))).rejects.toMatchObject({
				$metadata: { httpStatusCode: 404 },
			})
		} finally {
			await f.dispose()
		}
	}, 30000)
	it('runs the actual controller, refuses a competing owner and stops the scheduler cleanly', async () => {
		const f = await fixture()
		const directory = await mkdtemp(resolve(tmpdir(), 'junction-backup-controller-'))
		const databaseUrl = process.env['DATABASE_URL']
		if (!databaseUrl) throw new Error('Requires loopback database.')
		const isolatedUrl = new URL(databaseUrl)
		const sourceSchema = isolatedUrl.searchParams.get('schema')
		if (!sourceSchema || !/^[a-z0-9_]+$/.test(sourceSchema)) throw new Error('Requires a disposable integration schema.')
		const isolatedSchema = 'backup_controller_' + randomUUID().replaceAll('-', '')
		const pool = new Pool({ connectionString: databaseUrl })
		// The controller scans every database-owned source key. Other scenarios in
		// the shared integration schema deliberately retain missing/invalid media.
		// Clone the four ownership tables so this fixture tests one complete store.
		await pool.query(`CREATE SCHEMA "${isolatedSchema}"`)
		for (const table of ['workspaces', 'vendors', 'listings', 'media_assets']) {
			await pool.query(`CREATE TABLE "${isolatedSchema}"."${table}" (LIKE "${sourceSchema}"."${table}" INCLUDING ALL)`)
		}
		isolatedUrl.searchParams.set('schema', isolatedSchema)
		const foundation = new PostgresFoundation(isolatedUrl.toString())
		const session = await pool.connect()
		try {
			const mediaId = randomUUID()
			const sourceKey = await f.source(mediaId, 'Authoritative database-owned media')
			const workspace = await foundation.db.workspace.create({ data: { id: randomUUID(), kind: 'real' } })
			const vendor = await foundation.db.vendor.create({ data: { id: randomUUID(), workspaceId: workspace.id } })
			const listing = await foundation.db.listing.create({
				data: {
					id: randomUUID(),
					vendorId: vendor.id,
					kind: 'product',
					category: 'goods',
					title: 'Synthetic controller fixture',
					description: 'Temporary local fixture',
					priceCents: 100,
				},
			})
			await foundation.db.mediaAsset.create({
				data: { id: mediaId, listingId: listing.id, kind: 'listing_image', state: 'quarantined', sealedKey: sourceKey },
			})
			const policyPath = resolve(directory, 'policy.json')
			const keyPath = resolve(directory, 'key.hex')
			await writeFile(policyPath, JSON.stringify({ ...f.policy, intervalSeconds: 60 }))
			await writeFile(keyPath, f.key.toString('hex'), { mode: 0o600 })
			const env = {
				...process.env,
				DATABASE_URL: isolatedUrl.toString(),
				MEDIA_BACKUP_POLICY_FILE: policyPath,
				MEDIA_BACKUP_KEY_FILE: keyPath,
				MEDIA_S3_BUCKET: f.sourceBucket,
				MEDIA_DELETION_JOURNAL_BUCKET: f.journalBucket,
				MEDIA_DELETION_JOURNAL_ENDPOINT: process.env['MEDIA_S3_ENDPOINT'],
				MEDIA_DELETION_JOURNAL_REGION: process.env['MEDIA_S3_REGION'],
				MEDIA_DELETION_JOURNAL_ACCESS_KEY_ID: process.env['MEDIA_S3_ACCESS_KEY_ID'],
				MEDIA_DELETION_JOURNAL_SECRET_ACCESS_KEY: process.env['MEDIA_S3_SECRET_ACCESS_KEY'],
				MEDIA_BACKUP_ENDPOINT: process.env['MEDIA_S3_ENDPOINT'],
				MEDIA_BACKUP_REGION: process.env['MEDIA_S3_REGION'],
				MEDIA_BACKUP_ACCESS_KEY_ID: process.env['MEDIA_S3_ACCESS_KEY_ID'],
				MEDIA_BACKUP_SECRET_ACCESS_KEY: process.env['MEDIA_S3_SECRET_ACCESS_KEY'],
				MEDIA_BACKUP_BUCKET: f.backupBucket,
				MEDIA_BACKUP_CATALOG_BUCKET: f.catalogBucket,
			}
			const controllerPath = resolve(__dirname, '../../../../tools/media-backup-controller.mjs')
			const run = (operation: string) => promisify(execFile)(process.execPath, [controllerPath, operation], { env })
			expect(JSON.parse((await run('run')).stdout)).toMatchObject({ created: true, failed: 0 })
			expect((JSON.parse((await run('status')).stdout) as { generations: unknown[] }).generations).toHaveLength(1)
			const lockName = `media-backup-v1:${env.MEDIA_BACKUP_ENDPOINT}:${f.backupBucket}:${f.catalogBucket}`
			await session.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [lockName])
			try {
				await expect(run('run')).rejects.toThrow('Another backup controller')
			} finally {
				await session.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [lockName])
			}
			await new Promise<void>((resolvePromise, reject) => {
				const watcher = spawn(process.execPath, [controllerPath, 'watch'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
				let output = ''
				let errors = ''
				const timer = setTimeout(() => {
					watcher.kill('SIGKILL')
					reject(new Error('Scheduler did not stop.'))
				}, 10000)
				watcher.stdout.on('data', (bytes: Buffer) => {
					output += bytes.toString()
					if (output.includes('media-backup.heartbeat')) watcher.kill('SIGTERM')
				})
				watcher.stderr.on('data', (bytes: Buffer) => {
					errors += bytes.toString()
				})
				watcher.on('error', (error) => {
					clearTimeout(timer)
					reject(error)
				})
				watcher.on('close', (code) => {
					clearTimeout(timer)
					if (code !== 0 || !output.includes('media-backup.heartbeat')) reject(new Error(`Scheduler failed: ${errors}`))
					else resolvePromise()
				})
			})
			expect(JSON.parse((await run('run')).stdout)).toMatchObject({ created: false, failed: 0 })
		} finally {
			session.release()
			await foundation.close()
			await pool.query(`DROP SCHEMA "${isolatedSchema}" CASCADE`)
			await pool.end()
			await rm(directory, { recursive: true, force: true })
			await f.dispose()
		}
	}, 20000)
})
