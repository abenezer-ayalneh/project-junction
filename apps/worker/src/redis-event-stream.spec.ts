import { randomUUID } from 'node:crypto'

import { type DomainEvent, DomainEventSchema } from 'contracts'
import { createClient } from 'redis'

import { RedisEventStreamAdapter } from './redis-event-stream'

const testUrl = process.env['REDIS_TEST_URL']
const describeWithRedis = testUrl ? describe : describe.skip

describeWithRedis('staging Redis event stream', () => {
	it('appends a real event once across replay and rejects identity substitution', async () => {
		const redis = createClient({ url: testUrl })
		redis.on('error', () => undefined)
		await redis.connect()
		const namespace = `junction:test:${randomUUID()}`
		const adapter = new RedisEventStreamAdapter(redis, namespace)
		const id = randomUUID()
		const event: DomainEvent = DomainEventSchema.parse({
			eventId: id,
			type: 'ListingPublished',
			aggregateId: randomUUID(),
			aggregateVersion: 1,
			workspaceId: randomUUID(),
			causationId: randomUUID(),
			correlationId: randomUUID(),
			idempotencyKey: null,
			occurredAt: new Date().toISOString(),
			schemaVersion: 1,
			payload: { listingId: randomUUID() },
		})
		try {
			await expect(adapter.deliver(event)).resolves.toEqual({ duplicate: false })
			await expect(adapter.deliver(event)).resolves.toEqual({ duplicate: true })
			await expect(adapter.deliver({ ...event, payload: { listingId: randomUUID() } })).rejects.toThrow('different content')
			const records = await redis.xRange(`${namespace}:domain-events`, '-', '+')
			expect(records).toHaveLength(1)
			expect(records[0].message['eventId']).toBe(id)
			expect(JSON.parse(records[0].message['event'])).toEqual(event)
			await expect(adapter.deliver({ ...event, type: 'FoundationCommandAccepted' })).rejects.toThrow('Synthetic event types')
		} finally {
			await redis.del([`${namespace}:domain-events`, `${namespace}:domain-event-identities`])
			await redis.quit()
		}
	})
})
