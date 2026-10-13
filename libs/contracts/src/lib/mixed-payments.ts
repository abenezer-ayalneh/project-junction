import { z } from 'zod'

import { MoneySchema } from './finance.js'
const id = z.string().uuid()
export const MixedPaymentStartSchema = z.strictObject({ holdId: id })
export const MixedPaymentSimulationSchema = z.strictObject({ outcome: z.enum(['unknown', 'succeeded', 'failed']) })
export const MixedPaymentReadSchema = z.strictObject({
	paymentId: id,
	purchaseId: id.nullable(),
	holdId: id,
	holdState: z.enum(['holding', 'released', 'expired', 'committed']),
	state: z.enum(['pending_provider', 'unknown', 'succeeded', 'failed', 'refund_pending', 'refunded', 'no_payment_required']),
	provider: z.literal('local-controlled'),
	sandbox: z.literal(true),
	amount: MoneySchema,
	createdAt: z.string().datetime(),
	expiresAt: z.string().datetime(),
	commitmentReady: z.boolean(),
	refundState: z.enum(['pending', 'unknown', 'completed']).nullable(),
})
export const MixedPaymentResultSchema = MixedPaymentReadSchema.extend({ replayed: z.boolean() })
export const MixedPaymentWebhookAckSchema = z.strictObject({ accepted: z.literal(true), duplicate: z.boolean() })
export type MixedPaymentRead = z.infer<typeof MixedPaymentReadSchema>

export const MixedCurrentPaymentSchema = z.strictObject({ payment: MixedPaymentReadSchema.nullable() })
