import assert from 'node:assert/strict'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'

import { createAuth } from '../libs/platform-core/dist/lib/auth.js'
import { PostgresFoundation } from '../libs/platform-core/dist/lib/postgres-foundation.js'

// Integration-only probe: real Better Auth endpoints against a disposable local
// PostgreSQL database. It never sends email or establishes staging acceptance.
const require = createRequire(new URL('../libs/platform-core/package.json', import.meta.url))
const { Pool } = require('pg')
const { hashPassword } = await import(require.resolve('better-auth/crypto'))
const databaseUrl = new URL(process.env.DATABASE_URL ?? '')
if (!['127.0.0.1', 'localhost'].includes(databaseUrl.hostname) || process.env.JUNCTION_RUNTIME_MODE !== 'staging') {
	throw new Error('This Better Auth probe requires a loopback database and staging mode.')
}
const origin = 'https://staging-junction.abenezer-ayalneh.dev'
process.env.BETTER_AUTH_URL = origin
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex')
process.env.RESEND_API_KEY = 're_local_probe_only'
process.env.RESEND_FROM_EMAIL = 'probe@example.invalid'

const pool = new Pool({ connectionString: databaseUrl.toString() })
const foundation = new PostgresFoundation(databaseUrl.toString())
const auth = createAuth()
const userId = randomUUID()
const email = `${userId}@example.invalid`
const password = randomBytes(18).toString('hex')
const cookies = new Map()

function cookieHeader() {
	return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
}

async function request(path, body) {
	const response = await auth.handler(
		new Request(`${origin}/api/auth${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin, ...(cookies.size ? { cookie: cookieHeader() } : {}) },
			body: JSON.stringify(body),
		}),
	)
	for (const header of response.headers.getSetCookie()) {
		const [pair] = header.split(';')
		const separator = pair.indexOf('=')
		const name = pair.slice(0, separator)
		if (header.includes('Max-Age=0')) cookies.delete(name)
		else cookies.set(name, pair.slice(separator + 1))
	}
	const data = await response.json()
	assert.equal(response.status, 200, `${path} returned ${response.status}: ${JSON.stringify(data)}`)
	return data
}

async function currentSession() {
	return auth.api.getSession({ headers: new Headers({ cookie: cookieHeader() }) })
}

function totp(uri) {
	const secret = new URL(uri).searchParams.get('secret')
	assert.ok(secret)
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
	let bits = 0
	let value = 0
	const bytes = []
	for (const character of secret.toUpperCase().replaceAll('=', '')) {
		value = (value << 5) | alphabet.indexOf(character)
		bits += 5
		if (bits >= 8) {
			bytes.push((value >>> (bits - 8)) & 0xff)
			bits -= 8
		}
	}
	const counter = Buffer.alloc(8)
	counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
	const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest()
	const offset = digest[digest.length - 1] & 0xf
	return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

try {
	const passwordHash = await hashPassword(password)
	await pool.query('INSERT INTO junction_auth."user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)', [userId, 'MFA probe', email])
	await pool.query('INSERT INTO junction_auth.account (id, "accountId", "providerId", "userId", password, "updatedAt") VALUES ($1, $2, $3, $4, $5, now())', [
		randomUUID(),
		userId,
		'credential',
		userId,
		passwordHash,
	])
	await request('/sign-in/email', { email, password })
	const first = await currentSession()
	assert.ok(first?.session)
	await foundation.ensureAuthenticatedSession({ sessionId: first.session.id, userId, email, expiresAt: first.session.expiresAt })
	const passwordSession = await foundation.db.session.findUniqueOrThrow({ where: { id: first.session.id } })
	assert.equal(passwordSession.mfaVerifiedAt, null)
	assert.equal(passwordSession.recentAuthAt, null)
	const enabled = await request('/two-factor/enable', { password, method: 'totp' })
	assert.ok(enabled.totpURI)
	assert.ok(enabled.backupCodes?.[0])
	await request('/two-factor/verify-totp', { code: totp(enabled.totpURI), trustDevice: false })
	const enrolled = await currentSession()
	assert.ok(enrolled?.session)
	await foundation.ensureAuthenticatedSession({ sessionId: enrolled.session.id, userId, email, expiresAt: enrolled.session.expiresAt })
	const enrollmentSession = await foundation.db.session.findUniqueOrThrow({ where: { id: enrolled.session.id } })
	assert.equal(enrollmentSession.mfaVerifiedAt, null)
	assert.equal(enrollmentSession.recentAuthAt, null)

	await request('/sign-out', {})
	const challenge = await request('/sign-in/email', { email, password })
	assert.equal(challenge.twoFactorRedirect, true)
	await request('/two-factor/verify-totp', { code: totp(enabled.totpURI), trustDevice: false })
	const signedIn = await currentSession()
	assert.ok(signedIn?.session)
	const verifiedSession = await foundation.db.session.findUniqueOrThrow({ where: { id: signedIn.session.id } })
	assert.ok(verifiedSession.mfaVerifiedAt)
	assert.ok(verifiedSession.recentAuthAt)

	await request('/sign-out', {})
	const recoveryChallenge = await request('/sign-in/email', { email, password })
	assert.equal(recoveryChallenge.twoFactorRedirect, true)
	await request('/two-factor/verify-backup-code', { code: enabled.backupCodes[0], trustDevice: false })
	const recovered = await currentSession()
	assert.ok(recovered?.session)
	const recoveredSession = await foundation.db.session.findUniqueOrThrow({ where: { id: recovered.session.id } })
	assert.ok(recoveredSession.mfaVerifiedAt)
	assert.ok(recoveredSession.recentAuthAt)
	console.log('Better Auth enrollment left MFA unset; TOTP and backup-code sign-in challenges marked their matching Junction sessions.')
} finally {
	try {
		await foundation.db.session.deleteMany({ where: { userId } })
		await foundation.db.user.deleteMany({ where: { id: userId } })
		await pool.query('DELETE FROM junction_auth."user" WHERE id = $1', [userId])
	} finally {
		await foundation.close()
		await pool.end()
	}
}
