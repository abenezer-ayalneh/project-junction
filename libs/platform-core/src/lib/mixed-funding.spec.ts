import { type EconomicAllocation } from 'contracts'

import { originalFunding, proportionFunding } from './mixed-funding.js'
describe('Original mixed refund funding', () => {
	const allocation = {
		quantity: 3,
		unitSegments: [
			{ quantity: 1, customerUnitMinorUnits: 7, platformSubsidyUnitMinorUnits: 3, commissionUnitMinorUnits: 2, vendorEarningUnitMinorUnits: 8 },
			{ quantity: 2, customerUnitMinorUnits: 6, platformSubsidyUnitMinorUnits: 3, commissionUnitMinorUnits: 2, vendorEarningUnitMinorUnits: 7 },
		],
	} as EconomicAllocation
	test('disjoint partial quantities conserve all original funding including rounded units', () => {
		const a = originalFunding(allocation, 0, 1),
			b = originalFunding(allocation, 1, 2),
			whole = originalFunding(allocation, 0, 3)
		for (const key of ['customer', 'subsidy', 'commission', 'vendor'] as const) expect(a[key] + b[key]).toBe(whole[key])
		expect(() => originalFunding(allocation, 2, 2)).toThrow()
	})
	test('policy fractions conserve funds and never refund more than original amounts', () => {
		for (let customer = 0; customer < 20; customer++)
			for (let subsidy = 0; subsidy < 10; subsidy++)
				for (let commission = 0; commission <= customer + subsidy; commission++) {
					const original = { customer, subsidy, commission, vendor: customer + subsidy - commission }
					const refund = proportionFunding(original, 1, 2)
					expect(refund.customer + refund.subsidy).toBe(refund.commission + refund.vendor)
					for (const key of ['customer', 'subsidy', 'commission', 'vendor'] as const) expect(refund[key]).toBeLessThanOrEqual(original[key])
				}
	})
})
