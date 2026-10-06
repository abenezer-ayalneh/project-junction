import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto'
import { createRequire } from 'node:module'

import { createAuth } from '../libs/platform-core/dist/lib/auth.js'
import { PostgresFoundation } from '../libs/platform-core/dist/lib/postgres-foundation.js'

// Real application auth endpoints and PostgreSQL; only Google's responses are
// controlled fixtures. Never use real Google credentials or external requests.
const require = createRequire(new URL('../libs/platform-core/package.json', import.meta.url))
const { Pool } = require('pg')
const { hashPassword } = await import(require.resolve('better-auth/crypto'))
const databaseUrl = new URL(process.env.DATABASE_URL ?? '')
const schema = databaseUrl.searchParams.get('schema')
if (!['localhost', '127.0.0.1'].includes(databaseUrl.hostname) || !/^phase00_[a-f0-9]+$/.test(schema ?? '') || process.env.JUNCTION_RUNTIME_MODE !== 'local') {
	throw new Error('Google linking probe requires an isolated Phase 00 loopback schema and local runtime.')
}
const origin = 'http://localhost:3000'
Object.assign(process.env, {
	FOUNDATION_STORAGE: 'postgresql',
	BETTER_AUTH_URL: origin,
	BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
	GOOGLE_CLIENT_ID: 'local-probe.apps.googleusercontent.com',
	GOOGLE_CLIENT_SECRET: 'local-probe-only',
	SMTP_HOST: '127.0.0.1',
	SMTP_PORT: '1025',
})
const pool = new Pool({ connectionString: databaseUrl.toString() })
const foundation = new PostgresFoundation(databaseUrl.toString())
const auth = createAuth()
const cookies = new Map()
const userIds = new Set()
const fixtureEmails = new Set()
const stateIds = new Set()
const vendorIds = new Set()
const workspaceIds = new Set()
const codes = new Map()
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'local-probe', alg: 'RS256', use: 'sig' }
const originalFetch = globalThis.fetch
let tokenRequests = 0
let failExchange = false

globalThis.fetch = async (input, options) => {
	const url = new URL(input instanceof Request ? input.url : String(input))
	if (url.href === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] })
	assert.equal(url.href, 'https://oauth2.googleapis.com/token', 'Unexpected external request')
	tokenRequests++
	const body = new URLSearchParams(options?.body)
	const fixture = codes.get(body.get('code'))
	assert.ok(fixture, 'Unknown or reused authorization code')
	codes.delete(body.get('code'))
	assert.equal(body.get('redirect_uri'), `${origin}/api/auth/callback/google`)
	assert.equal(body.get('client_id'), process.env.GOOGLE_CLIENT_ID)
	assert.equal(body.get('client_secret'), process.env.GOOGLE_CLIENT_SECRET)
	assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), fixture.challenge)
	if (failExchange) return Response.json({ error: 'invalid_grant' }, { status: 400 })
	const now = Math.floor(Date.now() / 1000)
	const payload = { iss: 'https://accounts.google.com', aud: process.env.GOOGLE_CLIENT_ID, iat: now, exp: now + 3600, ...fixture.profile }
	if (fixture.nonce) payload.nonce = fixture.nonce
	const jwt = [
		Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url'),
		Buffer.from(JSON.stringify(payload)).toString('base64url'),
	].join('.')
	const signature = sign('RSA-SHA256', Buffer.from(jwt), privateKey).toString('base64url')
	return Response.json({
		access_token: 'local-probe-access',
		token_type: 'Bearer',
		expires_in: 3600,
		scope: 'openid email profile',
		id_token: `${jwt}.${signature}`,
	})
}

function cookieHeader() {
	return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
}
async function request(path, body) {
	const response = await auth.handler(
		new Request(`${origin}/api/auth${path}`, {
			method: body === undefined ? 'GET' : 'POST',
			headers: { origin, cookie: cookieHeader(), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		}),
	)
	for (const header of response.headers.getSetCookie()) {
		const [pair] = header.split(';')
		const separator = pair.indexOf('=')
		const name = pair.slice(0, separator)
		if (header.includes('Max-Age=0')) cookies.delete(name)
		else cookies.set(name, pair.slice(separator + 1))
	}
	return response
}
async function post(path, body) {
	const response = await request(path, body)
	assert.equal(response.status, 200, `${path} failed`)
	return response.json()
}
async function currentSession() {
	return auth.api.getSession({ headers: new Headers({ cookie: cookieHeader() }) })
}
async function seedCredential(emailVerified = true) {
	const id = randomUUID()
	const email = `${id}@example.invalid`
	const password = randomBytes(18).toString('hex')
	userIds.add(id)
	fixtureEmails.add(email)
	await pool.query('INSERT INTO junction_auth."user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, $4)', [
		id,
		'Google linking probe',
		email,
		emailVerified,
	])
	await pool.query('INSERT INTO junction_auth.account (id, "accountId", "providerId", "userId", password, "updatedAt") VALUES ($1, $2, $3, $4, $5, now())', [
		randomUUID(),
		id,
		'credential',
		id,
		await hashPassword(password),
	])
	return { id, email, password }
}
async function googleLogin(profile, expectedError) {
	fixtureEmails.add(profile.email)
	const { url } = await post('/sign-in/social', { provider: 'google', callbackURL: `${origin}/account` })
	const authorization = new URL(url)
	assert.equal(authorization.hostname, 'accounts.google.com')
	const state = authorization.searchParams.get('state')
	assert.ok(state)
	stateIds.add(state)
	const code = randomUUID()
	codes.set(code, { profile, challenge: authorization.searchParams.get('code_challenge'), nonce: authorization.searchParams.get('nonce') })
	const response = await request(`/callback/google?${new URLSearchParams({ state, code })}`)
	assert.equal(response.status, 302)
	const destination = new URL(response.headers.get('location'), origin)
	if (expectedError) assert.equal(destination.searchParams.get('error'), expectedError)
	else assert.equal(destination.href, `${origin}/account`, 'Google callback did not complete')
	const session = await currentSession()
	if (expectedError) assert.equal(session, null)
	else {
		assert.ok(session?.session)
		userIds.add(session.user.id)
	}
	return session
}
async function bridge(session) {
	await foundation.ensureAuthenticatedSession({
		sessionId: session.session.id,
		userId: session.user.id,
		email: session.user.email,
		expiresAt: session.session.expiresAt,
	})
	return foundation.accessContext(session.session.id)
}
async function signOut() {
	await post('/sign-out', {})
	assert.equal(await currentSession(), null)
}

try {
	assert.equal(await foundation.db.workspace.count(), 0, 'Probe must run before other fixtures in a fresh isolated schema')
	const owner = await seedCredential()
	await post('/sign-in/email', { email: owner.email, password: owner.password })
	const passwordSession = await currentSession()
	assert.equal(passwordSession.user.id, owner.id)
	await bridge(passwordSession)
	const domainSession = await foundation.db.session.findUniqueOrThrow({ where: { id: passwordSession.session.id } })
	workspaceIds.add(domainSession.workspaceId)
	const vendor = await foundation.db.vendor.create({
		data: { workspaceId: domainSession.workspaceId, applicationState: 'approved', displayName: 'Disposable linking fixture' },
	})
	vendorIds.add(vendor.id)
	const location = await foundation.db.location.create({ data: { vendorId: vendor.id } })
	await foundation.db.vendorMembership.create({ data: { userId: owner.id, vendorId: vendor.id, role: 'vendor_owner', locationIds: [location.id] } })
	await foundation.selectActiveVendor(passwordSession.session.id, { vendorId: vendor.id })
	const membershipsBefore = await foundation.db.vendorMembership.findMany({ where: { userId: owner.id } })
	const contextBefore = await foundation.accessContext(passwordSession.session.id)
	await signOut()
	const profile = { sub: randomUUID(), email: owner.email, email_verified: true, name: 'Google linking probe' }
	const linked = await googleLogin(profile)
	assert.equal(linked.user.id, owner.id)
	const contextAfter = await bridge(linked)
	assert.deepEqual(await foundation.db.vendorMembership.findMany({ where: { userId: owner.id } }), membershipsBefore)
	assert.deepEqual(contextAfter.memberships, contextBefore.memberships)
	assert.equal(contextAfter.activeVendorId, vendor.id)
	assert.equal((await foundation.readVendorCatalog(linked.session.id)).id, vendor.id)
	const accounts = await pool.query('SELECT "providerId", "userId" FROM junction_auth.account WHERE "userId" = $1 ORDER BY "providerId"', [owner.id])
	assert.deepEqual(accounts.rows, [
		{ providerId: 'credential', userId: owner.id },
		{ providerId: 'google', userId: owner.id },
	])
	assert.equal((await pool.query('SELECT count(*)::int AS count FROM junction_auth."user" WHERE email = $1', [owner.email])).rows[0].count, 1)
	assert.equal(await foundation.db.platformReviewerGrant.count({ where: { userId: owner.id } }), 0)
	assert.equal((await foundation.db.user.findUniqueOrThrow({ where: { id: owner.id } })).adultVerificationState, 'unverified')
	assert.equal((await foundation.db.session.findUniqueOrThrow({ where: { id: linked.session.id } })).mfaVerifiedAt, null)
	assert.equal((await foundation.db.session.findUniqueOrThrow({ where: { id: linked.session.id } })).recentAuthAt, null)
	assert.equal((await foundation.db.user.findUniqueOrThrow({ where: { id: owner.id } })).verifiedAt, null)
	const foreign = await foundation.db.vendor.create({ data: { workspaceId: domainSession.workspaceId, applicationState: 'approved' } })
	vendorIds.add(foreign.id)
	await assert.rejects(foundation.selectActiveVendor(linked.session.id, { vendorId: foreign.id }), { code: 'ACCESS_DENIED' })
	await signOut()
	const repeated = await googleLogin(profile)
	assert.equal(repeated.user.id, owner.id)
	assert.equal((await bridge(repeated)).activeVendorId, vendor.id)
	assert.equal(
		(await pool.query('SELECT count(*)::int AS count FROM junction_auth.account WHERE "userId" = $1 AND "providerId" = $2', [owner.id, 'google'])).rows[0]
			.count,
		1,
	)
	await signOut()
	const different = await googleLogin({ sub: randomUUID(), email: `${randomUUID()}@example.invalid`, email_verified: true, name: 'Separate Google identity' })
	assert.notEqual(different.user.id, owner.id)
	assert.equal((await bridge(different)).activeVendorId, null)
	await assert.rejects(foundation.readVendorCatalog(different.session.id), { code: 'ACCESS_DENIED' })
	assert.deepEqual(await foundation.db.vendorMembership.findMany({ where: { userId: owner.id } }), membershipsBefore)
	await signOut()
	const unverifiedLocal = await seedCredential(false)
	await googleLogin({ sub: randomUUID(), email: unverifiedLocal.email, email_verified: true, name: 'Unverified local fixture' }, 'account_not_linked')
	assert.equal((await pool.query('SELECT count(*)::int AS count FROM junction_auth.account WHERE "userId" = $1', [unverifiedLocal.id])).rows[0].count, 1)
	const verifiedLocal = await seedCredential()
	await googleLogin({ sub: randomUUID(), email: verifiedLocal.email, email_verified: false, name: 'Unverified Google fixture' }, 'account_not_linked')
	assert.equal((await pool.query('SELECT count(*)::int AS count FROM junction_auth.account WHERE "userId" = $1', [verifiedLocal.id])).rows[0].count, 1)
	failExchange = true
	await googleLogin(profile, 'invalid_code')
	failExchange = false
	const recovered = await googleLogin(profile)
	assert.equal(recovered.user.id, owner.id)
	assert.equal((await bridge(recovered)).activeVendorId, vendor.id)
	assert.ok(tokenRequests >= 7)
	console.log(
		'Google callback probe passed: email-first linking preserves User ID, Owner membership, locations and catalog access; repeat login, cross-Vendor denial, different-email separation, both verification gates and fresh retry after invalid_code passed. Google responses were controlled local fixtures.',
	)
} finally {
	globalThis.fetch = originalFetch
	try {
		await foundation.db.session.deleteMany({ where: { userId: { in: [...userIds] } } })
		await foundation.db.vendorMembership.deleteMany({ where: { userId: { in: [...userIds] } } })
		await foundation.db.location.deleteMany({ where: { vendorId: { in: [...vendorIds] } } })
		await foundation.db.vendor.deleteMany({ where: { id: { in: [...vendorIds] } } })
		await foundation.db.user.deleteMany({ where: { id: { in: [...userIds] } } })
		await foundation.db.workspace.deleteMany({ where: { id: { in: [...workspaceIds] } } })
		await pool.query('DELETE FROM junction_auth."user" WHERE id = ANY($1::text[]) OR email = ANY($2::text[])', [[...userIds], [...fixtureEmails]])
		assert.equal(
			(await pool.query('SELECT count(*)::int AS count FROM junction_auth."user" WHERE email = ANY($1::text[])', [[...fixtureEmails]])).rows[0].count,
			0,
		)
		await pool.query('DELETE FROM junction_auth.verification WHERE identifier = ANY($1::text[])', [[...stateIds]])
	} finally {
		await foundation.close()
		await pool.end()
	}
}
