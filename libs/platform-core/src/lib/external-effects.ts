import type { DomainEvent } from 'contracts'

import type { PrismaClient } from '../../generated/prisma/index.js'
import { stableHash } from './idempotency.js'

export interface ExternalEffectAdapter {
	deliver(event: DomainEvent): Promise<{ duplicate: boolean }>
}

/** Local receiver substitute: its write commits before, and apart from, outbox acknowledgement. */
export class FakeExternalEffectAdapter implements ExternalEffectAdapter {
	constructor(private readonly db: PrismaClient) {}

	async deliver(event: DomainEvent): Promise<{ duplicate: boolean }> {
		if (event.type !== 'FoundationCommandAccepted') throw new Error('Unsupported synthetic external effect.')
		const idempotencyKey = `foundation:${event.eventId}`
		const payloadHash = stableHash(event)
		const inserted = await this.db.syntheticExternalEffect.createMany({
			data: { idempotencyKey, eventId: event.eventId, workspaceId: event.workspaceId, payloadHash },
			skipDuplicates: true,
		})
		const stored = await this.db.syntheticExternalEffect.findUnique({ where: { idempotencyKey } })
		if (!stored || stored.eventId !== event.eventId || stored.workspaceId !== event.workspaceId || stored.payloadHash !== payloadHash)
			throw new Error('Synthetic external effect identity was reused with different content.')
		return { duplicate: inserted.count === 0 }
	}
}
