import { z } from 'zod'

import { BookingHoldSnapshotSchema } from './booking-holds.js'

const id = z.string().uuid()
export const BookingPolicySchema = z.strictObject({
	template: z.enum(['flexible', 'standard']),
	version: z.literal(1),
	fullRefundHours: z.number().int().positive(),
	partialRefundHours: z.number().int().positive(),
	amendmentLimit: z.number().int().positive(),
	contestHours: z.literal(48),
})
export const BookingPaymentStartSchema = z.strictObject({
	holdId: id,
	attendee: z.strictObject({ name: z.string().trim().min(1).max(120), notes: z.string().trim().max(500).optional() }).optional(),
})
export const BookingPaymentReceiptCommandSchema = z.strictObject({ outcome: z.enum(['succeeded', 'failed', 'unknown']) })
export const BookingSnapshotSchema = BookingHoldSnapshotSchema.extend({
	policy: BookingPolicySchema,
	attendee: BookingPaymentStartSchema.shape.attendee.nullable(),
	optionPriceCents: z.number().int().positive(),
	promotion: z.null(),
	commission: z.null(),
})
export const BookingReadSchema = z.object({
	bookingId: id,
	state: z.string(),
	version: z.number().int().positive(),
	confirmedAt: z.string().datetime(),
	snapshot: BookingSnapshotSchema,
})
export const BookingPaymentReadSchema = z.object({
	paymentId: id,
	holdId: id,
	provider: z.literal('local-controlled'),
	currency: z.literal('ETB'),
	amountCents: z.number().int().positive(),
	state: z.enum(['processing', 'unknown', 'failed', 'succeeded', 'refund_pending', 'refunded']),
	bookingId: id.nullable(),
	expiresAt: z.string().datetime(),
	refundedCents: z.number().int().min(0),
	pendingRefundCents: z.number().int().min(0),
})
export const BookingPaymentResultSchema = BookingPaymentReadSchema.extend({ replayed: z.boolean() })
export const BookingCancellationCommandSchema = z.strictObject({ reason: z.string().trim().min(1).max(500), expectedVersion: z.number().int().positive() })
export const BookingCancellationResultSchema = z.object({
	bookingId: id,
	cancellationId: id,
	state: z.literal('cancelled'),
	refundCents: z.number().int().min(0),
	cancelledAt: z.string().datetime(),
	replayed: z.boolean(),
})
