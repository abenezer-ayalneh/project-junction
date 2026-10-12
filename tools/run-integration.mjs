import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { globSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../libs/platform-core/package.json', import.meta.url))
const { Pool } = require('pg')
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to a local PostgreSQL database.')
const base = new URL(process.env.DATABASE_URL)
if (!['localhost', '127.0.0.1'].includes(base.hostname)) throw new Error('Integration tests require a loopback database.')
const schema = `phase00_${randomUUID().replaceAll('-', '')}`
const pool = new Pool({ connectionString: base.toString() })
base.searchParams.set('schema', schema)
const env = {
	...process.env,
	DATABASE_URL: base.toString(),
	FOUNDATION_INTEGRATION: '1',
	TS_NODE_COMPILER_OPTIONS: '{"moduleResolution":"node10","module":"commonjs","customConditions":null}',
}
const focusedTestName = process.env.FOUNDATION_TEST_NAME
const authProbe = process.env.FOUNDATION_AUTH_PROBE
if (authProbe && (authProbe !== 'google-linking' || focusedTestName)) throw new Error('Use FOUNDATION_AUTH_PROBE=google-linking without FOUNDATION_TEST_NAME.')
function run(args, overrides = {}) {
	const result = spawnSync('pnpm', args, { env: { ...env, ...overrides }, stdio: 'inherit' })
	if (result.status !== 0) throw new Error('Integration command failed.')
}
async function cleanSchema() {
	try {
		// Auth uses its fixed schema; remove only identities owned by this run's
		// isolated domain fixtures before dropping their membership records.
		const tables = await pool.query('SELECT to_regclass($1) AS domain_users, to_regclass($2) AS auth_users', [`${schema}.users`, 'junction_auth."user"'])
		if (tables.rows[0].domain_users && tables.rows[0].auth_users) {
			await pool.query(`DELETE FROM junction_auth."user" WHERE id IN (SELECT id::text FROM "${schema}".users)`)
		}
	} finally {
		await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
	}
}

try {
	run(['exec', 'prisma', 'migrate', 'deploy'])
	run(['exec', 'prisma', 'migrate', 'deploy']) // restart/replay must be a no-op
	run(['db:auth:migrate'])
	if (!focusedTestName || authProbe) run(['exec', 'node', 'tools/check-google-account-linking.mjs'], { JUNCTION_RUNTIME_MODE: 'local' })
	if (!focusedTestName && !authProbe) {
		run(['exec', 'node', 'tools/check-better-auth-mfa.mjs'], { JUNCTION_RUNTIME_MODE: 'staging' })
		run(['db:compat:check'])
		run(['db:upgrade:check'])
		run(['db:restore:check'])
		run(['db:lock:measure'])
	}
	// Generic fixtures use local policy; strict-policy cases explicitly select their runtime.
	if (!authProbe) {
		const jestArgs = ['exec', 'jest', '--config', 'libs/platform-core/jest.config.cts', '--testMatch', '**/*.integration.ts', '--runInBand']
		if (focusedTestName) run([...jestArgs, '--testNamePattern', focusedTestName], { JUNCTION_RUNTIME_MODE: 'local' })
		else {
			// Public discovery, media ownership and commerce suites intentionally
			// retain domain fixtures. Isolate files so test order cannot alter pages
			// or make a temporary object store appear incomplete.
			const files = globSync('libs/platform-core/src/**/*.integration.ts').sort()
			if (!files.length) throw new Error('No integration suites found.')
			for (const file of files) {
				await cleanSchema()
				run(['exec', 'prisma', 'migrate', 'deploy'])
				run([...jestArgs, '--runTestsByPath', file], { JUNCTION_RUNTIME_MODE: 'local' })
			}
			console.log(`Full local integration suites passed: ${files.length} isolated files.`)
			await cleanSchema()
			run(['exec', 'prisma', 'migrate', 'deploy'])
		}
	}
	if (!authProbe && (!focusedTestName || /atomic Booking holds|paid Booking confirmation|Booking cancellation/i.test(focusedTestName)))
		run(['exec', 'node', 'tools/check-booking-holds.mjs'], { JUNCTION_RUNTIME_MODE: 'local' })
	if (!authProbe && (!focusedTestName || /authoritative scheduling/i.test(focusedTestName)))
		run(['exec', 'node', 'tools/check-service-scheduling.mjs'], { JUNCTION_RUNTIME_MODE: 'local' })
	if (!authProbe && (!focusedTestName || /Service definitions/i.test(focusedTestName)))
		run(['exec', 'node', 'tools/check-service-definitions.mjs'], { JUNCTION_RUNTIME_MODE: 'local' })
	if (!authProbe && (!focusedTestName || /inventory/i.test(focusedTestName)))
		run(['exec', 'node', 'tools/check-inventory-transfers.mjs'], { JUNCTION_RUNTIME_MODE: 'local' })
} finally {
	try {
		await cleanSchema()
	} finally {
		await pool.end()
	}
}
