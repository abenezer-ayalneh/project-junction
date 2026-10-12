import { randomUUID } from 'node:crypto'

import { MixedCartSelectionSchema, MixedQuoteCommandSchema } from './mixed-checkout.js'
const id = randomUUID()
const booking = {
	intentId: id,
	quantity: 1,
	expectedPriceCents: 1000,
	selection: {
		listingId: id,
		optionId: id,
		addonIds: [],
		mode: 'online',
		locationId: null,
		staffId: null,
		start: '2026-10-12T09:00:00Z',
		expectedConfigurationVersion: 1,
		expectedRulesVersion: 1,
	},
}
describe('Mixed Cart selection boundary', () => {
	test('keeps independent quantity-one intents and rejects a sixth, duplicate IDs and higher quantity', () => {
		expect(
			MixedCartSelectionSchema.safeParse({ goodsGroups: [], bookings: Array.from({ length: 5 }, () => ({ ...booking, intentId: randomUUID() })) })
				.success,
		).toBe(true)
		for (const bookings of [Array.from({ length: 6 }, () => ({ ...booking, intentId: randomUUID() })), [booking, booking], [{ ...booking, quantity: 2 }]])
			expect(MixedCartSelectionSchema.safeParse({ goodsGroups: [], bookings }).success).toBe(false)
	})
	test('requires one Location per Vendor and unique Product/SKU lines', () => {
		const group = { vendorId: id, locationId: id, fulfillment: { method: 'pickup' }, lines: [{ listingId: id, quantity: 1, expectedUnitPriceCents: 1000 }] }
		expect(MixedCartSelectionSchema.safeParse({ goodsGroups: [group], bookings: [] }).success).toBe(true)
		expect(MixedCartSelectionSchema.safeParse({ goodsGroups: [group, group], bookings: [] }).success).toBe(false)
		expect(MixedCartSelectionSchema.safeParse({ goodsGroups: [{ ...group, lines: [...group.lines, ...group.lines] }], bookings: [] }).success).toBe(false)
	})
	test('supports an editable empty Cart but quotes require a persisted Cart identity and revision', () => {
		expect(MixedCartSelectionSchema.safeParse({ goodsGroups: [], bookings: [] }).success).toBe(true)
		expect(MixedQuoteCommandSchema.safeParse({ cartId: id, expectedVersion: 1 }).success).toBe(true)
		expect(MixedQuoteCommandSchema.safeParse({ cartId: id, expectedVersion: 1, totalCents: 1 }).success).toBe(false)
	})
})
