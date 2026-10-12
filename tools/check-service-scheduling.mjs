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
		return { status: response.status, body: await response.json(), cacheControl: response.headers.get('cache-control') }
	}
	const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
	const calendar = {
		timezone: 'UTC',
		weekly: Array.from({ length: 7 }, (_, weekday) => ({ weekday, hours: [{ startMinute: 540, endMinute: 1020 }], breaks: [] })),
		exceptions: [],
	}
	const linked = await request('/vendor/staff', 'POST', { displayName: 'Linked Schedule Staff', memberUserId: userId })
	const hidden = await request('/vendor/staff', 'POST', { displayName: 'Private Schedule Staff' })
	assert.equal(linked.status, 201)
	assert.equal(hidden.status, 201)
	const staffId = linked.body.id
	const listing = await repository.createListing(sessionId, randomUUID(), {
		kind: 'service',
		category: 'appointment',
		title: 'Scheduling HTTP test',
		description: 'Disposable authoritative scheduling HTTP test.',
		priceCents: 1200,
		durationMinutes: 30,
	})
	const option = {
		id: randomUUID(),
		label: 'Fixed appointment',
		priceCents: 1200,
		durationMinutes: 30,
		bufferBeforeMinutes: 5,
		bufferAfterMinutes: 10,
		locationIds: [source.id],
		online: true,
		addons: [{ id: randomUUID(), label: 'Extra work', priceCents: 300, durationMinutes: 15 }],
		qualifications: [staffId, hidden.body.id].map((id) => ({ staffId: id, locationIds: [source.id], online: true })),
	}
	assert.equal(
		(
			await request(`/listings/${listing.id}/service-configuration`, 'PUT', {
				expectedVersion: 0,
				configuration: { capacity: 'staff_only', options: [option] },
			})
		).status,
		200,
	)
	const rulesPath = `/listings/${listing.id}/scheduling-rules`
	const rulesCommand = { expectedVersion: 0, rules: { timezone: 'UTC', leadTimeMinutes: 0, horizonDays: 30, slotIntervalMinutes: 15 } }
	const rulesKey = randomUUID()
	const rules = await request(rulesPath, 'PUT', rulesCommand, rulesKey)
	assert.equal(rules.status, 200, JSON.stringify(rules.body))
	assert.deepEqual((await request(rulesPath, 'PUT', rulesCommand, rulesKey)).body, { ...rules.body, replayed: true })
	assert.equal((await request(rulesPath)).body.version, 1)
	const locationPath = `/locations/${source.id}/schedule`
	const locationCommand = { expectedVersion: 0, calendar }
	const key = randomUUID()
	const saved = await request(locationPath, 'PUT', locationCommand, key)
	assert.equal(saved.status, 200, JSON.stringify(saved.body))
	assert.deepEqual((await request(locationPath, 'PUT', locationCommand, key)).body, { ...saved.body, replayed: true })
	assert.equal((await request(locationPath)).body.version, 1)
	assert.equal((await request(locationPath, 'PUT', locationCommand)).status, 409)
	assert.equal((await request(locationPath, 'PUT', { ...locationCommand, expectedVersion: 1 }, key)).status, 409)
	assert.equal((await request(locationPath, 'PUT', locationCommand, '')).status, 400)
	assert.equal((await request(locationPath, 'PUT', locationCommand, randomUUID(), false)).status, 403)
	assert.equal((await request(locationPath, 'PUT', { expectedVersion: 1, calendar: { ...calendar, timezone: 'Invalid/Timezone' } })).status, 400)
	const schedule = {
		scopes: [
			{ mode: 'in_person', locationId: source.id, calendar },
			{ mode: 'online', locationId: null, calendar },
		],
	}
	for (const id of [staffId, hidden.body.id]) {
		const path = `/vendor/staff/${id}/schedule`
		const staffKey = randomUUID()
		const result = await request(path, 'PUT', { expectedVersion: 0, schedule }, staffKey)
		assert.equal(result.status, 200, JSON.stringify(result.body))
		assert.equal((await request(path, 'PUT', { expectedVersion: 0, schedule }, staffKey)).body.replayed, true)
		assert.equal((await request(path)).body.version, 1)
	}
	const slotPath = `/public/listings/${listing.id}/slots`
	const selection = {
		optionId: option.id,
		addonIds: [],
		mode: 'in_person',
		locationId: source.id,
		staffId: null,
		from: `${tomorrow}T00:00:00Z`,
		to: `${tomorrow}T23:59:59Z`,
	}
	const publicSlots = (body = selection) => request(slotPath, 'POST', body, '', false)
	assert.equal((await publicSlots()).status, 403)
	await repository.db.listing.update({ where: { id: listing.id }, data: { state: 'published' } })
	const available = await publicSlots()
	assert.equal(available.status, 200, JSON.stringify(available.body))
	assert.equal(available.body.reserved, false)
	assert.equal(available.cacheControl, 'no-store')
	assert.equal(available.body.timezone, 'UTC')
	assert.equal(available.body.slots[0].start, `${tomorrow}T09:15:00.000Z`)
	assert.equal(available.body.slots.at(-1).start, `${tomorrow}T16:15:00.000Z`)
	assert.ok(!JSON.stringify(available.body).includes(hidden.body.id))
	assert.equal((await publicSlots({ ...selection, staffId })).status, 403)
	assert.equal((await publicSlots({ ...selection, addonIds: [randomUUID()] })).status, 403)
	assert.equal((await publicSlots({ ...selection, mode: 'online' })).status, 400)
	assert.equal((await publicSlots({ ...selection, from: 'not-a-date' })).status, 400)
	const extra = await publicSlots({ ...selection, addonIds: [option.addons[0].id] })
	assert.equal(extra.body.priceCents, 1500)
	assert.equal(extra.body.durationMinutes, 45)
	assert.equal(extra.body.slots.at(-1).start, `${tomorrow}T16:00:00.000Z`)
	assert.equal(await repository.db.staffAllocation.count({ where: { staffId: { in: [staffId, hidden.body.id] } } }), 0)
	assert.equal((await request(`/vendor/staff/${staffId}/public-consent`, 'PUT', { expectedVersion: 1, publicDisplay: true })).status, 200)
	await repository.db.staffAllocation.create({
		data: { staffId, state: 'booked', startAt: new Date(`${tomorrow}T10:00:00Z`), endAt: new Date(`${tomorrow}T11:00:00Z`) },
	})
	await repository.db.staffAllocation.create({
		data: {
			staffId: hidden.body.id,
			state: 'held',
			startAt: new Date(`${tomorrow}T12:00:00Z`),
			endAt: new Date(`${tomorrow}T13:00:00Z`),
			expiresAt: new Date(Date.now() + 60000),
		},
	})
	const named = await publicSlots({ ...selection, staffId })
	assert.equal(named.status, 200, JSON.stringify(named.body))
	assert.ok(!named.body.slots.some((slot) => slot.start === `${tomorrow}T10:00:00.000Z`))
	assert.ok((await publicSlots()).body.slots.some((slot) => slot.start === `${tomorrow}T10:00:00.000Z`))
	const online = await publicSlots({ ...selection, staffId, mode: 'online', locationId: null })
	assert.ok(!online.body.slots.some((slot) => slot.start === `${tomorrow}T10:00:00.000Z`))
	const closedCalendar = { ...calendar, exceptions: [{ date: tomorrow, hours: [], breaks: [] }] }
	assert.equal((await request(locationPath, 'PUT', { expectedVersion: 1, calendar: closedCalendar })).status, 200)
	assert.deepEqual((await publicSlots()).body.slots, [])
	assert.ok((await publicSlots({ ...selection, mode: 'online', locationId: null })).body.slots.length > 0)
	assert.equal(await repository.db.staffAllocation.count({ where: { staffId: { in: [staffId, hidden.body.id] } } }), 2)
	await repository.db.vendor.update({ where: { id: vendor.id }, data: { applicationState: 'restricted' } })
	assert.equal((await publicSlots()).status, 403)
	console.log(
		'Built local authoritative scheduling HTTP smoke passed: cookie-scoped calendar/rule writes and reads, replay/conflict/validation/anonymous denial, current Option/add-on/buffer slots, named consent/private any-Staff, existing Booking/hold occupancy, mode separation, changed date closure and no read-created reservation.',
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
