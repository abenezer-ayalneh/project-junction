import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:net'

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
