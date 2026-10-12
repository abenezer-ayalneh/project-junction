import { type EconomicAllocation, type PromotionRuleSchema } from 'contracts'
import { type z } from 'zod'

/** Exact proportional minor-unit allocation. Stable keys, never input order,
 * break equal remainders. Bigint avoids overflow and floating-point rounding. */
export function allocateMinorUnits(amount: bigint, weights: readonly { key: string; value: bigint }[]): Map<string, bigint> {
	if (amount < 0n || weights.some((w) => w.value < 0n) || new Set(weights.map((w) => w.key)).size !== weights.length)
		throw new Error('Invalid allocation input.')
	const total = weights.reduce((sum, w) => sum + w.value, 0n)
	if (amount > total) throw new Error('Allocation exceeds eligible value.')
	const result = new Map(weights.map((w) => [w.key, 0n]))
	if (!amount || !total) return result
	const ranked = weights
		.map((w) => {
			const numerator = amount * w.value
			const floor = numerator / total
			result.set(w.key, floor)
			return { key: w.key, remainder: numerator % total, value: w.value }
		})
		.filter((w) => w.value > 0n)
		.sort((a, b) => (a.remainder === b.remainder ? (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) : a.remainder > b.remainder ? -1 : 1))
	let remaining = amount - [...result.values()].reduce((sum, value) => sum + value, 0n)
	for (const entry of ranked) {
		if (!remaining) break
		result.set(entry.key, (result.get(entry.key) ?? 0n) + 1n)
		remaining--
	}
	if (remaining) throw new Error('Allocation did not reconcile.')
	return result
}
export const roundBasisPoints = (basis: bigint, rate: number) => (basis * BigInt(rate) + 5000n) / 10000n
export function promotionAmount(rule: z.infer<typeof PromotionRuleSchema>, basis: bigint): bigint {
	const proposed = rule.kind === 'fixed' ? BigInt(rule.minorUnits) : roundBasisPoints(basis, rule.basisPoints)
	const cap = rule.kind === 'percentage' && rule.maximumMinorUnits !== null ? BigInt(rule.maximumMinorUnits) : basis
	return [basis, proposed, cap].reduce((min, value) => (value < min ? value : min))
}
/** Compact deterministic unit slices let later partial refunds use original
 * funding without expanding very large Product quantities into unit arrays. */
export function economicUnitSegments(
	quantity: number,
	unitPrice: number,
	vendorDiscount: bigint,
	platformSubsidy: bigint,
	commission: bigint,
): EconomicAllocation['unitSegments'] {
	const count = BigInt(quantity),
		unit = BigInt(unitPrice)
	if (
		!Number.isSafeInteger(quantity) ||
		quantity < 1 ||
		!Number.isSafeInteger(unitPrice) ||
		unitPrice < 1 ||
		vendorDiscount < 0n ||
		vendorDiscount > count * unit ||
		platformSubsidy < 0n ||
		commission < 0n
	)
		throw new Error('Invalid unit economics.')
	const vendorBase = vendorDiscount / count,
		vendorExtra = vendorDiscount % count
	const buckets = [
		{ key: '0', count: vendorExtra, discount: vendorBase + 1n },
		{ key: '1', count: count - vendorExtra, discount: vendorBase },
	].filter((b) => b.count > 0n)
	const weights = buckets.map((b) => ({ key: b.key, value: b.count * (unit - b.discount) }))
	const subsidy = allocateMinorUnits(platformSubsidy, weights),
		fees = allocateMinorUnits(commission, weights)
	const segments: EconomicAllocation['unitSegments'] = []
	for (const bucket of buckets) {
		const p = subsidy.get(bucket.key) ?? 0n,
			c = fees.get(bucket.key) ?? 0n
		const pBase = p / bucket.count,
			pExtra = p % bucket.count,
			cBase = c / bucket.count,
			cExtra = c % bucket.count
		const cuts = [...new Set([0n, pExtra, cExtra, bucket.count])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
		for (let i = 1; i < cuts.length; i++) {
			const position = cuts[i - 1],
				n = cuts[i] - position,
				pUnit = pBase + (position < pExtra ? 1n : 0n),
				cUnit = cBase + (position < cExtra ? 1n : 0n)
			if (!n) continue
			segments.push({
				quantity: Number(n),
				listUnitMinorUnits: unitPrice,
				vendorDiscountUnitMinorUnits: Number(bucket.discount),
				platformSubsidyUnitMinorUnits: Number(pUnit),
				commissionUnitMinorUnits: Number(cUnit),
				customerUnitMinorUnits: Number(unit - bucket.discount - pUnit),
				vendorEarningUnitMinorUnits: Number(unit - bucket.discount - cUnit),
			})
		}
	}
	return segments
}

/** Commission and uncapped percentage rules allocate their exact rate quotas,
 * rounding the group total half-up and then assigning largest remainders. */
export function allocateBasisPoints(rate: number, weights: readonly { key: string; value: bigint }[]): Map<string, bigint> {
	if (!Number.isInteger(rate) || rate < 0 || rate > 10000 || weights.some((w) => w.value < 0n) || new Set(weights.map((w) => w.key)).size !== weights.length)
		throw new Error('Invalid rate allocation.')
	const result = new Map<string, bigint>()
	const ranked = weights
		.map((w) => {
			const numerator = w.value * BigInt(rate)
			result.set(w.key, numerator / 10000n)
			return { key: w.key, remainder: numerator % 10000n }
		})
		.sort((a, b) => (a.remainder === b.remainder ? (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) : a.remainder > b.remainder ? -1 : 1))
	let remaining =
		roundBasisPoints(
			weights.reduce((sum, w) => sum + w.value, 0n),
			rate,
		) - [...result.values()].reduce((sum, value) => sum + value, 0n)
	for (const entry of ranked) {
		if (!remaining) break
		result.set(entry.key, (result.get(entry.key) ?? 0n) + 1n)
		remaining--
	}
	if (remaining) throw new Error('Rate allocation did not reconcile.')
	return result
}
