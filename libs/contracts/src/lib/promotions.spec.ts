import {
	CartPromotionSelectionSchema,
	CommissionRateCommandSchema,
	PlatformCampaignCommandSchema,
	PromotionDefinitionSchema,
	VendorCouponCommandSchema,
} from './promotions.js'
const id = '00000000-0000-4000-8000-abcdefabcdef'
const definition = {
	code: 'CODE_1',
	validFrom: '2026-10-12T00:00:00Z',
	validUntil: '2026-10-13T00:00:00Z',
	scope: { kinds: ['goods', 'booking'], listingIds: [] },
	rule: { kind: 'percentage', basisPoints: 1000, maximumMinorUnits: 500 },
	minimumMinorUnits: 0,
	usageLimit: null,
	perCustomerLimit: 1,
	refundFundingRule: 'proportional_original_allocations',
}
describe('promotion and commission boundaries', () => {
	test('definition requires explicit value, eligibility, usage and original funding controls', () => {
		expect(PromotionDefinitionSchema.safeParse(definition).success).toBe(true)
		expect(PromotionDefinitionSchema.safeParse({ ...definition, validUntil: definition.validFrom }).success).toBe(false)
		expect(PromotionDefinitionSchema.safeParse({ ...definition, rule: { kind: 'percentage', basisPoints: 10001, maximumMinorUnits: null } }).success).toBe(
			false,
		)
		expect(PromotionDefinitionSchema.safeParse({ ...definition, perCustomerLimit: 0 }).success).toBe(false)
	})
	test('campaign requires positive ETB Money and a coupon cannot claim Platform funding or caller ownership', () => {
		const command = { definition, reason: 'Controlled policy' }
		expect(VendorCouponCommandSchema.safeParse(command).success).toBe(true)
		expect(VendorCouponCommandSchema.safeParse({ ...command, vendorId: id, funding: 'platform' }).success).toBe(false)
		expect(PlatformCampaignCommandSchema.safeParse({ ...command, vendorIds: [], budget: { minorUnits: 1000, currency: 'ETB' } }).success).toBe(true)
		expect(PlatformCampaignCommandSchema.safeParse({ ...command, vendorIds: [], budget: { minorUnits: 1000, currency: 'USD' } }).success).toBe(false)
	})
	test('one selected coupon and campaign cannot be expanded into an implicit stack', () => {
		expect(CartPromotionSelectionSchema.safeParse({ vendorCouponId: id, platformCampaignId: null }).success).toBe(true)
		expect(CartPromotionSelectionSchema.safeParse({ vendorCouponId: [id, id], platformCampaignId: null }).success).toBe(false)
		expect(PromotionDefinitionSchema.safeParse({ ...definition, scope: { kinds: ['goods'], listingIds: [id, id.toUpperCase()] } }).success).toBe(false)
	})
	test('commission supports explicit global/Vendor effective rates and rejects category or caller economics', () => {
		const command = { vendorId: null, basisPoints: 500, effectiveFrom: '2026-10-12T00:00:00Z', effectiveUntil: null, reason: 'Effective controlled policy' }
		expect(CommissionRateCommandSchema.safeParse(command).success).toBe(true)
		expect(CommissionRateCommandSchema.safeParse({ ...command, vendorId: id }).success).toBe(true)
		expect(CommissionRateCommandSchema.safeParse({ ...command, category: 'goods' }).success).toBe(false)
		expect(CommissionRateCommandSchema.safeParse({ ...command, basisMinorUnits: 1 }).success).toBe(false)
	})
})
