import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function checkUnifiedCheckoutBrowser({ repository, identity, origin, vendor, location, product, service, selection, finance, secret }) {
	const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH)
	const buyer = await identity()
	const owner = await identity()
	const second = await repository.db.vendor.create({
		data: {
			workspaceId: owner.workspace.id,
			applicationState: 'approved',
			publishedAt: new Date(),
			publicSlug: randomUUID(),
			displayName: 'Second goods Vendor',
		},
	})
	const shop = await repository.db.location.create({
		data: {
			vendorId: second.id,
			label: 'Second shop',
			city: 'Test city',
			goodsConfiguration: { pickupEnabled: true, returnTemplate: 'standard', deliveryZones: [] },
			goodsConfigurationVersion: 1,
		},
	})
	await repository.db.vendorMembership.create({ data: { vendorId: second.id, userId: owner.user.id, role: 'vendor_owner', locationIds: [shop.id] } })
	await repository.db.session.update({ where: { id: owner.session.id }, data: { activeVendorId: second.id, activeRole: 'vendor_owner' } })
	const extra = await repository.db.listing.create({
		data: {
			vendorId: second.id,
			kind: 'product',
			category: 'goods',
			title: 'Second Vendor basket',
			description: 'Disposable checkout fixture.',
			state: 'published',
			priceCents: 1200,
		},
	})
	await repository.createInventoryMovement(owner.session.id, randomUUID(), {
		listingId: extra.id,
		locationId: shop.id,
		reason: 'received',
		quantityDelta: 10,
	})
	const firstGroup = {
		...selection.goodsGroups[0],
		fulfillment: { method: 'pickup' },
		lines: [{ listingId: product.id, quantity: 1, expectedUnitPriceCents: 900 }],
	}
	await repository.writeMixedCart(buyer.session.id, randomUUID(), { expectedVersion: 0, selection: { goodsGroups: [firstGroup], bookings: [] } })
	const appointment = {
		...selection.bookings[0],
		intentId: randomUUID(),
		selection: { ...selection.bookings[0].selection, start: selection.bookings[0].selection.start.replace('10:00:', '13:00:') },
	}
	// Use a distinct valid interval from the HTTP smoke's appointment.
	appointment.selection.start = new Date(Date.parse(selection.bookings[0].selection.start) + 3 * 3600000).toISOString()
	const goods = [
		{
			listing: { id: product.id, title: product.title, vendor: { id: vendor.id, displayName: vendor.displayName } },
			locationId: location.id,
			locationLabel: location.label,
			quantity: 1,
			unitPriceCents: 900,
			method: 'pickup',
		},
		{
			listing: { id: extra.id, title: extra.title, vendor: { id: second.id, displayName: second.displayName } },
			locationId: shop.id,
			locationLabel: shop.label,
			quantity: 1,
			unitPriceCents: 1200,
			method: 'pickup',
		},
	]
	const intent = {
		id: appointment.intentId,
		listing: { id: service.id, title: service.title, vendor: { id: vendor.id, displayName: vendor.displayName } },
		command: appointment.selection,
		optionLabel: 'Online service',
		addonLabels: [],
		staffLabel: 'Any qualified Staff',
		locationLabel: 'Online',
		timezone: 'UTC',
		end: new Date(Date.parse(appointment.selection.start) + 1800000).toISOString(),
		priceCents: 1500,
		durationMinutes: 30,
	}
	const server = createServer()
	await new Promise((r) => server.listen(0, '127.0.0.1', r))
	const port = server.address().port
	await new Promise((r) => server.close(r))
	const webUrl = `http://localhost:${port}`
	const nxState = await mkdtemp(join(tmpdir(), 'junction-checkout-nx-'))
	const web = spawn('pnpm', ['nx', 'run', 'web:preview-services'], {
		env: {
			...process.env,
			NX_DAEMON: 'false',
			NX_WORKSPACE_DATA_DIRECTORY: nxState,
			NEXT_PUBLIC_JUNCTION_RUNTIME_MODE: 'local',
			JUNCTION_API_URL: origin,
			PORT: String(port),
		},
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: true,
	})
	const closed = once(web, 'close')
	let logs = ''
	web.stdout.on('data', (v) => {
		logs = (logs + v).slice(-10000)
	})
	web.stderr.on('data', (v) => {
		logs = (logs + v).slice(-10000)
	})
	let browser, context, page
	const evidence =
		(process.env.MIXED_CHECKOUT_EVIDENCE_DIR ?? 'docs/quality/evidence/phase-04-c07-2026-10-13') +
		(process.env.MIXED_CHECKOUT_ACCEPTANCE_CHECK === '1' ? '/browser-boundaries' : '')
	try {
		let ready = false
		for (let i = 0; i < 120; i++) {
			try {
				ready = (await fetch(`${webUrl}/cart`)).ok
			} catch {}
			if (ready) break
			await new Promise((r) => setTimeout(r, 250))
		}
		assert.ok(ready, logs)
		browser = await chromium.launch({ channel: 'msedge', headless: true })
		context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
		let signedIn = false,
			loseHold = false,
			lost = false
		let resolveLostHold
		const lostHold = new Promise((resolve) => {
			resolveLostHold = resolve
		})
		const commands = []
		await context.route('**/v1/**', async (route) => {
			const req = route.request(),
				path = new URL(req.url()).pathname
			const headers = { ...req.headers(), ...(signedIn ? { cookie: buyer.cookie } : {}) }
			commands.push({ path, method: req.method(), key: headers['idempotency-key'] })
			const response = await route.fetch({ url: origin + path.slice(3), headers })
			if (signedIn && response.status() >= 400) console.error('Browser API failure', path, response.status(), await response.text())
			if (loseHold && path.endsWith('/checkout/holds') && req.method() === 'POST') {
				loseHold = false
				lost = true
				await route.abort()
				resolveLostHold()
				return
			}
			await route.fulfill({ response })
		})
		page = await context.newPage()
		page.setDefaultTimeout(15000)
		const errors = []
		page.on('pageerror', (e) => errors.push(e.message))
		await page.goto(`${webUrl}/cart`)
		await page.evaluate(
			({ goods, intent }) => {
				localStorage.setItem('junction:goods-cart:v1', JSON.stringify(goods))
				localStorage.setItem('junction:appointment-intents:v1', JSON.stringify([intent]))
			},
			{ goods, intent },
		)
		await page.reload()
		await page.getByRole('button', { name: 'Continue to checkout' }).click()
		await page.getByText(/This action requires an eligible Customer/).waitFor()
		signedIn = true
		await page.getByRole('button', { name: 'Continue to checkout' }).click()
		await page.getByRole('heading', { name: 'Review Cart merge' }).waitFor()
		assert.equal((await repository.readMixedCart(buyer.session.id)).version, 1)
		await page.getByRole('button', { name: 'Save merged Cart' }).click()
		await page.getByRole('button', { name: 'Review current quote' }).click()
		await page.getByRole('heading', { name: 'Resolve selections' }).waitFor()
		await page.getByRole('button', { name: 'Accept displayed current prices' }).click()
		await page.getByRole('button', { name: 'Review current quote' }).click()
		await page.getByRole('button', { name: 'Accept quote and reserve all for 15 minutes' }).waitFor()
		await mkdir(evidence, { recursive: true })
		await page.screenshot({ path: `${evidence}/quote-desktop.png`, fullPage: true })
		await page.setViewportSize({ width: 390, height: 844 })
		await page.screenshot({ path: `${evidence}/quote-mobile.png`, fullPage: true })
		assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
		loseHold = true
		await page.getByRole('button', { name: 'Accept quote and reserve all for 15 minutes' }).click()
		await lostHold
		await page.getByRole('button', { name: 'Retry original hold request' }).waitFor()
		assert.ok(lost)
		await page.getByRole('button', { name: 'Retry original hold request' }).click()
		await page.getByRole('heading', { name: 'All selections held' }).waitFor()
		await page.reload()
		await page.getByRole('heading', { name: 'All selections held' }).waitFor()
		const holdCommands = commands.filter((c) => c.path.endsWith('/checkout/holds') && c.method === 'POST')
		assert.equal(holdCommands.length, 2)
		assert.equal(holdCommands[0].key, holdCommands[1].key)
		assert.equal(await repository.db.mixedCheckoutHold.count({ where: { customerId: buyer.user.id } }), 1)
		await repository.db.user.update({ where: { id: buyer.user.id }, data: { adultVerificationState: 'unverified', verifiedAt: null } })
		await page.getByRole('button', { name: 'Refresh checkout status' }).click()
		await page.getByText('Adult identity: unverified.').waitFor()
		assert.ok(await page.getByRole('button', { name: /^Pay / }).isDisabled())
		await repository.db.user.update({ where: { id: buyer.user.id }, data: { adultVerificationState: 'verified', verifiedAt: new Date() } })
		await page.getByRole('button', { name: 'Refresh checkout status' }).click()
		await page.getByText('Adult identity: verified.').waitFor()
		await page.getByRole('button', { name: /^Pay / }).click()
		await page.getByRole('heading', { name: 'Checking payment status' }).waitFor()
		await page.getByRole('button', { name: 'Simulate timeout' }).click()
		await page.getByText('Checkout status refreshed.').waitFor({ state: 'hidden' })
		await context.setOffline(true)
		await page.getByText(/You are offline. Reconnect and refresh checkout status. No payment/).waitFor()
		assert.equal(await page.getByRole('button', { name: /^Pay / }).count(), 0)
		await context.setOffline(false)
		await page.reload()
		await page.getByRole('heading', { name: 'Checking payment status' }).waitFor()
		await page.screenshot({ path: `${evidence}/unknown-mobile.png`, fullPage: true })
		await page.getByRole('button', { name: 'Simulate success' }).click()
		await page.getByRole('heading', { name: 'Purchase confirmed' }).waitFor()
		await page.screenshot({ path: `${evidence}/outcome-mobile.png`, fullPage: true })
		await page.setViewportSize({ width: 1440, height: 1000 })
		await page.screenshot({ path: `${evidence}/outcome-desktop.png`, fullPage: true })
		await page.getByRole('link', { name: 'View Purchase and non-tax receipt' }).click()
		await page.getByRole('heading', { name: 'Original non-tax receipt' }).waitFor()
		await page.screenshot({ path: `${evidence}/purchase-desktop.png`, fullPage: true })
		assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
		await page.setViewportSize({ width: 390, height: 844 })
		await page.screenshot({ path: `${evidence}/purchase-mobile.png`, fullPage: true })
		assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
		const payment = await repository.readCurrentMixedPayment(buyer.session.id)
		const purchase = await repository.readMixedPurchase(buyer.session.id, payment.payment.purchaseId)
		assert.equal(purchase.orders.length, 2)
		assert.equal(purchase.bookings.length, 1)
		assert.equal(commands.filter((c) => c.path.endsWith('/checkout/payments') && c.method === 'POST').length, 1)
		assert.deepEqual(errors, [])
		const extraChecks = []
		if (process.env.MIXED_CHECKOUT_ACCEPTANCE_CHECK === '1') {
			const { PostgresFoundation } = await import('../libs/platform-core/dist/lib/postgres-foundation.js')
			const { LocalMixedPaymentAdapter } = await import('../libs/platform-core/dist/lib/local-mixed-payment.js')
			const lateBuyer = await identity(),
				old = new Date(Date.now() - 16 * 60000)
			await repository.publishCommissionRate(finance.session.id, randomUUID(), {
				vendorId: vendor.id,
				basisPoints: 500,
				effectiveFrom: new Date(old.getTime() - 60000).toISOString(),
				effectiveUntil: null,
				reason: 'Disposable historical expiry browser fixture.',
			})
			const adapter = new LocalMixedPaymentAdapter(secret),
				historic = new PostgresFoundation(
					process.env.DATABASE_URL,
					undefined,
					undefined,
					undefined,
					undefined,
					() => old,
					undefined,
					undefined,
					adapter,
				)
			let latePayment
			try {
				const cart = await historic.writeMixedCart(lateBuyer.session.id, randomUUID(), {
					expectedVersion: 0,
					selection: {
						goodsGroups: [
							{
								vendorId: vendor.id,
								locationId: location.id,
								fulfillment: { method: 'pickup' },
								lines: [{ listingId: product.id, quantity: 1, expectedUnitPriceCents: 1000 }],
							},
						],
						bookings: [],
					},
				})
				const quote = await historic.createMixedQuote(lateBuyer.session.id, randomUUID(), { cartId: cart.cartId, expectedVersion: cart.version })
				const hold = await historic.createMixedHold(lateBuyer.session.id, randomUUID(), { quoteId: quote.quoteId })
				const payment = await historic.startMixedPayment(lateBuyer.session.id, randomUUID(), { holdId: hold.holdId })
				latePayment = await historic.db.mixedPaymentAttempt.findUniqueOrThrow({ where: { id: payment.paymentId } })
			} finally {
				await historic.close()
			}
			const recovery = await browser.newContext({ viewport: { width: 390, height: 844 } })
			try {
				await recovery.route('**/v1/**', async (route) => {
					const req = route.request(),
						path = new URL(req.url()).pathname
					const response = await route.fetch({ url: origin + path.slice(3), headers: { ...req.headers(), cookie: lateBuyer.cookie } })
					await route.fulfill({ response })
				})
				const recoveryPage = await recovery.newPage()
				recoveryPage.setDefaultTimeout(15000)
				await recoveryPage.goto(`${webUrl}/cart`)
				await recoveryPage.getByRole('heading', { name: 'Hold expired', exact: true }).waitFor()
				await recoveryPage.getByRole('heading', { name: 'Checking payment status', exact: true }).waitFor()
				assert.equal(await recoveryPage.getByRole('button', { name: /^Pay / }).count(), 0)
				await recoveryPage.screenshot({ path: `${evidence}/expired-unknown-mobile.png`, fullPage: true })
				const at = new Date(),
					raw = Buffer.from(
						JSON.stringify({
							eventId: randomUUID(),
							paymentId: latePayment.id,
							workspaceId: latePayment.workspaceId,
							reference: latePayment.providerReference,
							merchant: 'junction',
							environment: 'local-controlled',
							amount: { minorUnits: Number(latePayment.amountMinorUnits), currency: 'ETB' },
							outcome: 'succeeded',
							occurredAt: at.toISOString(),
						}),
					)
				const controlled = new PostgresFoundation(
					process.env.DATABASE_URL,
					undefined,
					undefined,
					undefined,
					undefined,
					() => new Date(),
					undefined,
					undefined,
					adapter,
				)
				try {
					await controlled.receiveMixedPaymentWebhook(raw, adapter.sign(raw, at))
				} finally {
					await controlled.close()
				}
				await repository.reconcileMixedPayments()
				await repository.reconcileMixedRefunds()
				await recoveryPage.getByRole('button', { name: 'Refresh checkout status' }).click()
				await recoveryPage.getByRole('heading', { name: 'Payment refunded', exact: true }).waitFor()
				assert.equal(await recoveryPage.getByRole('heading', { name: 'Purchase confirmed' }).count(), 0)
				assert.equal(await repository.db.mixedPurchase.count({ where: { paymentId: latePayment.id } }), 0)
				await recoveryPage.screenshot({ path: `${evidence}/late-refunded-mobile.png`, fullPage: true })
				assert.equal(await recoveryPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
				extraChecks.push('expired hold preserves uncertain payment recovery', 'late success shows compensated refund without a Purchase')
			} finally {
				await recovery.unrouteAll({ behavior: 'wait' })
				await recovery.close()
			}
			const unavailableBuyer = await identity()
			await repository.writeMixedCart(unavailableBuyer.session.id, randomUUID(), {
				expectedVersion: 0,
				selection: {
					goodsGroups: [
						{
							vendorId: vendor.id,
							locationId: location.id,
							fulfillment: { method: 'pickup' },
							lines: [{ listingId: product.id, quantity: 999, expectedUnitPriceCents: 1000 }],
						},
					],
					bookings: [],
				},
			})
			const unavailable = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
			try {
				await unavailable.route('**/v1/**', async (route) => {
					const req = route.request(),
						path = new URL(req.url()).pathname
					const response = await route.fetch({ url: origin + path.slice(3), headers: { ...req.headers(), cookie: unavailableBuyer.cookie } })
					await route.fulfill({ response })
				})
				const reviewPage = await unavailable.newPage()
				reviewPage.setDefaultTimeout(15000)
				await reviewPage.goto(`${webUrl}/cart`)
				await reviewPage.getByRole('button', { name: 'Review current quote' }).click()
				const reserve = reviewPage.getByRole('button', { name: 'Accept quote and reserve all for 15 minutes' })
				await reserve.waitFor()
				assert.equal(await reserve.isDisabled(), true)
				assert.equal(await repository.db.mixedCheckoutHold.count({ where: { customerId: unavailableBuyer.user.id } }), 0)
				await reviewPage.screenshot({ path: `${evidence}/unavailable-desktop.png`, fullPage: true })
				extraChecks.push('unavailable component blocks all-or-nothing reserve in served UI')
			} finally {
				await unavailable.unrouteAll({ behavior: 'wait' })
				await unavailable.close()
			}
		}

		await writeFile(
			`${evidence}/browser.json`,
			JSON.stringify(
				{
					browser: 'Microsoft Edge',
					viewports: [1440, 390],
					checks: [
						'anonymous authorization',
						'explicit merge with existing quantity',
						'two Vendors and independent appointment',
						'repricing acknowledgment',
						'lost hold response and reload recovery',
						'unverified identity payment disabled',
						'offline unknown payment and refresh recovery',
						'one authoritative payment and Purchase',
						'two Orders and one Booking receipt',
						'no horizontal overflow',
						...extraChecks,
					],
					passed: true,
				},
				null,
				2,
			) + '\n',
		)
		console.log(
			'Unified checkout browser passed: explicit mixed merge/reprice, lost hold response, identity gate, offline unknown payment, one Purchase and receipt across desktop/mobile.',
		)
	} catch (error) {
		if (page) {
			console.error(await page.locator('body').innerText())
			await page.screenshot({ path: '/tmp/p04-c07-browser-failure.png', fullPage: true })
		}
		throw error
	} finally {
		if (context) await context.unrouteAll({ behavior: 'wait' })
		if (browser) await browser.close()
		try {
			process.kill(-web.pid, 'SIGTERM')
		} catch {}
		await closed
		await rm(nxState, { recursive: true, force: true })
	}
}
