import { fireEvent, render, screen } from '@testing-library/react'
import { type PublicListingDetail } from 'contracts'

import { AppointmentIntents } from '../src/components/appointment-intents'
import { ServiceSelection } from '../src/components/service-selection'
import { readAppointmentIntents, type ServiceDefinition, type ServiceSlots } from '../src/lib/appointment-intents'

const id = '11111111-1111-4111-8111-111111111111'
const locationId = '22222222-2222-4222-8222-222222222222'
const optionId = '33333333-3333-4333-8333-333333333333'
const addonId = '44444444-4444-4444-8444-444444444444'
const staffId = '55555555-5555-4555-8555-555555555555'
const listing: PublicListingDetail = {
	id,
	kind: 'service',
	category: 'appointment',
	title: 'Service fixture',
	description: 'Fixed appointment fixture for browser recovery tests.',
	state: 'published',
	version: 1,
	images: [],
	priceCents: 9000,
	durationMinutes: 15,
	vendor: { id: '66666666-6666-4666-8666-666666666666', slug: 'vendor', displayName: 'Fixture Vendor' },
	locations: [{ id: locationId, label: 'Office', city: 'Test city' }],
}
const definition: ServiceDefinition = {
	listingId: id,
	version: 1,
	capacity: 'staff_only',
	scheduling: { version: 1, timezone: 'UTC', leadTimeMinutes: 60, horizonDays: 30, slotIntervalMinutes: 15 },
	options: [
		{
			id: optionId,
			label: 'Standard',
			priceCents: 1000,
			durationMinutes: 30,
			bufferBeforeMinutes: 5,
			bufferAfterMinutes: 10,
			online: true,
			addons: [{ id: addonId, label: 'Extra work', priceCents: 550, durationMinutes: 15 }],
			locations: [{ id: locationId, label: 'Office', city: 'Test city', timezone: 'Africa/Addis_Ababa' }],
			eligibleModes: [
				{ mode: 'in_person', locationId, anyStaffEligible: true, namedStaff: [{ id: staffId, displayName: 'Named Staff' }] },
				{ mode: 'online', locationId: null, anyStaffEligible: true, namedStaff: [] },
			],
		},
	],
}
const start = '2026-10-13T06:15:00.000Z'
const originalFetch = globalThis.fetch
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response
let currentDefinition: ServiceDefinition
let lost: boolean
let fail: boolean
function installFetch() {
	globalThis.fetch = jest.fn(async (path, init) => {
		if (String(path).endsWith('/service-definition')) return response(currentDefinition)
		if (fail) throw new Error('Controlled failed availability refresh')
		const body = JSON.parse(String(init?.body))
		const extra = body.addonIds.includes(addonId)
		const result: ServiceSlots = {
			listingId: id,
			optionId,
			mode: body.mode,
			locationId: body.locationId,
			staffId: body.staffId,
			timezone: body.mode === 'online' ? 'UTC' : 'Africa/Addis_Ababa',
			configurationVersion: currentDefinition.version,
			rulesVersion: currentDefinition.scheduling?.version ?? 1,
			evaluatedAt: '2026-10-12T00:00:00.000Z',
			priceCents: extra ? 1550 : 1000,
			durationMinutes: extra ? 45 : 30,
			bufferBeforeMinutes: 5,
			bufferAfterMinutes: 10,
			reserved: false,
			slots: lost ? [] : [{ start, end: extra ? '2026-10-13T07:00:00.000Z' : '2026-10-13T06:45:00.000Z' }],
		}
		return response(result)
	})
}
beforeEach(() => {
	globalThis.window.localStorage.clear()
	currentDefinition = JSON.parse(JSON.stringify(definition))
	lost = false
	fail = false
	installFetch()
})
afterEach(() => {
	globalThis.fetch = originalFetch
	Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: true })
})
async function select(extra = false) {
	await screen.findByRole('option', { name: /Standard/ })
	fireEvent.change(screen.getByLabelText('Service Option'), { target: { value: optionId } })
	if (extra) fireEvent.click(screen.getByRole('checkbox', { name: /Extra work/ }))
	fireEvent.change(screen.getByLabelText('Appointment mode'), { target: { value: 'in_person' } })
	fireEvent.change(screen.getByLabelText('Service Location'), { target: { value: locationId } })
	fireEvent.change(screen.getByLabelText('Appointment date'), { target: { value: '2026-10-13' } })
}
async function refreshAndChoose() {
	fireEvent.click(screen.getByRole('button', { name: 'Refresh times' }))
	await screen.findByText('Times refreshed. Select an available time.')
	fireEvent.change(screen.getByLabelText('Appointment time'), { target: { value: start } })
}
it('requires selections before slot reads and shows exact Option/add-on terms rather than Listing base price', async () => {
	render(<ServiceSelection listing={listing} />)
	await screen.findByRole('option', { name: /Standard/ })
	fireEvent.click(screen.getByRole('button', { name: 'Refresh times' }))
	await screen.findByText(/Select an Option, mode/)
	expect(jest.mocked(globalThis.fetch).mock.calls.every(([path]) => String(path).endsWith('/service-definition'))).toBe(true)
	await select(true)
	expect(screen.getByLabelText('Appointment total').textContent).toContain('15.50')
	expect(screen.getByLabelText('Appointment total').textContent).toContain('45 minutes')
	expect(screen.getByText('Timezone: Africa/Addis_Ababa')).toBeTruthy()
	expect((screen.getByRole('button', { name: 'Add appointment to Cart' }) as globalThis.HTMLButtonElement).disabled).toBe(true)
})
it('rechecks a chosen time before persisting an unreserved any-Staff intent, without any hold/payment request', async () => {
	render(<ServiceSelection listing={listing} />)
	await select(true)
	await refreshAndChoose()
	fireEvent.click(screen.getByRole('button', { name: 'Add appointment to Cart' }))
	await screen.findByRole('link', { name: 'View Cart' })
	expect(readAppointmentIntents()[0]).toMatchObject({
		command: { staffId: null, addonIds: [addonId], expectedConfigurationVersion: 1, expectedRulesVersion: 1 },
		priceCents: 1550,
		durationMinutes: 45,
		staffLabel: 'Any qualified Staff',
		timezone: 'Africa/Addis_Ababa',
	})
	expect(jest.mocked(globalThis.fetch).mock.calls.filter(([path]) => String(path).endsWith('/slots'))).toHaveLength(2)
	expect(jest.mocked(globalThis.fetch).mock.calls.every(([path]) => !/holds|payments/.test(String(path)))).toBe(true)
})
it('slot loss clears only the lost time, preserves safe selectors and never saves an intent', async () => {
	render(<ServiceSelection listing={listing} />)
	await select(true)
	await refreshAndChoose()
	lost = true
	fireEvent.click(screen.getByRole('button', { name: 'Add appointment to Cart' }))
	await screen.findByText(/That time is no longer available/)
	expect((screen.getByLabelText('Service Option') as globalThis.HTMLSelectElement).value).toBe(optionId)
	expect((screen.getByLabelText('Service Location') as globalThis.HTMLSelectElement).value).toBe(locationId)
	expect((screen.getByLabelText('Appointment date') as globalThis.HTMLInputElement).value).toBe('2026-10-13')
	expect((screen.getByRole('checkbox') as globalThis.HTMLInputElement).checked).toBe(true)
	expect((screen.getByLabelText('Appointment time') as globalThis.HTMLSelectElement).value).toBe('')
	expect(readAppointmentIntents()).toEqual([])
})
it('failed refresh preserves selections and prior time but invalidates availability until a successful retry', async () => {
	render(<ServiceSelection listing={listing} />)
	await select()
	await refreshAndChoose()
	fail = true
	fireEvent.click(screen.getByRole('button', { name: 'Refresh times' }))
	await screen.findByText(/Current Service information could not be read/)
	expect(screen.getByText(/Previously selected:/)).toBeTruthy()
	expect((screen.getByLabelText('Service Option') as globalThis.HTMLSelectElement).value).toBe(optionId)
	expect((screen.getByRole('button', { name: 'Add appointment to Cart' }) as globalThis.HTMLButtonElement).disabled).toBe(true)
	fail = false
	await refreshAndChoose()
	expect((screen.getByRole('button', { name: 'Add appointment to Cart' }) as globalThis.HTMLButtonElement).disabled).toBe(false)
})
it('offline/online events invalidate old times and preserve selectors without requesting capacity', async () => {
	render(<ServiceSelection listing={listing} />)
	await select()
	await refreshAndChoose()
	Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: false })
	fireEvent(globalThis.window, new globalThis.Event('offline'))
	expect((screen.getByRole('button', { name: 'Add appointment to Cart' }) as globalThis.HTMLButtonElement).disabled).toBe(true)
	expect((screen.getByLabelText('Appointment date') as globalThis.HTMLInputElement).value).toBe('2026-10-13')
	Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: true })
	fireEvent(globalThis.window, new globalThis.Event('online'))
	expect((screen.getByRole('button', { name: 'Add appointment to Cart' }) as globalThis.HTMLButtonElement).disabled).toBe(true)
	await refreshAndChoose()
	expect(readAppointmentIntents()).toEqual([])
})
it('changed terms require review instead of silently persisting a different price', async () => {
	render(<ServiceSelection listing={listing} />)
	await select()
	await refreshAndChoose()
	currentDefinition = { ...currentDefinition, version: 2, options: [{ ...currentDefinition.options[0], priceCents: 2000 }] }
	fireEvent.click(screen.getByRole('button', { name: 'Add appointment to Cart' }))
	await screen.findByText('Service terms changed. Review your selections and refresh times.')
	expect(readAppointmentIntents()).toEqual([])
	expect((screen.getByLabelText('Appointment date') as globalThis.HTMLInputElement).value).toBe('2026-10-13')
})
it('withdrawn named Staff consent clears the unsafe named choice before another slot request', async () => {
	render(<ServiceSelection listing={listing} />)
	await select()
	fireEvent.change(screen.getByLabelText('Staff'), { target: { value: staffId } })
	await refreshAndChoose()
	currentDefinition.options[0].eligibleModes[0].namedStaff = []
	fireEvent.click(screen.getByRole('button', { name: 'Add appointment to Cart' }))
	await screen.findByText(/Staff or Location eligibility changed/)
	expect((screen.getByLabelText('Staff') as globalThis.HTMLSelectElement).value).toBe('')
	expect(readAppointmentIntents()).toEqual([])
})
it('a failed browser save leaves the intent absent and provides recovery', async () => {
	render(<ServiceSelection listing={listing} />)
	await select()
	await refreshAndChoose()
	const mock = jest.spyOn(globalThis.Storage.prototype, 'setItem').mockImplementation(() => {
		throw new Error('Saved appointment could not be written. Try again.')
	})
	fireEvent.click(screen.getByRole('button', { name: 'Add appointment to Cart' }))
	await screen.findByText('Saved appointment could not be written. Try again.')
	mock.mockRestore()
	expect(readAppointmentIntents()).toEqual([])
})
it('Cart renders unconfirmed terms and removes only appointment intents, preserving goods storage', async () => {
	const view = render(<ServiceSelection listing={listing} />)
	await select()
	await refreshAndChoose()
	fireEvent.click(screen.getByRole('button', { name: 'Add appointment to Cart' }))
	await screen.findByRole('link', { name: 'View Cart' })
	view.unmount()
	globalThis.window.localStorage.setItem('junction:goods-cart:v1', '[]')
	render(<AppointmentIntents />)
	await screen.findByRole('link', { name: 'Edit appointment' })
	expect(screen.getByText(/These are unreserved intents/)).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'Remove appointment' }))
	await screen.findByText('No appointment intents in Cart.')
	expect(globalThis.window.localStorage.getItem('junction:goods-cart:v1')).toBe('[]')
})
it('corrupt intent storage has a clear recovery action', async () => {
	globalThis.window.localStorage.setItem('junction:appointment-intents:v1', '{invalid')
	render(<AppointmentIntents />)
	fireEvent.click(await screen.findByRole('button', { name: 'Clear appointments' }))
	await screen.findByText('Saved appointment intents cleared.')
	expect(readAppointmentIntents()).toEqual([])
})
it('editing replaces the same intent after fresh availability and never duplicates it', async () => {
	const view = render(<ServiceSelection listing={listing} />)
	await select()
	await refreshAndChoose()
	fireEvent.click(screen.getByRole('button', { name: 'Add appointment to Cart' }))
	await screen.findByRole('link', { name: 'View Cart' })
	const saved = readAppointmentIntents()[0]
	view.unmount()
	render(<ServiceSelection listing={listing} editId={saved.id} />)
	await screen.findByText(/Review your selections and refresh times to update/)
	fireEvent.click(screen.getByRole('checkbox', { name: /Extra work/ }))
	await refreshAndChoose()
	fireEvent.click(screen.getByRole('button', { name: 'Update appointment in Cart' }))
	await screen.findByText('Appointment intent updated. Time is not reserved.')
	expect(readAppointmentIntents()).toHaveLength(1)
	expect(readAppointmentIntents()[0]).toMatchObject({ id: saved.id, priceCents: 1550 })
})
