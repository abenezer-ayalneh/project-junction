import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

// Called inside the disposable inventory fixture. All traffic stays on loopback;
// browser routing is only a transport proxy to the real built API, plus explicit
// failure injection after a real request/commit.
export async function checkGoodsCartBrowser({ repository, sessionId, vendor, location, origin, cookie }) {
	if (!process.env.PLAYWRIGHT_MODULE_PATH) throw new Error('Set PLAYWRIGHT_MODULE_PATH to the local bundled playwright/index.mjs.')
	const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH)
	const zoneId = randomUUID()
	await repository.configureGoodsLocation(sessionId, randomUUID(), location.id, {
		expectedVersion: 1,
		configuration: {
			pickupEnabled: true,
			returnTemplate: 'standard',
			deliveryZones: [
				{
					id: zoneId,
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
	const product = await repository.createListing(sessionId, randomUUID(), {
		kind: 'product',
		category: 'goods',
		title: 'Browser variant basket',
		description: 'Disposable browser test Product.',
		variants: [
			{ sku: 'small', label: 'Small', priceCents: 1000 },
			{ sku: 'large', label: 'Large', priceCents: 2000 },
		],
	})
	await repository.db.listing.update({ where: { id: product.id }, data: { state: 'published' } })
	await repository.createInventoryMovement(sessionId, randomUUID(), {
		listingId: product.id,
		locationId: location.id,
		sku: 'small',
		reason: 'received',
		quantityDelta: 3,
	})
	const web = spawn('pnpm', ['nx', 'run', 'web:serve-static'], {
		env: {
			...process.env,
			NEXT_PUBLIC_JUNCTION_RUNTIME_MODE: 'local',
			NEXT_PUBLIC_JUNCTION_API_URL: 'http://localhost:3001/v1',
			JUNCTION_API_URL: origin,
			PORT: '3000',
		},
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: true,
	})
	const closed = once(web, 'close')
	let logs = ''
	web.stdout.on('data', (value) => {
		logs = (logs + value).slice(-5000)
	})
	web.stderr.on('data', (value) => {
		logs = (logs + value).slice(-5000)
	})
	let browser
	try {
		let ready = false
		for (let i = 0; i < 180; i++) {
			try {
				ready = (await fetch('http://localhost:3000/cart', { signal: AbortSignal.timeout(1000) })).ok
			} catch {
				/* bounded local startup */
			}
			if (ready) break
			if (web.exitCode !== null) throw new Error(logs)
			await new Promise((resolve) => setTimeout(resolve, 500))
		}
		assert.ok(ready, logs)
		browser = await chromium.launch({ channel: 'msedge', headless: true })
		const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
		const separator = cookie.indexOf('=')
		await context.addCookies([{ name: cookie.slice(0, separator), value: decodeURIComponent(cookie.slice(separator + 1)), domain: 'localhost', path: '/' }])
		let offline = false
		let failRead = false
		let loseHold = false
		const holdKeys = []
		await context.route('**/v1/**', async (route) => {
			if (offline) {
				await route.abort()
				return
			}
			const request = route.request()
			const path = new URL(request.url()).pathname + new URL(request.url()).search
			if (failRead && path.includes('/availability')) {
				failRead = false
				await route.abort()
				return
			}
			if (path.endsWith('/customer/goods/holds') && request.method() === 'POST') holdKeys.push(request.headers()['idempotency-key'])
			const result = await route.fetch({ url: origin + path.slice(3) })
			if (loseHold && path.endsWith('/customer/goods/holds') && result.ok()) {
				loseHold = false
				await route.abort()
				return
			}
			await route.fulfill({ response: result })
		})
		const page = await context.newPage()
		page.setDefaultTimeout(15000)
		await page.goto(`http://localhost:3000/listings/${product.id}`)
		await page.getByRole('button', { name: 'Add to Cart' }).click()
		await page.getByRole('status').filter({ hasText: 'Select a variant' }).waitFor()
		await page.getByLabel('Variant', { exact: true }).selectOption('small')
		await page.getByLabel('Location', { exact: true }).selectOption(location.id)
		await page.getByLabel('Fulfillment', { exact: true }).selectOption('pickup')
		failRead = true
		await page.getByRole('button', { name: 'Add to Cart' }).click()
		await page
			.getByRole('status')
			.filter({ hasText: /Failed to fetch|fetch failed|Network/ })
			.waitFor()
		assert.equal(await page.getByLabel('Variant', { exact: true }).inputValue(), 'small')
		await page.getByLabel('Quantity', { exact: true }).fill('4')
		await page.getByRole('button', { name: 'Add to Cart' }).click()
		await page.getByText('Only 3 available', { exact: false }).waitFor()
		await page.getByLabel('Quantity', { exact: true }).fill('2')
		await page.getByRole('button', { name: 'Add to Cart' }).click()
		await page.getByRole('link', { name: 'View Cart', exact: true }).waitFor()
		const dir = process.env.GOODS_BROWSER_EVIDENCE_DIR ?? 'docs/quality/evidence/phase-02-c07-2026-10-12'
		await mkdir(dir, { recursive: true })
		await page.screenshot({ path: `${dir}/product-desktop.png`, fullPage: true })
		await page.getByRole('link', { name: 'View Cart', exact: true }).click()
		await page.getByRole('button', { name: 'Continue to checkout' }).waitFor()
		assert.equal((await repository.readPublicProductAvailability(product.id, { locationId: location.id, sku: 'small' })).available, 3)
		const draftBeforeOffline = await page.evaluate(() => localStorage.getItem('junction:goods-cart:v1'))
		assert.ok(draftBeforeOffline)
		offline = true
		await context.setOffline(true)
		await page.getByRole('button', { name: 'Continue to checkout' }).click()
		await page
			.getByRole('status')
			.filter({ hasText: /Failed to fetch|fetch failed|Network/ })
			.waitFor()
		assert.equal(await page.evaluate(() => navigator.onLine), false)
		assert.equal(await page.evaluate(() => localStorage.getItem('junction:goods-cart:v1')), draftBeforeOffline)
		assert.equal((await repository.readPublicProductAvailability(product.id, { locationId: location.id, sku: 'small' })).available, 3)
		offline = false
		await context.setOffline(false)
		await page.reload()
		await page.getByRole('button', { name: 'Continue to checkout' }).waitFor()
		assert.equal(await page.evaluate(() => localStorage.getItem('junction:goods-cart:v1')), draftBeforeOffline)
		// Authoritative quote must expose the changed current price.
		await repository.db.listingVariant.updateMany({ where: { listingId: product.id, sku: 'small' }, data: { priceCents: 1500 } })
		await page.getByRole('button', { name: 'Continue to checkout' }).click()
		await page.getByText('Price changed from', { exact: false }).waitFor()
		loseHold = true
		await page.getByRole('button', { name: 'Accept quote and hold stock' }).click()
		await page.getByRole('button', { name: 'Retry original hold request' }).waitFor()
		await page
			.getByRole('status')
			.filter({ hasText: /Failed to fetch|fetch failed|Network/ })
			.waitFor()
		assert.equal((await repository.readPublicProductAvailability(product.id, { locationId: location.id, sku: 'small' })).available, 1)
		await page.getByRole('button', { name: 'Retry original hold request' }).click()
		await page.getByRole('heading', { name: 'Stock held', exact: true }).waitFor()
		assert.equal(holdKeys.length, 2)
		assert.equal(holdKeys[0], holdKeys[1])
		await page.reload()
		await page.getByRole('button', { name: 'Refresh hold status' }).click()
		await page.getByRole('heading', { name: 'Stock held', exact: true }).waitFor()
		await page.getByRole('button', { name: 'Release hold', exact: true }).click()
		await page.getByText('Hold ended.', { exact: false }).waitFor()
		assert.equal((await repository.readPublicProductAvailability(product.id, { locationId: location.id, sku: 'small' })).available, 3)
		await page.getByRole('combobox', { name: /^Fulfillment/ }).selectOption('delivery')
		await page.getByRole('combobox', { name: /^Delivery zone/ }).selectOption(zoneId)
		for (const [label, value] of Object.entries({
			'Contact name': 'Fixture Customer',
			Phone: '0911000000',
			Locality: 'Test city',
			Address: 'Local test address',
			Longitude: '43',
			Latitude: '9.5',
		}))
			await page.getByLabel(label, { exact: true }).fill(value)
		await page.getByRole('button', { name: 'Continue to checkout' }).click()
		await page.getByText('Stock, price or fulfillment changed.', { exact: false }).waitFor()
		await page.getByLabel('Longitude', { exact: true }).fill('41.5')
		await page.getByRole('button', { name: 'Continue to checkout' }).click()
		await page.getByText('Delivery: Local delivery', { exact: false }).waitFor()
		await page.setViewportSize({ width: 320, height: 900 })
		await page.screenshot({ path: `${dir}/cart-mobile.png`, fullPage: true })
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile Cart overflows')
		await page.goto(`http://localhost:3000/listings/${product.id}`)
		await page.screenshot({ path: `${dir}/product-mobile.png`, fullPage: true })
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile Product overflows')
		await page.goto('http://localhost:3000/cart')
		// Delivery contact is deliberately not persisted; choose pickup for this
		// controlled payment bridge and obtain a new quote/hold through the UI.
		await page.getByRole('combobox', { name: /^Fulfillment/ }).selectOption('pickup')
		await page.getByRole('button', { name: 'Continue to checkout' }).click()
		await page.getByRole('button', { name: 'Accept quote and hold stock' }).click()
		await page.getByRole('heading', { name: 'Stock held', exact: true }).waitFor()
		const pending = await page.evaluate(() => JSON.parse(window.sessionStorage.getItem('junction:goods-hold-pending:v1')))
		const simulated = async (path, body) => {
			const response = await fetch(`${origin}${path}`, {
				method: 'POST',
				headers: { cookie, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
				body: JSON.stringify(body),
			})
			assert.equal(response.status, 201, await response.clone().text())
			return response.json()
		}
		const payment = await simulated('/customer/goods/payments', { holdId: pending.holdId })
		await page.getByRole('button', { name: 'Refresh hold status' }).click()
		await page.getByRole('heading', { name: 'Awaiting payment', exact: true }).waitFor()
		assert.ok(await page.getByRole('button', { name: 'Continue to checkout' }).isDisabled())
		await page.screenshot({ path: `${dir}/cart-awaiting-payment-mobile.png`, fullPage: true })
		await simulated(`/customer/goods/payments/${payment.paymentId}/local-result`, { outcome: 'succeeded' })
		await page.getByRole('button', { name: 'Refresh hold status' }).click()
		await page.getByText('Local payment confirmed. Goods Orders created.', { exact: true }).waitFor()
		assert.equal((await repository.readPublicProductAvailability(product.id, { locationId: location.id, sku: 'small' })).available, 1)
		await page.waitForFunction(() => {
			const button = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Continue to checkout')
			return button && !button.disabled && document.querySelector('[role=\"status\"]')?.textContent?.includes('Local payment confirmed.')
		})
		await page.evaluate(async () => {
			await new Promise(requestAnimationFrame)
			await new Promise(requestAnimationFrame)
		})
		await writeFile(
			`${dir}/payment-bridge.json`,
			JSON.stringify(
				{
					paymentId: payment.paymentId,
					status: await page.getByRole('status').textContent(),
					cartEditingEnabled: await page.getByRole('button', { name: 'Continue to checkout' }).isEnabled(),
					soldAvailability: 1,
					liveFunds: false,
				},
				null,
				2,
			),
		)
		await page.screenshot({ path: `${dir}/cart-paid-mobile.png`, fullPage: true })
		console.log(
			'Served local Edge controlled payment bridge passed: awaiting payment preserves hold and locks Cart edits; authoritative committed hold reports local paid Orders and sold stock.',
		)

		console.log(
			'Served local Edge goods Cart passed: explicit variant/Location, failed read preservation, stock conflict, Cart persistence/no reservation, offline draft preservation and reconnect, changed-price review, lost committed hold/replay, reload reconciliation, release, delivery zone/address rejection and recovery, desktop/mobile layout.',
		)
	} finally {
		await browser?.close()
		if (web.exitCode === null) {
			process.kill(-web.pid, 'SIGTERM')
			const timer = setTimeout(() => {
				try {
					process.kill(-web.pid, 'SIGKILL')
				} catch {
					/* already stopped */
				}
			}, 5000)
			try {
				await closed
			} finally {
				clearTimeout(timer)
			}
		}
	}
}
