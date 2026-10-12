import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'

import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	GetObjectCommand,
	ListMultipartUploadsCommand,
	ListObjectsV2Command,
	ListObjectVersionsCommand,
	ListPartsCommand,
	PutObjectCommand,
	S3Client,
	UploadPartCommand,
} from '@aws-sdk/client-s3'

import { type DeletionJournal, purgeObjectVersions } from './media-retention.js'

const day = 86400000
const catalogPrefix = 'media-backup-catalog-v1/'
const prefixes = ['quarantine/uploads/', 'quarantine/sealed/', 'private/processed/']
const maxObjectBytes = 64 * 1024 * 1024
const maxInventoryObjects = 50000
const archivePartBytes = 8 * 1024 * 1024
interface MediaBackupObject {
	key: string
	sha256: string
}

export interface MediaBackupPolicy {
	version: string
	approvalReference: string
	maxAgeDays: number
	intervalSeconds: number
	lockDays: number
	keyId: string
}

export interface MediaBackupGeneration {
	format: 1
	id: string
	kind: 'media-copy' | 'encrypted-archive'
	policy: MediaBackupPolicy
	createdAt: string
	expiresAt: string
	state: 'copying' | 'ready' | 'failed' | 'expiring' | 'expired'
	objectCount: number
	heldReason: string | null
	lastAttemptAt: string | null
	nextAttemptAt: string | null
	lastError: 'storage-operation-failed' | null
	updatedAt: string
}

function httpStatus(error: unknown) {
	return (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
}

export function validateMediaBackupPolicy(input: MediaBackupPolicy) {
	if (
		!input ||
		Object.keys(input).some((field) => !['version', 'approvalReference', 'keyId', 'maxAgeDays', 'intervalSeconds', 'lockDays'].includes(field)) ||
		!['version', 'approvalReference', 'keyId'].every(
			(field) =>
				typeof input[field as keyof MediaBackupPolicy] === 'string' &&
				String(input[field as keyof MediaBackupPolicy]).trim() &&
				String(input[field as keyof MediaBackupPolicy]).length <= 300,
		) ||
		!Number.isInteger(input.maxAgeDays) ||
		input.maxAgeDays < 1 ||
		input.maxAgeDays > 3650 ||
		!Number.isInteger(input.intervalSeconds) ||
		input.intervalSeconds < 1 ||
		input.intervalSeconds > 86400 ||
		!Number.isInteger(input.lockDays) ||
		input.lockDays < 0 ||
		input.lockDays > input.maxAgeDays
	)
		throw new Error('Explicit backup policy, approval reference, interval, lifetime, lock period and key ID required.')
	return input
}

function validateGeneration(input: MediaBackupGeneration) {
	validateMediaBackupPolicy(input.policy)
	if (
		input.format !== 1 ||
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id) ||
		!['media-copy', 'encrypted-archive'].includes(input.kind) ||
		!['copying', 'ready', 'failed', 'expiring', 'expired'].includes(input.state) ||
		!Number.isFinite(Date.parse(input.createdAt)) ||
		Date.parse(input.expiresAt) !== Date.parse(input.createdAt) + input.policy.maxAgeDays * day ||
		!Number.isInteger(input.objectCount) ||
		input.objectCount < 0 ||
		(input.heldReason !== null && (typeof input.heldReason !== 'string' || !input.heldReason.trim() || input.heldReason.length > 1000)) ||
		![input.lastAttemptAt, input.nextAttemptAt, input.updatedAt].every(
			(time) => time === null || (typeof time === 'string' && Number.isFinite(Date.parse(time))),
		) ||
		![null, 'storage-operation-failed'].includes(input.lastError)
	)
		throw new Error('Invalid backup generation manifest; lifecycle stopped.')
	return input
}

export function mediaBackupPrefix(id: string) {
	if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid backup generation ID.')
	return `media-backups-v1/${id}/`
}

function sourceKeyAllowed(key: string) {
	return prefixes.some((prefix) => key.startsWith(prefix)) && !key.split('/').some((part) => part === '..' || part === '.')
}

/** Encrypt each bounded media object; bind ciphertext to its generation, key and key ID. */
function encrypt(body: Buffer, key: Buffer, generation: MediaBackupGeneration, sourceKey: string) {
	const iv = randomBytes(12)
	const cipher = createCipheriv('aes-256-gcm', key, iv)
	cipher.setAAD(Buffer.from(`${generation.id}\n${sourceKey}\n${generation.policy.keyId}`))
	const ciphertext = Buffer.concat([cipher.update(body), cipher.final()])
	return Buffer.concat([Buffer.from('JMB1'), iv, cipher.getAuthTag(), ciphertext])
}

export function decryptMediaBackup(body: Buffer, key: Buffer, generation: MediaBackupGeneration, sourceKey: string) {
	if (key.length !== 32 || body.length < 32 || body.subarray(0, 4).toString() !== 'JMB1') throw new Error('Invalid encrypted media backup.')
	const decipher = createDecipheriv('aes-256-gcm', key, body.subarray(4, 16))
	decipher.setAAD(Buffer.from(`${generation.id}\n${sourceKey}\n${generation.policy.keyId}`))
	decipher.setAuthTag(body.subarray(16, 32))
	return Buffer.concat([decipher.update(body.subarray(32)), decipher.final()])
}

/** For isolated archive adapters only. Large bundles need streaming authenticated extraction. */
export function decryptBackupArchive(body: Buffer, key: Buffer, generation: MediaBackupGeneration) {
	if (key.length !== 32 || body.length < 32 || body.subarray(0, 4).toString() !== 'JBA1') throw new Error('Invalid encrypted backup archive.')
	const decipher = createDecipheriv('aes-256-gcm', key, body.subarray(4, 16))
	decipher.setAAD(Buffer.from(`${generation.id}\narchive.enc\n${generation.policy.keyId}`))
	decipher.setAuthTag(body.subarray(body.length - 16))
	return Buffer.concat([decipher.update(body.subarray(16, body.length - 16)), decipher.final()])
}

async function readBounded(client: S3Client, bucket: string, key: string, max: number, etag?: string) {
	const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, ...(etag ? { IfMatch: etag } : {}) }))
	if (!object.Body || object.ContentLength === undefined || object.ContentLength > max) {
		throw new Error('Backup object exceeds its bounded format.')
	}
	const bytes = Buffer.from(await object.Body.transformToByteArray())
	if (bytes.length !== object.ContentLength || bytes.length > max) throw new Error('Backup object size mismatch.')
	return bytes
}

/** Operations credentials only. Callers serialize controllers and fence restore traffic. */
export class MediaBackupLifecycle {
	constructor(
		private readonly source: S3Client,
		private readonly sourceBucket: string,
		private readonly storage: S3Client,
		private readonly backupBucket: string,
		private readonly catalogBucket: string,
		private readonly journal: DeletionJournal,
		private readonly policy: MediaBackupPolicy,
		private readonly encryptionKey: Buffer,
		private readonly journalBucket: string,
		private readonly sourceKeys: () => Promise<Set<string>>,
	) {
		validateMediaBackupPolicy(policy)
		if (
			encryptionKey.length !== 32 ||
			new Set([sourceBucket, backupBucket, catalogBucket, journalBucket]).size !== 4 ||
			[sourceBucket, backupBucket, catalogBucket, journalBucket].some((bucket) => !bucket)
		)
			throw new Error('Require a 32-byte key and distinct active, backup, catalog and independent journal buckets.')
	}

	async *objects(client: S3Client, bucket: string, prefix: string) {
		let token: string | undefined
		do {
			const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }))
			for (const object of page.Contents ?? []) {
				if (!object.Key || !object.ETag) throw new Error('Invalid backup object listing.')
				yield { key: object.Key, etag: object.ETag }
			}
			token = page.IsTruncated ? page.NextContinuationToken : undefined
			if (page.IsTruncated && !token) throw new Error('Incomplete backup listing.')
		} while (token)
	}

	async generations() {
		const generations: MediaBackupGeneration[] = []
		for await (const object of this.objects(this.storage, this.catalogBucket, catalogPrefix)) {
			const entry = validateGeneration(
				JSON.parse((await readBounded(this.storage, this.catalogBucket, object.key, 16384, object.etag)).toString()) as MediaBackupGeneration,
			)
			if (object.key !== `${catalogPrefix}${entry.id}.json`) throw new Error('Backup catalog key mismatch.')
			generations.push(entry)
		}
		const registered = new Set(generations.map((entry) => entry.id))
		for (const key of await this.versionKeys('media-backups-v1/')) {
			if (!registered.has(key.split('/')[1])) throw new Error('Unregistered backup generation; reconcile inventory before continuing.')
		}
		for (const upload of await this.multipartUploads('media-backups-v1/')) {
			if (!registered.has(upload.key.split('/')[1])) throw new Error('Unregistered backup multipart scope; reconcile inventory before continuing.')
		}
		return generations
	}

	private async save(entry: MediaBackupGeneration, create = false) {
		validateGeneration(entry)
		await this.storage.send(
			new PutObjectCommand({
				Bucket: this.catalogBucket,
				Key: `${catalogPrefix}${entry.id}.json`,
				Body: JSON.stringify(entry),
				ContentType: 'application/json',
				...(create ? { IfNoneMatch: '*' } : {}),
			}),
		)
	}

	private async begin(kind: MediaBackupGeneration['kind'], now: Date) {
		const entry: MediaBackupGeneration = {
			format: 1,
			id: randomUUID(),
			kind,
			policy: { ...this.policy },
			createdAt: now.toISOString(),
			expiresAt: new Date(now.getTime() + this.policy.maxAgeDays * day).toISOString(),
			state: 'copying',
			objectCount: 0,
			heldReason: null,
			lastAttemptAt: null,
			nextAttemptAt: null,
			lastError: null,
			updatedAt: now.toISOString(),
		}
		// Persist scope before the first object: an interrupted copy is still inventory and expires.
		await this.save(entry, true)
		return entry
	}

	private async fail(entry: MediaBackupGeneration, now: Date) {
		entry.lastAttemptAt = entry.updatedAt = now.toISOString()
		entry.nextAttemptAt = new Date(now.getTime() + this.policy.intervalSeconds * 1000).toISOString()
		entry.lastError = 'storage-operation-failed'
		await this.save(entry)
	}

	async createCopy(now = new Date()) {
		const entry = await this.begin('media-copy', now)
		try {
			// Validate journal availability before reading source bytes.
			const deleted = await this.deletionScope()
			const eligible = await this.sourceKeys()
			const inventory: MediaBackupObject[] = []
			const remaining = new Set([...eligible].filter((key) => !deleted(key)))
			if (remaining.size > maxInventoryObjects) throw new Error('Media inventory exceeds supported generation size.')
			for (const prefix of prefixes) {
				for await (const object of this.objects(this.source, this.sourceBucket, prefix)) {
					if (!sourceKeyAllowed(object.key)) throw new Error('Unexpected source key.')
					if (!eligible.has(object.key) || deleted(object.key)) continue
					let body: Buffer
					try {
						body = await readBounded(this.source, this.sourceBucket, object.key, maxObjectBytes, object.etag)
					} catch (error) {
						if (httpStatus(error) === 404 && (await this.deletionScope())(object.key)) {
							remaining.delete(object.key)
							continue
						}
						throw error
					}
					const encrypted = encrypt(body, this.encryptionKey, entry, object.key)
					await this.storage.send(
						new PutObjectCommand({
							Bucket: this.backupBucket,
							Key: `${mediaBackupPrefix(entry.id)}media/${object.key}`,
							Body: encrypted,
							ContentType: 'application/octet-stream',
							IfNoneMatch: '*',
							Metadata: { 'key-id': entry.policy.keyId, 'source-sha256': createHash('sha256').update(body).digest('hex') },
							...(this.policy.lockDays
								? {
										ObjectLockMode: 'GOVERNANCE' as const,
										ObjectLockRetainUntilDate: new Date(Date.parse(entry.createdAt) + this.policy.lockDays * day),
									}
								: {}),
						}),
					)
					entry.objectCount++
					inventory.push({ key: object.key, sha256: createHash('sha256').update(body).digest('hex') })
					remaining.delete(object.key)
				}
			}
			const latestDeleted = await this.deletionScope()
			if ([...remaining].some((key) => !latestDeleted(key))) throw new Error('Referenced media is missing from storage; generation is incomplete.')
			const inventoryBody = JSON.stringify(inventory)
			if (Buffer.byteLength(inventoryBody) > 16 * 1024 * 1024) throw new Error('Media inventory exceeds supported manifest size.')
			await this.storage.send(
				new PutObjectCommand({
					Bucket: this.catalogBucket,
					Key: `media-backup-inventory-v1/${entry.id}.json`,
					Body: inventoryBody,
					ContentType: 'application/json',
					IfNoneMatch: '*',
				}),
			)
			await this.reconcile(entry)
			entry.state = 'ready'
			entry.updatedAt = now.toISOString()
			await this.save(entry)
			return entry
		} catch (error) {
			entry.state = 'failed'
			await this.fail(entry, now)
			throw error
		}
	}

	/** Stream and encrypt a standalone bundle; its immutable bytes expire as a whole. */
	async importArchive(body: Buffer | AsyncIterable<Uint8Array>, recoveryPoint: Date, now = new Date()) {
		if (!Number.isFinite(recoveryPoint.getTime()) || recoveryPoint > now) throw new Error('Archive requires its original nonfuture recovery point.')
		const entry = await this.begin('encrypted-archive', recoveryPoint)
		entry.updatedAt = now.toISOString()
		const objectKey = `${mediaBackupPrefix(entry.id)}archive.enc`
		let uploadId: string | undefined
		try {
			const upload = await this.storage.send(
				new CreateMultipartUploadCommand({
					Bucket: this.backupBucket,
					Key: objectKey,
					ContentType: 'application/octet-stream',
					Metadata: { 'key-id': entry.policy.keyId, format: 'JBA1' },
					...(this.policy.lockDays && Date.parse(entry.createdAt) + this.policy.lockDays * day > now.getTime()
						? {
								ObjectLockMode: 'GOVERNANCE' as const,
								ObjectLockRetainUntilDate: new Date(Date.parse(entry.createdAt) + this.policy.lockDays * day),
							}
						: {}),
				}),
			)
			uploadId = upload.UploadId
			if (!uploadId) throw new Error('Archive upload did not return its durable scope.')
			const iv = randomBytes(12)
			const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv)
			cipher.setAAD(Buffer.from(`${entry.id}\narchive.enc\n${entry.policy.keyId}`))
			const chunks = Buffer.isBuffer(body) ? [body] : body
			let pending = Buffer.concat([Buffer.from('JBA1'), iv])
			let bytes = 0
			const parts: { PartNumber: number; ETag: string }[] = []
			const sendPart = async (part: Buffer) => {
				if (parts.length >= 10000) throw new Error('Archive exceeds the multipart part limit.')
				const number = parts.length + 1
				const result = await this.storage.send(
					new UploadPartCommand({ Bucket: this.backupBucket, Key: objectKey, UploadId: uploadId, PartNumber: number, Body: part }),
				)
				if (!result.ETag) throw new Error('Archive part acknowledgment missing.')
				parts.push({ PartNumber: number, ETag: result.ETag })
			}
			for await (const chunk of chunks) {
				bytes += chunk.length
				// Bound cipher and multipart buffering even when a caller yields a large chunk.
				for (let offset = 0; offset < chunk.length; offset += archivePartBytes) {
					pending = Buffer.concat([pending, cipher.update(chunk.subarray(offset, offset + archivePartBytes))])
					while (pending.length >= archivePartBytes) {
						await sendPart(pending.subarray(0, archivePartBytes))
						pending = pending.subarray(archivePartBytes)
					}
				}
			}
			if (!bytes) throw new Error('Archive cannot be empty.')
			pending = Buffer.concat([pending, cipher.final(), cipher.getAuthTag()])
			await sendPart(pending)
			await this.storage.send(
				new CompleteMultipartUploadCommand({
					Bucket: this.backupBucket,
					Key: objectKey,
					UploadId: uploadId,
					MultipartUpload: { Parts: parts },
					IfNoneMatch: '*',
				}),
			)
			uploadId = undefined
			entry.objectCount = 1
			entry.state = 'ready'
			await this.save(entry)
			return entry
		} catch (error) {
			entry.state = 'failed'
			await this.fail(entry, now)
			throw error
		} finally {
			if (uploadId) await this.storage.send(new AbortMultipartUploadCommand({ Bucket: this.backupBucket, Key: objectKey, UploadId: uploadId }))
		}
	}

	private async multipartUploads(prefix: string) {
		const uploads: { key: string; uploadId: string }[] = []
		let keyMarker: string | undefined
		let uploadMarker: string | undefined
		do {
			const page = await this.storage.send(
				// The pinned local MinIO release mishandles directory-prefix filtering and can
				// return stale upload indexes from deleted buckets. Filter locally and verify
				// each upload's bucket-scoped existence before treating it as recoverable.
				new ListMultipartUploadsCommand({ Bucket: this.backupBucket, KeyMarker: keyMarker, UploadIdMarker: uploadMarker }),
			)
			for (const upload of page.Uploads ?? []) {
				if (!upload.Key || !upload.UploadId) throw new Error('Invalid multipart inventory.')
				if (!upload.Key.startsWith(prefix)) continue
				try {
					await this.storage.send(new ListPartsCommand({ Bucket: this.backupBucket, Key: upload.Key, UploadId: upload.UploadId, MaxParts: 1 }))
				} catch (error) {
					if (httpStatus(error) === 404) continue
					throw error
				}
				uploads.push({ key: upload.Key, uploadId: upload.UploadId })
			}
			keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined
			uploadMarker = page.IsTruncated ? page.NextUploadIdMarker : undefined
			if (page.IsTruncated && !keyMarker) throw new Error('Incomplete multipart inventory.')
		} while (keyMarker)
		return uploads
	}

	private async abortIncomplete(prefix: string) {
		for (const upload of await this.multipartUploads(prefix)) {
			await this.storage.send(new AbortMultipartUploadCommand({ Bucket: this.backupBucket, Key: upload.key, UploadId: upload.uploadId }))
		}
		if ((await this.multipartUploads(prefix)).length) throw new Error('Incomplete backup parts remain recoverable.')
	}

	private async deletionScope() {
		const keys = new Set<string>()
		const mediaIds = new Set<string>()
		for await (const entry of this.journal.entries()) {
			for (const key of entry.keys) keys.add(key)
			mediaIds.add(entry.mediaId)
		}
		return (key: string) => keys.has(key) || [...mediaIds].some((id) => key.startsWith(`private/processed/${id}/`))
	}

	async reconcile(entry: MediaBackupGeneration) {
		validateGeneration(entry)
		if (entry.kind !== 'media-copy') return 0
		const deleted = await this.deletionScope()
		const prefix = `${mediaBackupPrefix(entry.id)}media/`
		// Include historical versions whose current version is a delete marker.
		const keys = await this.versionKeys(prefix)
		let purged = 0
		for (const key of keys)
			if (deleted(key.slice(prefix.length))) {
				await purgeObjectVersions(this.storage, this.backupBucket, key)
				purged++
			}
		return purged
	}

	private async versionKeys(prefix: string) {
		const keys = new Set<string>()
		let keyMarker: string | undefined
		let versionMarker: string | undefined
		do {
			const page = await this.storage.send(
				new ListObjectVersionsCommand({ Bucket: this.backupBucket, Prefix: prefix, KeyMarker: keyMarker, VersionIdMarker: versionMarker }),
			)
			for (const object of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]) {
				if (!object.Key?.startsWith(prefix)) throw new Error('Backup version listing escaped generation scope.')
				keys.add(object.Key)
			}
			keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined
			versionMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined
			if (page.IsTruncated && !keyMarker) throw new Error('Incomplete backup version listing.')
		} while (keyMarker)
		return keys
	}

	async setHold(id: string, reason: string | null, justification: string, now = new Date()) {
		const entry = (await this.generations()).find((generation) => generation.id === id)
		if (!entry || ['expiring', 'expired'].includes(entry.state)) throw new Error('Unknown generation or irreversible expiry already started.')
		if (reason !== null && !reason.trim()) throw new Error('Hold reason required.')
		if (!justification.trim() || justification.length > 1000) throw new Error('Hold change requires a bounded justification.')
		const changeId = randomUUID()
		await this.storage.send(
			new PutObjectCommand({
				Bucket: this.catalogBucket,
				Key: `media-backup-audit-v1/${changeId}-requested.json`,
				IfNoneMatch: '*',
				ContentType: 'application/json',
				Body: JSON.stringify({
					changeId,
					outcome: 'requested',
					generationId: id,
					action: reason === null ? 'release' : 'hold',
					reason: justification,
					occurredAt: now.toISOString(),
					previousHeld: Boolean(entry.heldReason),
				}),
			}),
		)
		entry.heldReason = reason
		entry.updatedAt = now.toISOString()
		// Releasing does not renew the original recovery-point lifetime.
		await this.save(entry)
		await this.storage.send(
			new PutObjectCommand({
				Bucket: this.catalogBucket,
				Key: `media-backup-audit-v1/${changeId}-applied.json`,
				IfNoneMatch: '*',
				ContentType: 'application/json',
				Body: JSON.stringify({ changeId, generationId: id, outcome: 'applied', held: reason !== null, occurredAt: now.toISOString() }),
			}),
		)
		return entry
	}

	async sweep(now = new Date()) {
		const entries = await this.generations()
		const result = { expired: 0, reconciled: 0, failed: 0, held: 0 }
		for (const entry of entries) {
			if (entry.nextAttemptAt && Date.parse(entry.nextAttemptAt) > now.getTime()) continue
			try {
				if (
					entry.state === 'expired' &&
					!entry.lastError &&
					!(await this.versionKeys(mediaBackupPrefix(entry.id))).size &&
					!(await this.multipartUploads(mediaBackupPrefix(entry.id))).length
				)
					continue
				if (Date.parse(entry.expiresAt) <= now.getTime() && !entry.heldReason) {
					entry.state = 'expiring'
					entry.lastAttemptAt = entry.updatedAt = now.toISOString()
					await this.save(entry)
					await this.abortIncomplete(mediaBackupPrefix(entry.id))
					for (const key of await this.versionKeys(mediaBackupPrefix(entry.id))) await purgeObjectVersions(this.storage, this.backupBucket, key)
					if ((await this.versionKeys(mediaBackupPrefix(entry.id))).size) throw new Error('Backup generation remains recoverable.')
					entry.state = 'expired'
					result.expired++
				} else {
					if (entry.state === 'copying' || entry.state === 'failed') await this.abortIncomplete(mediaBackupPrefix(entry.id))
					if (entry.heldReason) result.held++
					result.reconciled += await this.reconcile(entry)
				}
				entry.lastError = null
				entry.nextAttemptAt = null
				entry.lastAttemptAt = entry.updatedAt = now.toISOString()
				await this.save(entry)
			} catch {
				result.failed++
				await this.fail(entry, now)
			}
		}
		return result
	}

	async runScheduled(now = new Date()) {
		// Fail closed on unreadable journals/catalogs before creating another recovery point.
		await this.deletionScope()
		const sweep = await this.sweep(now)
		const entries = await this.generations()
		const latest = Math.max(0, ...entries.filter((entry) => entry.kind === 'media-copy').map((entry) => Date.parse(entry.createdAt)))
		let created = false
		if (now.getTime() - latest >= this.policy.intervalSeconds * 1000) {
			try {
				await this.createCopy(now)
				created = true
			} catch {
				sweep.failed++
			}
		}
		return { ...sweep, created }
	}

	/** Media only; archive unpacking requires its own adapter and current-journal replay. */
	async restore(id: string, target: S3Client, targetBucket: string, key: Buffer, keyId: string, now = new Date()) {
		if ([this.sourceBucket, this.backupBucket, this.catalogBucket, this.journalBucket].includes(targetBucket) || !targetBucket)
			throw new Error('Restore requires a separate fenced recovery bucket.')
		const entry = (await this.generations()).find((generation) => generation.id === id)
		if (!entry || entry.kind !== 'media-copy' || entry.state !== 'ready' || Date.parse(entry.expiresAt) <= now.getTime() || keyId !== entry.policy.keyId)
			throw new Error('Generation is unavailable, expired, incomplete, or requires another encryption key.')
		await this.reconcile(entry)
		let restored = 0
		const prefix = `${mediaBackupPrefix(entry.id)}media/`
		const deleted = await this.deletionScope()
		const inventory: unknown = JSON.parse(
			(await readBounded(this.storage, this.catalogBucket, `media-backup-inventory-v1/${id}.json`, 16 * 1024 * 1024)).toString(),
		)
		if (!Array.isArray(inventory) || inventory.length !== entry.objectCount || inventory.length > maxInventoryObjects)
			throw new Error('Backup inventory is missing or inconsistent.')
		const seen = new Set<string>()
		for (const item of inventory as MediaBackupObject[]) {
			if (!item || typeof item.key !== 'string' || !sourceKeyAllowed(item.key) || !/^[0-9a-f]{64}$/.test(item.sha256) || seen.has(item.key))
				throw new Error('Invalid backup inventory.')
			seen.add(item.key)
		}
		for (const item of inventory as MediaBackupObject[]) {
			const sourceKey = item.key
			if (deleted(sourceKey)) continue
			const body = decryptMediaBackup(
				await readBounded(this.storage, this.backupBucket, `${prefix}${sourceKey}`, maxObjectBytes + 32),
				key,
				entry,
				sourceKey,
			)
			if (createHash('sha256').update(body).digest('hex') !== item.sha256) throw new Error('Backup content differs from its inventory.')
			await target.send(new PutObjectCommand({ Bucket: targetBucket, Key: sourceKey, Body: body, ContentType: 'application/octet-stream' }))
			restored++
		}
		// Journal may have advanced while decrypting. Purge the whole fenced target's matching versions.
		const { purgeMediaCopy } = await import('./media-retention.js')
		await purgeMediaCopy(target, targetBucket, this.journal)
		return { restored }
	}
}
