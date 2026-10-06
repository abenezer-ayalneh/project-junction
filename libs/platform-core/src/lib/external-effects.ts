import type { DomainEvent } from 'contracts'

export interface ExternalEffectAdapter {
	deliver(event: DomainEvent): Promise<{ duplicate: boolean }>
}

/** Refuse delivery until the deployed runtime provides an external destination. */
export class UnconfiguredExternalEffectAdapter implements ExternalEffectAdapter {
	deliver(): Promise<{ duplicate: boolean }> {
		return Promise.reject(new Error('A real external effect provider must be configured before this event can be delivered.'))
	}
}
