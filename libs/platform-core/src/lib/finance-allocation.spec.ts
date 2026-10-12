import { allocateBasisPoints, allocateMinorUnits, economicUnitSegments, promotionAmount, roundBasisPoints } from './finance-allocation.js'
const sum = (values: Iterable<bigint>) => [...values].reduce((n, v) => n + v, 0n)
const ordered = (map: Map<string, bigint>) => [...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
describe('central minor-unit financial allocation', () => {
	test('largest remainders and stable keys allocate the exact fixed discount independent of input order', () => {
		const weights = [
			{ key: 'b', value: 1n },
			{ key: 'a', value: 1n },
			{ key: 'c', value: 1n },
		]
		expect(ordered(allocateMinorUnits(2n, weights))).toEqual([
			['a', 1n],
			['b', 1n],
			['c', 0n],
		])
		expect(ordered(allocateMinorUnits(2n, [...weights].reverse()))).toEqual(ordered(allocateMinorUnits(2n, weights)))
		expect(
			sum(
				allocateMinorUnits(5n, [
					{ key: 'zero', value: 0n },
					{ key: 'sale', value: 10n },
				]).values(),
			),
		).toBe(5n)
	})
	test('commission rounds half-up at the Vendor total and preserves exact rate quotas', () => {
		expect(
			ordered(
				allocateBasisPoints(5000, [
					{ key: 'a', value: 1n },
					{ key: 'b', value: 1n },
					{ key: 'c', value: 1n },
				]),
			),
		).toEqual([
			['a', 1n],
			['b', 1n],
			['c', 0n],
		])
		expect(roundBasisPoints(1n, 5000)).toBe(1n)
		expect(roundBasisPoints(1n, 4999)).toBe(0n)
		expect(promotionAmount({ kind: 'percentage', basisPoints: 5000, maximumMinorUnits: 10 }, 101n)).toBe(10n)
		expect(promotionAmount({ kind: 'fixed', minorUnits: 1000 }, 3n)).toBe(3n)
	})
	test('compact sequential unit funding prevents over-discounting the same unit across two funding sources', () => {
		const segments = economicUnitSegments(2, 1, 1n, 1n, 1n)
		expect(segments).toEqual([
			{
				quantity: 1,
				listUnitMinorUnits: 1,
				vendorDiscountUnitMinorUnits: 1,
				platformSubsidyUnitMinorUnits: 0,
				customerUnitMinorUnits: 0,
				commissionUnitMinorUnits: 0,
				vendorEarningUnitMinorUnits: 0,
			},
			{
				quantity: 1,
				listUnitMinorUnits: 1,
				vendorDiscountUnitMinorUnits: 0,
				platformSubsidyUnitMinorUnits: 1,
				customerUnitMinorUnits: 0,
				commissionUnitMinorUnits: 1,
				vendorEarningUnitMinorUnits: 0,
			},
		])
		expect(economicUnitSegments(2147483647, 1, 1n, 2n, 3n).length).toBeLessThanOrEqual(6)
	})
	test('seeded monetary properties conserve amounts, cap each component and reconcile original unit funding', () => {
		let seed = 1903
		const random = () => {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
			return seed
		}
		for (let iteration = 0; iteration < 500; iteration++) {
			const weights = Array.from({ length: 1 + (random() % 15) }, (_, i) => ({ key: String(i).padStart(2, '0'), value: BigInt(random() % 10000000) }))
			const basis = sum(weights.map((w) => w.value)),
				amount = basis ? BigInt(random()) % (basis + 1n) : 0n
			const fixed = allocateMinorUnits(amount, weights),
				rate = random() % 10001,
				fees = allocateBasisPoints(rate, weights)
			expect(sum(fixed.values())).toBe(amount)
			expect(sum(fees.values())).toBe(roundBasisPoints(basis, rate))
			expect(ordered(fixed)).toEqual(ordered(allocateMinorUnits(amount, [...weights].reverse())))
			expect(ordered(fees)).toEqual(ordered(allocateBasisPoints(rate, [...weights].reverse())))
			for (const weight of weights) {
				expect((fixed.get(weight.key) ?? -1n) >= 0n && (fixed.get(weight.key) ?? -1n) <= weight.value).toBe(true)
				const floor = (weight.value * BigInt(rate)) / 10000n,
					fee = fees.get(weight.key) ?? -1n
				expect(fee === floor || fee === floor + 1n).toBe(true)
			}
			const quantity = 1 + (random() % 100000),
				unitPrice = 1 + (random() % 1000),
				list = BigInt(quantity) * BigInt(unitPrice)
			const vendor = BigInt(random()) % (list + 1n),
				net = list - vendor,
				platform = net ? BigInt(random()) % (net + 1n) : 0n,
				commission = net ? BigInt(random()) % (net + 1n) : 0n
			const segments = economicUnitSegments(quantity, unitPrice, vendor, platform, commission)
			expect(segments.length).toBeLessThanOrEqual(6)
			expect(segments.reduce((n, s) => n + s.quantity, 0)).toBe(quantity)
			const totals = (field: keyof Omit<(typeof segments)[number], 'quantity'>) => sum(segments.map((s) => BigInt(s.quantity) * BigInt(s[field])))
			expect(totals('vendorDiscountUnitMinorUnits')).toBe(vendor)
			expect(totals('platformSubsidyUnitMinorUnits')).toBe(platform)
			expect(totals('commissionUnitMinorUnits')).toBe(commission)
			expect(totals('customerUnitMinorUnits')).toBe(net - platform)
			expect(totals('vendorEarningUnitMinorUnits')).toBe(net - commission)
			expect(segments.every((s) => s.customerUnitMinorUnits >= 0 && s.vendorEarningUnitMinorUnits >= 0)).toBe(true)
		}
	})
	test('large intermediate products remain exact and invalid allocation cannot create money', () => {
		const basis = 9007199254740991n
		expect(
			sum(
				allocateBasisPoints(9999, [
					{ key: 'a', value: basis },
					{ key: 'b', value: basis },
				]).values(),
			),
		).toBe(roundBasisPoints(basis * 2n, 9999))
		expect(() => allocateMinorUnits(2n, [{ key: 'one', value: 1n }])).toThrow()
		expect(() => allocateMinorUnits(-1n, [{ key: 'one', value: 1n }])).toThrow()
		expect(() => allocateBasisPoints(10001, [{ key: 'one', value: 1n }])).toThrow()
	})
})
