import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../libs/platform-core/package.json', import.meta.url))
const { Pool } = require('pg')

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to the local synthetic PostgreSQL database.')

const databaseUrl = new URL(process.env.DATABASE_URL)
if (!['localhost', '127.0.0.1'].includes(databaseUrl.hostname)) throw new Error('Restore rehearsal requires a loopback database.')
if (!databaseUrl.port) throw new Error('Restore rehearsal requires an explicit loopback database port.')

const schema = `phase00_restore_${randomUUID().replaceAll('-', '')}`
const dumpPath = `/tmp/${schema}.dump`
const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1))
const databaseUser = decodeURIComponent(databaseUrl.username)
if (!databaseName || !databaseUser) throw new Error('Restore rehearsal requires a database name and user.')

const schemaUrl = new URL(databaseUrl)
schemaUrl.searchParams.set('schema', schema)
const pool = new Pool({ connectionString: databaseUrl.toString(), options: `-c search_path=${schema},public` })

function run(command, args, env = process.env) {
	const result = spawnSync(command, args, { env, stdio: 'inherit' })
	if (result.status !== 0) throw new Error(`${command} failed during the restore rehearsal.`)
}

function composePort() {
	const result = spawnSync('docker', ['compose', 'port', 'postgres', '5432'], { encoding: 'utf8' })
	if (result.status !== 0) throw new Error('Local Compose PostgreSQL must be running for the restore rehearsal.')
	const match = result.stdout.trim().match(/^(?:127\.0\.0\.1|localhost):(\d+)$/)
	if (!match || match[1] !== databaseUrl.port) throw new Error('DATABASE_URL must target the configured local Compose PostgreSQL port.')
}

async function fixtureCounts() {
	const result = await pool.query(`
		SELECT
			(SELECT count(*)::int FROM "workspaces") AS "workspaceCount",
			(SELECT count(*)::int FROM "sessions") AS "sessionCount",
			(SELECT count(*)::int FROM "demo_personas") AS "personaCount",
			(SELECT count(*)::int FROM "provider_inbox_events") AS "inboxCount",
			(SELECT count(*)::int FROM "outbox_events") AS "outboxCount",
			(SELECT count(*)::int FROM "audit_logs") AS "auditCount",
			(SELECT "command_events_used" FROM "demo_personas" LIMIT 1) AS "commandEventsUsed",
			(SELECT "command_events_limit" FROM "demo_personas" LIMIT 1) AS "commandEventsLimit"
	`)
	return result.rows[0]
}

try {
	composePort()
	run('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { ...process.env, DATABASE_URL: schemaUrl.toString() })

	const ids = {
		demo: randomUUID(),
		event: randomUUID(),
		location: randomUUID(),
		persona: randomUUID(),
		session: randomUUID(),
		user: randomUUID(),
		vendor: randomUUID(),
		workspace: randomUUID(),
	}
	await pool.query('INSERT INTO "workspaces" (id, kind) VALUES ($1::uuid, $2)', [ids.workspace, 'demo'])
	await pool.query('INSERT INTO "demo_workspaces" (id, "workspace_id", "expires_at") VALUES ($1::uuid, $2::uuid, now() + interval \'1 hour\')', [
		ids.demo,
		ids.workspace,
	])
	await pool.query('INSERT INTO "users" (id, email, "adult_verification_state", "verified_at") VALUES ($1::uuid, $2, $3, now())', [
		ids.user,
		`${ids.user}@example.invalid`,
		'verified',
	])
	await pool.query('INSERT INTO "vendors" (id, "workspace_id") VALUES ($1::uuid, $2::uuid)', [ids.vendor, ids.workspace])
	await pool.query('INSERT INTO "locations" (id, "vendor_id") VALUES ($1::uuid, $2::uuid)', [ids.location, ids.vendor])
	await pool.query(
		'INSERT INTO "demo_personas" (id, "workspace_id", key, role, "vendor_id", "location_ids", "command_events_used", "command_events_limit") VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, ARRAY[$6::uuid], 7, 9)',
		[ids.persona, ids.workspace, 'vendor_owner', 'vendor_owner', ids.vendor, ids.location],
	)
	await pool.query(
		'INSERT INTO "sessions" (id, "user_id", "workspace_id", "expires_at", "active_vendor_id", "active_role") VALUES ($1::uuid, $2::uuid, $3::uuid, now() + interval \'1 hour\', $4::uuid, $5)',
		[ids.session, ids.user, ids.workspace, ids.vendor, 'vendor_owner'],
	)
	await pool.query(
		'INSERT INTO "provider_inbox_events" ("workspace_id", provider, "provider_event_id", "payload_hash", payload) VALUES ($1::uuid, $2, $3, $4, $5::jsonb)',
		[ids.workspace, 'fake-payment', `restore-${ids.event}`, 'fixture-hash', JSON.stringify({ fixture: true })],
	)
	await pool.query(
		'INSERT INTO "outbox_events" ("event_id", "workspace_id", type, payload, "occurred_at") VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, now())',
		[ids.event, ids.workspace, 'FoundationCommandAccepted', JSON.stringify({ fixture: true })],
	)
	await pool.query('INSERT INTO "audit_logs" ("workspace_id", "actor_id", action, "correlation_id", metadata) VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::jsonb)', [
		ids.workspace,
		ids.user,
		'restore.fixture',
		ids.event,
		JSON.stringify({ fixture: true }),
	])

	const expected = await fixtureCounts()
	run('docker', [
		'compose',
		'exec',
		'-T',
		'postgres',
		'pg_dump',
		'--username',
		databaseUser,
		'--dbname',
		databaseName,
		'--schema',
		schema,
		'--format',
		'custom',
		'--file',
		dumpPath,
	])
	await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
	run('docker', [
		'compose',
		'exec',
		'-T',
		'postgres',
		'pg_restore',
		'--username',
		databaseUser,
		'--dbname',
		databaseName,
		'--exit-on-error',
		'--no-owner',
		'--no-privileges',
		dumpPath,
	])
	assert.deepEqual(await fixtureCounts(), expected)
	process.stdout.write('Disposable PostgreSQL restore rehearsal passed.\n')
} finally {
	await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
	await pool.end()
	spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'rm', '-f', dumpPath], { stdio: 'ignore' })
}
