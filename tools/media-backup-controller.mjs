import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'

import { MediaBackupLifecycle, PostgresFoundation, S3DeletionJournal } from '../libs/platform-core/dist/index.js'

const require = createRequire(new URL('../libs/platform-core/package.json', import.meta.url))
const { S3Client } = require('@aws-sdk/client-s3')
const { Pool } = require('pg')
const operation = process.argv[2]
const operations = ['status', 'run', 'watch', 'import', 'hold', 'release', 'restore']
if (process.argv.includes('--help')) {
	console.log(
		'Local media backup controller: status|run|watch|import|hold|release|restore. Configure MEDIA_BACKUP_POLICY_FILE, MEDIA_BACKUP_KEY_FILE, independent storage credentials, catalog and journal. See docs/data/MEDIA-BACKUP-LIFECYCLE.md.',
	)
	process.exit(0)
}
if (!operations.includes(operation) || process.argv.length !== 3) throw new Error('Use media-backup-controller.mjs --help.')
function required(name) {
	const value = process.env[name]
	if (!value) throw new Error(`Missing ${name}.`)
	return value
}
function loopback(value, name) {
	if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname)) throw new Error(`${name} requires local loopback storage.`)
}
function client(prefix) {
	const endpoint = required(`${prefix}_ENDPOINT`)
	loopback(endpoint, `${prefix}_ENDPOINT`)
	return new S3Client({
		endpoint,
		region: required(`${prefix}_REGION`),
		forcePathStyle: true,
		credentials: { accessKeyId: required(`${prefix}_ACCESS_KEY_ID`), secretAccessKey: required(`${prefix}_SECRET_ACCESS_KEY`) },
	})
}
const databaseUrl = required('DATABASE_URL')
loopback(databaseUrl, 'DATABASE_URL')
loopback(process.env.MEDIA_DELETION_JOURNAL_ENDPOINT ?? required('MEDIA_S3_ENDPOINT'), 'MEDIA_DELETION_JOURNAL_ENDPOINT')
const journal = S3DeletionJournal.fromEnvironment()
if (!journal) throw new Error('Independent deletion journal required.')
const policy = JSON.parse(await readFile(required('MEDIA_BACKUP_POLICY_FILE'), 'utf8'))
const keyPath = required('MEDIA_BACKUP_KEY_FILE')
const keyStat = await stat(keyPath)
if (!keyStat.isFile() || keyStat.mode & 0o077) throw new Error('Backup encryption key must be a private regular file (mode 0600).')
const keyHex = (await readFile(keyPath, 'utf8')).trim()
if (!/^[0-9a-f]{64}$/i.test(keyHex)) throw new Error('Backup key requires exactly 32 random bytes encoded as hex.')
const key = Buffer.from(keyHex, 'hex')
const source = client('MEDIA_S3')
const storage = client('MEDIA_BACKUP')
const backupBucket = required('MEDIA_BACKUP_BUCKET')
const catalogBucket = required('MEDIA_BACKUP_CATALOG_BUCKET')
const foundation = new PostgresFoundation(databaseUrl)
const pool = new Pool({ connectionString: databaseUrl })
const lockName = `media-backup-v1:${required('MEDIA_BACKUP_ENDPOINT')}:${backupBucket}:${catalogBucket}`
const lifecycle = new MediaBackupLifecycle(
	source,
	required('MEDIA_S3_BUCKET'),
	storage,
	backupBucket,
	catalogBucket,
	journal,
	policy,
	key,
	required('MEDIA_DELETION_JOURNAL_BUCKET'),
	async () => {
		const rows = await foundation.db.mediaAsset.findMany({
			where: { state: { not: 'pending_upload' }, retentionDeletedAt: null, listing: { vendor: { workspace: { kind: 'real' } } } },
			select: { uploadKey: true, sealedKey: true, renditionKey: true, posterKey: true },
		})
		return new Set(rows.flatMap((row) => [row.uploadKey, row.sealedKey, row.renditionKey, row.posterKey].filter(Boolean)))
	},
)
let session
let locked = false
let stopping = false
const stop = new AbortController()
function requestStop() {
	stopping = true
	stop.abort()
}
process.on('SIGTERM', requestStop)
process.on('SIGINT', requestStop)
async function once() {
	if (operation === 'status') {
		const entries = await lifecycle.generations()
		console.log(
			JSON.stringify({
				type: 'media-backup.status',
				generations: entries.map(({ id, kind, state, createdAt, expiresAt, heldReason, nextAttemptAt, lastError }) => ({
					id,
					kind,
					state,
					createdAt,
					expiresAt,
					held: Boolean(heldReason),
					nextAttemptAt,
					lastError,
				})),
			}),
		)
		return
	}
	if (operation === 'run' || operation === 'watch') {
		const result = await lifecycle.runScheduled()
		console.log(JSON.stringify({ type: 'media-backup.heartbeat', ...result }))
		if (operation === 'run' && result.failed) process.exitCode = 1
	} else if (operation === 'import') {
		const path = required('MEDIA_BACKUP_ARCHIVE_FILE')
		const recoveryPoint = new Date(required('MEDIA_BACKUP_ARCHIVE_CREATED_AT'))
		if (!Number.isFinite(recoveryPoint.getTime()) || recoveryPoint > new Date())
			throw new Error('Archive requires its original, nonfuture recovery-point timestamp.')
		if (!(await stat(path)).isFile()) throw new Error('Archive import requires a standalone regular file.')
		const generation = await lifecycle.importArchive(createReadStream(path), recoveryPoint)
		console.log(JSON.stringify({ type: 'media-backup.imported', id: generation.id, expiresAt: generation.expiresAt }))
	} else if (operation === 'hold' || operation === 'release') {
		// A release justification is mandatory even though the manifest clears the active reason.
		const reason = required('MEDIA_BACKUP_HOLD_REASON')
		const generation = await lifecycle.setHold(required('MEDIA_BACKUP_GENERATION_ID'), operation === 'hold' ? reason : null, reason)
		console.log(JSON.stringify({ type: 'media-backup.hold-changed', id: generation.id, held: Boolean(generation.heldReason) }))
	} else if (operation === 'restore') {
		if (process.env.MEDIA_RECOVERY_ISOLATED !== '1') throw new Error('Fence all recovery traffic and set MEDIA_RECOVERY_ISOLATED=1.')
		const target = client('MEDIA_RECOVERY')
		try {
			const result = await lifecycle.restore(required('MEDIA_BACKUP_GENERATION_ID'), target, required('MEDIA_RECOVERY_BUCKET'), key, policy.keyId)
			console.log(JSON.stringify({ type: 'media-backup.restored', ...result, readyForApplicationAccess: false }))
		} finally {
			target.destroy()
		}
	}
}
try {
	session = await pool.connect()
	// A lost lock connection must terminate destructive work; unfinished manifests remain retryable.
	session.on('error', () => {
		console.error(JSON.stringify({ type: 'media-backup.lock-lost' }))
		process.exit(1)
	})
	const acquired = await session.query('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired', [lockName])
	if (!acquired.rows[0].acquired) throw new Error('Another backup controller owns this storage scope.')
	locked = true
	do {
		try {
			await once()
		} catch (error) {
			if (operation !== 'watch') throw error
			console.error(JSON.stringify({ type: 'media-backup.failure', retryable: true }))
		}
		if (operation === 'watch' && !stopping) {
			try {
				await delay(Math.min(policy.intervalSeconds, 60) * 1000, undefined, { signal: stop.signal })
			} catch (error) {
				if (!stopping) throw error
			}
		}
	} while (operation === 'watch' && !stopping)
} finally {
	if (session) {
		if (locked) await session.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [lockName])
		session.release()
	}
	await pool.end()
	await foundation.close()
	source.destroy()
	storage.destroy()
}
