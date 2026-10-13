import { z } from 'zod'
const amount = z.number().int().safe().nonnegative()
export const EarningAmountsSchema = z
	.strictObject({
		gross: amount,
		pending: amount,
		available: amount,
		frozen: amount,
		refundPending: amount,
		refunded: amount,
		eligibleAt: z.string().datetime().nullable(),
		freezes: z.array(z.strictObject({ kind: z.enum(['goods_return', 'booking_contest']), sourceId: z.string().uuid(), minorUnits: amount })),
	})
	.superRefine((value, ctx) => {
		if (
			['pending', 'available', 'frozen', 'refundPending', 'refunded'].reduce((sum, key) => sum + BigInt(value[key as 'pending']), 0n) !==
			BigInt(value.gross)
		)
			ctx.addIssue({ code: 'custom', message: 'Earning partitions must conserve original Vendor funding.' })
	})
export const VendorEarningsSchema = z.strictObject({
	currency: z.literal('ETB'),
	settlement: z.enum(['not_transferred', 'simulated_transfers']),
	lots: z.array(
		z.strictObject({
			allocationId: z.string().uuid(),
			purchaseId: z.string().uuid(),
			kind: z.enum(['goods', 'booking', 'delivery']),
			locationId: z.string().uuid().nullable(),
			goodsOrderLineId: z.string().uuid().nullable(),
			bookingId: z.string().uuid().nullable(),
			version: z.number().int().positive(),
			amounts: EarningAmountsSchema,
		}),
	),
})
