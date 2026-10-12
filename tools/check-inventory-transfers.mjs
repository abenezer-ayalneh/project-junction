import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { once } from 'node:events'

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
	const vendor = await repository.db.vendor.create({ data: { workspaceId: workspace.id } })
	const source = await repository.db.location.create({ data: { vendorId: vendor.id } })
	const destination = await repository.db.location.create({ data: { vendorId: vendor.id } })
	await repository.db.user.create({ data: { id: userId, email, adultVerificationState: 'verified', verifiedAt: new Date() } })
	await repository.db.vendorMembership.create({ data: { userId, vendorId: vendor.id, role: 'vendor_owner', locationIds: [source.id, destination.id] } })
	const expires = new Date(Date.now() + 3600000)
	await repository.db.session.create({
		data: { id: sessionId, userId, workspaceId: workspace.id, activeVendorId: vendor.id, activeRole: 'vendor_owner', expiresAt: expires },
	})
	await repository.db
		.$executeRaw`INSERT INTO junction_auth."user" (id, name, email, "emailVerified") VALUES (${userId}, ${'Inventory API fixture'}, ${email}, true)`
	await repository.db
		.$executeRaw`INSERT INTO junction_auth.session (id, "expiresAt", token, "updatedAt", "userId") VALUES (${sessionId}, ${expires}, ${token}, now(), ${userId})`
	const listing = await repository.createListing(sessionId, randomUUID(), {
		kind: 'product',
		category: 'goods',
		title: 'HTTP transfer item',
		description: 'Disposable inventory API test item.',
		priceCents: 1000,
	})
	await repository.createInventoryMovement(sessionId, randomUUID(), { locationId: source.id, listingId: listing.id, reason: 'received', quantityDelta: 4 })
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
	const command = {
		sourceLocationId: source.id,
		destinationLocationId: destination.id,
		listingId: listing.id,
		quantity: 3,
		note: 'Transfer via built HTTP API',
	}
	const key = randomUUID()
	const request = async (body, idempotencyKey = key, authenticated = true) => {
		const response = await fetch(`${origin}/inventory/transfers`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(authenticated ? { cookie } : {}),
				...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
			},
			body: JSON.stringify(body),
		})
		return { status: response.status, body: await response.json() }
	}
	const first = await request(command)
	assert.equal(first.status, 201, JSON.stringify(first.body))
	assert.equal(first.body.source.available, 1)
	assert.equal(first.body.destination.available, 3)
	assert.equal(first.body.replayed, false)
	const replay = await request(command)
	assert.equal(replay.status, 201)
	assert.deepEqual(replay.body, { ...first.body, replayed: true })
	assert.equal((await request({ ...command, quantity: 2 })).status, 409)
	assert.equal((await request({ ...command, quantity: 2 }, randomUUID())).status, 403)
	assert.equal((await request({ ...command, quantity: 0 }, randomUUID())).status, 400)
	assert.equal((await request(command, '')).status, 400)
	assert.equal((await request(command, randomUUID(), false)).status, 403)
	const foreign = await repository.db.vendor.create({ data: { workspaceId: workspace.id } })
	const foreignLocation = await repository.db.location.create({ data: { vendorId: foreign.id } })
	assert.equal((await request({ ...command, destinationLocationId: foreignLocation.id, quantity: 1 }, randomUUID())).status, 403)
	const availability = await fetch(`${origin}/inventory/listings/${listing.id}/availability?locationId=${destination.id}`, { headers: { cookie } })
	assert.equal(availability.status, 200)
	assert.equal((await availability.json()).available, 3)
	assert.equal(await repository.db.inventoryMovement.count({ where: { listingId: listing.id } }), 3)
	const publicCheck = (params) => fetch(`${origin}/public/listings/${listing.id}/availability?${new URLSearchParams(params)}`)
	assert.equal((await publicCheck({ locationId: destination.id })).status, 403)
	await repository.db.vendor.update({
		where: { id: vendor.id },
		data: {
			applicationState: 'approved',
			publishedAt: new Date(),
			publicSlug: randomUUID(),
			displayName: 'Public stock vendor',
		},
	})
	await repository.db.location.update({ where: { id: destination.id }, data: { label: 'Shop', city: 'Test city' } })
	await repository.db.listing.update({ where: { id: listing.id }, data: { state: 'published' } })
	const publicAvailability = await publicCheck({ locationId: destination.id, quantity: '2' })
	assert.equal(publicAvailability.status, 200)
	const publicBody = await publicAvailability.json()
	assert.deepEqual(publicBody, {
		listingId: listing.id,
		locationId: destination.id,
		sku: null,
		available: 3,
		requestedQuantity: 2,
		canFulfill: true,
		checkedAt: publicBody.checkedAt,
	})
	assert.ok(Number.isFinite(Date.parse(publicBody.checkedAt)))
	assert.equal((await (await publicCheck({ locationId: destination.id, quantity: '4' })).json()).canFulfill, false)
	assert.equal((await publicCheck({ locationId: destination.id, quantity: '0' })).status, 400)
	assert.equal((await publicCheck({ locationId: foreignLocation.id })).status, 403)
	assert.equal((await publicCheck({ locationId: destination.id, sku: 'unknown' })).status, 403)
	await repository.db.listing.update({ where: { id: listing.id }, data: { state: 'unpublished' } })
	assert.equal((await publicCheck({ locationId: destination.id })).status, 403)
	assert.equal(await repository.db.inventoryMovement.count({ where: { listingId: listing.id } }), 3)
	await repository.db.listing.update({ where: { id: listing.id }, data: { state: 'published' } })
	const goodsRequest = async (path, method, body, key = randomUUID(), authenticated = true) => {
		const response = await fetch(`${origin}${path}`, {
			method,
			headers: { 'content-type': 'application/json', 'idempotency-key': key, ...(authenticated ? { cookie } : {}) },
			...(body ? { body: JSON.stringify(body) } : {}),
		})
		return { status: response.status, body: await response.json() }
	}
	const configuration = { expectedVersion: 0, configuration: { pickupEnabled: true, returnTemplate: 'standard', deliveryZones: [] } }
	const configurationPath = `/locations/${destination.id}/goods-configuration`
	const configKey = randomUUID()
	const configured = await goodsRequest(configurationPath, 'PUT', configuration, configKey)
	assert.equal(configured.status, 200, JSON.stringify(configured.body))
	assert.equal((await goodsRequest(configurationPath, 'PUT', configuration, configKey)).body.replayed, true)
	assert.equal((await goodsRequest(configurationPath, 'PUT', configuration)).status, 409)
	assert.equal((await goodsRequest(`/locations/${foreignLocation.id}/goods-configuration`, 'PUT', configuration)).status, 403)
	const selection = {
		groups: [{ vendorId: vendor.id, locationId: destination.id, fulfillment: { method: 'pickup' }, lines: [{ listingId: listing.id, quantity: 2 }] }],
	}
	assert.equal((await goodsRequest('/customer/goods/quotes', 'POST', selection, randomUUID(), false)).status, 403)
	const quoteKey = randomUUID()
	const quote = await goodsRequest('/customer/goods/quotes', 'POST', selection, quoteKey)
	assert.equal(quote.status, 201, JSON.stringify(quote.body))
	assert.equal(quote.body.snapshot.totalCents, 2000)
	assert.equal(quote.body.snapshot.currency, 'ETB')
	assert.equal((await goodsRequest('/customer/goods/quotes', 'POST', selection, quoteKey)).body.replayed, true)
	const holdKey = randomUUID()
	const hold = await goodsRequest('/customer/goods/holds', 'POST', { quoteId: quote.body.quoteId }, holdKey)
	assert.equal(hold.status, 201, JSON.stringify(hold.body))
	assert.equal((await goodsRequest('/customer/goods/holds', 'POST', { quoteId: quote.body.quoteId }, holdKey)).body.replayed, true)
	assert.equal((await goodsRequest('/customer/goods/holds', 'POST', { quoteId: quote.body.quoteId })).status, 409)
	assert.equal((await (await publicCheck({ locationId: destination.id })).json()).available, 1)
	const holdPath = `/customer/goods/holds/${hold.body.holdId}`
	assert.equal((await goodsRequest(holdPath, 'GET')).body.state, 'holding')
	const releaseKey = randomUUID()
	assert.equal((await goodsRequest(`${holdPath}/release`, 'POST', null, releaseKey)).body.state, 'released')
	assert.equal((await goodsRequest(`${holdPath}/release`, 'POST', null, releaseKey)).body.replayed, true)
	assert.equal((await goodsRequest(holdPath, 'GET')).body.state, 'released')
	assert.equal((await (await publicCheck({ locationId: destination.id })).json()).available, 3)
	const publicDetail = await fetch(`${origin}/public/listings/${listing.id}`)
	assert.deepEqual((await publicDetail.json()).locations.find((item) => item.id === destination.id).goodsConfiguration, configuration.configuration)
	if (process.env.FOUNDATION_BROWSER_GOODS === '1') {
		const { checkGoodsCartBrowser } = await import('./check-goods-cart-browser.mjs')
		await checkGoodsCartBrowser({ repository, sessionId, vendor, location: destination, origin, cookie })
	}

	const paidQuote = await goodsRequest('/customer/goods/quotes', 'POST', selection)
	const paidHold = await goodsRequest('/customer/goods/holds', 'POST', { quoteId: paidQuote.body.quoteId })
	const paymentKey = randomUUID()
	const payment = await goodsRequest('/customer/goods/payments', 'POST', { holdId: paidHold.body.holdId }, paymentKey)
	assert.equal(payment.status, 201, JSON.stringify(payment.body))
	assert.equal(payment.body.holdState, 'awaiting_payment')
	assert.equal((await goodsRequest('/customer/goods/payments', 'POST', { holdId: paidHold.body.holdId }, paymentKey)).body.replayed, true)
	assert.equal((await goodsRequest('/customer/goods/payments', 'POST', { holdId: paidHold.body.holdId })).status, 409)
	assert.equal((await goodsRequest('/customer/goods/payments', 'POST', { holdId: paidHold.body.holdId }, randomUUID(), false)).status, 403)
	const paymentPath = `/customer/goods/payments/${payment.body.paymentId}`
	assert.equal((await goodsRequest(`${paymentPath}/local-result`, 'POST', { outcome: 'succeeded', amountCents: 1 })).status, 400)
	assert.equal((await goodsRequest(`${paymentPath}/local-result`, 'POST', { outcome: 'unknown' })).body.state, 'unknown')
	assert.equal((await goodsRequest(paymentPath, 'GET')).body.purchaseId, null)
	const resultKey = randomUUID()
	assert.equal((await goodsRequest(`${paymentPath}/local-result`, 'POST', { outcome: 'succeeded' }, resultKey)).status, 201)
	assert.equal((await goodsRequest(`${paymentPath}/local-result`, 'POST', { outcome: 'succeeded' }, resultKey)).body.replayed, true)
	const paidPayment = await goodsRequest(paymentPath, 'GET')
	assert.equal(paidPayment.body.state, 'succeeded')
	assert.equal(paidPayment.body.holdState, 'committed')
	const purchasePath = `/customer/goods/purchases/${paidPayment.body.purchaseId}`
	const purchase = await goodsRequest(purchasePath, 'GET')
	assert.equal(purchase.status, 200, JSON.stringify(purchase.body))
	assert.equal(purchase.body.snapshot.totalCents, 2000)
	assert.equal(purchase.body.orders.length, 1)
	assert.equal(purchase.body.orders[0].state, 'confirmed')
	assert.equal(purchase.body.orders[0].lines[0].snapshot.quantity, 2)
	assert.equal((await goodsRequest(`/vendor/goods/orders/${purchase.body.orders[0].orderId}`, 'GET')).status, 200)
	assert.equal((await goodsRequest(purchasePath, 'GET', null, randomUUID(), false)).status, 403)
	assert.equal((await goodsRequest(`${paymentPath}/local-result`, 'POST', { outcome: 'failed' })).status, 409)
	assert.equal((await goodsRequest(`/customer/goods/holds/${paidHold.body.holdId}/release`, 'POST', null)).status, 409)
	assert.equal((await (await publicCheck({ locationId: destination.id })).json()).available, 1)
	console.log(
		'Built local goods paid Order smoke passed: payment window/replay, unknown and authoritative success, one Purchase/confirmed scoped Order, immutable price/quantity snapshots, denial and stock sale.',
	)
	console.log(
		'Built local goods checkout smoke passed: Owner configuration, quote/hold/release replay, snapshots, stock reservation and restored availability.',
	)
	console.log('Built local public Product availability smoke passed: anonymous stock read, quantity checks, validation and visibility denial.')
	console.log(
		'Built local API inventory transfer smoke passed: transfer, replay, conflict, insufficient stock, validation, anonymous/foreign denial, and availability.',
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
