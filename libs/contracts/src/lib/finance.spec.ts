import { LedgerCommandSchema, MoneySchema } from './finance.js'
const uuid = '00000000-0000-4000-8000-000000000001'
const posting = { account: 'processor_clearing', vendorId: null, locationId: null, componentId: null, money: { minorUnits: 1, currency: 'ETB' } }
const command = {
	workspaceId: uuid,
	sourceId: uuid,
	reason: 'Capture',
	economicEventId: 'capture:1',
	postings: [posting, { ...posting, money: { minorUnits: -1, currency: 'ETB' } }],
}
describe('Money and balanced ledger contracts', () => {
	test('rejects lossy, fractional and implicit currency values', () => {
		for (const value of [
			{ minorUnits: 0.1, currency: 'ETB' },
			{ minorUnits: Number.MAX_SAFE_INTEGER + 1, currency: 'ETB' },
			{ minorUnits: 1, currency: 'etb' },
			{ minorUnits: 1 },
		])
			expect(MoneySchema.safeParse(value).success).toBe(false)
	})
	test('requires balanced nonzero single currency postings', () => {
		expect(LedgerCommandSchema.safeParse(command).success).toBe(true)
		expect(LedgerCommandSchema.safeParse({ ...command, postings: [posting, posting] }).success).toBe(false)
		expect(LedgerCommandSchema.safeParse({ ...command, postings: [posting, { ...posting, money: { minorUnits: -1, currency: 'USD' } }] }).success).toBe(
			false,
		)
	})
	test('fee accounts cannot charge Vendor or Location payable scope', () => {
		expect(
			LedgerCommandSchema.safeParse({ ...command, postings: [posting, { ...posting, account: 'platform_processor_fee_expense', vendorId: uuid }] })
				.success,
		).toBe(false)
	})
})
