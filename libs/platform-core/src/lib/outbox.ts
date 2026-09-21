import { createHash, randomUUID } from 'node:crypto'

import type { DomainEvent } from 'contracts'

export type DeliveryState = 'pending' | 'in_flight' | 'delivered' | 'dead_letter'

export interface OutboxRecord {
	id: string
	event: DomainEvent
	state: DeliveryState
	attempts: number
	claimedBy: string | null
}

export class InMemoryOutbox {
	private readonly records: OutboxRecord[] = []

	publish(event: DomainEvent): OutboxRecord {
		const record = { id: randomUUID(), event, state: 'pending' as const, attempts: 0, claimedBy: null }
		this.records.push(record)
		return record
	}

	claim(workerId: string): OutboxRecord | undefined {
		const record = this.records.find((candidate) => candidate.state === 'pending')
		if (!record) return undefined
		record.state = 'in_flight'
		record.claimedBy = workerId
		record.attempts += 1
		return { ...record }
	}

	complete(recordId: string, workerId: string): void {
		const record = this.requireClaim(recordId, workerId)
		record.state = 'delivered'
		record.claimedBy = null
	}

	fail(recordId: string, workerId: string, maxAttempts = 3): void {
		const record = this.requireClaim(recordId, workerId)
		record.state = record.attempts >= maxAttempts ? 'dead_letter' : 'pending'
		record.claimedBy = null
	}

	snapshot(): readonly OutboxRecord[] {
		return this.records.map((record) => ({ ...record }))
	}

	private requireClaim(recordId: string, workerId: string): OutboxRecord {
		const record = this.records.find((candidate) => candidate.id === recordId)
		if (!record || record.state !== 'in_flight' || record.claimedBy !== workerId) {
			throw new Error('Outbox record is not claimed by this worker.')
		}
		return record
	}
}

export interface InboxResult<T> {
	duplicate: boolean
	result: T | undefined
}

export class ProviderInbox {
	private readonly processed = new Map<string, string>()

	receive<T>(provider: string, eventId: string, payload: unknown, handler: () => T): InboxResult<T> {
		const key = `${provider}:${eventId}`
		const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
		const priorFingerprint = this.processed.get(key)

		if (priorFingerprint) {
			if (priorFingerprint !== fingerprint) {
				throw new Error('Provider event identifier was reused with a different payload.')
			}
			return { duplicate: true, result: undefined }
		}

		const result = handler()
		this.processed.set(key, fingerprint)
		return { duplicate: false, result }
	}
}
