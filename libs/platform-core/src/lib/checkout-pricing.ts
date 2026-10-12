import {
	type CartPromotionSelectionSchema,
	CommissionSnapshotSchema,
	type EconomicAllocation,
	type MixedQuoteConflict,
	type MixedQuoteSnapshot,
	PromotionDefinitionSchema,
	PromotionSnapshotSchema,
} from 'contracts'
import { type z } from 'zod'

import { type Prisma, type PromotionDefinition } from '../../generated/prisma/index.js'
import { commissionRateView, promotionView } from './checkout-finance-config.js'
import { allocateBasisPoints, allocateMinorUnits, economicUnitSegments, promotionAmount, roundBasisPoints } from './finance-allocation.js'

type Tx = Prisma.TransactionClient
type Line = {
	key: string
	componentId: string
	vendorId: string
	listingId: string
	sku: string | null
	kind: 'goods' | 'booking'
	quantity: number
	unitPrice: number
	list: bigint
	vendorDiscount: bigint
	platformSubsidy: bigint
	commission: bigint
}
const issue = (code: MixedQuoteConflict['code'], message: string, referenceId: string | null = null): MixedQuoteConflict => ({
	kind: 'cart',
	referenceId,
	listingId: null,
	sku: null,
	code,
	message,
	expectedPriceCents: null,
	currentPriceCents: null,
})
const sum = (values: readonly bigint[]) => values.reduce((total, value) => total + value, 0n)
export class CheckoutPricing {
	async eligibleDefinition(tx: Tx, row: PromotionDefinition, now: Date, customerId: string | null) {
		const definition = PromotionDefinitionSchema.parse(row.definition)
		if (now < new Date(definition.validFrom) || now >= new Date(definition.validUntil)) return false
		const active = { promotionId: row.id, OR: [{ state: 'consumed' }, { state: 'reserved', expiresAt: { gt: now } }] }
		const uses = await tx.promotionReservation.count({ where: active })
		if (definition.usageLimit !== null && uses >= definition.usageLimit) return false
		if (
			customerId &&
			definition.perCustomerLimit !== null &&
			(await tx.promotionReservation.count({ where: { ...active, customerId } })) >= definition.perCustomerLimit
		)
			return false
		return true
	}
	async availableBudget(tx: Tx, promotionId: string, now: Date) {
		const balance = await tx.campaignBudgetBalance.findUnique({ where: { promotionId } })
		if (!balance) return 0n
		const expired = await tx.promotionReservation.aggregate({
			where: { promotionId, state: 'reserved', expiresAt: { lte: now } },
			_sum: { amountMinorUnits: true },
		})
		return balance.capacity - balance.reserved - balance.consumed + (expired._sum.amountMinorUnits ?? 0n)
	}
	private lines(snapshot: MixedQuoteSnapshot): Line[] {
		return [
			...snapshot.goods.flatMap((g) =>
				g.group.lines.map((l) => ({
					key: JSON.stringify(['goods', g.group.vendorId.toLowerCase(), l.listingId, l.sku]),
					componentId: g.componentId,
					vendorId: g.group.vendorId.toLowerCase(),
					listingId: l.listingId,
					sku: l.sku,
					kind: 'goods' as const,
					quantity: l.quantity,
					unitPrice: l.unitPriceCents,
					list: BigInt(l.subtotalCents),
					vendorDiscount: 0n,
					platformSubsidy: 0n,
					commission: 0n,
				})),
			),
			...snapshot.bookings.map((b) => ({
				key: JSON.stringify(['booking', b.componentId]),
				componentId: b.componentId,
				vendorId: b.snapshot.vendorId,
				listingId: b.snapshot.listingId,
				sku: null,
				kind: 'booking' as const,
				quantity: 1,
				unitPrice: b.snapshot.priceCents,
				list: BigInt(b.snapshot.priceCents),
				vendorDiscount: 0n,
				platformSubsidy: 0n,
				commission: 0n,
			})),
		]
	}
	async apply(
		tx: Tx,
		snapshot: MixedQuoteSnapshot,
		selection: z.infer<typeof CartPromotionSelectionSchema> | undefined,
		customerId: string,
		now: Date,
	): Promise<MixedQuoteSnapshot> {
		if (snapshot.total === null || snapshot.conflicts.length) return snapshot
		const lines = this.lines(snapshot)
		const conflicts: MixedQuoteConflict[] = []
		const applied: { vendorCoupon: ReturnType<typeof promotionView> | null; platformCampaign: ReturnType<typeof promotionView> | null } = {
			vendorCoupon: null,
			platformCampaign: null,
		}
		for (const [field, id, expectedKind] of [
			['vendorCoupon', selection?.vendorCouponId, 'vendor_coupon'],
			['platformCampaign', selection?.platformCampaignId, 'platform_campaign'],
		] as const) {
			if (!id) continue
			const row = await tx.promotionDefinition.findUnique({ where: { id } })
			if (!row || row.kind !== expectedKind || !(await this.eligibleDefinition(tx, row, now, customerId))) {
				conflicts.push(issue('promotion_unavailable', 'Selected promotion is unavailable. Remove it or select another.', id))
				continue
			}
			const definition = PromotionDefinitionSchema.parse(row.definition)
			const eligible = lines.filter(
				(l) =>
					(row.vendorId === null || row.vendorId === l.vendorId) &&
					(!row.vendorIds.length || row.vendorIds.includes(l.vendorId)) &&
					definition.scope.kinds.includes(l.kind) &&
					(!definition.scope.listingIds.length || definition.scope.listingIds.includes(l.listingId)),
			)
			const weights = eligible.map((l) => ({ key: l.key, value: l.list - l.vendorDiscount }))
			const basis = sum(weights.map((w) => w.value))
			if (!basis || basis < BigInt(definition.minimumMinorUnits)) {
				conflicts.push(issue('promotion_unavailable', 'Selected promotion has no eligible value or its minimum is not met.', id))
				continue
			}
			const amount = promotionAmount(definition.rule, basis)
			if (!amount || (expectedKind === 'platform_campaign' && amount > (await this.availableBudget(tx, row.id, now)))) {
				conflicts.push(issue('promotion_unavailable', 'Selected promotion value or campaign budget is unavailable.', id))
				continue
			}
			const allocations =
				definition.rule.kind === 'percentage' && amount === roundBasisPoints(basis, definition.rule.basisPoints)
					? allocateBasisPoints(definition.rule.basisPoints, weights)
					: allocateMinorUnits(amount, weights)
			for (const line of eligible) {
				const value = allocations.get(line.key) ?? 0n
				if (field === 'vendorCoupon') line.vendorDiscount = value
				else line.platformSubsidy = value
			}
			applied[field] = promotionView(row)
		}
		const rates: z.infer<typeof CommissionSnapshotSchema>['rates'] = []
		for (const vendorId of [...new Set(lines.map((l) => l.vendorId))].sort()) {
			const window = { effectiveFrom: { lte: now }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }] }
			const row =
				(await tx.commissionRate.findFirst({ where: { vendorId, ...window }, orderBy: { effectiveFrom: 'desc' } })) ??
				(await tx.commissionRate.findFirst({ where: { vendorId: null, ...window }, orderBy: { effectiveFrom: 'desc' } }))
			if (!row) {
				conflicts.push(issue('commission_unavailable', 'An effective commission rate is required before checkout.', vendorId))
				continue
			}
			const vendorLines = lines.filter((l) => l.vendorId === vendorId)
			const weights = vendorLines.map((l) => ({ key: l.key, value: l.list - l.vendorDiscount }))
			const allocated = allocateBasisPoints(row.basisPoints, weights)
			for (const line of vendorLines) line.commission = allocated.get(line.key) ?? 0n
			rates.push({
				...commissionRateView(row),
				affectedVendorId: vendorId,
				source: row.vendorId ? 'vendor_override' : 'global',
				basisMinorUnits: Number(sum(weights.map((w) => w.value))),
				commissionMinorUnits: Number(sum([...allocated.values()])),
			})
		}
		if (conflicts.length) return { ...snapshot, total: null, conflicts: [...snapshot.conflicts, ...conflicts], promotion: null, commission: null }
		const allocations: EconomicAllocation[] = lines.map((l) => ({
			key: l.key,
			componentId: l.componentId,
			vendorId: l.vendorId,
			listingId: l.listingId,
			sku: l.sku,
			kind: l.kind,
			quantity: l.quantity,
			listMinorUnits: Number(l.list),
			vendorDiscountMinorUnits: Number(l.vendorDiscount),
			platformSubsidyMinorUnits: Number(l.platformSubsidy),
			customerMinorUnits: Number(l.list - l.vendorDiscount - l.platformSubsidy),
			commissionBasisMinorUnits: Number(l.list - l.vendorDiscount),
			commissionMinorUnits: Number(l.commission),
			vendorEarningMinorUnits: Number(l.list - l.vendorDiscount - l.commission),
			unitSegments: economicUnitSegments(l.quantity, l.unitPrice, l.vendorDiscount, l.platformSubsidy, l.commission),
		}))
		const delivery = sum(snapshot.goods.map((g) => BigInt(g.group.deliveryFeeCents)))
		const vendorDiscount = sum(lines.map((l) => l.vendorDiscount)),
			platformSubsidy = sum(lines.map((l) => l.platformSubsidy)),
			gross = sum(lines.map((l) => l.list))
		const payable = gross - vendorDiscount - platformSubsidy + delivery
		const appliedView = (field: 'vendorCoupon' | 'platformCampaign', amount: bigint) => {
			const value = applied[field]
			if (!value) return null
			const { budget, ...definition } = value
			void budget
			return { ...definition, funding: field === 'vendorCoupon' ? 'vendor' : 'platform', allocated: { minorUnits: Number(amount), currency: 'ETB' } }
		}
		const promotion = PromotionSnapshotSchema.parse({
			vendorCoupon: appliedView('vendorCoupon', vendorDiscount),
			platformCampaign: appliedView('platformCampaign', platformSubsidy),
			allocations,
			grossSaleMinorUnits: Number(gross),
			deliveryMinorUnits: Number(delivery),
			vendorDiscountMinorUnits: Number(vendorDiscount),
			platformSubsidyMinorUnits: Number(platformSubsidy),
			customerPayableMinorUnits: Number(payable),
			receiptContext: {
				kind: 'non_tax_platform_receipt',
				taxCalculated: false,
				deliveryThresholdBasis: 'list_sale_before_promotions',
				currency: 'ETB',
				paymentMerchant: 'junction',
				contractingSellers: 'vendors',
				refundFundingRule: 'proportional_original_allocations',
			},
		})
		const commission = CommissionSnapshotSchema.parse({
			basis: 'after_vendor_discount_before_platform_subsidy_excluding_delivery',
			rounding: 'largest_remainder_half_up_per_vendor',
			rates,
			totalMinorUnits: Number(sum(lines.map((l) => l.commission))),
		})
		return { ...snapshot, total: { minorUnits: Number(payable), currency: 'ETB' }, promotion, commission }
	}
}
