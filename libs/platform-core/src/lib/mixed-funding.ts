import { type EconomicAllocation } from 'contracts'
export interface FundingVector {
	customer: number
	subsidy: number
	commission: number
	vendor: number
}
/** Consume original compact units in stable order; never recalculate discounts or rates. */
export function originalFunding(allocation: Pick<EconomicAllocation, 'quantity' | 'unitSegments'>, offset: number, quantity: number): FundingVector {
	if (!Number.isInteger(offset) || !Number.isInteger(quantity) || offset < 0 || quantity < 0 || offset + quantity > allocation.quantity)
		throw new Error('Refund quantity exceeds original allocation.')
	let skip = offset,
		left = quantity,
		customer = 0n,
		subsidy = 0n,
		commission = 0n,
		vendor = 0n
	for (const segment of allocation.unitSegments) {
		const ignored = Math.min(skip, segment.quantity)
		skip -= ignored
		const count = Math.min(left, segment.quantity - ignored)
		left -= count
		customer += BigInt(count) * BigInt(segment.customerUnitMinorUnits)
		subsidy += BigInt(count) * BigInt(segment.platformSubsidyUnitMinorUnits)
		commission += BigInt(count) * BigInt(segment.commissionUnitMinorUnits)
		vendor += BigInt(count) * BigInt(segment.vendorEarningUnitMinorUnits)
	}
	if (left || customer + subsidy !== commission + vendor) throw new Error('Original funding is incomplete or unbalanced.')
	return { customer: Number(customer), subsidy: Number(subsidy), commission: Number(commission), vendor: Number(vendor) }
}
/** Policy bands refund an original gross fraction. Floor funding totals, then
 * cap commission and give remaining value to Vendor proceeds to conserve Money. */
export function proportionFunding(original: FundingVector, numerator: number, denominator: number): FundingVector {
	if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0 || numerator < 0 || numerator > denominator)
		throw new Error('Invalid original refund fraction.')
	const scale = (n: number) => Number((BigInt(n) * BigInt(numerator)) / BigInt(denominator))
	const customer = scale(original.customer),
		subsidy = scale(original.subsidy),
		commission = Math.min(scale(original.commission), customer + subsidy),
		vendor = customer + subsidy - commission
	if (vendor > original.vendor) throw new Error('Refund proceeds exceed original funding.')
	return { customer, subsidy, commission, vendor }
}
