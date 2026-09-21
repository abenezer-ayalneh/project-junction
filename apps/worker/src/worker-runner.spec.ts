import type { DomainEvent } from 'contracts'
import { InMemoryOutbox } from 'platform-core'

import { WorkerRunner } from './worker-runner'

describe('WorkerRunner', () => {
	it('claims and completes an outbox record exactly once', () => {
		const outbox = new InMemoryOutbox()
		outbox.publish({
			eventId: '11111111-1111-4111-8111-111111111111',
			type: 'FoundationCommandAccepted',
			aggregateId: '22222222-2222-4222-8222-222222222222',
			aggregateVersion: 1,
			workspaceId: '33333333-3333-4333-8333-333333333333',
			causationId: '44444444-4444-4444-8444-444444444444',
			correlationId: '55555555-5555-4555-8555-555555555555',
			idempotencyKey: 'foundation-command-0001',
			occurredAt: '2029-01-01T00:00:00.000Z',
			schemaVersion: 1,
			payload: {},
		} satisfies DomainEvent)

		const runner = new WorkerRunner('worker-test', outbox)
		expect(runner.processOne()).toMatchObject({ processed: true })
		expect(runner.processOne()).toEqual({ processed: false })
		expect(outbox.snapshot()[0]?.state).toBe('delivered')
	})
})
