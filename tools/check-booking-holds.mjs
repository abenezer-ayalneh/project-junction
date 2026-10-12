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
	const linked = await request('/vendor/staff', 'POST', { displayName: 'Named HTTP Staff', memberUserId: userId })
	const hidden = await request('/vendor/staff', 'POST', { displayName: 'Private Hold Staff' })
	assert.equal(linked.status, 201)
	assert.equal(hidden.status, 201)
	const listing = await repository.createListing(sessionId, randomUUID(), {
		kind: 'service',
		category: 'appointment',
		title: 'Booking hold HTTP test',
		description: 'Disposable atomic appointment hold HTTP test.',
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
		qualifications: [{ staffId: hidden.body.id, locationIds: [source.id], online: true }],
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
	assert.equal(
		(
			await request(`/listings/${listing.id}/scheduling-rules`, 'PUT', {
				expectedVersion: 0,
				rules: { timezone: 'UTC', leadTimeMinutes: 0, horizonDays: 30, slotIntervalMinutes: 15 },
			})
		).status,
		200,
	)
	assert.equal((await request(`/locations/${source.id}/schedule`, 'PUT', { expectedVersion: 0, calendar })).status, 200)
	for (const staffId of [hidden.body.id, linked.body.id])
		assert.equal(
			(
				await request(`/vendor/staff/${staffId}/schedule`, 'PUT', {
					expectedVersion: 0,
					schedule: {
						scopes: [
							{ mode: 'in_person', locationId: source.id, calendar },
							{ mode: 'online', locationId: null, calendar },
						],
					},
				})
			).status,
			200,
		)
	await repository.db.listing.update({ where: { id: listing.id }, data: { state: 'published' } })
	const command = {
		listingId: listing.id,
		optionId: option.id,
		addonIds: [option.addons[0].id],
		mode: 'in_person',
		locationId: source.id,
		staffId: null,
		start: `${tomorrow}T09:15:00Z`,
		expectedConfigurationVersion: 1,
		expectedRulesVersion: 1,
	}
	const path = '/customer/bookings/holds'
	const key = randomUUID()
	const before = Date.now()
	const created = await request(path, 'POST', command, key)
	assert.equal(created.status, 201, JSON.stringify(created.body))
	assert.equal(created.cacheControl, 'no-store')
	assert.equal(created.body.state, 'holding')
	assert.equal(created.body.snapshot.priceCents, 1500)
	assert.equal(created.body.snapshot.durationMinutes, 45)
	assert.equal(created.body.snapshot.selectedStaffId, null)
	assert.ok(new Date(created.body.expiresAt).getTime() >= before + 900000)
	assert.ok(new Date(created.body.expiresAt).getTime() <= Date.now() + 900000)
	assert.ok(!JSON.stringify(created.body).includes(hidden.body.id))
	assert.ok(!JSON.stringify(created.body).includes('Private Hold Staff'))
	assert.deepEqual((await request(path, 'POST', command, key)).body, { ...created.body, replayed: true })
	const holdPath = `${path}/${created.body.holdId}`
	assert.equal((await request(holdPath)).body.state, 'holding')
	assert.equal((await request(holdPath, 'GET', undefined, '', false)).status, 403)
	assert.equal((await request(path, 'POST', command)).status, 409)
	assert.equal((await request(path, 'POST', { ...command, start: `${tomorrow}T11:00:00Z` }, key)).status, 409)
	assert.equal((await request(path, 'POST', command, '')).status, 400)
	assert.equal((await request(path, 'POST', command, randomUUID(), false)).status, 403)
	assert.equal((await request(path, 'POST', { ...command, groupSeats: 2 })).status, 400)
	assert.equal((await request(path, 'POST', { ...command, staffId: hidden.body.id })).status, 403)
	assert.equal((await request(path, 'POST', { ...command, mode: 'online', locationId: null })).status, 409)
	const releaseKey = randomUUID()
	const released = await request(`${holdPath}/release`, 'POST', undefined, releaseKey)
	assert.equal(released.status, 201, JSON.stringify(released.body))
	assert.equal(released.body.state, 'released')
	assert.equal((await request(`${holdPath}/release`, 'POST', undefined, releaseKey)).body.replayed, true)
	assert.equal((await request(path, 'POST', command, key)).body.state, 'holding')
	assert.equal((await request(holdPath)).body.state, 'released')
	assert.equal((await request(`/vendor/staff/${linked.body.id}/public-consent`, 'PUT', { expectedVersion: 1, publicDisplay: true })).status, 200)
	const namedOption = { ...option, qualifications: [{ staffId: linked.body.id, locationIds: [source.id], online: true }] }
	assert.equal(
		(
			await request(`/listings/${listing.id}/service-configuration`, 'PUT', {
				expectedVersion: 1,
				configuration: { capacity: 'staff_only', options: [namedOption] },
			})
		).status,
		200,
	)
	assert.equal((await request(path, 'POST', command)).status, 409)
	const current = { ...command, expectedConfigurationVersion: 2, staffId: linked.body.id }
	const named = await request(path, 'POST', current)
	assert.equal(named.status, 201, JSON.stringify(named.body))
	assert.equal(named.body.snapshot.selectedStaffId, linked.body.id)
	assert.equal((await request(`${path}/${named.body.holdId}/release`, 'POST')).status, 201)
	const competing = await Promise.all([request(path, 'POST', current), request(path, 'POST', { ...current, staffId: null })])
	assert.deepEqual(competing.map((result) => result.status).sort(), [201, 409])
	const expiry = new Date(Date.now() - 1000)
	const due = await repository.db.bookingHold.create({
		data: { customerId: userId, workspaceId: workspace.id, vendorId: vendor.id, expiresAt: expiry, snapshot: created.body.snapshot },
	})
	await repository.db.staffAllocation.create({
		data: {
			holdId: due.id,
			staffId: hidden.body.id,
			state: 'held',
			expiresAt: expiry,
			startAt: new Date(`${tomorrow}T09:10:00Z`),
			endAt: new Date(`${tomorrow}T10:10:00Z`),
		},
	})
	const expiredRead = await request(`${path}/${due.id}`)
	assert.equal(expiredRead.status, 200, JSON.stringify(expiredRead.body))
	assert.equal(expiredRead.body.state, 'expired')
	assert.equal((await request(`${path}/${due.id}/release`, 'POST')).body.state, 'expired')
	assert.equal((await repository.db.staffAllocation.findUniqueOrThrow({ where: { holdId: due.id } })).state, 'expired')
	// Verify the built worker's actual tick, using disposable due occupancy and loopback Redis.
	const redisUrl = new URL(process.env.REDIS_URL ?? '')
	assert.ok(['localhost', '127.0.0.1'].includes(redisUrl.hostname), 'Worker smoke requires loopback Redis.')
	const workerDue = await repository.db.bookingHold.create({
		data: { customerId: userId, workspaceId: workspace.id, vendorId: vendor.id, expiresAt: expiry, snapshot: created.body.snapshot },
	})
	await repository.db.staffAllocation.create({
		data: {
			holdId: workerDue.id,
			staffId: hidden.body.id,
			state: 'held',
			expiresAt: expiry,
			startAt: new Date(`${tomorrow}T09:10:00Z`),
			endAt: new Date(`${tomorrow}T10:10:00Z`),
		},
	})
	const worker = spawn(process.execPath, ['apps/worker/dist/main.js'], {
		env: { ...process.env, JUNCTION_RUNTIME_MODE: 'local', FOUNDATION_STORAGE: 'postgresql' },
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	const workerClosed = once(worker, 'close')
	let workerLogs = ''
	worker.stdout.on('data', (chunk) => {
		workerLogs = (workerLogs + chunk).slice(-8000)
	})
	worker.stderr.on('data', (chunk) => {
		workerLogs = (workerLogs + chunk).slice(-8000)
	})
	try {
		let expired = false
		for (let attempt = 0; attempt < 40; attempt++) {
			const current = await repository.db.bookingHold.findUniqueOrThrow({ where: { id: workerDue.id } })
			if (current.state === 'expired') {
				expired = true
				break
			}
			if (worker.exitCode !== null) break
			await new Promise((resolve) => setTimeout(resolve, 250))
		}
		assert.ok(expired, 'Built local worker did not expire the disposable appointment hold.')
		assert.ok(workerLogs.includes('worker.started'))
		assert.equal((await repository.db.staffAllocation.findUniqueOrThrow({ where: { holdId: workerDue.id } })).state, 'expired')
		console.log(
			'Built local Booking hold worker expiry smoke passed: loopback PostgreSQL/Redis, due hold and allocation expire without a Customer session.',
		)
	} finally {
		if (worker.exitCode === null) worker.kill('SIGTERM')
		const workerTimer = setTimeout(() => worker.kill('SIGKILL'), 5000)
		try {
			await workerClosed
		} finally {
			clearTimeout(workerTimer)
		}
	}
	const expanded = { ...namedOption, qualifications: [...namedOption.qualifications, { staffId: hidden.body.id, locationIds: [source.id], online: true }] }
	assert.equal(
		(
			await request(`/listings/${listing.id}/service-configuration`, 'PUT', {
				expectedVersion: 2,
				configuration: { capacity: 'staff_only', options: [expanded] },
			})
		).status,
		200,
	)
	const paidSelection = { ...current, expectedConfigurationVersion: 3, staffId: null }
	const paidHold = await request(path, 'POST', { ...paidSelection, start: `${tomorrow}T13:00:00Z` })
	assert.equal(paidHold.status, 201)
	const paymentKey = randomUUID()
	const paid = await request('/customer/bookings/payments', 'POST', { holdId: paidHold.body.holdId, attendee: { name: 'Guest' } }, paymentKey)
	assert.equal(paid.status, 201, JSON.stringify(paid.body))
	assert.equal(paid.body.expiresAt, paidHold.body.expiresAt)
	assert.equal(
		(await request('/customer/bookings/payments', 'POST', { holdId: paidHold.body.holdId, attendee: { name: 'Guest' } }, paymentKey)).body.replayed,
		true,
	)
	const paymentPath = `/customer/bookings/payments/${paid.body.paymentId}`
	assert.equal((await request(`${paymentPath}/local-result`, 'POST', { outcome: 'succeeded', amountCents: 1 })).status, 400)
	assert.equal((await request(paymentPath, 'GET', undefined, '', false)).status, 403)
	assert.equal((await request(`${paymentPath}/local-result`, 'POST', { outcome: 'succeeded' })).status, 201)
	const confirmed = await request(paymentPath)
	assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body))
	assert.equal(confirmed.body.state, 'succeeded')
	const booking = await request(`/customer/bookings/${confirmed.body.bookingId}`)
	assert.equal(booking.status, 200, JSON.stringify(booking.body))
	assert.equal(booking.body.snapshot.priceCents, 1500)
	assert.equal(booking.body.snapshot.optionPriceCents, 1200)
	assert.equal(booking.body.snapshot.attendee.name, 'Guest')
	assert.equal(booking.body.snapshot.policy.template, 'standard')
	assert.equal((await request(`/customer/bookings/${confirmed.body.bookingId}`, 'GET', undefined, '', false)).status, 403)
	assert.equal((await request(`${path}/${paidHold.body.holdId}/release`, 'POST')).status, 409)
	const substitution = await request(`/vendor/bookings/${confirmed.body.bookingId}/substitutions`, 'POST', {
		expectedVersion: 1,
		replacementStaffId: hidden.body.id,
		reason: 'Staff unavailable',
	})
	assert.equal(substitution.status, 201, JSON.stringify(substitution.body))
	assert.equal(substitution.body.state, 'accepted')
	assert.equal(substitution.body.replacementStaffId, null)
	assert.equal((await request(`/customer/bookings/substitutions/${substitution.body.proposalId}`)).status, 200)
	assert.equal((await request(`/customer/bookings/${confirmed.body.bookingId}`)).body.customerAmendments, 0)
	console.log('Built local any-Staff substitution HTTP smoke passed: private replacement, Customer notice and preserved allowance.')
	const amendmentKey = randomUUID()
	const amended = await request(
		`/customer/bookings/${confirmed.body.bookingId}/amend`,
		'POST',
		{ expectedVersion: 2, selection: { ...paidSelection, start: `${tomorrow}T15:00:00Z` }, extraPaymentOutcome: 'succeeded' },
		amendmentKey,
	)
	assert.equal(amended.status, 201, JSON.stringify(amended.body))
	assert.equal(amended.body.deltaCents, 0)
	assert.equal(amended.body.version, 3)
	assert.equal((await request(`/customer/bookings/${confirmed.body.bookingId}`)).body.originalSnapshot.start, booking.body.snapshot.start)
	console.log('Built local Booking amendment HTTP smoke passed: atomic replacement, unchanged purchased price and immutable original snapshot.')
	const cancelKey = randomUUID()
	const cancellationPath = `/customer/bookings/${confirmed.body.bookingId}/cancel`
	const cancelled = await request(cancellationPath, 'POST', { reason: 'Plans changed', expectedVersion: 3 }, cancelKey)
	assert.equal(cancelled.status, 201, JSON.stringify(cancelled.body))
	const remaining = new Date(booking.body.snapshot.start).getTime() - Date.now()
	assert.equal(cancelled.body.refundCents, remaining >= 48 * 3600000 ? 1500 : remaining >= 12 * 3600000 ? 750 : 0)
	assert.equal((await request(cancellationPath, 'POST', { reason: 'Plans changed', expectedVersion: 3 }, cancelKey)).body.replayed, true)
	await repository.reconcileBookingRefunds()
	assert.equal((await request(paymentPath)).body.refundedCents, cancelled.body.refundCents)
	assert.equal((await request(`/customer/bookings/${confirmed.body.bookingId}`)).body.state, 'cancelled')
	assert.equal((await request(cancellationPath, 'POST', { reason: 'Cancel', expectedVersion: 2 })).status, 409)
	console.log('Built local Booking cancellation HTTP smoke passed: snapshotted Standard policy, replay, terminal state and scoped refund completion.')
	console.log(
		'Built local paid Booking HTTP smoke passed: adult cookie scope, exact amount/deadline, attendee, policy, durable receipt, once-only commitment and terminal release denial.',
	)
	const waitlistSelection = {
		optionId: option.id,
		addonIds: [],
		mode: 'in_person',
		locationId: source.id,
		staffId: null,
		from: `${tomorrow}T13:00:00Z`,
		to: `${tomorrow}T13:01:00Z`,
	}
	const allocationCount = await repository.db.staffAllocation.count()
	const waiting = await request('/customer/bookings/waitlists', 'POST', { listingId: listing.id, selection: waitlistSelection })
	assert.equal(waiting.status, 201, JSON.stringify(waiting.body))
	assert.equal(waiting.body.reserved, false)
	assert.equal(await repository.notifyBookingWaitlists(), 1)
	assert.equal((await request(`/customer/bookings/waitlists/${waiting.body.waitlistId}`)).body.state, 'notified')
	assert.equal(await repository.db.staffAllocation.count(), allocationCount)
	assert.equal((await request(`/customer/bookings/waitlists/${waiting.body.waitlistId}/remove`, 'POST', undefined, '')).status, 400)
	assert.equal((await request(`/customer/bookings/waitlists/${waiting.body.waitlistId}/remove`, 'POST')).body.state, 'removed')
	console.log('Built local waitlist HTTP smoke passed: scoped notification, no reservation or charge, removal and missing-key denial.')
	if (process.env.SERVICE_BROWSER_CHECK === '1') {
		const { checkServiceSelectionBrowser } = await import('./check-service-selection-browser.mjs')
		await checkServiceSelectionBrowser({ repository, sessionId, vendor, location: source, origin })
	}
	console.log(
		'Built local atomic Booking hold HTTP smoke passed: cookie/adult scope, fixed fifteen-minute terms, private any-Staff/named selection, current slot revalidation, replay/conflict/validation/anonymous denial, cross-mode capacity, release/replay, stale versions, concurrent last-Staff race and expired read recovery. Paid confirmation smoke runs separately above.',
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
