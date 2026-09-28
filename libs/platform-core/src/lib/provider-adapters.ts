import { createHmac, timingSafeEqual } from 'node:crypto'

import { type SyntheticProviderCallback, SyntheticProviderCallbackSchema } from 'contracts'

import { AccessDeniedError } from './access.js'

export const FAKE_PAYMENT_PROVIDER = 'fake-payment'
export const PROVIDER_WEBHOOK_ADAPTER = Symbol('ProviderWebhookAdapter')

export interface ProviderWebhookInput {
	body: unknown
	eventId: string | undefined
	provider: string
	rawBody: Buffer | undefined
	signature: string | undefined
}

export interface VerifiedProviderWebhook {
	callback: SyntheticProviderCallback
	eventId: string
	provider: string
}

export interface ProviderWebhookAdapter {
	verify(input: ProviderWebhookInput): VerifiedProviderWebhook
}

export class DisabledProviderWebhookAdapter implements ProviderWebhookAdapter {
	verify(input: ProviderWebhookInput): never {
		void input
		throw new AccessDeniedError('Synthetic provider callbacks are unavailable in staging.')
	}
}

/**
 * Deterministic local substitute only. The adapter owns provider-specific
 * signature shape while the caller owns inbox deduplication and reconciliation.
 */
export class FakePaymentWebhookAdapter implements ProviderWebhookAdapter {
	constructor(private readonly signingSecret: string) {}

	verify(input: ProviderWebhookInput): VerifiedProviderWebhook {
		if (input.provider !== FAKE_PAYMENT_PROVIDER || !input.eventId || input.eventId.length > 200 || !this.signatureMatches(input))
			throw new AccessDeniedError('Provider callback is not accepted.')

		return {
			provider: FAKE_PAYMENT_PROVIDER,
			eventId: input.eventId,
			callback: SyntheticProviderCallbackSchema.parse(input.body),
		}
	}

	private signatureMatches(input: ProviderWebhookInput): boolean {
		if (!this.signingSecret || !input.rawBody || !input.signature?.startsWith('sha256=')) return false
		const expected = createHmac('sha256', this.signingSecret).update(input.rawBody).digest('hex')
		const expectedBytes = Buffer.from(expected, 'hex')
		const suppliedBytes = Buffer.from(input.signature.slice('sha256='.length), 'hex')
		return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes)
	}
}
