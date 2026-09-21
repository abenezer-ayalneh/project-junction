import { ConfigService } from '@nestjs/config'
import { AccessDeniedError, IdempotencyConflictError } from 'platform-core'

import { FoundationService } from './foundation.service'

const syntheticSession = '00000000-0000-4000-8000-000000000002'

describe('FoundationService', () => {
	const configService = new ConfigService({ FOUNDATION_STORAGE: 'memory' })

	it('makes a protected synthetic command replay-safe', async () => {
		const service = new FoundationService(configService)
		const first = await service.acceptAuditMarker(syntheticSession, 'foundation-command-0001', {
			marker: 'first proof',
		})
		const replay = await service.acceptAuditMarker(syntheticSession, 'foundation-command-0001', {
			marker: 'first proof',
		})

		expect(first.replayed).toBe(false)
		expect(replay).toEqual({ ...first, replayed: true })
		await expect(service.acceptAuditMarker(syntheticSession, 'foundation-command-0001', { marker: 'different' })).rejects.toThrow(IdempotencyConflictError)
	})

	it('does not treat client-supplied claims as a session', async () => {
		const service = new FoundationService(configService)
		await expect(service.accessContext('invented-session-id')).rejects.toThrow(AccessDeniedError)
	})

	it('deduplicates a signed synthetic provider callback', () => {
		const service = new FoundationService(configService)
		const headers = ['fake-payment', 'callback-01', 'synthetic-test-signature'] as const
		expect(service.receiveProviderWebhook(...headers, { state: 'ok' })).toEqual({
			accepted: true,
			duplicate: false,
		})
		expect(service.receiveProviderWebhook(...headers, { state: 'ok' })).toEqual({
			accepted: true,
			duplicate: true,
		})
	})
})
