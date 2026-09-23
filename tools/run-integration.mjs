import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
const require = createRequire(new URL('../libs/platform-core/package.json', import.meta.url))
const { Pool } = require('pg')
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to a local synthetic PostgreSQL database.')
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
function run(args) {
	const result = spawnSync('pnpm', args, { env, stdio: 'inherit' })
	if (result.status !== 0) throw new Error('Integration command failed.')
}
try {
	run(['exec', 'prisma', 'migrate', 'deploy'])
	run(['exec', 'prisma', 'migrate', 'deploy']) // restart/replay must be a no-op
	run(['db:compat:check'])
	run(['db:upgrade:check'])
	run(['db:restore:check'])
	run(['db:lock:measure'])
	run(['db:rollback:check'])
	run(['exec', 'jest', '--config', 'libs/platform-core/jest.config.cts', '--testMatch', '**/*.integration.ts', '--runInBand'])
	run(['exec', 'node', 'tools/runtime-smoke.mjs'])
} finally {
	await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
	await pool.end()
}
