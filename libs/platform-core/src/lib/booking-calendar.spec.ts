import { randomUUID } from 'node:crypto'

import { bookingCalendar } from './booking-calendar.js'

describe('private read-only Booking iCal', () => {
	it('escapes injection and folds UTF-8 lines without exposing private fields', () => {
		const id = randomUUID()
		const snapshot = {
			listingId: randomUUID(),
			vendorId: randomUUID(),
			serviceTitle: 'ሰላም'.repeat(40) + '\r\nATTENDEE:evil',
			optionId: randomUUID(),
			optionLabel: 'A;B,C',
			addons: [],
			mode: 'online',
			locationId: null,
			locationLabel: null,
			locationCity: null,
			selectedStaffId: null,
			timezone: 'Africa/Addis_Ababa',
			start: '2026-10-20T09:00:00Z',
			end: '2026-10-20T09:30:00Z',
			currency: 'ETB',
			priceCents: 1000,
			durationMinutes: 30,
			bufferBeforeMinutes: 0,
			bufferAfterMinutes: 0,
			configurationVersion: 1,
			rulesVersion: 1,
			policy: { template: 'standard', version: 1, fullRefundHours: 48, partialRefundHours: 12, amendmentLimit: 1, contestHours: 48 },
			attendee: { name: 'Private Guest' },
			optionPriceCents: 1000,
			promotion: null,
			commission: null,
		}
		const exported = bookingCalendar({ bookingId: id, state: 'cancelled', version: 2, confirmedAt: '2026-10-12T00:00:00Z', snapshot })
		expect(exported).toContain('DTSTART:20261020T090000Z\r\n')
		expect(exported).toContain('STATUS:CANCELLED\r\n')
		expect(exported).not.toContain('\r\nATTENDEE:')
		expect(exported).not.toContain('Private Guest')
		expect(exported.replaceAll('\r\n ', '')).toContain('A\\;B\\,C')
		for (const line of exported.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75)
		expect(exported).not.toContain('\uFFFD')
	})
})
