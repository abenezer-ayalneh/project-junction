import { ApiErrorSchema, AuditMarkerCommandSchema, IdempotencyKeySchema } from './api.js'

describe('public platform contracts', () => {
	it('accepts a safe error envelope without internal details', () => {
		expect(
			ApiErrorSchema.parse({
				code: 'ACCESS_DENIED',
				message: 'This action is not permitted.',
				requestId: '11111111-1111-4111-8111-111111111111',
				retryable: false,
			}),
		).toMatchObject({ code: 'ACCESS_DENIED' })
	})

	it('requires a safe idempotency key for mutating commands', () => {
		expect(() => IdempotencyKeySchema.parse('short')).toThrow()
		expect(AuditMarkerCommandSchema.parse({ marker: 'foundation check' })).toEqual({
			marker: 'foundation check',
		})
	})
})
