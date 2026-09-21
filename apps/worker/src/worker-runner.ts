import { InMemoryOutbox } from 'platform-core'

export class WorkerRunner {
	constructor(
		private readonly workerId: string,
		private readonly outbox = new InMemoryOutbox(),
	) {}

	processOne(): { processed: boolean; eventId?: string } {
		const record = this.outbox.claim(this.workerId)
		if (!record) return { processed: false }

		this.outbox.complete(record.id, this.workerId)
		return { processed: true, eventId: record.event.eventId }
	}
}
