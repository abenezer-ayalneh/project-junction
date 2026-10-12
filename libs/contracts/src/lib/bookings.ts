import { z } from 'zod'

import { BookingHoldCommandSchema, BookingHoldSnapshotSchema } from './booking-holds.js'
import { ServiceSlotSelectionSchema } from './scheduling.js'

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
	originalSnapshot: BookingSnapshotSchema.optional(),
	customerAmendments: z.number().int().min(0).optional(),
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
	collectedCents: z.number().int().positive(),
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
export const BookingAmendmentCommandSchema = z.strictObject({
	expectedVersion: z.number().int().positive(),
	selection: BookingHoldCommandSchema,
	extraPaymentOutcome: z.enum(['succeeded', 'failed', 'unknown']),
})
export const BookingAmendmentResultSchema = z.object({
	bookingId: id,
	amendmentId: id,
	version: z.number().int().positive(),
	deltaCents: z.number().int(),
	snapshot: BookingSnapshotSchema,
	replayed: z.boolean(),
})
export const BookingSubstitutionCommandSchema = z.strictObject({
	expectedVersion: z.number().int().positive(),
	replacementStaffId: id,
	reason: z.string().trim().min(1).max(500),
})
export const BookingSubstitutionDecisionSchema = z.strictObject({ decision: z.enum(['accept', 'decline', 'withdraw']) })
export const BookingSubstitutionReadSchema = z.object({
	proposalId: id,
	bookingId: id,
	state: z.enum(['pending', 'accepted', 'declined', 'withdrawn']),
	replacementStaffId: id.nullable(),
	replacementStaffName: z.string().nullable(),
	expectedBookingVersion: z.number().int().positive(),
})
export const BookingSubstitutionResultSchema = BookingSubstitutionReadSchema.extend({ replayed: z.boolean() })
export const BookingWaitlistCommandSchema = z.strictObject({ listingId: id, selection: ServiceSlotSelectionSchema })
export const BookingWaitlistReadSchema = z.object({
	waitlistId: id,
	state: z.enum(['waiting', 'notified', 'removed']),
	selection: ServiceSlotSelectionSchema,
	listingId: id,
	reserved: z.literal(false),
})
export const BookingWaitlistResultSchema = BookingWaitlistReadSchema.extend({ replayed: z.boolean() })
export const StaffMeetConnectionCommandSchema = z.strictObject({ expectedVersion: z.number().int().min(0), connected: z.boolean() })
export const StaffMeetConnectionResultSchema = z.object({
	staffId: id,
	connected: z.boolean(),
	version: z.number().int().min(0),
	provider: z.literal('controlled_google_meet'),
	replayed: z.boolean(),
})
export const BookingMeetingReadSchema = z.object({
	bookingId: id,
	meetingId: id.nullable(),
	state: z.enum(['pending', 'provisioning', 'retry_scheduled', 'replacement_required', 'ready', 'booking_cancelled']),
	provider: z.enum(['demo_meet', 'controlled_google_meet']).nullable(),
	bookingVersion: z.number().int().positive(),
	attempts: z.number().int().min(0),
	retryAt: z.string().datetime().nullable(),
	safetyCutoffAt: z.string().datetime(),
	uri: z.string().nullable(),
	lastError: z.enum(['timeout', 'provider_failure', 'invalid_response', 'connection_unavailable']).nullable(),
	manualReplacement: z.boolean(),
})
export const BookingMeetingReplacementCommandSchema = z.strictObject({
	expectedVersion: z.number().int().positive(),
	kind: z.literal('demo_meet'),
	reason: z.string().trim().min(1).max(500),
})
export const BookingMeetingResultSchema = BookingMeetingReadSchema.extend({ replayed: z.boolean() })
