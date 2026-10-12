import { z } from 'zod'

import { MoneySchema } from './finance.js'
const id = z.string().uuid()
const minor = z.number().int().min(0).max(2_147_483_647)
const positive = minor.min(1)
const date = z.string().datetime({ offset: true })
const uniqueIds = z
	.array(id)
	.max(500)
	.refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length, 'IDs must be unique')
export const PromotionRuleSchema = z.discriminatedUnion('kind', [
	z.strictObject({ kind: z.literal('fixed'), minorUnits: positive }),
	z.strictObject({ kind: z.literal('percentage'), basisPoints: z.number().int().min(1).max(10000), maximumMinorUnits: positive.nullable() }),
])
export const PromotionScopeSchema = z.strictObject({
	kinds: z
		.array(z.enum(['goods', 'booking']))
		.min(1)
		.max(2)
		.refine((values) => new Set(values).size === values.length, 'Kinds must be unique'),
	listingIds: uniqueIds,
})
export const PromotionDefinitionSchema = z
	.strictObject({
		code: z
			.string()
			.trim()
			.regex(/^[A-Za-z0-9_-]{2,40}$/),
		validFrom: date,
		validUntil: date,
		scope: PromotionScopeSchema,
		rule: PromotionRuleSchema,
		minimumMinorUnits: minor,
		usageLimit: z.number().int().positive().nullable(),
		perCustomerLimit: z.number().int().positive().nullable(),
		refundFundingRule: z.literal('proportional_original_allocations'),
	})
	.refine((v) => new Date(v.validUntil) > new Date(v.validFrom), 'Promotion window must be positive')
export type PromotionDefinition = z.infer<typeof PromotionDefinitionSchema>
export const VendorCouponCommandSchema = z.strictObject({ definition: PromotionDefinitionSchema, reason: z.string().trim().min(1).max(500) })
export const PlatformCampaignCommandSchema = VendorCouponCommandSchema.extend({
	vendorIds: uniqueIds,
	budget: MoneySchema.refine((m) => m.currency === 'ETB' && m.minorUnits > 0, 'Campaign budget requires positive ETB Money'),
})
export const PromotionReadSchema = z.strictObject({
	promotionId: id,
	version: z.literal(1),
	kind: z.enum(['vendor_coupon', 'platform_campaign']),
	vendorId: id.nullable(),
	definition: PromotionDefinitionSchema,
	vendorIds: uniqueIds,
	budget: MoneySchema.nullable(),
})
export const PromotionResultSchema = PromotionReadSchema.extend({ replayed: z.boolean() })
export const CommissionRateCommandSchema = z
	.strictObject({
		vendorId: id.nullable(),
		basisPoints: z.number().int().min(0).max(10000),
		effectiveFrom: date,
		effectiveUntil: date.nullable(),
		reason: z.string().trim().min(1).max(500),
	})
	.refine((v) => !v.effectiveUntil || new Date(v.effectiveUntil) > new Date(v.effectiveFrom), 'Rate window must be positive')
export const CommissionRateReadSchema = z.strictObject({
	rateId: id,
	version: z.literal(1),
	vendorId: id.nullable(),
	basisPoints: z.number().int().min(0).max(10000),
	effectiveFrom: date,
	effectiveUntil: date.nullable(),
})
export const CommissionRateResultSchema = CommissionRateReadSchema.extend({ replayed: z.boolean() })
export const CartPromotionSelectionSchema = z.strictObject({ vendorCouponId: id.nullable(), platformCampaignId: id.nullable() })
export const EconomicUnitSegmentSchema = z.strictObject({
	quantity: z.number().int().positive(),
	listUnitMinorUnits: positive,
	vendorDiscountUnitMinorUnits: minor,
	platformSubsidyUnitMinorUnits: minor,
	customerUnitMinorUnits: minor,
	commissionUnitMinorUnits: minor,
	vendorEarningUnitMinorUnits: minor,
})
export const EconomicAllocationSchema = z.strictObject({
	key: z.string(),
	componentId: id,
	vendorId: id,
	listingId: id,
	sku: z.string().nullable(),
	kind: z.enum(['goods', 'booking']),
	quantity: z.number().int().positive(),
	listMinorUnits: positive,
	vendorDiscountMinorUnits: minor,
	platformSubsidyMinorUnits: minor,
	customerMinorUnits: minor,
	commissionBasisMinorUnits: minor,
	commissionMinorUnits: minor,
	vendorEarningMinorUnits: minor,
	unitSegments: z.array(EconomicUnitSegmentSchema).min(1).max(6),
})
export type EconomicAllocation = z.infer<typeof EconomicAllocationSchema>
export const AppliedPromotionSchema = PromotionReadSchema.omit({ budget: true }).extend({ funding: z.enum(['vendor', 'platform']), allocated: MoneySchema })
export const PromotionSnapshotSchema = z.strictObject({
	vendorCoupon: AppliedPromotionSchema.nullable(),
	platformCampaign: AppliedPromotionSchema.nullable(),
	allocations: z.array(EconomicAllocationSchema),
	grossSaleMinorUnits: minor,
	deliveryMinorUnits: minor,
	vendorDiscountMinorUnits: minor,
	platformSubsidyMinorUnits: minor,
	customerPayableMinorUnits: minor,
	receiptContext: z.strictObject({
		kind: z.literal('non_tax_platform_receipt'),
		taxCalculated: z.literal(false),
		deliveryThresholdBasis: z.literal('list_sale_before_promotions'),
		currency: z.literal('ETB'),
		paymentMerchant: z.literal('junction'),
		contractingSellers: z.literal('vendors'),
		refundFundingRule: z.literal('proportional_original_allocations'),
	}),
})
export type PromotionSnapshot = z.infer<typeof PromotionSnapshotSchema>
export const CommissionSnapshotSchema = z.strictObject({
	basis: z.literal('after_vendor_discount_before_platform_subsidy_excluding_delivery'),
	rounding: z.literal('largest_remainder_half_up_per_vendor'),
	rates: z.array(
		CommissionRateReadSchema.extend({
			affectedVendorId: id,
			source: z.enum(['global', 'vendor_override']),
			basisMinorUnits: minor,
			commissionMinorUnits: minor,
		}),
	),
	totalMinorUnits: minor,
})
export type CommissionSnapshot = z.infer<typeof CommissionSnapshotSchema>

export const CouponResolveCommandSchema = z.strictObject({ vendorId: id, code: z.string().trim().min(2).max(40) })
