import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../libs/platform-core/package.json', import.meta.url))
const { Pool } = require('pg')

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to a local PostgreSQL database.')

const databaseUrl = new URL(process.env.DATABASE_URL)
if (!['localhost', '127.0.0.1'].includes(databaseUrl.hostname)) throw new Error('Migration compatibility checks require a loopback database.')

const schema = `phase00_compat_${randomUUID().replaceAll('-', '')}`
databaseUrl.searchParams.set('schema', schema)
const pool = new Pool({ connectionString: databaseUrl.toString() })

try {
	const env = { ...process.env, DATABASE_URL: databaseUrl.toString() }
	const migrate = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { env, stdio: 'inherit' })
	if (migrate.status !== 0) throw new Error('Migration history could not be applied to the disposable compatibility schema.')

	const result = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'diff', '--exit-code', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma'], {
		env,
		stdio: 'inherit',
	})
	if (result.status !== 0) throw new Error('Migration history does not match the Prisma schema.')
} finally {
	await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
	await pool.end()
}
