import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { createRequire } from 'node:module'
const fixtureRequire = createRequire(new URL('../libs/platform-core/package.json', import.meta.url))

import { PostgresFoundation } from '../libs/platform-core/dist/lib/postgres-foundation.js'

// Run only inside the integration runner's disposable local schema.
const url = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname))
assert.match(url.searchParams.get('schema') ?? '', /^phase00_[a-f0-9]+$/)
const repository = new PostgresFoundation(url.toString())
const secret = randomBytes(32).toString('hex')
const token = randomBytes(32).toString('hex')
const sessionId = randomUUID()
const userId = randomUUID()
const email = `${userId}@example.invalid`
const cookie = `junction-auth.session_token=${encodeURIComponent(`${token}.${createHmac('sha256', secret).update(token).digest('base64')}`)}`
let child
let closed
let logs = ''
try {
	const workspace = await repository.db.workspace.create({ data: { kind: 'real' } })
	const vendor = await repository.db.vendor.create({
		data: {
			workspaceId: workspace.id,
			applicationState: 'approved',
			publishedAt: new Date(),
			publicSlug: randomUUID(),
			displayName: 'Service HTTP fixture',
		},
	})
	const source = await repository.db.location.create({ data: { vendorId: vendor.id, label: 'Service office', city: 'Test city' } })
	const destination = await repository.db.location.create({ data: { vendorId: vendor.id, label: 'Service office', city: 'Test city' } })
	await repository.db.user.create({ data: { id: userId, email, adultVerificationState: 'verified', verifiedAt: new Date() } })
	await repository.db.vendorMembership.create({ data: { userId, vendorId: vendor.id, role: 'vendor_owner', locationIds: [source.id, destination.id] } })
	const expires = new Date(Date.now() + 3600000)
	await repository.db.session.create({
		data: { id: sessionId, userId, workspaceId: workspace.id, activeVendorId: vendor.id, activeRole: 'vendor_owner', expiresAt: expires },
	})
	await repository.db
		.$executeRaw`INSERT INTO junction_auth."user" (id, name, email, "emailVerified") VALUES (${userId}, ${'Service API fixture'}, ${email}, true)`
	await repository.db
		.$executeRaw`INSERT INTO junction_auth.session (id, "expiresAt", token, "updatedAt", "userId") VALUES (${sessionId}, ${expires}, ${token}, now(), ${userId})`
	const server = createServer()
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
	const port = server.address().port
	await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
	child = spawn(process.execPath, ['apps/api/dist/main.js'], {
		env: {
			...process.env,
			JUNCTION_RUNTIME_MODE: 'local',
			FOUNDATION_STORAGE: 'postgresql',
			API_PORT: String(port),
			API_BIND_ADDRESS: '127.0.0.1',
			BETTER_AUTH_URL: 'http://localhost:3000',
			BETTER_AUTH_SECRET: secret,
			GOOGLE_CLIENT_ID: 'local-inventory.apps.googleusercontent.com',
			GOOGLE_CLIENT_SECRET: 'local-test-only',
			SMTP_HOST: '127.0.0.1',
			SMTP_PORT: '1025',
			REALTIME_REDIS_FANOUT: 'disabled',
			LOG_LEVEL: 'error',
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	closed = once(child, 'close')
	child.stdout.on('data', (chunk) => {
		logs = (logs + chunk).slice(-8000)
	})
	child.stderr.on('data', (chunk) => {
		logs = (logs + chunk).slice(-8000)
	})
	const origin = `http://127.0.0.1:${port}/v1`
	let ready = false
	for (let attempt = 0; attempt < 100; attempt++) {
		if (child.exitCode !== null) throw new Error(`API exited during startup: ${logs}`)
		try {
			ready = (await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1000) })).ok
		} catch {
			/* Await the bounded startup below. */
		}
		if (ready) break
		await new Promise((resolve) => setTimeout(resolve, 100))
	}
	assert.ok(ready, `Built API failed to become ready: ${logs}`)
	const request = async (path, method = 'GET', body, key = randomUUID(), authenticated = true) => {
		const response = await fetch(`${origin}${path}`, {
			method,
			headers: { 'content-type': 'application/json', ...(authenticated ? { cookie } : {}), ...(key ? { 'idempotency-key': key } : {}) },
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		})
		return { status: response.status, body: await response.json() }
	}
	const created = await request('/vendor/staff', 'POST', { displayName: 'Linked HTTP Staff', memberUserId: userId })
	assert.equal(created.status, 201, JSON.stringify(created.body))
	const staffId = created.body.id
	assert.equal(created.body.publicDisplay, false)
	const privateProfile = await request('/vendor/staff', 'POST', { displayName: 'Private HTTP Staff' })
	assert.equal(privateProfile.status, 201)
	assert.equal((await request(`/vendor/staff/${staffId}`)).body.version, 1)
	assert.equal((await request('/vendor/staff')).body.items.length, 2)
	const listing = await repository.createListing(sessionId, randomUUID(), {
		kind: 'service',
		category: 'appointment',
		title: 'Service HTTP test',
		description: 'Disposable built HTTP Service definition test.',
		priceCents: 1200,
		durationMinutes: 45,
	})
	const option = {
		id: randomUUID(),
		label: 'Fixed appointment',
		priceCents: 1200,
		durationMinutes: 45,
		bufferBeforeMinutes: 5,
		bufferAfterMinutes: 5,
		locationIds: [source.id],
		online: true,
		addons: [{ id: randomUUID(), label: 'Extra work', priceCents: 300, durationMinutes: 10 }],
		qualifications: [
			{ staffId, locationIds: [source.id], online: true },
			{ staffId: privateProfile.body.id, locationIds: [source.id], online: false },
		],
	}
	const command = { expectedVersion: 0, configuration: { capacity: 'staff_only', options: [option] } }
	const path = `/listings/${listing.id}/service-configuration`
	const publicPath = `/public/listings/${listing.id}/service-definition`
	const key = randomUUID()
	const configured = await request(path, 'PUT', command, key)
	assert.equal(configured.status, 200, JSON.stringify(configured.body))
	assert.equal(configured.body.version, 1)
	assert.deepEqual((await request(path, 'PUT', command, key)).body, { ...configured.body, replayed: true })
	assert.equal((await request(path, 'PUT', command)).status, 409)
	assert.equal((await request(path, 'PUT', { ...command, expectedVersion: 1 }, key)).status, 409)
	assert.equal((await request(path, 'PUT', command, randomUUID(), false)).status, 403)
	assert.equal((await request(path, 'PUT', command, '')).status, 400)
	assert.equal((await request(path, 'PUT', { ...command, configuration: { ...command.configuration, groupSeats: 2 } })).status, 400)
	assert.equal((await request(publicPath, 'GET', undefined, '', false)).status, 403)
	await repository.db.listing.update({ where: { id: listing.id }, data: { state: 'published' } })
	const publicResult = await request(publicPath, 'GET', undefined, '', false)
	assert.equal(publicResult.status, 200, JSON.stringify(publicResult.body))
	assert.equal(publicResult.body.options[0].eligibleModes[0].anyStaffEligible, true)
	assert.deepEqual(publicResult.body.options[0].eligibleModes[0].namedStaff, [])
	assert.ok(!JSON.stringify(publicResult.body).includes(privateProfile.body.id))
	assert.ok(!JSON.stringify(publicResult.body).includes(staffId))
	const consentPath = `/vendor/staff/${staffId}/public-consent`
	const consent = await request(consentPath, 'PUT', { expectedVersion: 1, publicDisplay: true })
	assert.equal(consent.status, 200, JSON.stringify(consent.body))
	assert.deepEqual((await request(publicPath, 'GET', undefined, '', false)).body.options[0].eligibleModes[1].namedStaff, [
		{ id: staffId, displayName: 'Linked HTTP Staff' },
	])
	assert.equal((await request(`/vendor/staff/${privateProfile.body.id}/public-consent`, 'PUT', { expectedVersion: 1, publicDisplay: true })).status, 403)
	assert.equal((await request(consentPath, 'PUT', { expectedVersion: 2, publicDisplay: false })).status, 200)
	assert.deepEqual((await request(publicPath, 'GET', undefined, '', false)).body.options[0].eligibleModes[1].namedStaff, [])
	await repository.db.vendor.update({ where: { id: vendor.id }, data: { applicationState: 'restricted' } })
	assert.equal((await request(publicPath, 'GET', undefined, '', false)).status, 403)
	console.log(
		'Built local Service definition HTTP smoke passed: cookie authority, Staff creation/link/self-read, fixed Options/add-ons/modes, configure/read/replay, stale/key conflicts, excluded-model and anonymous denial, private any-Staff, self-consent/withdrawal, restricted publication.',
	)
} finally {
	if (child && child.exitCode === null) {
		child.kill('SIGTERM')
		const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
		try {
			await closed
		} finally {
			clearTimeout(timer)
		}
	}
	await repository.db.$executeRaw`DELETE FROM junction_auth."user" WHERE id = ${userId}`
	await repository.close()
}
