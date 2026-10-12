import { z } from 'zod'

import { GoodsQuoteCommandSchema, GoodsQuoteSnapshotSchema } from './api.js'
import { BookingHoldCommandSchema, BookingHoldSnapshotSchema } from './booking-holds.js'
import { BookingPolicySchema } from './bookings.js'
import { MoneySchema } from './finance.js'
import { CartPromotionSelectionSchema, CommissionSnapshotSchema, PromotionSnapshotSchema } from './promotions.js'
const id = z.string().uuid()
const version = z.number().int().min(0)
const price = z.number().int().positive().max(2_147_483_647)
const goodsGroup = GoodsQuoteCommandSchema.shape.groups.element
export const MixedGoodsGroupSchema = goodsGroup.extend({
	lines: z
		.array(goodsGroup.shape.lines.element.extend({ expectedUnitPriceCents: price }))
		.min(1)
		.max(50),
})
export const MixedBookingIntentSchema = z.strictObject({ intentId: id, quantity: z.literal(1), selection: BookingHoldCommandSchema, expectedPriceCents: price })
export const MixedCartSelectionSchema = z
	.strictObject({
		goodsGroups: z.array(MixedGoodsGroupSchema).max(10),
		bookings: z.array(MixedBookingIntentSchema).max(5),
		promotions: CartPromotionSelectionSchema.optional(),
	})
	.superRefine((selection, ctx) => {
		if (new Set(selection.bookings.map((b) => b.intentId)).size !== selection.bookings.length)
			ctx.addIssue({ code: 'custom', path: ['bookings'], message: 'Appointment intent IDs must be unique.' })
		if (selection.goodsGroups.length) {
			const result = GoodsQuoteCommandSchema.safeParse({
				groups: selection.goodsGroups.map((g) => ({ ...g, lines: g.lines.map(({ listingId, sku, quantity }) => ({ listingId, sku, quantity })) })),
			})
			if (!result.success)
				for (const issue of result.error.issues) ctx.addIssue({ code: 'custom', path: ['goodsGroups', ...issue.path.slice(1)], message: issue.message })
		}
	})
export type MixedCartSelection = z.infer<typeof MixedCartSelectionSchema>
export const MixedCartWriteSchema = z.strictObject({ expectedVersion: version, selection: MixedCartSelectionSchema })
export const MixedCartReadSchema = z.strictObject({ cartId: id.nullable(), version, selection: MixedCartSelectionSchema })
export const MixedCartWriteResultSchema = MixedCartReadSchema.extend({ replayed: z.boolean() })
export const MixedCartMergeSchema = z.strictObject({ expectedVersion: version, incoming: MixedCartSelectionSchema })
export const MixedQuoteConflictSchema = z.strictObject({
	kind: z.enum(['goods', 'booking', 'cart']),
	referenceId: id.nullable(),
	listingId: id.nullable(),
	sku: z.string().nullable(),
	code: z.enum([
		'unavailable',
		'price_changed',
		'terms_changed',
		'selection_conflict',
		'capacity_conflict',
		'limit_exceeded',
		'promotion_unavailable',
		'commission_unavailable',
	]),
	message: z.string(),
	expectedPriceCents: price.nullable(),
	currentPriceCents: price.nullable(),
})
export type MixedQuoteConflict = z.infer<typeof MixedQuoteConflictSchema>
export const MixedQuoteSnapshotSchema = z.strictObject({
	evaluatedAt: z.string().datetime(),
	goods: z.array(z.strictObject({ componentId: id, group: GoodsQuoteSnapshotSchema.shape.groups.element })),
	bookings: z.array(z.strictObject({ componentId: id, quantity: z.literal(1), snapshot: BookingHoldSnapshotSchema, policy: BookingPolicySchema })),
	total: MoneySchema.nullable(),
	conflicts: z.array(MixedQuoteConflictSchema),
	reserved: z.literal(false),
	promotion: PromotionSnapshotSchema.nullable(),
	commission: CommissionSnapshotSchema.nullable(),
})
export type MixedQuoteSnapshot = z.infer<typeof MixedQuoteSnapshotSchema>
export const MixedCartMergeResultSchema = z.strictObject({
	cart: MixedCartReadSchema,
	incoming: MixedCartSelectionSchema,
	proposed: MixedCartSelectionSchema.nullable(),
	matches: z.array(
		z.strictObject({
			kind: z.enum(['goods', 'booking']),
			referenceId: id,
			listingId: id,
			sku: z.string().nullable(),
			previousQuantity: z.number().int().positive(),
			incomingQuantity: z.number().int().positive(),
			proposedQuantity: z.number().int().positive(),
		}),
	),
	conflicts: z.array(MixedQuoteConflictSchema),
	reviews: z.array(MixedQuoteSnapshotSchema),
	persisted: z.literal(false),
})
export const MixedQuoteCommandSchema = z.strictObject({ cartId: id, expectedVersion: version })
export const MixedQuoteReadSchema = z.strictObject({
	quoteId: id,
	cartId: id,
	cartVersion: version,
	state: z.enum(['ready', 'conflicts', 'expired', 'stale']),
	expiresAt: z.string().datetime(),
	snapshot: MixedQuoteSnapshotSchema,
})
export const MixedQuoteResultSchema = MixedQuoteReadSchema.extend({ replayed: z.boolean() })

export const MixedHoldCommandSchema = z.strictObject({ quoteId: id })
export const MixedHoldReadSchema = z.strictObject({
	holdId: id,
	quoteId: id,
	cartId: id,
	state: z.enum(['holding', 'released', 'expired']),
	createdAt: z.string().datetime(),
	expiresAt: z.string().datetime(),
	reserved: z.boolean(),
	snapshot: MixedQuoteSnapshotSchema,
})
export const MixedHoldResultSchema = MixedHoldReadSchema.extend({ replayed: z.boolean() })
export const MixedHoldReleaseResultSchema = z.strictObject({ holdId: id, state: z.enum(['released', 'expired']), replayed: z.boolean() })

export const MixedCurrentHoldSchema = z.strictObject({ hold: MixedHoldReadSchema.nullable() })
