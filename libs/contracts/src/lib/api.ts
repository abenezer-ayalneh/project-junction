import { z } from 'zod'

import { OwnershipScopeSchema } from './access-context.js'

export const ApiErrorCodeSchema = z.enum([
	'AUTH_REQUIRED',
	'ACCESS_DENIED',
	'IDEMPOTENCY_CONFLICT',
	'INVALID_REQUEST',
	'NOT_FOUND',
	'RATE_LIMITED',
	'UNAVAILABLE',
])

export const ApiErrorSchema = z.object({
	code: ApiErrorCodeSchema,
	message: z.string().min(1),
	requestId: z.string().uuid(),
	retryable: z.boolean(),
	fieldIssues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
})

export type ApiError = z.infer<typeof ApiErrorSchema>

export const IdempotencyKeySchema = z
	.string()
	.trim()
	.min(16)
	.max(200)
	.regex(/^[A-Za-z0-9._:-]+$/, 'must use URL-safe characters')

export const AuditMarkerCommandSchema = z.object({
	marker: z.string().trim().min(1).max(120),
	scope: OwnershipScopeSchema.optional(),
})

export const CommandOutcomeSchema = z.object({
	commandId: z.string().uuid(),
	status: z.literal('accepted'),
	marker: z.string(),
	replayed: z.boolean(),
})

export type CommandOutcome = z.infer<typeof CommandOutcomeSchema>

export const HealthResponseSchema = z.object({
	status: z.literal('ok'),
	service: z.literal('api'),
	runtimeMode: z.literal('synthetic'),
	storage: z.enum(['in-memory-test-double', 'postgresql']),
	requestId: z.string().uuid(),
})
