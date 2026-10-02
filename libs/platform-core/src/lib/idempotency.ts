import { createHash } from 'node:crypto'

export class IdempotencyConflictError extends Error {
	readonly code = 'IDEMPOTENCY_CONFLICT'

	constructor() {
		super('This idempotency key was already used with a different request.')
		this.name = 'IdempotencyConflictError'
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
