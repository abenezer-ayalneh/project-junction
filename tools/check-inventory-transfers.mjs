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
	const pickupQuote = await goodsRequest('/customer/goods/quotes', 'POST', {
		groups: [{ ...selection.groups[0], lines: [{ listingId: listing.id, quantity: 1 }] }],
	})
	const pickupHold = await goodsRequest('/customer/goods/holds', 'POST', { quoteId: pickupQuote.body.quoteId })
	const pickupPayment = await goodsRequest('/customer/goods/payments', 'POST', { holdId: pickupHold.body.holdId })
	await goodsRequest(`/customer/goods/payments/${pickupPayment.body.paymentId}/local-result`, 'POST', { outcome: 'succeeded' })
	const pickupPaid = await goodsRequest(`/customer/goods/payments/${pickupPayment.body.paymentId}`, 'GET')
	const pickupPurchase = await goodsRequest(`/customer/goods/purchases/${pickupPaid.body.purchaseId}`, 'GET')
	const pickupOrder = pickupPurchase.body.orders[0]
	const pickupRead = await goodsRequest(`/vendor/goods/orders/${pickupOrder.orderId}/fulfillment`, 'GET')
	assert.equal(pickupRead.status, 200, JSON.stringify(pickupRead.body))
	const fulfillmentPath = `/vendor/goods/fulfillments/${pickupRead.body.fulfillmentId}`
	assert.equal((await goodsRequest(`${fulfillmentPath}/ready`, 'POST', {})).status, 409)
	assert.equal((await goodsRequest(`${fulfillmentPath}/prepare`, 'POST', {})).status, 201)
	const readyKey = randomUUID()
	const pickupReady = await goodsRequest(`${fulfillmentPath}/ready`, 'POST', {}, readyKey)
	assert.equal(pickupReady.status, 201, JSON.stringify(pickupReady.body))
	assert.equal((await goodsRequest(`${fulfillmentPath}/ready`, 'POST', {}, readyKey)).body.replayed, true)
	const privateProof = await goodsRequest(`/customer/goods/orders/${pickupOrder.orderId}/fulfillment`, 'GET')
	assert.ok(privateProof.body.collectionProof)
	assert.equal(pickupReady.body.collectionProof, undefined)
	const svg = decodeURIComponent(privateProof.body.collectionProof.qrSvgDataUri.split(',').slice(1).join(','))
	const sharp = fixtureRequire('sharp')
	const jsQR = fixtureRequire('jsqr')
	const raster = await sharp(Buffer.from(svg)).resize(600, 600, { kernel: 'nearest' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
	const decoded = jsQR(new Uint8ClampedArray(raster.data), raster.info.width, raster.info.height)
	assert.equal(decoded?.data, privateProof.body.collectionProof.qrPayload)
	assert.equal((await goodsRequest(`${fulfillmentPath}/collect`, 'POST', { proof: { method: 'code', code: 'wrong' } })).status, 409)
	const collectionKey = randomUUID()
	const collection = { proof: { method: 'qr', payload: decoded.data } }
	const collected = await goodsRequest(`${fulfillmentPath}/collect`, 'POST', collection, collectionKey)
	assert.equal(collected.status, 201, JSON.stringify(collected.body))
	assert.equal(collected.body.state, 'collected')
	assert.equal((await goodsRequest(`${fulfillmentPath}/collect`, 'POST', collection, collectionKey)).body.replayed, true)
	assert.equal((await goodsRequest(`/customer/goods/orders/${pickupOrder.orderId}/fulfillment`, 'GET')).body.collectionProof, null)
	assert.equal((await goodsRequest(`${fulfillmentPath}/collect`, 'POST', collection)).status, 409)
	console.log(
		'Built local pickup smoke passed: preparation/readiness replay, private Customer code and decodable SVG QR, wrong-proof denial, QR collection once and terminal code removal.',
	)

	const order = purchase.body.orders[0]
	const cancellationPath = `/vendor/goods/orders/${order.orderId}/cancellations`
	const cancellationBody = {
		note: 'Built API exceptional cancellation proof',
		lines: [{ lineId: order.lines[0].lineId, quantity: 1, stockDisposition: 'restock' }],
	}
	assert.equal((await goodsRequest(cancellationPath, 'POST', cancellationBody, randomUUID(), false)).status, 403)
	assert.equal((await goodsRequest(cancellationPath, 'POST', cancellationBody, '')).status, 400)
	assert.equal((await goodsRequest(cancellationPath, 'POST', { ...cancellationBody, lines: [{ ...cancellationBody.lines[0], quantity: 1.5 }] })).status, 400)
	const cancellationKey = randomUUID()
	const cancelled = await goodsRequest(cancellationPath, 'POST', cancellationBody, cancellationKey)
	assert.equal(cancelled.status, 201, JSON.stringify(cancelled.body))
	assert.equal(cancelled.body.state, 'partially_cancelled')
	assert.equal(cancelled.body.refund.amountCents, 1000)
	assert.equal((await goodsRequest(cancellationPath, 'POST', cancellationBody, cancellationKey)).body.replayed, true)
	assert.equal((await goodsRequest(cancellationPath, 'POST', { ...cancellationBody, note: 'Changed cancellation reason' }, cancellationKey)).status, 409)
	assert.equal((await (await publicCheck({ locationId: destination.id })).json()).available, 1)
	assert.equal((await goodsRequest(paymentPath, 'GET')).body.pendingRefundCents, 1000)
	const cancellationRead = await goodsRequest(`/goods/cancellations/${cancelled.body.cancellationId}`, 'GET')
	assert.equal(cancellationRead.status, 200)
	assert.equal(cancellationRead.body.refund.state, 'pending')

	// Validate the local operator grant CLI and real authenticated Finance routes.
	const financeId = randomUUID()
	const financeSessionId = randomUUID()
	const financeToken = randomBytes(32).toString('hex')
	const financeEmail = `${financeId}@example.invalid`
	const financeWorkspace = await repository.db.workspace.create({ data: { kind: 'real' } })
	await repository.db.user.create({ data: { id: financeId, email: financeEmail, adultVerificationState: 'verified', verifiedAt: new Date() } })
	await repository.db.session.create({ data: { id: financeSessionId, userId: financeId, workspaceId: financeWorkspace.id, expiresAt: expires } })
	await repository.db
		.$executeRaw`INSERT INTO junction_auth."user" (id, name, email, "emailVerified") VALUES (${financeId}, ${'Cancellation Finance fixture'}, ${financeEmail}, true)`
	await repository.db
		.$executeRaw`INSERT INTO junction_auth.session (id, "expiresAt", token, "updatedAt", "userId") VALUES (${financeSessionId}, ${expires}, ${financeToken}, now(), ${financeId})`
	const financeCookie = `junction-auth.session_token=${encodeURIComponent(`${financeToken}.${createHmac('sha256', secret).update(financeToken).digest('base64')}`)}`
	const financeRequest = async (path, body) => {
		const response = await fetch(`${origin}${path}`, {
			method: body ? 'POST' : 'GET',
			headers: { cookie: financeCookie, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
			...(body ? { body: JSON.stringify(body) } : {}),
		})
		return { status: response.status, body: await response.json() }
	}
	const financePath = `/platform/goods/orders/${order.orderId}`
	assert.equal((await financeRequest(financePath)).status, 403)
	const manageGrant = (action) => {
		const result = spawnSync(process.execPath, ['tools/manage-local-goods-cancellation-grant.mjs', action], {
			env: {
				...process.env,
				LOCAL_FINANCE_EMAIL: financeEmail,
				LOCAL_GOODS_ORDER_ID: order.orderId,
				LOCAL_OPERATOR_LABEL: 'Disposable local operator',
				LOCAL_GOODS_GRANT_REASON: 'Built local scoped Finance cancellation proof',
			},
			encoding: 'utf8',
		})
		assert.equal(result.status, 0, result.stderr)
	}
	manageGrant('grant')
	assert.equal((await financeRequest(financePath)).status, 200)
	manageGrant('revoke')
	assert.equal((await financeRequest(`${financePath}/cancellations`, cancellationBody)).status, 403)
	manageGrant('grant')
	const finalCancellation = await financeRequest(`${financePath}/cancellations`, cancellationBody)
	assert.equal(finalCancellation.status, 201, JSON.stringify(finalCancellation.body))
	assert.equal(finalCancellation.body.state, 'cancelled')
	await repository.reconcileGoodsRefunds()
	await repository.reconcileGoodsRefunds()
	const refunded = await goodsRequest(paymentPath, 'GET')
	assert.equal(refunded.body.state, 'refunded')
	assert.equal(refunded.body.refundedCents, 2000)
	assert.equal(refunded.body.pendingRefundCents, 0)
	assert.equal((await goodsRequest(`/goods/cancellations/${cancelled.body.cancellationId}`, 'GET')).body.refund.state, 'succeeded')
	assert.equal((await (await publicCheck({ locationId: destination.id })).json()).available, 2)
	const deliveryZoneId = randomUUID()
	await repository.configureGoodsLocation(sessionId, randomUUID(), destination.id, {
		expectedVersion: process.env.FOUNDATION_BROWSER_GOODS === '1' ? 2 : 1,
		configuration: {
			pickupEnabled: true,
			returnTemplate: 'standard',
			deliveryZones: [
				{
					id: deliveryZoneId,
					label: 'Local delivery',
					polygon: [
						[41, 9],
						[42, 9],
						[42, 10],
						[41, 10],
						[41, 9],
					],
					feeCents: 200,
					minimumCents: 1000,
					freeDeliveryThresholdCents: null,
					etaMinutes: 60,
				},
			],
		},
	})
	const deliveryAddress = { contactName: 'Customer', phone: '0911000000', locality: 'City', address: 'Original gate', point: [41.5, 9.5] }
	const deliveryQuote = await goodsRequest('/customer/goods/quotes', 'POST', {
		groups: [
			{
				...selection.groups[0],
				lines: [{ listingId: listing.id, quantity: 1 }],
				fulfillment: { method: 'delivery', zoneId: deliveryZoneId, address: deliveryAddress },
			},
		],
	})
	assert.equal(deliveryQuote.status, 201, JSON.stringify(deliveryQuote.body))
	const deliveryHold = await goodsRequest('/customer/goods/holds', 'POST', { quoteId: deliveryQuote.body.quoteId })
	const deliveryPayment = await goodsRequest('/customer/goods/payments', 'POST', { holdId: deliveryHold.body.holdId })
	await goodsRequest(`/customer/goods/payments/${deliveryPayment.body.paymentId}/local-result`, 'POST', { outcome: 'succeeded' })
	const deliveryPaid = await goodsRequest(`/customer/goods/payments/${deliveryPayment.body.paymentId}`, 'GET')
	const deliveryPurchase = await goodsRequest(`/customer/goods/purchases/${deliveryPaid.body.purchaseId}`, 'GET')
	const deliveryFulfillment = await goodsRequest(`/vendor/goods/orders/${deliveryPurchase.body.orders[0].orderId}/fulfillment`, 'GET')
	const deliveryId = deliveryFulfillment.body.fulfillmentId,
		deliveryPath = `/vendor/goods/fulfillments/${deliveryId}`
	await goodsRequest(`${deliveryPath}/prepare`, 'POST', {})
	const dispatchKey = randomUUID(),
		dispatch = await goodsRequest(`${deliveryPath}/delivery-milestones`, 'POST', { action: 'dispatch' }, dispatchKey)
	assert.equal(dispatch.status, 201, JSON.stringify(dispatch.body))
	assert.equal((await goodsRequest(`${deliveryPath}/delivery-milestones`, 'POST', { action: 'dispatch' }, dispatchKey)).body.replayed, true)
	await goodsRequest(`${deliveryPath}/delivery-milestones`, 'POST', {
		action: 'failed',
		reason: 'address_inaccessible',
		evidence: 'Vendor reached the address but the documented gate was inaccessible.',
	})
	const outsideAck = await goodsRequest(`/customer/goods/fulfillments/${deliveryId}/delivery-acknowledgements`, 'POST', {
		purpose: 'correction',
		address: { ...deliveryAddress, point: [43, 9.5] },
		statement: 'I confirm this corrected address.',
	})
	const correctedAck = await goodsRequest(`/customer/goods/fulfillments/${deliveryId}/delivery-acknowledgements`, 'POST', {
		purpose: 'correction',
		address: { ...deliveryAddress, address: 'Corrected gate' },
		statement: 'I confirm this corrected gate.',
	})
	assert.equal(
		(
			await goodsRequest(`${deliveryPath}/delivery-milestones`, 'POST', {
				action: 'retry',
				acknowledgementId: outsideAck.body.acknowledgementId,
				address: { ...deliveryAddress, point: [43, 9.5] },
				correction: 'Corrected address lies outside the original delivery zone.',
			})
		).status,
		409,
	)
	assert.equal(
		(
			await goodsRequest(`${deliveryPath}/delivery-milestones`, 'POST', {
				action: 'retry',
				acknowledgementId: correctedAck.body.acknowledgementId,
				address: { ...deliveryAddress, address: 'Corrected gate' },
				correction: 'Customer clarified the accessible gate inside the paid delivery zone.',
			})
		).status,
		201,
	)
	const deliveryProof = await goodsRequest(`/customer/goods/fulfillments/${deliveryId}/delivery`, 'GET')
	assert.ok(deliveryProof.body.collectionProof)
	const handoffKey = randomUUID(),
		handoff = { proof: { method: 'code', code: deliveryProof.body.collectionProof.code } }
	const delivered = await goodsRequest(`${deliveryPath}/delivery-handoff`, 'POST', handoff, handoffKey)
	assert.equal(delivered.status, 201, JSON.stringify(delivered.body))
	assert.equal(delivered.body.state, 'delivered')
	assert.equal((await goodsRequest(`${deliveryPath}/delivery-handoff`, 'POST', handoff, handoffKey)).body.replayed, true)
	assert.equal((await goodsRequest(`/customer/goods/fulfillments/${deliveryId}/delivery`, 'GET')).body.collectionProof, null)
	console.log(
		'Built local delivery progress smoke passed: dispatch replay, failure, outside-zone correction denial, one corrected retry, private Customer proof and one-time delivered handoff.',
	)

	await repository.db.vendor.update({ where: { id: vendor.id }, data: { applicationState: 'restricted' } })
	assert.equal((await goodsRequest(`/vendor/goods/orders/${order.orderId}`, 'GET')).status, 200)
	assert.equal(
		(await goodsRequest('/inventory/movements', 'POST', { locationId: destination.id, listingId: listing.id, reason: 'received', quantityDelta: 1 }))
			.status,
		403,
	)
	console.log(
		'Built local goods cancellation smoke passed: exact partial/full quantity and stock recovery, replay/conflict, validation/anonymous denial, live scoped Finance CLI grant/revoke, refunded state and restricted-Vendor read without new stock authority.',
	)

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
