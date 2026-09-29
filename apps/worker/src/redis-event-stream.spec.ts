import { randomUUID } from 'node:crypto'

import { type DomainEvent, DomainEventSchema } from 'contracts'
import { createClient } from 'redis'

import { RedisEventStreamAdapter } from './redis-event-stream'

const testUrl = process.env['REDIS_TEST_URL']
const describeWithRedis = testUrl ? describe : describe.skip

describeWithRedis('staging Redis event stream', () => {
	it('appends a real event once across replay and rejects identity substitution', async () => {
		const redis = createClient({ url: testUrl })
		const subscriber = redis.duplicate()
		redis.on('error', () => undefined)
		subscriber.on('error', () => undefined)
		await redis.connect()
		await subscriber.connect()
		const namespace = `junction:test:${randomUUID()}`
		const liveMessages: string[] = []
		let resolveLiveMessages: (() => void) | undefined
		const liveReady = new Promise<void>((resolve) => {
			resolveLiveMessages = resolve
		})
		await subscriber.subscribe(`${namespace}:domain-events-live`, (message) => {
			liveMessages.push(message)
			if (liveMessages.length === 2) resolveLiveMessages?.()
		})
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
		let liveTimeout: ReturnType<typeof setTimeout> | undefined
		try {
			await expect(adapter.deliver(event)).resolves.toEqual({ duplicate: false })
			await expect(adapter.deliver(event)).resolves.toEqual({ duplicate: true })
			await Promise.race([
				liveReady,
				new Promise((_, reject) => {
					liveTimeout = setTimeout(() => reject(new Error('Live event delivery timed out.')), 2000)
				}),
			])
			expect(liveMessages.map((message) => DomainEventSchema.parse(JSON.parse(message)))).toEqual([event, event])
			await expect(adapter.deliver({ ...event, payload: { listingId: randomUUID() } })).rejects.toThrow('different content')
			const records = await redis.xRange(`${namespace}:domain-events`, '-', '+')
			expect(records).toHaveLength(1)
			expect(records[0].message['eventId']).toBe(id)
			expect(JSON.parse(records[0].message['event'])).toEqual(event)
			await expect(adapter.deliver({ ...event, type: 'FoundationCommandAccepted' })).rejects.toThrow('Non-domain event types')
		} finally {
			clearTimeout(liveTimeout)
			await redis.del([`${namespace}:domain-events`, `${namespace}:domain-event-identities`])
			await subscriber.quit()
			await redis.quit()
		}
	})
})
