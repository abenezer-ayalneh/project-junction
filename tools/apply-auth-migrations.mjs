import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../libs/platform-core/package.json', import.meta.url))
const { Pool } = require('pg')

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const directory = new URL('../auth/migrations/', import.meta.url)

try {
	const migrations = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()
	for (const name of migrations) {
		const client = await pool.connect()
		try {
			await client.query('BEGIN')
			await client.query('SELECT pg_advisory_xact_lock(20260925, 1)')
			await client.query('CREATE SCHEMA IF NOT EXISTS junction_auth')
			await client.query('CREATE TABLE IF NOT EXISTS junction_auth.migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
			const applied = await client.query('SELECT 1 FROM junction_auth.migrations WHERE name = $1', [name])
			if (applied.rowCount === 0) {
				await client.query(await readFile(new URL(name, directory), 'utf8'))
				await client.query('INSERT INTO junction_auth.migrations (name) VALUES ($1)', [name])
				process.stdout.write(`Applied auth migration ${name}\n`)
			}
			await client.query('COMMIT')
		} catch (error) {
			await client.query('ROLLBACK')
			throw error
		} finally {
			client.release()
		}
	}
} finally {
	await pool.end()
}
