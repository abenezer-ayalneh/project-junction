import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../libs/platform-core/package.json', import.meta.url))
const { Pool } = require('pg')
const action = process.argv[2],
	email = process.env.LOCAL_FINANCE_EMAIL?.trim().toLowerCase(),
	operator = process.env.LOCAL_OPERATOR_LABEL?.trim(),
	reason = process.env.LOCAL_FINANCE_REASON?.trim(),
	workspaceId = process.env.LOCAL_FINANCE_WORKSPACE_ID
const expiresAt = process.env.LOCAL_FINANCE_EXPIRES_AT ? new Date(process.env.LOCAL_FINANCE_EXPIRES_AT) : null
if (
	!['grant', 'revoke'].includes(action) ||
	!email ||
	!operator ||
	!reason ||
	!workspaceId ||
	!process.env.DATABASE_URL ||
	process.env.JUNCTION_RUNTIME_MODE !== 'local'
)
	throw new Error(
		'Set local DATABASE_URL, JUNCTION_RUNTIME_MODE, LOCAL_FINANCE_EMAIL, LOCAL_FINANCE_WORKSPACE_ID, LOCAL_OPERATOR_LABEL and LOCAL_FINANCE_REASON; choose grant or revoke.',
	)
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || operator.length > 120 || reason.length > 500 || !/^[0-9a-f-]{36}$/i.test(workspaceId))
	throw new Error('Invalid local Finance identity, scope or provenance.')
if (action === 'grant' && (!expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()))
	throw new Error('Set a future LOCAL_FINANCE_EXPIRES_AT for this explicit temporary grant.')
const url = new URL(process.env.DATABASE_URL),
	schema = url.searchParams.get('schema') ?? 'public'
if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/^[a-z_][a-z0-9_]*$/.test(schema))
	throw new Error('Local Finance grants require a loopback database and valid schema.')
const pool = new Pool({ connectionString: url.toString(), options: `-c search_path=${schema},public` }),
	client = await pool.connect()
try {
	await client.query('BEGIN')
	await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`junction:finance-grant:${workspaceId}:${email}`])
	const identity = await client.query(
		`SELECT u.id FROM users u JOIN junction_auth."user" a ON a.id=u.id::text AND lower(a.email)=lower(u.email) WHERE lower(u.email)=$1 AND a."emailVerified"=true`,
		[email],
	)
	if (identity.rowCount !== 1) throw new Error('Finance identity must exist and be email-verified.')
	const userId = identity.rows[0].id
	if (action === 'grant') {
		const scope = await client.query(
			`SELECT w.id FROM workspaces w WHERE w.id=$1 AND w.kind='real' AND EXISTS(SELECT 1 FROM sessions s WHERE s.user_id=$2 AND s.workspace_id=w.id AND s.revoked_at IS NULL AND s.expires_at>now()) AND NOT EXISTS(SELECT 1 FROM vendor_memberships m WHERE m.user_id=$2 AND m.revoked_at IS NULL)`,
			[workspaceId, userId],
		)
		if (scope.rowCount !== 1) throw new Error('Finance configuration needs a live non-Vendor session in this real workspace.')
	}
	const result =
		action === 'grant'
			? await client.query(
					`INSERT INTO platform_finance_grants(user_id,workspace_id,expires_at,granted_by,reason) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,workspace_id) DO UPDATE SET expires_at=EXCLUDED.expires_at,granted_by=EXCLUDED.granted_by,reason=EXCLUDED.reason,revoked_at=NULL RETURNING id`,
					[userId, workspaceId, expiresAt, operator, reason],
				)
			: await client.query(
					`UPDATE platform_finance_grants SET revoked_at=now() WHERE user_id=$1 AND workspace_id=$2 AND revoked_at IS NULL RETURNING id`,
					[userId, workspaceId],
				)
	if (result.rowCount)
		await client.query(`INSERT INTO audit_logs(workspace_id,actor_id,action,correlation_id,metadata) VALUES($1,NULL,$2,$3,$4::jsonb)`, [
			workspaceId,
			`platform.finance-configuration-${action === 'grant' ? 'granted' : 'revoked'}`,
			randomUUID(),
			JSON.stringify({
				operator,
				reason,
				subjectUserId: userId,
				source: 'local-operator-cli',
				expiresAt: action === 'grant' ? expiresAt.toISOString() : null,
			}),
		])
	await client.query('COMMIT')
	console.log(`Local Finance configuration ${action} ${result.rowCount ? 'applied' : 'already revoked'}.`)
} catch (error) {
	await client.query('ROLLBACK')
	throw error
} finally {
	client.release()
	await pool.end()
}
