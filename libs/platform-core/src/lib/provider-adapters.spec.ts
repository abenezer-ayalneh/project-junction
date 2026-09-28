import { createHmac } from 'node:crypto'

import { AccessDeniedError } from './access.js'
import { DisabledProviderWebhookAdapter, FakePaymentWebhookAdapter } from './provider-adapters.js'

const signingSecret = 'fake-payment-test-secret'
const body = { providerReference: 'payment-intent-01', outcome: 'confirmed' }
const rawBody = Buffer.from(JSON.stringify(body))
const signature = `sha256=${createHmac('sha256', signingSecret).update(rawBody).digest('hex')}`

describe('FakePaymentWebhookAdapter', () => {
	it('normalizes a valid signed callback without leaking the signing mechanism', () => {
		const adapter = new FakePaymentWebhookAdapter(signingSecret)

		expect(adapter.verify({ provider: 'fake-payment', eventId: 'event-01', rawBody, signature, body })).toEqual({
			provider: 'fake-payment',
			eventId: 'event-01',
			callback: body,
		})
	})

	it.each([
		{ provider: 'other-provider', eventId: 'event-01', rawBody, signature, body },
		{ provider: 'fake-payment', eventId: undefined, rawBody, signature, body },
		{ provider: 'fake-payment', eventId: 'event-01', rawBody, signature: 'sha256=deadbeef', body },
	])('fails closed for invalid provider transport: %o', (input) => {
		const adapter = new FakePaymentWebhookAdapter(signingSecret)

		expect(() => adapter.verify(input)).toThrow(AccessDeniedError)
	})
})

it('rejects a correctly signed fake callback when synthetic provider handling is disabled', () => {
	const adapter = new DisabledProviderWebhookAdapter()
	expect(() => adapter.verify({ provider: 'fake-payment', eventId: 'event-01', rawBody, signature, body })).toThrow(AccessDeniedError)
})
