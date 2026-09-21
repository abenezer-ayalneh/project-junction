import { createHash } from 'node:crypto'

export class IdempotencyConflictError extends Error {
	readonly code = 'IDEMPOTENCY_CONFLICT'

	constructor() {
		super('This idempotency key was already used with a different request.')
		this.name = 'IdempotencyConflictError'
	}
}

export interface IdempotencyScope {
	actorId: string
	workspaceId: string
	vendorId: string | null
}

export interface IdempotencyResult<T> {
	outcome: T
	replayed: boolean
}

interface StoredOutcome {
	requestHash: string
	outcome: unknown
}

export class IdempotencyStore {
	private readonly records = new Map<string, StoredOutcome>()

	execute<T>(key: string, scope: IdempotencyScope, request: unknown, effect: () => T): IdempotencyResult<T> {
		const recordKey = `${stableHash(scope)}:${key}`
		const requestHash = stableHash(request)
		const stored = this.records.get(recordKey)

		if (stored) {
			if (stored.requestHash !== requestHash) throw new IdempotencyConflictError()
			return { outcome: stored.outcome as T, replayed: true }
		}

		const outcome = effect()
		this.records.set(recordKey, { requestHash, outcome })
		return { outcome, replayed: false }
	}
}

export function stableHash(value: unknown): string {
	return createHash('sha256').update(canonicalize(value)).digest('hex')
}

function canonicalize(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`

	const entries = Object.entries(value as Record<string, unknown>)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
	return `{${entries.join(',')}}`
}
