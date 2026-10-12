import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const require = createRequire(new URL('../libs/platform-core/package.json', import.meta.url))
const { Pool } = require('pg')

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to a local PostgreSQL database.')

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
	'prisma/migrations/20260924000000_media_upload_intents/migration.sql',
	'prisma/migrations/20260924010000_video_processing_and_moderation/migration.sql',
	'prisma/migrations/20260925000000_real_platform_reviewer_grants/migration.sql',
	'prisma/migrations/20260928000000_retire_legacy_adult_default/migration.sql',
	'prisma/migrations/20260929000000_retire_synthetic_schema/migration.sql',
	'prisma/migrations/20261001000000_durable_didit_sessions/migration.sql',
	'prisma/migrations/20261002000000_durable_realtime_cursor/migration.sql',
	'prisma/migrations/20261006000000_phase_01_marketplace_discovery/migration.sql',
	'prisma/migrations/20261006010000_phase_01_listing_images/migration.sql',
	'prisma/migrations/20261006020000_phase_01_storefront_branding/migration.sql',
	'prisma/migrations/20261009000000_rejected_media_retention/migration.sql',
	'prisma/migrations/20261012000000_inventory_transfers/migration.sql',
	'prisma/migrations/20261012010000_goods_quotes_and_holds/migration.sql',
	'prisma/migrations/20261012020000_goods_paid_orders/migration.sql',
	'prisma/migrations/20261012030000_goods_order_cancellations/migration.sql',
	'prisma/migrations/20261012040000_goods_pickup_fulfillment/migration.sql',
	'prisma/migrations/20261012050000_goods_delivery_milestones/migration.sql',
	'prisma/migrations/20261012060000_goods_returns/migration.sql',
	'prisma/migrations/20261012070000_service_definitions/migration.sql',
	'prisma/migrations/20261012080000_authoritative_schedules/migration.sql',
	'prisma/migrations/20261012090000_atomic_booking_holds/migration.sql',
	'prisma/migrations/20261012100000_paid_bookings/migration.sql',
	'prisma/migrations/20261012110000_booking_cancellations/migration.sql',
	'prisma/migrations/20261012120000_booking_amendments/migration.sql',
	'prisma/migrations/20261012130000_substitutions_waitlists/migration.sql',
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
	await client.query('INSERT INTO "Workspace" (id, kind) VALUES ($1::uuid, $2)', [ids.workspace, 'real'])
	await client.query('INSERT INTO "Vendor" (id, "workspaceId") VALUES ($1::uuid, $2::uuid)', [ids.vendor, ids.workspace])
	await client.query('INSERT INTO "Location" (id, "vendorId") VALUES ($1::uuid, $2::uuid)', [ids.location, ids.vendor])
	await client.query('INSERT INTO "Session" (id, "userId", "workspaceId", "expiresAt") VALUES ($1::uuid, $2::uuid, $3::uuid, now() + interval \'1 hour\')', [
		ids.session,
		ids.user,
		ids.workspace,
	])
	await client.query('INSERT INTO "ProviderInboxEvent" (id, provider, "providerEventId", "payloadHash", payload) VALUES ($1::uuid, $2, $3, $4, $5::jsonb)', [
		ids.inbox,
		'didit',
		`legacy-${ids.inbox}`,
		'legacy-hash',
		JSON.stringify({ legacy: true }),
	])

	const inventoryListing = randomUUID()
	const inventoryMovement = randomUUID()
	for (const migration of migrations.slice(1)) {
		if (migration.endsWith('20261012000000_inventory_transfers/migration.sql')) {
			await client.query(
				'INSERT INTO listings (id, vendor_id, kind, category, title, description, price_cents, updated_at) VALUES ($1, $2, $3, $4, $5, $6, 1000, now())',
				[
					inventoryListing,
					ids.vendor,
					'product',
					'goods',
					'Populated inventory upgrade fixture',
					'Verify historical stock survives the transfer migration',
				],
			)
			await client.query(
				'INSERT INTO inventory_movements (id, location_id, listing_id, reason, on_hand_delta, actor_kind, actor_id) VALUES ($1, $2, $3, $4, 7, $5, $6)',
				[inventoryMovement, ids.location, inventoryListing, 'received', 'user', ids.user],
			)
		}
		await client.query(await readFile(migration, 'utf8'))
	}
	assert.deepEqual(
		(await client.query('SELECT on_hand_delta, reserved_delta, transfer_id FROM inventory_movements WHERE id = $1', [inventoryMovement])).rows,
		[{ on_hand_delta: 7, reserved_delta: 0, transfer_id: null }],
	)
	await assert.rejects(client.query('UPDATE inventory_movements SET on_hand_delta = 8 WHERE id = $1', [inventoryMovement]), /immutable/)

	const session = await client.query(
		'SELECT "user_id" AS "userId", "workspace_id" AS "workspaceId", "active_vendor_id" AS "activeVendorId", "active_role" AS "activeRole", "realtime_cursor" AS "realtimeCursor" FROM "sessions" WHERE id = $1::uuid',
		[ids.session],
	)
	assert.deepEqual(session.rows, [{ userId: ids.user, workspaceId: ids.workspace, activeVendorId: null, activeRole: null, realtimeCursor: null }])
	assert.deepEqual((await client.query('SELECT "adult_verification_state" AS "adultVerificationState" FROM "users" WHERE id = $1::uuid', [ids.user])).rows, [
		{ adultVerificationState: 'verified' },
	])
	const oldWriterUser = randomUUID()
	await client.query('INSERT INTO "users" (id, email, "verified_at") VALUES ($1::uuid, $2, now())', [oldWriterUser, `${oldWriterUser}@example.invalid`])
	assert.deepEqual(
		(await client.query('SELECT "adult_verification_state" AS "adultVerificationState" FROM "users" WHERE id = $1::uuid', [oldWriterUser])).rows,
		[{ adultVerificationState: 'unverified' }],
	)
	const inbox = await client.query(
		'SELECT "workspace_id" AS "workspaceId", "provider_reference" AS "providerReference", "reconciliation_state" AS "reconciliationState", "reconciled_at" AS "reconciledAt", payload FROM "provider_inbox_events" WHERE id = $1::uuid',
		[ids.inbox],
	)
	assert.deepEqual(inbox.rows, [
		{ workspaceId: null, providerReference: null, reconciliationState: 'reconciled', reconciledAt: null, payload: { legacy: true } },
	])
	assert.deepEqual((await client.query('SELECT to_regclass($1) AS value', [`${schema}.demo_personas`])).rows, [{ value: null }])

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
