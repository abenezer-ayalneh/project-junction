import type { DomainEvent } from 'contracts'
import { type ExternalEffectAdapter, stableHash } from 'platform-core'

interface RedisScriptClient {
	eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>
}

// XADD and the replay identity must commit together. A retry after a PostgreSQL
// acknowledgement failure returns the original result without appending twice.
const appendOnce = `
local previous = redis.call('HGET', KEYS[1], ARGV[1])
if previous then
  if previous ~= ARGV[2] then return redis.error_reply('event identity reused with different content') end
  return 1
end
redis.call('XADD', KEYS[2], '*', 'eventId', ARGV[1], 'event', ARGV[3])
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
return 0
`

export class RedisEventStreamAdapter implements ExternalEffectAdapter {
	constructor(
		private readonly redis: RedisScriptClient,
		private readonly namespace = 'junction:staging',
	) {}

	async deliver(event: DomainEvent): Promise<{ duplicate: boolean }> {
		if (['FoundationCommandAccepted', 'ProviderCallbackReceived', 'ProviderTimeoutReconciled', 'DemoWorkspaceExpired'].includes(event.type)) {
			throw new Error('Synthetic event types cannot enter the staging stream.')
		}
		const result = await this.redis.eval(appendOnce, {
			keys: [`${this.namespace}:domain-event-identities`, `${this.namespace}:domain-events`],
			arguments: [event.eventId, stableHash(event), JSON.stringify(event)],
		})
		if (result !== 0 && result !== 1) throw new Error('Unexpected Redis stream append result.')
		return { duplicate: result === 1 }
	}
}
