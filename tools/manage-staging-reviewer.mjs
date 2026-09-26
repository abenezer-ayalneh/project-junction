import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../libs/platform-core/package.json', import.meta.url))
const { Pool } = require('pg')

const action = process.argv[2]
const email = process.env.STAGING_REVIEWER_EMAIL?.trim().toLowerCase()
const operator = process.env.STAGING_OPERATOR_LABEL?.trim()
if (!['grant', 'revoke'].includes(action) || !email || !operator || !process.env.DATABASE_URL || process.env.JUNCTION_RUNTIME_MODE !== 'staging') {
	throw new Error('Set staging DATABASE_URL, JUNCTION_RUNTIME_MODE, STAGING_REVIEWER_EMAIL, and STAGING_OPERATOR_LABEL; choose grant or revoke.')
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || operator.length > 120) throw new Error('Invalid reviewer email or operator label.')
const databaseUrl = new URL(process.env.DATABASE_URL)
const schema = databaseUrl.searchParams.get('schema') ?? 'public'
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('Unsupported database schema name.')
const pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` })
const client = await pool.connect()
try {
	await client.query('BEGIN')
	const identity = await client.query(
		action === 'grant'
			? `SELECT u.id, s.workspace_id
		 FROM users u
		 JOIN junction_auth."user" a ON a.id = u.id::text AND lower(a.email) = lower(u.email)
		 JOIN sessions s ON s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > now()
		 JOIN workspaces w ON w.id = s.workspace_id AND w.kind = 'real'
		 WHERE lower(u.email) = $1 AND a."emailVerified" = true
		   AND u.adult_verification_state = 'verified' AND u.verified_at IS NOT NULL
		 ORDER BY s.created_at ASC LIMIT 1`
			: `SELECT u.id, s.workspace_id
		 FROM users u
		 JOIN platform_reviewer_grants g ON g.user_id = u.id
		 JOIN sessions s ON s.user_id = u.id
		 JOIN workspaces w ON w.id = s.workspace_id AND w.kind = 'real'
		 WHERE lower(u.email) = $1
		 ORDER BY s.created_at ASC LIMIT 1`,
		[email],
	)
	if (identity.rowCount !== 1) throw new Error('Reviewer identity is missing or ineligible for this action.')
	const { id: userId, workspace_id: workspaceId } = identity.rows[0]
	await client.query('SELECT pg_advisory_xact_lock(20260925, hashtext($1))', [userId])
	const changed =
		action === 'grant'
			? await client.query(
					`INSERT INTO platform_reviewer_grants (user_id, granted_by)
					 VALUES ($1, $2)
					 ON CONFLICT (user_id) DO UPDATE SET granted_at = now(), revoked_at = NULL, granted_by = EXCLUDED.granted_by
					 WHERE platform_reviewer_grants.revoked_at IS NOT NULL
					 RETURNING user_id`,
					[userId, operator],
				)
			: await client.query('UPDATE platform_reviewer_grants SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL RETURNING user_id', [userId])
	if (changed.rowCount === 1) {
		await client.query('INSERT INTO audit_logs (workspace_id, actor_id, action, correlation_id, metadata) VALUES ($1, NULL, $2, $3, $4::jsonb)', [
			workspaceId,
			action === 'grant' ? 'platform.reviewer-granted' : 'platform.reviewer-revoked',
			randomUUID(),
			JSON.stringify({ operator, subjectUserId: userId, source: 'staging-operator-cli' }),
		])
	}
	await client.query('COMMIT')
	process.stdout.write(`Reviewer ${action} ${changed.rowCount === 1 ? 'applied' : 'already in requested state'}.\n`)
} catch (error) {
	await client.query('ROLLBACK')
	throw error
} finally {
	client.release()
	await pool.end()
}
