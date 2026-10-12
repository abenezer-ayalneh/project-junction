import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../libs/platform-core/package.json', import.meta.url))
const { Pool } = require('pg')
const action = process.argv[2],
	membershipId = process.env.LOCAL_SCHEDULING_MEMBERSHIP_ID,
	operator = process.env.LOCAL_OPERATOR_LABEL?.trim(),
	reason = process.env.LOCAL_SCHEDULING_AUTHORITY_REASON?.trim()
const url = new URL(process.env.DATABASE_URL ?? '')
const schema = url.searchParams.get('schema') ?? 'public'
if (
	process.env.JUNCTION_RUNTIME_MODE !== 'local' ||
	!['localhost', '127.0.0.1'].includes(url.hostname) ||
	!/^[a-z_][a-z0-9_]*$/.test(schema) ||
	!['enable', 'disable'].includes(action) ||
	!membershipId ||
	!/^[a-f0-9-]{36}$/i.test(membershipId) ||
	!operator ||
	!reason ||
	reason.length < 5
)
	throw new Error(
		'Set local loopback DATABASE_URL, LOCAL_SCHEDULING_MEMBERSHIP_ID, LOCAL_OPERATOR_LABEL and LOCAL_SCHEDULING_AUTHORITY_REASON; choose enable/disable.',
	)
const pool = new Pool({ connectionString: url.toString(), options: `-c search_path=${schema},public` })
const client = await pool.connect()
try {
	await client.query('BEGIN')
	const workspace = await client.query(
		'SELECT v.workspace_id FROM vendor_memberships m JOIN vendors v ON v.id=m.vendor_id JOIN workspaces w ON w.id=v.workspace_id WHERE m.id=$1 AND w.kind=$2',
		[membershipId, 'real'],
	)
	if (workspace.rowCount !== 1) throw new Error('A real local Vendor membership is required.')
	await client.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [workspace.rows[0].workspace_id])
	const result = await client.query(
		`SELECT m.id,m.user_id,v.workspace_id FROM vendor_memberships m JOIN vendors v ON v.id=m.vendor_id WHERE m.id=$1 AND m.role='vendor_staff' AND m.revoked_at IS NULL AND cardinality(m.location_ids)>0 FOR UPDATE OF m`,
		[membershipId],
	)
	if (result.rowCount !== 1) throw new Error('An active assigned Staff membership is required; a Staff profile alone is insufficient.')
	await client.query('UPDATE vendor_memberships SET scheduling_enabled=$1 WHERE id=$2', [action === 'enable', membershipId])
	await client.query('INSERT INTO audit_logs(workspace_id,actor_id,action,correlation_id,metadata)VALUES($1,NULL,$2,$3,$4::jsonb)', [
		result.rows[0].workspace_id,
		action === 'enable' ? 'schedule.authority-enabled' : 'schedule.authority-disabled',
		randomUUID(),
		JSON.stringify({ membershipId, subjectUserId: result.rows[0].user_id, operator, reason, source: 'local-operator-cli' }),
	])
	await client.query('COMMIT')
	console.log('Local assigned scheduling authority updated.')
} catch (error) {
	await client.query('ROLLBACK')
	throw error
} finally {
	client.release()
	await pool.end()
}
