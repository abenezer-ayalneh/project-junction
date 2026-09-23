import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const require = createRequire(new URL('../libs/platform-core/package.json', import.meta.url))
const { Pool } = require('pg')

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to a local synthetic PostgreSQL database.')

const databaseUrl = new URL(process.env.DATABASE_URL)
if (!['localhost', '127.0.0.1'].includes(databaseUrl.hostname)) throw new Error('Populated upgrade checks require a loopback database.')

const schema = `phase00_upgrade_${randomUUID().replaceAll('-', '')}`
databaseUrl.searchParams.set('schema', schema)
const pool = new Pool({ connectionString: databaseUrl.toString() })
let client

const migrations = [
	'prisma/migrations/20260831120000_platform_foundation/migration.sql',
	'prisma/migrations/20260921000000_durable_foundation/migration.sql',
	'prisma/migrations/20260922000000_demo_persona_access/migration.sql',
	'prisma/migrations/20260922010000_provider_timeout_reconciliation/migration.sql',
	'prisma/migrations/20260922020000_adult_verification_lifecycle/migration.sql',
	'prisma/migrations/20260922030000_demo_provider_quota/migration.sql',
	'prisma/migrations/20260922040000_staff_user_linkage/migration.sql',
	'prisma/migrations/20260922050000_public_vendor_browse/migration.sql',
	'prisma/migrations/20260922060000_adult_verification_mixed_version_compatibility/migration.sql',
	'prisma/migrations/20260922070000_demo_persona_command_quota/migration.sql',
	'prisma/migrations/20260923000000_phase_01_vendor_catalog/migration.sql',
	'prisma/migrations/20260923010000_snake_case_identifiers/migration.sql',
	'prisma/migrations/20260923020000_legacy_identifier_compatibility/migration.sql',
	'prisma/migrations/20260923030000_synthetic_external_effect_idempotency/migration.sql',
	'prisma/migrations/20260923040000_inventory_movements/migration.sql',
]

try {
	client = await pool.connect()
	await client.query(`CREATE SCHEMA "${schema}"`)
	await client.query(`SET search_path TO "${schema}", public`)
	await client.query(await readFile(migrations[0], 'utf8'))

	const ids = {
		user: randomUUID(),
		workspace: randomUUID(),
		vendor: randomUUID(),
		location: randomUUID(),
		session: randomUUID(),
		inbox: randomUUID(),
	}
	// This fixture targets the pre-snake-case schema so the populated upgrade verifies the rename migration.
	await client.query('INSERT INTO "User" (id, email, "verifiedAt") VALUES ($1::uuid, $2, now())', [ids.user, `${ids.user}@example.invalid`])
	await client.query('INSERT INTO "Workspace" (id, kind) VALUES ($1::uuid, $2)', [ids.workspace, 'synthetic'])
	await client.query('INSERT INTO "Vendor" (id, "workspaceId") VALUES ($1::uuid, $2::uuid)', [ids.vendor, ids.workspace])
	await client.query('INSERT INTO "Location" (id, "vendorId") VALUES ($1::uuid, $2::uuid)', [ids.location, ids.vendor])
	await client.query('INSERT INTO "Session" (id, "userId", "workspaceId", "expiresAt") VALUES ($1::uuid, $2::uuid, $3::uuid, now() + interval \'1 hour\')', [
		ids.session,
		ids.user,
		ids.workspace,
	])
	await client.query('INSERT INTO "ProviderInboxEvent" (id, provider, "providerEventId", "payloadHash", payload) VALUES ($1::uuid, $2, $3, $4, $5::jsonb)', [
		ids.inbox,
		'fake-payment',
		`legacy-${ids.inbox}`,
		'legacy-hash',
		JSON.stringify({ legacy: true }),
	])

	for (const migration of migrations.slice(1)) await client.query(await readFile(migration, 'utf8'))

	const session = await client.query(
		'SELECT "user_id" AS "userId", "workspace_id" AS "workspaceId", "active_vendor_id" AS "activeVendorId", "active_role" AS "activeRole" FROM "sessions" WHERE id = $1::uuid',
		[ids.session],
	)
	assert.deepEqual(session.rows, [{ userId: ids.user, workspaceId: ids.workspace, activeVendorId: null, activeRole: null }])
	assert.deepEqual((await client.query('SELECT "adult_verification_state" AS "adultVerificationState" FROM "users" WHERE id = $1::uuid', [ids.user])).rows, [
		{ adultVerificationState: 'verified' },
	])
	const oldWriterUser = randomUUID()
	await client.query('INSERT INTO "users" (id, email, "verified_at") VALUES ($1::uuid, $2, now())', [oldWriterUser, `${oldWriterUser}@example.invalid`])
	assert.deepEqual(
		(await client.query('SELECT "adult_verification_state" AS "adultVerificationState" FROM "users" WHERE id = $1::uuid', [oldWriterUser])).rows,
		[{ adultVerificationState: 'legacy_verified_compat' }],
	)
	const inbox = await client.query(
		'SELECT "workspace_id" AS "workspaceId", "provider_reference" AS "providerReference", "reconciliation_state" AS "reconciliationState", "reconciled_at" AS "reconciledAt", payload FROM "provider_inbox_events" WHERE id = $1::uuid',
		[ids.inbox],
	)
	assert.deepEqual(inbox.rows, [
		{ workspaceId: null, providerReference: null, reconciliationState: 'reconciled', reconciledAt: null, payload: { legacy: true } },
	])
	assert.equal((await client.query('SELECT count(*)::int AS count FROM "demo_personas"')).rows[0].count, 0)

	const result = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'diff', '--exit-code', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma'], {
		env: { ...process.env, DATABASE_URL: databaseUrl.toString() },
		stdio: 'inherit',
	})
	if (result.status !== 0) throw new Error('Upgraded populated schema does not match the Prisma schema.')
	process.stdout.write('Populated supported-foundation upgrade check passed.\n')
} finally {
	if (client) {
		await client.query('RESET search_path')
		client.release()
	}
	await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
	await pool.end()
}
