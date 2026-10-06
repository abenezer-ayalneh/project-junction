import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'

import { io } from 'socket.io-client'

import { PostgresFoundation } from '../libs/platform-core/dist/lib/postgres-foundation.js'

// Exercise the served local auth/API/gateway with disposable accounts only.
const databaseUrl = new URL(process.env.DATABASE_URL ?? '')
assert.equal(process.env.JUNCTION_RUNTIME_MODE, 'local')
assert.ok(['localhost', '127.0.0.1'].includes(databaseUrl.hostname))
assert.ok(!databaseUrl.searchParams.get('schema') || databaseUrl.searchParams.get('schema') === 'public')
const origin = 'http://localhost:3000'
const api = 'http://127.0.0.1:3001'
const health = await fetch(`${api}/v1/health`).then((response) => response.json())
assert.equal(health.runtimeMode, 'local')
assert.equal(health.storage, 'postgresql')
const require = createRequire(new URL('../libs/platform-core/package.json', import.meta.url))
const { Pool } = require('pg')
const { hashPassword } = await import(require.resolve('better-auth/crypto'))
const pool = new Pool({ connectionString: databaseUrl.toString() })
const repository = new PostgresFoundation(databaseUrl.toString())
const userId = randomUUID()
const email = `${userId}@example.invalid`
const password = randomBytes(24).toString('hex')
const vendors = []
let socket
let cookie = ''

async function request(path, body) {
	const response = await fetch(`${api}/v1${path}`, {
		method: body === undefined ? 'GET' : 'POST',
		headers: { cookie, origin, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	})
	return { status: response.status, body: await response.json() }
}
async function snapshot() {
	return {
		audit: await repository.db.auditLog.count({ where: { actorId: userId } }),
		outbox: await repository.db.outboxEvent.count(),
		vendors: await repository.db.vendor.findMany({ where: { id: { in: vendors } }, orderBy: { id: 'asc' } }),
		sessions: await repository.db.session.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
	}
}
async function deny(path, body) {
	const before = await snapshot()
	const result = await request(path, body)
	assert.equal(result.status, 403)
	assert.equal(result.body.code, 'ACCESS_DENIED')
	assert.deepEqual(await snapshot(), before, 'Denied request changed business state')
}
async function select(vendorId) {
	const result = await request('/account/active-vendor', { vendorId })
	assert.equal(result.status, 201)
	assert.equal(result.body.activeVendorId, vendorId)
	const context = await request('/access-context')
	assert.equal(context.status, 200)
	assert.equal(context.body.activeVendorId, vendorId)
	return context.body
}
async function join(room) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('Local room response timed out')), 5000)
		socket.once('room.joined', (result) => {
			clearTimeout(timer)
			resolve(result)
		})
		socket.emit('room.join', { room })
	})
}

try {
	await pool.query('INSERT INTO junction_auth."user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)', [userId, 'Local scope probe', email])
	await pool.query('INSERT INTO junction_auth.account (id, "accountId", "providerId", "userId", password, "updatedAt") VALUES ($1, $2, $3, $4, $5, now())', [
		randomUUID(),
		userId,
		'credential',
		userId,
		await hashPassword(password),
	])
	const login = await fetch(`${origin}/api/auth/sign-in/email`, {
		method: 'POST',
		headers: { origin, 'content-type': 'application/json' },
		body: JSON.stringify({ email, password }),
	})
	assert.equal(login.status, 200, 'Served local sign-in failed')
	cookie = login.headers
		.getSetCookie()
		.map((header) => header.split(';')[0])
		.join('; ')
	assert.ok(cookie)
	const context = await request('/access-context')
	assert.equal(context.status, 200)
	const { workspaceId } = context.body
	for (const displayName of ['Local probe first', 'Local probe second', 'Local probe foreign']) {
		const vendor = await repository.db.vendor.create({ data: { workspaceId, displayName } })
		vendors.push(vendor.id)
	}
	for (const vendorId of vendors.slice(0, 2)) {
		await repository.db.vendorMembership.create({ data: { userId, vendorId, role: 'vendor_owner', locationIds: [] } })
	}
	const memberships = await request('/account/vendor-memberships')
	assert.equal(memberships.status, 200)
	assert.deepEqual(memberships.body.items.map((item) => item.vendorId).sort(), vendors.slice(0, 2).sort())
	await select(vendors[0])
	await select(vendors[1])
	await deny('/account/active-vendor', { vendorId: vendors[2] })
	await select(null)
	await repository.db.vendorMembership.update({ where: { userId_vendorId: { userId, vendorId: vendors[1] } }, data: { revokedAt: new Date() } })
	await deny('/account/active-vendor', { vendorId: vendors[1] })
	await select(vendors[0])
	socket = io(api, { transports: ['websocket'], extraHeaders: { cookie, origin }, reconnection: false })
	await new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('Local socket connection timed out')), 5000)
		socket.once('connect', () => {
			clearTimeout(timer)
			resolve()
		})
		socket.once('connect_error', (error) => {
			clearTimeout(timer)
			reject(error)
		})
	})
	assert.equal((await join({ kind: 'vendor', workspaceId, vendorId: vendors[0] })).joined, true)
	assert.equal((await join({ kind: 'vendor', workspaceId, vendorId: vendors[2] })).joined, false)
	await repository.db.vendorMembership.update({ where: { userId_vendorId: { userId, vendorId: vendors[0] } }, data: { revokedAt: new Date() } })
	const before = await snapshot()
	await deny('/access-context')
	assert.equal((await join({ kind: 'vendor', workspaceId, vendorId: vendors[0] })).joined, false)
	assert.deepEqual(await snapshot(), before)
	const user = await repository.db.user.findUniqueOrThrow({ where: { id: userId } })
	assert.equal(user.adultVerificationState, 'unverified')
	assert.equal(user.verifiedAt, null)
	for (const session of await repository.db.session.findMany({ where: { userId } })) {
		assert.equal(session.mfaVerifiedAt, null)
		assert.equal(session.recentAuthAt, null)
	}
	console.log(
		'Served local scope probe passed: two Owner scopes, Customer return, foreign/revoked membership denial, open-socket revocation and unchanged denied-request state; identity/MFA remain deferred.',
	)
} finally {
	socket?.disconnect()
	try {
		await repository.db.$transaction(async (tx) => {
			await tx.auditLog.deleteMany({ where: { actorId: userId } })
			await tx.session.deleteMany({ where: { userId } })
			await tx.vendorMembership.deleteMany({ where: { userId } })
			await tx.vendor.deleteMany({ where: { id: { in: vendors } } })
			await tx.user.deleteMany({ where: { id: userId } })
		})
		await pool.query('DELETE FROM junction_auth."user" WHERE id = $1', [userId])
		console.log('Disposable scope probe accounts, memberships, sessions, Vendors and audits removed.')
	} finally {
		await repository.close()
		await pool.end()
	}
}
