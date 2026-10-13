import { createHmac, timingSafeEqual } from 'node:crypto'

import { z } from 'zod'

import { AccessDeniedError } from './access.js'
import { applicationRuntimeMode } from './runtime.js'
export const MixedProviderEventSchema = z.strictObject({
	eventId: z.string().min(1).max(200),
	paymentId: z.string().uuid(),
	workspaceId: z.string().uuid(),
	reference: z.string().min(1).max(200),
	merchant: z.literal('junction'),
	environment: z.literal('local-controlled'),
	amount: z.strictObject({ minorUnits: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), currency: z.literal('ETB') }),
	outcome: z.enum(['unknown', 'succeeded', 'failed']),
	occurredAt: z.string().datetime(),
})
export type MixedProviderEvent = z.infer<typeof MixedProviderEventSchema>
/** Local synthetic provider. Raw receipt authentication is independent of Customer cookies. */
export class LocalMixedPaymentAdapter {
	constructor(private readonly secret = process.env['JUNCTION_MIXED_PAYMENT_WEBHOOK_SECRET'] ?? '') {}
	assertLocal() {
		if (applicationRuntimeMode() !== 'local') throw new AccessDeniedError('Mixed payment simulation requires local development.')
	}
	private key() {
		this.assertLocal()
		if (this.secret.length < 32) throw new AccessDeniedError('Configure the local mixed payment signing key.')
		return this.secret
	}
	sign(raw: Buffer, now: Date) {
		const timestamp = Math.floor(now.getTime() / 1000).toString()
		return `${timestamp}.${createHmac('sha256', this.key())
			.update(timestamp + '.')
			.update(raw)
			.digest('hex')}`
	}
	verify(raw: Buffer | undefined, signature: string | undefined, now: Date) {
		const secret = this.key()
		if (!raw || raw.length > 65536 || !signature) throw new AccessDeniedError('Invalid payment receipt.')
		const match = /^(\d{10})\.([a-f0-9]{64})$/.exec(signature)
		if (!match || Math.abs(now.getTime() / 1000 - Number(match[1])) > 300) throw new AccessDeniedError('Invalid payment receipt.')
		const expected = createHmac('sha256', secret)
				.update(match[1] + '.')
				.update(raw)
				.digest(),
			supplied = Buffer.from(match[2], 'hex')
		if (!timingSafeEqual(expected, supplied)) throw new AccessDeniedError('Invalid payment receipt.')
	}
	/** Stable semantic key permits safe retry/fetch after a timeout. No live funds. */
	refund(request: { operationId: string; paymentId: string; amountMinorUnits: number }): Promise<{ state: 'completed' | 'unknown'; reference: string }> {
		this.assertLocal()
		return Promise.resolve({ state: 'completed', reference: `local-mixed-refund:${request.operationId}` })
	}
}
