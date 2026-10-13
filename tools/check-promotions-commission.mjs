import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:net'

import { LocalMixedPaymentAdapter } from '../libs/platform-core/dist/lib/local-mixed-payment.js'
import { PostgresFoundation } from '../libs/platform-core/dist/lib/postgres-foundation.js'
const url = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname))
assert.match(url.searchParams.get('schema') ?? '', /^phase00_[a-f0-9]+$/)
const repository = new PostgresFoundation(url.toString()),
	secret = randomBytes(32).toString('hex'),
	identities = []
let child,
	closed,
	logs = ''
async function identity() {
	const workspace = await repository.db.workspace.create({ data: { kind: 'real' } })
	const id = randomUUID(),
		email = `${id}@example.invalid`,
		token = randomBytes(32).toString('hex'),
		expiresAt = new Date(Date.now() + 3600000)
	const user = await repository.db.user.create({ data: { id, email, adultVerificationState: 'verified', verifiedAt: new Date() } })
	const session = await repository.db.session.create({ data: { userId: id, workspaceId: workspace.id, expiresAt } })
	await repository.db.$executeRaw`INSERT INTO junction_auth."user" (id,name,email,"emailVerified") VALUES (${id},${'Promotion HTTP fixture'},${email},true)`
	await repository.db
		.$executeRaw`INSERT INTO junction_auth.session (id,"expiresAt",token,"updatedAt","userId") VALUES (${session.id},${expiresAt},${token},now(),${id})`
	identities.push(id)
	return {
		workspace,
		user,
		session,
		cookie: `junction-auth.session_token=${encodeURIComponent(`${token}.${createHmac('sha256', secret).update(token).digest('base64')}`)}`,
	}
}
try {
	const owner = await identity(),
		buyer = await identity(),
		finance = await identity()
	const grantEnv = {
		...process.env,
		JUNCTION_RUNTIME_MODE: 'local',
		LOCAL_FINANCE_EMAIL: finance.user.email,
		LOCAL_FINANCE_WORKSPACE_ID: finance.workspace.id,
		LOCAL_OPERATOR_LABEL: 'Disposable HTTP verifier',
		LOCAL_FINANCE_REASON: 'Local configuration authority proof',
		LOCAL_FINANCE_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString(),
	}
	const cli = (action) => {
		const result = spawnSync(process.execPath, ['tools/manage-local-finance.mjs', action], { env: grantEnv, stdio: 'pipe', encoding: 'utf8' })
		assert.equal(result.status, 0, result.stderr)
	}
	cli('grant')
	const vendor = await repository.db.vendor.create({
		data: {
			workspaceId: owner.workspace.id,
			applicationState: 'approved',
			publishedAt: new Date(),
			publicSlug: randomUUID(),
			displayName: 'Promotion HTTP Vendor',
		},
	})
	const calendar = {
		timezone: 'UTC',
		weekly: Array.from({ length: 7 }, (_, weekday) => ({ weekday, hours: [{ startMinute: 540, endMinute: 1020 }], breaks: [] })),
		exceptions: [],
	}
	const zone = {
		id: randomUUID(),
		label: 'Local zone',
		polygon: [
			[41, 9],
			[42, 9],
			[42, 10],
			[41, 10],
			[41, 9],
		],
		feeCents: 200,
		minimumCents: 1000,
		freeDeliveryThresholdCents: 3000,
		etaMinutes: 60,
	}
	const location = await repository.db.location.create({
		data: {
			vendorId: vendor.id,
			label: 'Shop',
			city: 'Test city',
			goodsConfiguration: { pickupEnabled: true, returnTemplate: 'standard', deliveryZones: [zone] },
			goodsConfigurationVersion: 1,
			scheduleCalendar: calendar,
			scheduleVersion: 1,
		},
	})
	await repository.db.vendorMembership.create({ data: { vendorId: vendor.id, userId: owner.user.id, role: 'vendor_owner', locationIds: [location.id] } })
	await repository.db.session.update({ where: { id: owner.session.id }, data: { activeVendorId: vendor.id, activeRole: 'vendor_owner' } })
	const product = await repository.db.listing.create({
		data: {
			vendorId: vendor.id,
			kind: 'product',
			category: 'goods',
			title: 'Promotion HTTP Product',
			description: 'Disposable promotion Product.',
			state: 'published',
			priceCents: 1000,
		},
	})
	await repository.createInventoryMovement(owner.session.id, randomUUID(), {
		listingId: product.id,
		locationId: location.id,
		reason: 'received',
		quantityDelta: 10,
	})
	const staff = await repository.db.staff.create({
		data: {
			vendorId: vendor.id,
			displayName: 'Private HTTP Staff',
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
			title: 'Promotion HTTP Service',
			description: 'Disposable promotion Service.',
			state: 'published',
			priceCents: 1500,
			durationMinutes: 30,
			serviceConfiguration: { capacity: 'staff_only', options: [option] },
			serviceConfigurationVersion: 1,
			schedulingRules: { timezone: 'UTC', leadTimeMinutes: 0, horizonDays: 30, slotIntervalMinutes: 15 },
			schedulingRulesVersion: 1,
		},
	})
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
			JUNCTION_MIXED_PAYMENT_WEBHOOK_SECRET: secret,
			JUNCTION_BOOKING_ATTENDANCE_SECRET: secret,
			GOOGLE_CLIENT_ID: 'local-promotions.apps.googleusercontent.com',
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
			/* bounded local startup */
		}
		if (ready) break
		await new Promise((resolve) => setTimeout(resolve, 100))
	}
	assert.ok(ready, `Built API failed to start: ${logs}`)
	const request = async (person, path, method = 'GET', body, key = randomUUID()) => {
		const response = await fetch(`${origin}${path}`, {
			method,
			headers: { 'content-type': 'application/json', ...(person ? { cookie: person.cookie } : {}), ...(key ? { 'idempotency-key': key } : {}) },
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
			signal: AbortSignal.timeout(10000),
		})
		return { status: response.status, body: await response.json(), cacheControl: response.headers.get('cache-control') }
	}
	const effectiveFrom = new Date(Date.now() - 60000).toISOString()
	const rateCommand = { vendorId: null, basisPoints: 500, effectiveFrom, effectiveUntil: null, reason: 'Controlled HTTP global rate' },
		rateKey = randomUUID()
	assert.equal((await request(owner, '/platform/finance/commission-rates', 'POST', rateCommand)).status, 403)
	assert.equal((await request(buyer, '/platform/finance/commission-rates', 'POST', rateCommand)).status, 403)
	const rate = await request(finance, '/platform/finance/commission-rates', 'POST', rateCommand, rateKey)
	assert.equal(rate.status, 201, JSON.stringify(rate.body))
	assert.equal(rate.body.basisPoints, 500)
	assert.equal((await request(finance, '/platform/finance/commission-rates', 'POST', rateCommand, rateKey)).body.replayed, true)
	assert.equal((await request(finance, '/platform/finance/commission-rates', 'POST', { ...rateCommand, basisPoints: 600 }, rateKey)).status, 409)
	assert.equal((await request(finance, '/platform/finance/commission-rates', 'POST', { ...rateCommand, category: 'goods' })).status, 400)
	assert.match((await request(finance, `/platform/finance/commission-rates/${rate.body.rateId}`)).cacheControl ?? '', /no-store/)
	const definition = {
		code: 'HTTP_COUPON',
		validFrom: effectiveFrom,
		validUntil: new Date(Date.now() + 86400000).toISOString(),
		scope: { kinds: ['goods', 'booking'], listingIds: [] },
		rule: { kind: 'fixed', minorUnits: 300 },
		minimumMinorUnits: 0,
		usageLimit: 10,
		perCustomerLimit: 3,
		refundFundingRule: 'proportional_original_allocations',
	}
	const couponCommand = { definition, reason: 'Controlled HTTP Vendor coupon' },
		couponKey = randomUUID()
	assert.equal((await request(buyer, '/vendor/coupons', 'POST', couponCommand)).status, 403)
	const coupon = await request(owner, '/vendor/coupons', 'POST', couponCommand, couponKey)
	assert.equal(coupon.status, 201, JSON.stringify(coupon.body))
	assert.equal(coupon.body.kind, 'vendor_coupon')
	assert.equal((await request(owner, '/vendor/coupons', 'POST', couponCommand, couponKey)).body.replayed, true)
	assert.equal((await request(buyer, `/vendor/coupons/${coupon.body.promotionId}`)).status, 403)
	assert.match((await request(owner, `/vendor/coupons/${coupon.body.promotionId}`)).cacheControl ?? '', /no-store/)
	const resolved = await request(buyer, '/customer/promotions/coupon', 'POST', { vendorId: vendor.id, code: 'http_coupon' })
	assert.equal(resolved.status, 201)
	assert.equal(resolved.body.promotionId, coupon.body.promotionId)
	const campaignCommand = {
		definition: { ...definition, code: 'HTTP_CAMPAIGN', rule: { kind: 'percentage', basisPoints: 1000, maximumMinorUnits: null } },
		vendorIds: [],
		budget: { minorUnits: 500, currency: 'ETB' },
		reason: 'Controlled HTTP campaign',
	}
	assert.equal((await request(owner, '/platform/finance/campaigns', 'POST', campaignCommand)).status, 403)
	assert.equal(
		(await request(finance, '/platform/finance/campaigns', 'POST', { ...campaignCommand, budget: { minorUnits: 500, currency: 'USD' } })).status,
		400,
	)
	const campaign = await request(finance, '/platform/finance/campaigns', 'POST', campaignCommand)
	assert.equal(campaign.status, 201, JSON.stringify(campaign.body))
	assert.equal(campaign.body.kind, 'platform_campaign')
	assert.equal((await request(owner, `/platform/finance/campaigns/${coupon.body.promotionId}`)).status, 403)
	assert.equal((await request(buyer, `/platform/finance/campaigns/${campaign.body.promotionId}`)).status, 403)
	const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
	const selection = {
		goodsGroups: [
			{
				vendorId: vendor.id,
				locationId: location.id,
				fulfillment: {
					method: 'delivery',
					zoneId: zone.id,
					address: { contactName: 'Buyer', phone: '+251900000000', locality: 'Test city', address: 'Office', point: [41.5, 9.5] },
				},
				lines: [{ listingId: product.id, quantity: 2, expectedUnitPriceCents: 1000 }],
			},
		],
		bookings: [
			{
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
			},
		],
		promotions: { vendorCouponId: coupon.body.promotionId, platformCampaignId: campaign.body.promotionId },
	}
	const cart = await request(buyer, '/customer/cart', 'PUT', { expectedVersion: 0, selection })
	assert.equal(cart.status, 200, JSON.stringify(cart.body))
	const command = { cartId: cart.body.cartId, expectedVersion: 1 },
		quoteKey = randomUUID()
	const quote = await request(buyer, '/customer/checkout/quotes', 'POST', command, quoteKey)
	assert.equal(quote.status, 201, JSON.stringify(quote.body))
	assert.equal(quote.body.state, 'ready')
	assert.deepEqual(quote.body.snapshot.total, { minorUnits: 3080, currency: 'ETB' })
	assert.equal(quote.body.snapshot.promotion.vendorDiscountMinorUnits, 300)
	assert.equal(quote.body.snapshot.promotion.platformSubsidyMinorUnits, 320)
	assert.equal(quote.body.snapshot.promotion.deliveryMinorUnits, 200)
	assert.equal(quote.body.snapshot.commission.totalMinorUnits, 160)
	assert.equal(quote.body.snapshot.commission.rates[0].basisMinorUnits, 3200)
	assert.equal(quote.body.snapshot.promotion.receiptContext.kind, 'non_tax_platform_receipt')
	assert.equal(quote.body.snapshot.promotion.receiptContext.taxCalculated, false)
	assert.equal((await request(buyer, '/customer/checkout/quotes', 'POST', command, quoteKey)).body.replayed, true)
	assert.ok(!JSON.stringify(quote.body).includes(staff.id))
	assert.equal(await repository.db.promotionReservation.count({ where: { quoteId: quote.body.quoteId } }), 0)
	assert.equal(await repository.db.staffAllocation.count({ where: { staffId: staff.id } }), 0)
	assert.equal((await request(buyer, `/customer/checkout/quotes/${quote.body.quoteId}`)).body.snapshot.total.minorUnits, 3080)
	const changed = await request(finance, '/platform/finance/commission-rates', 'POST', {
		...rateCommand,
		basisPoints: 600,
		effectiveFrom: new Date().toISOString(),
		reason: 'Later effective HTTP policy',
	})
	assert.equal(changed.status, 201, JSON.stringify(changed.body))
	assert.equal((await request(buyer, `/customer/checkout/quotes/${quote.body.quoteId}`)).body.snapshot.commission.totalMinorUnits, 160)
	assert.equal((await request(buyer, '/customer/checkout/quotes', 'POST', command)).body.snapshot.commission.totalMinorUnits, 192)
	if (process.env.MIXED_HOLD_HTTP_CHECK === '1' || process.env.MIXED_PAYMENT_HTTP_CHECK === '1') {
		let paymentProofId, duePaymentId
		const paymentAdapter = new LocalMixedPaymentAdapter(secret)
		const latest = await request(buyer, '/customer/checkout/quotes', 'POST', command)
		assert.equal(latest.body.state, 'ready')
		const holdCommand = { quoteId: latest.body.quoteId },
			holdKey = randomUUID()
		assert.equal((await request(null, '/customer/checkout/holds', 'POST', holdCommand)).status, 403)
		const held = await request(buyer, '/customer/checkout/holds', 'POST', holdCommand, holdKey)
		assert.equal(held.status, 201, JSON.stringify(held.body))
		assert.equal(held.body.state, 'holding')
		assert.equal(held.body.reserved, true)
		assert.equal(Date.parse(held.body.expiresAt) - Date.parse(held.body.createdAt), 15 * 60000)
		assert.equal((await request(buyer, '/customer/checkout/holds', 'POST', holdCommand, holdKey)).body.replayed, true)
		assert.equal((await request(buyer, '/customer/checkout/holds', 'POST', holdCommand)).status, 409)
		const recovered = await request(buyer, '/customer/checkout/holds/current')
		assert.equal(recovered.status, 200)
		assert.equal(recovered.body.hold.holdId, held.body.holdId)
		assert.match(recovered.cacheControl ?? '', /no-store/)
		assert.equal((await request(owner, `/customer/checkout/holds/${held.body.holdId}`)).status, 403)
		assert.equal((await request(owner, `/customer/checkout/holds/${held.body.holdId}/release`, 'POST')).status, 403)
		assert.equal((await request(buyer, '/customer/cart', 'PUT', { expectedVersion: 1, selection })).status, 409)
		assert.equal(await repository.db.staffAllocation.count({ where: { mixedIntent: { holdId: held.body.holdId }, state: 'held' } }), 1)
		assert.equal((await repository.db.campaignBudgetBalance.findUniqueOrThrow({ where: { promotionId: campaign.body.promotionId } })).reserved, 320n)
		assert.ok(!JSON.stringify(held.body).includes(staff.id))

		if (process.env.MIXED_PAYMENT_HTTP_CHECK === '1') {
			const startBody = { holdId: held.body.holdId },
				startKey = randomUUID()
			assert.equal((await request(null, '/customer/checkout/payments', 'POST', startBody)).status, 403)
			assert.equal((await request(owner, '/customer/checkout/payments', 'POST', startBody)).status, 403)
			assert.equal((await request(buyer, '/customer/checkout/payments', 'POST', { ...startBody, amount: 1 })).status, 400)
			const payment = await request(buyer, '/customer/checkout/payments', 'POST', startBody, startKey)
			assert.equal(payment.status, 201, JSON.stringify(payment.body))
			paymentProofId = payment.body.paymentId
			assert.equal(payment.body.expiresAt, held.body.expiresAt)
			assert.equal(payment.body.sandbox, true)
			assert.equal((await request(buyer, '/customer/checkout/payments', 'POST', startBody, startKey)).body.replayed, true)
			assert.equal((await request(buyer, '/customer/checkout/payments', 'POST', startBody)).status, 409)
			assert.equal((await request(owner, `/customer/checkout/payments/${paymentProofId}`)).status, 403)
			const p = await repository.db.mixedPaymentAttempt.findUniqueOrThrow({ where: { id: paymentProofId } })
			const event = {
				eventId: randomUUID(),
				paymentId: p.id,
				workspaceId: p.workspaceId,
				reference: p.providerReference,
				merchant: 'junction',
				environment: 'local-controlled',
				amount: { minorUnits: 1, currency: 'ETB' },
				outcome: 'succeeded',
				occurredAt: new Date().toISOString(),
			}
			const raw = Buffer.from(JSON.stringify(event))
			const unsigned = await fetch(`${origin}/payments/local-mixed-webhook`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: raw,
			})
			assert.equal(unsigned.status, 403)

			const malformed = Buffer.from('{bad')
			const unsignedMalformed = await fetch(`${origin}/payments/local-mixed-webhook`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: malformed,
			})
			assert.equal(unsignedMalformed.status, 403)
			const signedMalformed = await fetch(`${origin}/payments/local-mixed-webhook`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-junction-payment-signature': paymentAdapter.sign(malformed, new Date()) },
				body: malformed,
			})
			assert.equal(signedMalformed.status, 200)
			const wrongMoney = await fetch(`${origin}/payments/local-mixed-webhook`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-junction-payment-signature': paymentAdapter.sign(raw, new Date()) },
				body: raw,
			})
			assert.equal(wrongMoney.status, 200)
			assert.equal((await request(buyer, `/customer/checkout/payments/${p.id}`)).body.state, 'pending_provider')
			const simulated = await request(buyer, `/customer/checkout/payments/${p.id}/local-result`, 'POST', { outcome: 'succeeded' })
			assert.equal(simulated.status, 201, JSON.stringify(simulated.body))
			assert.equal(simulated.body.state, 'pending_provider')
			const recoveredPayment = await request(buyer, `/customer/checkout/payments/${p.id}`)
			assert.match(recoveredPayment.cacheControl ?? '', /no-store/)
			assert.equal(recoveredPayment.body.state, 'succeeded')
			assert.equal(recoveredPayment.body.commitmentReady, true)
			const currentPayment = await request(buyer, '/customer/checkout/payments/current')
			assert.equal(currentPayment.status, 200)
			assert.equal(currentPayment.body.payment.paymentId, p.id)
			assert.match(currentPayment.cacheControl ?? '', /no-store/)
			assert.equal(await repository.db.goodsPurchase.count({ where: { customerId: buyer.user.id } }), 0)
			assert.equal(await repository.db.ledgerTransaction.count({ where: { sourceId: p.id } }), 1)
		}
		const releaseKey = randomUUID(),
			path = `/customer/checkout/holds/${held.body.holdId}/release`
		assert.equal((await request(buyer, path, 'POST', undefined, releaseKey)).body.state, 'released')
		assert.equal((await request(buyer, path, 'POST', undefined, releaseKey)).body.replayed, true)
		assert.equal((await request(buyer, `/customer/checkout/holds/${held.body.holdId}`)).body.reserved, false)
		assert.equal((await repository.db.campaignBudgetBalance.findUniqueOrThrow({ where: { promotionId: campaign.body.promotionId } })).reserved, 0n)
		const original = await repository.db.inventoryMovement.aggregate({
			where: { listingId: product.id, locationId: location.id },
			_sum: { onHandDelta: true, reservedDelta: true },
		})
		assert.equal(original._sum.onHandDelta, 10)
		assert.equal(original._sum.reservedDelta, 0)

		// A genuine due mixed hold created with a controlled earlier business
		// clock proves the actual built worker, without waiting fifteen minutes.
		const past = new Date(Date.now() - 16 * 60000)
		await repository.db.commissionRate.create({
			data: {
				workspaceId: finance.workspace.id,
				actorId: finance.user.id,
				scopeKey: vendor.id,
				vendorId: vendor.id,
				basisPoints: 500,
				effectiveFrom: new Date(past.getTime() - 60000),
				effectiveUntil: null,
				reason: 'Controlled worker timing rate',
			},
		})
		const workerCampaign = await request(finance, '/platform/finance/campaigns', 'POST', {
			...campaignCommand,
			definition: {
				...campaignCommand.definition,
				code: 'WORKER_CAMPAIGN',
				validFrom: new Date(past.getTime() - 60000).toISOString(),
				rule: { kind: 'fixed', minorUnits: 100 },
			},
		})
		assert.equal(workerCampaign.status, 201, JSON.stringify(workerCampaign.body))
		const controlled = new PostgresFoundation(url.toString(), undefined, undefined, undefined, undefined, () => new Date(past))
		let due
		try {
			const currentCart = await controlled.readMixedCart(buyer.session.id)
			const workerSelection = { ...selection, promotions: { vendorCouponId: null, platformCampaignId: workerCampaign.body.promotionId } }
			const saved = await controlled.writeMixedCart(buyer.session.id, randomUUID(), { expectedVersion: currentCart.version, selection: workerSelection })
			const priced = await controlled.createMixedQuote(buyer.session.id, randomUUID(), { cartId: saved.cartId, expectedVersion: saved.version })
			assert.equal(priced.state, 'ready')
			due = await controlled.createMixedHold(buyer.session.id, randomUUID(), { quoteId: priced.quoteId })
			if (process.env.MIXED_PAYMENT_HTTP_CHECK === '1')
				duePaymentId = (await controlled.startMixedPayment(buyer.session.id, randomUUID(), { holdId: due.holdId })).paymentId
		} finally {
			await controlled.close()
		}

		if (duePaymentId) {
			const p = await repository.db.mixedPaymentAttempt.findUniqueOrThrow({ where: { id: duePaymentId } })
			const payload = {
					eventId: randomUUID(),
					paymentId: p.id,
					workspaceId: p.workspaceId,
					reference: p.providerReference,
					merchant: 'junction',
					environment: 'local-controlled',
					amount: { minorUnits: Number(p.amountMinorUnits), currency: p.currency },
					outcome: 'succeeded',
					occurredAt: new Date().toISOString(),
				},
				raw = Buffer.from(JSON.stringify(payload))
			const deliver = () =>
				fetch(`${origin}/payments/local-mixed-webhook`, {
					method: 'POST',
					headers: { 'content-type': 'application/json', 'x-junction-payment-signature': paymentAdapter.sign(raw, new Date()) },
					body: raw,
				})
			assert.equal((await deliver()).status, 200)
			assert.equal((await (await deliver()).json()).duplicate, true)
		}
		const redisUrl = new URL(process.env.REDIS_URL ?? '')
		assert.ok(['localhost', '127.0.0.1'].includes(redisUrl.hostname))
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
			for (let attempt = 0; attempt < 60; attempt++) {
				const row = await repository.db.mixedCheckoutHold.findUniqueOrThrow({ where: { id: due.holdId } })
				if (
					row.state === 'expired' &&
					(!duePaymentId || (await repository.db.mixedPaymentAttempt.findUniqueOrThrow({ where: { id: duePaymentId } })).state === 'refunded') &&
					(!paymentProofId || (await repository.db.mixedPaymentAttempt.findUniqueOrThrow({ where: { id: paymentProofId } })).state === 'refunded')
				) {
					expired = true
					break
				}
				if (worker.exitCode !== null) break
				await new Promise((resolve) => setTimeout(resolve, 250))
			}
			assert.ok(expired, `Built worker did not expire mixed participants: ${workerLogs}`)

			if (duePaymentId) {
				for (const id of [paymentProofId, duePaymentId]) {
					const entries = await repository.db.ledgerTransaction.findMany({ where: { sourceId: id }, include: { postings: true } })
					assert.equal(entries.length, 2)
					assert.equal(
						entries.flatMap((t) => t.postings).reduce((sum, p) => sum + p.minorUnits, 0n),
						0n,
					)
				}
				console.log(
					'Built local mixed payment HTTP/actual worker passed: signed raw inbox, scope/Money rejection, durable synthetic receipt, fixed original deadline, capture liability, abandoned and late-success full refunds with exact ledger reversals. No Purchase or live provider claim.',
				)
			}
			assert.ok(workerLogs.includes('worker.started'))
			assert.equal(await repository.db.staffAllocation.count({ where: { mixedIntent: { holdId: due.holdId }, state: 'held' } }), 0)
			assert.equal(
				(await repository.db.campaignBudgetBalance.findUniqueOrThrow({ where: { promotionId: workerCampaign.body.promotionId } })).reserved,
				0n,
			)
			assert.equal(
				(await repository.db.inventoryMovement.aggregate({ where: { listingId: product.id, locationId: location.id }, _sum: { reservedDelta: true } }))
					._sum.reservedDelta,
				0,
			)
		} finally {
			if (worker.exitCode === null) worker.kill('SIGTERM')
			const timer = setTimeout(() => worker.kill('SIGKILL'), 5000)
			try {
				await workerClosed
			} finally {
				clearTimeout(timer)
			}
		}
		console.log(
			'Built local atomic mixed hold HTTP/worker smoke passed: private recovery, 15-minute common deadline, stock/Staff/budget allocation, replay, foreign-scope denial, Cart lock, complete release and actual loopback worker expiry of all participants.',
		)
	}
	cli('revoke')
	assert.equal(
		(
			await request(finance, '/platform/finance/campaigns', 'POST', {
				...campaignCommand,
				definition: { ...campaignCommand.definition, code: 'DENIED_AFTER_REVOKE' },
			})
		).status,
		403,
	)
	assert.equal(await repository.db.auditLog.count({ where: { workspaceId: finance.workspace.id, action: 'platform.finance-configuration-granted' } }), 1)
	assert.equal(await repository.db.auditLog.count({ where: { workspaceId: finance.workspace.id, action: 'platform.finance-configuration-revoked' } }), 1)
	console.log(
		'Built local promotion/commission HTTP smoke passed: temporary audited Finance CLI grant/revoke, signed-cookie Owner/Finance isolation, explicit rates/coupons/campaigns, replay/validation, ordered funding, delivery exclusion, private any-Staff, non-tax receipt context, no quote reservations and frozen history after effective rate change.',
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
	for (const id of identities) await repository.db.$executeRaw`DELETE FROM junction_auth."user" WHERE id=${id}`
	await repository.close()
}
