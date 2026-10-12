import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../libs/platform-core/package.json', import.meta.url))
const { Pool } = require('pg')
const action = process.argv[2]
const email = process.env.LOCAL_FINANCE_EMAIL?.trim().toLowerCase()
const orderId = process.env.LOCAL_GOODS_ORDER_ID?.trim()
const operator = process.env.LOCAL_OPERATOR_LABEL?.trim()
const reason = process.env.LOCAL_GOODS_GRANT_REASON?.trim()
const ttlMinutes = Number(process.env.LOCAL_GOODS_GRANT_MINUTES ?? '60')
const url = new URL(process.env.DATABASE_URL ?? '')
const schema = url.searchParams.get('schema') ?? 'public'
if (process.env.JUNCTION_RUNTIME_MODE !== 'local' || !['localhost', '127.0.0.1'].includes(url.hostname) || !/^[a-z_][a-z0-9_]*$/.test(schema))
	throw new Error('Scoped cancellation grants require a local loopback database and local runtime.')
if (
	!['grant', 'revoke'].includes(action) ||
	!email ||
	!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
	!orderId ||
	!/^[a-f0-9-]{36}$/i.test(orderId) ||
	!operator ||
	operator.length > 120 ||
	!reason ||
	reason.length < 5 ||
	reason.length > 500 ||
	!Number.isInteger(ttlMinutes) ||
	ttlMinutes < 1 ||
	ttlMinutes > 1440
)
	throw new Error(
		'Choose grant/revoke and set LOCAL_FINANCE_EMAIL, LOCAL_GOODS_ORDER_ID, LOCAL_OPERATOR_LABEL and LOCAL_GOODS_GRANT_REASON. Grant duration is 1–1440 minutes (default 60).',
	)
const pool = new Pool({ connectionString: url.toString(), options: `-c search_path=${schema},public` })
const client = await pool.connect()
try {
	await client.query('BEGIN')
	const subject = await client.query(
		`SELECT u.id, s.workspace_id FROM users u JOIN junction_auth."user" a ON a.id = u.id::text
	 JOIN sessions s ON s.user_id = u.id JOIN workspaces w ON w.id = s.workspace_id
	 WHERE lower(u.email) = $1 AND lower(a.email) = lower(u.email) AND a."emailVerified" = true
	 AND s.revoked_at IS NULL AND s.expires_at > now() AND s.active_vendor_id IS NULL AND s.active_role IS NULL AND w.kind = 'real'
	 ORDER BY s.created_at ASC LIMIT 1`,
		[email],
	)
	if (subject.rowCount !== 1) throw new Error('A verified local account with an active non-Vendor session is required.')
	const { id: userId, workspace_id: workspaceId } = subject.rows[0]
	await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`goods-cancel-grant:${userId}:${workspaceId}:${orderId}`])
	const scope = await client.query(
		`SELECT o.id FROM goods_vendor_orders o JOIN goods_purchases p ON p.id = o.purchase_id
	 WHERE o.id = $1 AND p.customer_id <> $2 AND NOT EXISTS (SELECT 1 FROM vendor_memberships m WHERE m.vendor_id = o.vendor_id AND m.user_id = $2 AND m.revoked_at IS NULL)`,
		[orderId, userId],
	)
	if (action === 'grant' && scope.rowCount !== 1)
		throw new Error('The Order is missing or conflicts with the Finance account own purchase/Vendor membership.')
	const changed =
		action === 'grant'
			? await client.query(
					`INSERT INTO goods_cancellation_grants(user_id,workspace_id,order_id,reason,granted_by,expires_at)
		 VALUES ($1,$2,$3,$4,$5,now()+$6::integer*interval '1 minute')
		 ON CONFLICT(user_id,workspace_id,order_id) DO UPDATE SET reason=EXCLUDED.reason,granted_by=EXCLUDED.granted_by,granted_at=now(),expires_at=EXCLUDED.expires_at,revoked_at=NULL RETURNING id`,
					[userId, workspaceId, orderId, reason, operator, ttlMinutes],
				)
			: await client.query(
					'UPDATE goods_cancellation_grants SET revoked_at=now() WHERE user_id=$1 AND workspace_id=$2 AND order_id=$3 AND revoked_at IS NULL RETURNING id',
					[userId, workspaceId, orderId],
				)
	if (changed.rowCount)
		await client.query('INSERT INTO audit_logs(workspace_id,actor_id,action,correlation_id,metadata) VALUES ($1,NULL,$2,$3,$4::jsonb)', [
			workspaceId,
			action === 'grant' ? 'goods.cancellation-authority-granted' : 'goods.cancellation-authority-revoked',
			randomUUID(),
			JSON.stringify({ subjectUserId: userId, orderId, operator, reason, source: 'local-operator-cli', ttlMinutes }),
		])
	await client.query('COMMIT')
	console.log(
		action === 'grant'
			? 'Order-scoped local Platform Finance cancellation authority granted.'
			: 'Order-scoped local cancellation authority revoked or already inactive.',
	)
} catch (error) {
	await client.query('ROLLBACK')
	throw error
} finally {
	client.release()
	await pool.end()
}
