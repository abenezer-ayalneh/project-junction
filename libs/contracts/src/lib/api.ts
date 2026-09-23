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

export const AccessContextResponseSchema = z.object({
	actor: z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('user'), userId: z.string().uuid() }),
		z.object({ kind: z.literal('demo_persona'), personaId: z.string().uuid() }),
	]),
	workspaceId: z.string().uuid(),
	activeVendorId: z.string().uuid().nullable(),
	locationIds: z.array(z.string().uuid()),
	capabilities: z.array(z.string()),
})

export type AccessContextResponse = z.infer<typeof AccessContextResponseSchema>

export const LocationReadSchema = z.object({
	id: z.string().uuid(),
	vendorId: z.string().uuid(),
	workspaceId: z.string().uuid(),
})

export type LocationRead = z.infer<typeof LocationReadSchema>

export const PublicVendorBrowseQuerySchema = z.object({
	cursor: z.string().uuid().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type PublicVendorBrowseQuery = z.infer<typeof PublicVendorBrowseQuerySchema>

export const PublicVendorSummarySchema = z.object({
	id: z.string().uuid(),
	slug: z.string().min(1).max(120),
})

export type PublicVendorSummary = z.infer<typeof PublicVendorSummarySchema>

export const PublicVendorPageSchema = z.object({
	items: z.array(PublicVendorSummarySchema),
	nextCursor: z.string().uuid().nullable(),
})

export type PublicVendorPage = z.infer<typeof PublicVendorPageSchema>

export const ProviderWebhookReceiptSchema = z.object({
	accepted: z.literal(true),
	duplicate: z.boolean(),
})

export type ProviderWebhookReceipt = z.infer<typeof ProviderWebhookReceiptSchema>

export const SyntheticProviderCallbackSchema = z.object({
	providerReference: z.string().trim().min(1).max(200),
	outcome: z.enum(['confirmed', 'timed_out']),
})

export type SyntheticProviderCallback = z.infer<typeof SyntheticProviderCallbackSchema>

export const DemoPersonaKeySchema = z.enum(['customer', 'vendor_owner', 'service_staff', 'support', 'trust', 'finance', 'platform_owner'])

export type DemoPersonaKey = z.infer<typeof DemoPersonaKeySchema>

export const DemoPersonaSchema = z.object({
	key: DemoPersonaKeySchema,
	role: z.string().min(1),
})

export type DemoPersona = z.infer<typeof DemoPersonaSchema>

export const DemoSessionSchema = z.object({
	id: z.string().uuid(),
	personaKey: DemoPersonaKeySchema,
	expiresAt: z.string().datetime(),
})

export type DemoSession = z.infer<typeof DemoSessionSchema>

export const DemoWorkspaceSchema = z.object({
	id: z.string().uuid(),
	createdAt: z.string().datetime(),
	expiresAt: z.string().datetime(),
	state: z.enum(['active', 'purged']),
	personas: z.array(DemoPersonaSchema).min(1),
	session: DemoSessionSchema,
})

export type DemoWorkspace = z.infer<typeof DemoWorkspaceSchema>

export const SyntheticAccountProvisionSchema = z.object({
	email: z.string().email().endsWith('@example.invalid'),
	adultVerificationState: z.enum(['verified', 'pending', 'rejected']),
})

export const SyntheticAccountSchema = z.object({
	id: z.string().uuid(),
	email: z.string().email(),
	adultVerificationState: z.enum(['verified', 'pending', 'rejected']),
})

export const SyntheticStaffGrantSchema = z.object({
	userId: z.string().uuid(),
	locationIds: z.array(z.string().uuid()).min(1).max(100),
})

export const SyntheticStaffGrantResultSchema = z.object({
	staffId: z.string().uuid(),
	userId: z.string().uuid(),
	sessionId: z.string().uuid(),
	expiresAt: z.string().datetime(),
})

export const SyntheticStaffRevokeResultSchema = z.object({ revoked: z.literal(true) })

export const RealtimeRoomSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('workspace'), workspaceId: z.string().uuid() }),
	z.object({ kind: z.literal('vendor'), workspaceId: z.string().uuid(), vendorId: z.string().uuid() }),
	z.object({ kind: z.literal('location'), workspaceId: z.string().uuid(), vendorId: z.string().uuid(), locationId: z.string().uuid() }),
])

export type RealtimeRoom = z.infer<typeof RealtimeRoomSchema>

export const RealtimeJoinRequestSchema = z.object({
	room: RealtimeRoomSchema,
	cursor: z.string().uuid().optional(),
})

export type RealtimeJoinRequest = z.infer<typeof RealtimeJoinRequestSchema>

export const RealtimeEventTypeSchema = z.enum(['FoundationCommandAccepted', 'ProviderCallbackReceived', 'ProviderTimeoutReconciled', 'DemoWorkspaceExpired'])

export const RealtimeFoundationEventSchema = z.object({
	eventId: z.string().uuid(),
	type: RealtimeEventTypeSchema,
	schemaVersion: z.literal(1),
	cursor: z.string().uuid(),
	occurredAt: z.string().datetime(),
	scope: z.object({ workspaceId: z.string().uuid() }),
	payload: z.object({}),
})

export type RealtimeFoundationEvent = z.infer<typeof RealtimeFoundationEventSchema>

export const RealtimeJoinResultSchema = z.discriminatedUnion('joined', [
	z.object({
		joined: z.literal(true),
		room: RealtimeRoomSchema,
		cursor: z.string().uuid().nullable(),
		events: z.array(RealtimeFoundationEventSchema),
		restRefetchRequired: z.boolean(),
	}),
	z.object({ joined: z.literal(false) }),
])

export type RealtimeJoinResult = z.infer<typeof RealtimeJoinResultSchema>

export const HealthResponseSchema = z.object({
	status: z.literal('ok'),
	service: z.literal('api'),
	runtimeMode: z.literal('synthetic'),
	storage: z.enum(['in-memory-test-double', 'postgresql']),
	requestId: z.string().uuid(),
})
