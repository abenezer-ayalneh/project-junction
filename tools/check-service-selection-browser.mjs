import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'

export async function checkServiceSelectionBrowser({ repository, sessionId, vendor, location, origin }) {
	if (!process.env.PLAYWRIGHT_MODULE_PATH) throw new Error('Set PLAYWRIGHT_MODULE_PATH to the bundled local playwright/index.mjs.')
	const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH)
	const calendar = (timezone) => ({
		timezone,
		weekly: Array.from({ length: 7 }, (_, weekday) => ({ weekday, hours: [{ startMinute: 540, endMinute: 1020 }], breaks: [] })),
		exceptions: [],
	})
	const session = await repository.db.session.findUniqueOrThrow({ where: { id: sessionId } })
	const named = await repository.db.staff.findFirstOrThrow({ where: { vendorId: vendor.id, userId: session.userId } })
	const hidden = await repository.createStaffProfile(sessionId, randomUUID(), { displayName: 'Private scheduling profile' })
	const locationRow = await repository.db.location.findUniqueOrThrow({ where: { id: location.id } })
	await repository.configureLocationSchedule(sessionId, randomUUID(), location.id, {
		expectedVersion: locationRow.scheduleVersion,
		calendar: calendar('Africa/Addis_Ababa'),
	})
	for (const staff of [named, hidden]) {
		const row = await repository.db.staff.findUniqueOrThrow({ where: { id: staff.id } })
		await repository.configureStaffSchedule(sessionId, randomUUID(), staff.id, {
			expectedVersion: row.scheduleVersion,
			schedule: {
				scopes: [
					{ mode: 'in_person', locationId: location.id, calendar: calendar('Africa/Addis_Ababa') },
					{ mode: 'online', locationId: null, calendar: calendar('UTC') },
				],
			},
		})
	}
	const listing = await repository.createListing(sessionId, randomUUID(), {
		kind: 'service',
		category: 'appointment',
		title: 'Service selection fixture',
		description: 'Disposable Service selection and safe recovery test.',
		priceCents: 9000,
		durationMinutes: 15,
	})
	const option = {
		id: randomUUID(),
		label: 'Standard appointment',
		priceCents: 1015,
		durationMinutes: 30,
		bufferBeforeMinutes: 5,
		bufferAfterMinutes: 10,
		locationIds: [location.id],
		online: true,
		addons: [{ id: randomUUID(), label: 'Extra work', priceCents: 255, durationMinutes: 15 }],
		qualifications: [named, hidden].map((staff) => ({ staffId: staff.id, locationIds: [location.id], online: true })),
	}
	await repository.configureService(sessionId, randomUUID(), listing.id, { expectedVersion: 0, configuration: { capacity: 'staff_only', options: [option] } })
	await repository.configureServiceSchedulingRules(sessionId, randomUUID(), listing.id, {
		expectedVersion: 0,
		rules: { timezone: 'UTC', leadTimeMinutes: 0, horizonDays: 30, slotIntervalMinutes: 15 },
	})
	await repository.db.listing.update({ where: { id: listing.id }, data: { state: 'published' } })
	const server = createServer()
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
	const port = server.address().port
	await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
	const webUrl = `http://localhost:${port}`
	const web = spawn('pnpm', ['nx', 'run', 'web:preview-services'], {
		env: {
			...process.env,
			NEXT_PUBLIC_JUNCTION_RUNTIME_MODE: 'local',
			NEXT_PUBLIC_JUNCTION_API_URL: 'http://localhost:3001/v1',
			JUNCTION_API_URL: origin,
			PORT: String(port),
		},
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: true,
	})
	const closed = once(web, 'close')
	let logs = ''
	let browser
	web.stdout.on('data', (chunk) => {
		logs = (logs + chunk).slice(-8000)
	})
	web.stderr.on('data', (chunk) => {
		logs = (logs + chunk).slice(-8000)
	})
	const evidence = process.env.SERVICE_BROWSER_EVIDENCE_DIR ?? 'docs/quality/evidence/phase-03-c04-2026-10-12'
	try {
		let ready = false
		for (let index = 0; index < 100; index++) {
			try {
				ready = (await fetch(`${webUrl}/cart`, { signal: AbortSignal.timeout(1000) })).ok
			} catch {
				/* bounded local startup */
			}
			if (ready) break
			if (web.exitCode !== null) throw new Error(logs)
			await new Promise((resolve) => setTimeout(resolve, 250))
		}
		assert.ok(ready, logs)
		browser = await chromium.launch({ channel: 'msedge', headless: true })
		const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
		let failRead = false
		let networkDown = false
		const requests = []
		await context.route('**/v1/**', async (route) => {
			const request = route.request()
			const path = new URL(request.url()).pathname
			requests.push({ path, method: request.method() })
			if (networkDown || (failRead && path.endsWith('/slots'))) {
				failRead = false
				await route.abort()
				return
			}
			await route.fulfill({ response: await route.fetch({ url: origin + path.slice(3) }) })
		})
		const page = await context.newPage()
		page.setDefaultTimeout(15000)
		const errors = []
		page.on('pageerror', (error) => errors.push(error.message))
		await page.goto(`${webUrl}/listings/${listing.id}`)
		await page.getByLabel('Service Option').selectOption(option.id)
		await page.getByRole('checkbox', { name: /Extra work/ }).check()
		assert.ok((await page.getByLabel('Appointment total').innerText()).includes('12.70'))
		await page.getByLabel('Appointment mode').selectOption('in_person')
		await page.getByLabel('Service Location').selectOption(location.id)
		await page.getByLabel('Staff', { exact: true }).selectOption(named.id)
		const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
		await page.getByLabel('Appointment date').fill(day)
		await page.getByText('Timezone: Africa/Addis_Ababa', { exact: true }).waitFor()
		failRead = true
		await page.getByRole('button', { name: 'Refresh times', exact: true }).click()
		await page.getByText(/Current Service information could not be read/).waitFor()
		assert.equal(await page.getByLabel('Service Option').inputValue(), option.id)
		assert.equal(await page.getByLabel('Appointment date').inputValue(), day)
		assert.ok(await page.getByRole('checkbox', { name: /Extra work/ }).isChecked())
		await page.getByRole('button', { name: 'Refresh times', exact: true }).click()
		await page.getByText('Times refreshed. Select an available time.', { exact: true }).waitFor()
		const selected = await page
			.getByLabel('Appointment time')
			.locator('option')
			.evaluateAll((options) => options.map((option) => option.value).find(Boolean))
		await page.getByLabel('Appointment time').selectOption(selected)
		await repository.createBookingHold(sessionId, randomUUID(), {
			listingId: listing.id,
			optionId: option.id,
			addonIds: [option.addons[0].id],
			mode: 'in_person',
			locationId: location.id,
			staffId: named.id,
			start: selected,
			expectedConfigurationVersion: 1,
			expectedRulesVersion: 1,
		})
		await page.getByRole('button', { name: 'Add appointment to Cart' }).click()
		await page.getByText(/That time is no longer available/).waitFor()
		assert.equal(await page.getByLabel('Staff', { exact: true }).inputValue(), named.id)
		assert.equal(await page.getByLabel('Appointment date').inputValue(), day)
		assert.equal(await page.evaluate(() => window.localStorage.getItem('junction:appointment-intents:v1')), null)
		const alternative = await page
			.getByLabel('Appointment time')
			.locator('option')
			.evaluateAll((options) => options.map((option) => option.value).find(Boolean))
		assert.ok(alternative && alternative !== selected)
		await page.getByLabel('Appointment time').selectOption(alternative)
		networkDown = true
		await page.getByRole('button', { name: 'Refresh times', exact: true }).click()
		await page.getByText(/Current Service information could not be read/).waitFor()
		assert.ok(await page.getByRole('button', { name: 'Add appointment to Cart' }).isDisabled())
		networkDown = false
		await page.getByRole('button', { name: 'Refresh times', exact: true }).click()
		await page.getByText('Times refreshed. Select an available time.', { exact: true }).waitFor()
		await page.getByLabel('Appointment time').selectOption(alternative)
		await context.setOffline(true)
		await page.getByText('You are offline. Reconnect and refresh times. Your selections are kept on this page.', { exact: true }).waitFor()
		assert.ok(await page.getByRole('button', { name: 'Add appointment to Cart' }).isDisabled())
		await page.getByRole('button', { name: 'Add appointment to Cart' }).click({ force: true })
		assert.equal(await page.evaluate(() => window.localStorage.getItem('junction:appointment-intents:v1')), null)
		assert.equal(await page.getByLabel('Appointment date').inputValue(), day)
		await context.setOffline(false)
		assert.ok(await page.getByRole('button', { name: 'Add appointment to Cart' }).isDisabled())
		await page.getByRole('button', { name: 'Refresh times', exact: true }).click()
		await page.getByText('Times refreshed. Select an available time.', { exact: true }).waitFor()
		await page.getByLabel('Appointment time').selectOption(alternative)
		await mkdir(evidence, { recursive: true })
		await page.getByRole('button', { name: 'Add appointment to Cart' }).scrollIntoViewIfNeeded()
		await page.evaluate(() => window.scrollTo(0, 0))
		if (process.env.SERVICE_BROWSER_NO_CAPTURE !== '1')
			await page.screenshot({ path: `${evidence}/service-desktop.png`, fullPage: true, animations: 'disabled' })
		await page.setViewportSize({ width: 390, height: 844 })
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
		await page.getByRole('button', { name: 'Add appointment to Cart' }).scrollIntoViewIfNeeded()
		await page.evaluate(() => window.scrollTo(0, 0))
		if (process.env.SERVICE_BROWSER_NO_CAPTURE !== '1')
			await page.screenshot({ path: `${evidence}/service-mobile.png`, fullPage: true, animations: 'disabled' })
		await page.getByRole('button', { name: 'Add appointment to Cart' }).click()
		await page.getByRole('link', { name: 'View Cart', exact: true }).waitFor()
		const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem('junction:appointment-intents:v1')))
		assert.equal(saved.length, 1)
		assert.equal(saved[0].priceCents, 1270)
		assert.equal(saved[0].durationMinutes, 45)
		await page.getByRole('link', { name: 'View Cart', exact: true }).click()
		await page.getByRole('link', { name: 'Edit appointment', exact: true }).waitFor()
		await page.getByText(/These are unreserved intents/).waitFor()
		await page.evaluate(() => window.scrollTo(0, 0))
		if (process.env.SERVICE_BROWSER_NO_CAPTURE !== '1')
			await page.screenshot({ path: `${evidence}/cart-mobile.png`, fullPage: true, animations: 'disabled' })
		await page.getByRole('link', { name: 'Edit appointment', exact: true }).click()
		await page.getByText(/Review your selections and refresh times to update/).waitFor()
		await page.getByLabel('Appointment mode').selectOption('online')
		await page.getByText('Timezone: UTC', { exact: true }).waitFor()
		await page.getByRole('button', { name: 'Refresh times', exact: true }).click()
		await page.getByText('Times refreshed. Select an available time.', { exact: true }).waitFor()
		const onlineTime = await page
			.getByLabel('Appointment time')
			.locator('option')
			.evaluateAll((options) => options.map((option) => option.value).find(Boolean))
		await page.getByLabel('Appointment time').selectOption(onlineTime)
		await page.getByRole('button', { name: 'Update appointment in Cart', exact: true }).click()
		await page.getByText('Appointment intent updated. Time is not reserved.', { exact: true }).waitFor()
		const updated = await page.evaluate(() => JSON.parse(window.localStorage.getItem('junction:appointment-intents:v1')))
		assert.equal(updated.length, 1)
		assert.equal(updated[0].id, saved[0].id)
		assert.equal(updated[0].command.mode, 'online')
		assert.equal(updated[0].command.staffId, null)
		assert.ok(!JSON.stringify(updated).includes(hidden.id))
		await page.getByRole('link', { name: 'View Cart', exact: true }).click()
		await page.getByRole('button', { name: 'Remove appointment', exact: true }).click()
		await page.getByText('No appointment intents in Cart.', { exact: true }).waitFor()
		assert.ok(requests.every((request) => !/customer\/bookings|holds|payments/.test(request.path)))
		assert.equal(errors.length, 0, JSON.stringify(errors))
		await writeFile(
			`${evidence}/browser.json`,
			JSON.stringify(
				{
					date: '2026-10-12',
					environment: 'loopback API/PostgreSQL; local served Next build; fresh headless Microsoft Edge context',
					viewport: { desktop: [1440, 1000], mobile: [390, 844] },
					passed: [
						'exact Option/add-on totals',
						'timezone before date selection',
						'named/any qualified Staff',
						'failed read safe recovery',
						'actual competing hold slot loss',
						'network recovery',
						'offline add prevented and reconnect requires fresh times',
						'responsive no-overflow',
						'unreserved intent saved',
						'Cart edit online timezone and same-intent replacement',
						'Cart remove',
						'no browser capacity/payment mutation',
						'no private Staff identity',
						'no page errors',
					],
					screenshots: process.env.SERVICE_BROWSER_NO_CAPTURE === '1' ? [] : ['service-desktop.png', 'service-mobile.png', 'cart-mobile.png'],
					result: 'passed',
				},
				null,
				2,
			) + '\n',
		)
		console.log(
			'Served local Service selection Edge browser checks passed: Option/add-ons/mode/Location/named-any Staff, timezone, failed read/network/real slot loss recovery, intent Cart add/edit/remove, responsive layout and no browser reservation/confirmation.',
		)
	} finally {
		if (browser) await browser.close()
		try {
			process.kill(-web.pid, 'SIGTERM')
		} catch {
			/* process already stopped */
		}
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
