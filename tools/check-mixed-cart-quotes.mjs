import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:net'

import { PostgresFoundation } from '../libs/platform-core/dist/lib/postgres-foundation.js'

const url = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname))
assert.match(url.searchParams.get('schema') ?? '', /^phase00_[a-f0-9]+$/)
const repository = new PostgresFoundation(url.toString())
const secret = randomBytes(32).toString('hex'),
	token = randomBytes(32).toString('hex'),
	userId = randomUUID(),
	sessionId = randomUUID()
const cookie = `junction-auth.session_token=${encodeURIComponent(`${token}.${createHmac('sha256', secret).update(token).digest('base64')}`)}`
let child,
	closed,
	logs = ''
try {
	const workspace = await repository.db.workspace.create({ data: { kind: 'real' } })
	const email = `${userId}@example.invalid`,
		expires = new Date(Date.now() + 3600000)
	await repository.db.user.create({ data: { id: userId, email, adultVerificationState: 'verified', verifiedAt: new Date() } })
	await repository.db.session.create({ data: { id: sessionId, userId, workspaceId: workspace.id, expiresAt: expires } })
	await repository.db.$executeRaw`INSERT INTO junction_auth."user" (id,name,email,"emailVerified") VALUES (${userId},${'Mixed HTTP Customer'},${email},true)`
	await repository.db
		.$executeRaw`INSERT INTO junction_auth.session (id,"expiresAt",token,"updatedAt","userId") VALUES (${sessionId},${expires},${token},now(),${userId})`
	const groups = []
	let booking, productId
	for (let index = 0; index < 2; index++) {
		const vendorWorkspace = await repository.db.workspace.create({ data: { kind: 'real' } })
		const vendor = await repository.db.vendor.create({
			data: {
				workspaceId: vendorWorkspace.id,
				applicationState: 'approved',
				publishedAt: new Date(),
				publicSlug: randomUUID(),
				displayName: 'Mixed HTTP Vendor',
			},
		})
		const calendar = {
			timezone: 'UTC',
			weekly: Array.from({ length: 7 }, (_, weekday) => ({ weekday, hours: [{ startMinute: 540, endMinute: 1020 }], breaks: [] })),
			exceptions: [],
		}
		const location = await repository.db.location.create({
			data: {
				vendorId: vendor.id,
				label: 'Mixed shop',
				city: 'Test city',
				goodsConfiguration: { pickupEnabled: true, returnTemplate: 'standard', deliveryZones: [] },
				goodsConfigurationVersion: 1,
				scheduleCalendar: calendar,
				scheduleVersion: 1,
			},
		})
		const product = await repository.db.listing.create({
			data: {
				vendorId: vendor.id,
				kind: 'product',
				category: 'goods',
				title: 'Mixed HTTP Product',
				description: 'Disposable Product.',
				priceCents: 1000,
				state: 'published',
			},
		})
		await repository.db.inventoryMovement.create({
			data: { listingId: product.id, locationId: location.id, reason: 'received', onHandDelta: 10, reservedDelta: 0, actorKind: 'user', actorId: userId },
		})
		groups.push({
			vendorId: vendor.id,
			locationId: location.id,
			fulfillment: { method: 'pickup' },
			lines: [{ listingId: product.id, quantity: 1, expectedUnitPriceCents: 1000 }],
		})
		if (index === 0) {
			productId = product.id
			const staff = await repository.db.staff.create({
				data: {
					vendorId: vendor.id,
					displayName: 'Private Staff',
					schedule: { scopes: [{ mode: 'online', locationId: null, calendar }] },
					scheduleVersion: 1,
				},
			})
			const option = {
				id: randomUUID(),
				label: 'Online service',
				priceCents: 1500,
				durationMinutes: 30,
				bufferBeforeMinutes: 5,
				bufferAfterMinutes: 10,
				locationIds: [],
				online: true,
				addons: [],
				qualifications: [{ staffId: staff.id, locationIds: [], online: true }],
			}
			const service = await repository.db.listing.create({
				data: {
					vendorId: vendor.id,
					kind: 'service',
					category: 'appointment',
					title: 'Mixed HTTP Service',
					description: 'Disposable Service.',
					priceCents: 1500,
					durationMinutes: 30,
					state: 'published',
					serviceConfiguration: { capacity: 'staff_only', options: [option] },
					serviceConfigurationVersion: 1,
					schedulingRules: { timezone: 'UTC', leadTimeMinutes: 0, horizonDays: 30, slotIntervalMinutes: 15 },
					schedulingRulesVersion: 1,
				},
			})
			const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
			booking = {
				intentId: randomUUID(),
				quantity: 1,
				expectedPriceCents: 1500,
				selection: {
					listingId: service.id,
					optionId: option.id,
					addonIds: [],
					mode: 'online',
					locationId: null,
					staffId: null,
					start: `${tomorrow}T10:15:00Z`,
					expectedConfigurationVersion: 1,
					expectedRulesVersion: 1,
				},
			}
		}
	}
	if (!(await repository.db.commissionRate.findFirst({ where: { vendorId: null, effectiveFrom: { lte: new Date() } } }))) {
		await repository.db.commissionRate.create({
			data: {
				workspaceId: workspace.id,
				actorId: userId,
				scopeKey: 'global',
				vendorId: null,
				basisPoints: 0,
				effectiveFrom: new Date('2026-10-12T00:00:00Z'),
				effectiveUntil: null,
				reason: 'Explicit controlled HTTP regression rate',
			},
		})
	}
	const selection = { goodsGroups: groups, bookings: [booking] }
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
			JUNCTION_BOOKING_ATTENDANCE_SECRET: secret,
			GOOGLE_CLIENT_ID: 'local-mixed.apps.googleusercontent.com',
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
			/* bounded startup */
		}
		if (ready) break
		await new Promise((resolve) => setTimeout(resolve, 100))
	}
	assert.ok(ready, `Built API failed to start: ${logs}`)
	const request = async (path, method = 'GET', body, key = randomUUID(), authenticated = true) => {
		const response = await fetch(`${origin}${path}`, {
			method,
			headers: { 'content-type': 'application/json', ...(authenticated ? { cookie } : {}), ...(key ? { 'idempotency-key': key } : {}) },
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
			signal: AbortSignal.timeout(10000),
		})
		return { status: response.status, body: await response.json(), cacheControl: response.headers.get('cache-control') }
	}
	assert.equal((await request('/customer/cart', 'GET', undefined, undefined, false)).status, 403)
	const initial = await request('/customer/cart')
	assert.equal(initial.status, 200)
	assert.equal(initial.body.version, 0)
	const key = randomUUID(),
		write = { expectedVersion: 0, selection }
	const cart = await request('/customer/cart', 'PUT', write, key)
	assert.equal(cart.status, 200, JSON.stringify(cart.body))
	assert.equal(cart.body.version, 1)
	assert.equal((await request('/customer/cart', 'PUT', write, key)).body.replayed, true)
	assert.equal((await request('/customer/cart', 'PUT', write)).status, 409)
	assert.equal(
		(await request('/customer/cart', 'PUT', { expectedVersion: 1, selection: { goodsGroups: [], bookings: [{ ...booking, quantity: 2 }] } })).status,
		400,
	)
	const preview = await request('/customer/cart/merge-preview', 'POST', { expectedVersion: 1, incoming: selection })
	assert.equal(preview.status, 201, JSON.stringify(preview.body))
	assert.equal(preview.body.persisted, false)
	assert.deepEqual(
		preview.body.matches.map((x) => x.proposedQuantity),
		[2, 2, 1],
	)
	assert.equal((await request('/customer/cart')).body.version, 1)
	const quoteKey = randomUUID(),
		quoteCommand = { cartId: cart.body.cartId, expectedVersion: 1 }
	const before = await repository.db.staffAllocation.count()
	const quote = await request('/customer/checkout/quotes', 'POST', quoteCommand, quoteKey)
	assert.equal(quote.status, 201, JSON.stringify(quote.body))
	assert.equal(quote.body.state, 'ready')
	assert.deepEqual(quote.body.snapshot.total, { minorUnits: 3500, currency: 'ETB' })
	assert.equal(quote.body.snapshot.reserved, false)
	assert.equal((await request('/customer/checkout/quotes', 'POST', quoteCommand, quoteKey)).body.replayed, true)
	const read = await request(`/customer/checkout/quotes/${quote.body.quoteId}`)
	assert.equal(read.status, 200)
	assert.match(read.cacheControl ?? '', /no-store/)
	assert.equal((await request(`/customer/checkout/quotes/${quote.body.quoteId}`, 'GET', undefined, undefined, false)).status, 403)
	assert.equal(await repository.db.staffAllocation.count(), before)
	await repository.db.listing.update({ where: { id: productId }, data: { priceCents: 1200, version: { increment: 1 } } })
	const repriced = await request('/customer/checkout/quotes', 'POST', quoteCommand)
	assert.equal(repriced.body.state, 'conflicts')
	assert.equal(repriced.body.snapshot.conflicts[0].code, 'price_changed')
	assert.equal(repriced.body.snapshot.total.minorUnits, 3700)
	const accepted = structuredClone(selection)
	accepted.goodsGroups[0].lines[0].expectedUnitPriceCents = 1200
	assert.equal((await request('/customer/cart', 'PUT', { expectedVersion: 1, selection: accepted })).body.version, 2)
	assert.equal((await request(`/customer/checkout/quotes/${quote.body.quoteId}`)).body.state, 'stale')
	assert.equal((await request('/customer/checkout/quotes', 'POST', quoteCommand, quoteKey)).body.state, 'stale')
	assert.equal((await request('/customer/checkout/quotes', 'POST', quoteCommand)).status, 409)
	console.log(
		'Built local mixed Cart/quote HTTP smoke passed: signed cookie scope, version/replay/validation, explicit merge preview, multi-Vendor goods plus appointment totals, private no-store reads, no allocation, repricing and stale quote recovery.',
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
	await repository.db.$executeRaw`DELETE FROM junction_auth."user" WHERE id=${userId}`
	await repository.close()
}
