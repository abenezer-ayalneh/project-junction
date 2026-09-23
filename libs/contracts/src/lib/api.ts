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

export const InventoryMovementCommandSchema = z
	.object({
		locationId: z.string().uuid(),
		listingId: z.string().uuid(),
		sku: z.string().trim().min(1).max(80).optional(),
		reason: z.enum(['received', 'adjusted', 'damaged']),
		quantityDelta: z
			.number()
			.int()
			.min(-2_147_483_648)
			.max(2_147_483_647)
			.refine((value) => value !== 0, 'must not be zero'),
		note: z.string().trim().min(5).max(500).optional(),
	})
	.superRefine((value, ctx) => {
		if (value.reason === 'received' && value.quantityDelta < 1)
			ctx.addIssue({ code: 'custom', path: ['quantityDelta'], message: 'received stock must be positive' })
		if (value.reason === 'damaged' && value.quantityDelta > -1)
			ctx.addIssue({ code: 'custom', path: ['quantityDelta'], message: 'damaged stock must be negative' })
		if (value.reason !== 'received' && !value.note)
			ctx.addIssue({ code: 'custom', path: ['note'], message: 'a reason note is required for adjustments and damage' })
	})

export type InventoryMovementCommand = z.infer<typeof InventoryMovementCommandSchema>

export const InventoryAvailabilityQuerySchema = z.object({
	locationId: z.string().uuid(),
	sku: z.string().trim().min(1).max(80).optional(),
})

export const InventoryAvailabilitySchema = z.object({
	locationId: z.string().uuid(),
	listingId: z.string().uuid(),
	sku: z.string().nullable(),
	onHand: z.number().int().nonnegative(),
	reserved: z.number().int().nonnegative(),
	available: z.number().int().nonnegative(),
})

export const InventoryMovementResultSchema = InventoryAvailabilitySchema.extend({
	movementId: z.string().uuid(),
	reason: z.enum(['received', 'adjusted', 'damaged']),
	quantityDelta: z.number().int(),
	replayed: z.boolean(),
})

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

const ListingKindSchema = z.enum(['product', 'service'])
const ListingCategorySchema = z.enum(['goods', 'home', 'fashion', 'beauty', 'appointment', 'education', 'repair'])

const ListingDraftObjectSchema = z.object({
	kind: ListingKindSchema,
	category: ListingCategorySchema,
	title: z.string().trim().min(3).max(160),
	description: z.string().trim().min(10).max(4000),
	priceCents: z.number().int().positive().max(100_000_000).optional(),
	durationMinutes: z.number().int().min(15).max(480).optional(),
	variants: z
		.array(
			z.object({
				sku: z.string().trim().min(1).max(80),
				label: z.string().trim().min(1).max(120),
				priceCents: z.number().int().positive().max(100_000_000),
			}),
		)
		.min(2)
		.max(100)
		.optional(),
})

export const ListingDraftSchema = ListingDraftObjectSchema.superRefine((value, ctx) => {
	if (value.kind === 'product' && !value.priceCents && !value.variants?.length)
		ctx.addIssue({ code: 'custom', path: ['priceCents'], message: 'price or variants is required for products' })
	if (value.kind !== 'product' && value.variants?.length) ctx.addIssue({ code: 'custom', path: ['variants'], message: 'are only supported for products' })
	if (value.variants && new Set(value.variants.map((variant) => variant.sku)).size !== value.variants.length)
		ctx.addIssue({ code: 'custom', path: ['variants'], message: 'SKUs must be unique per listing' })
	if (value.kind === 'service' && (!value.priceCents || !value.durationMinutes))
		ctx.addIssue({ code: 'custom', path: ['durationMinutes'], message: 'price and fixed duration are required for services' })
})

export type ListingDraft = z.infer<typeof ListingDraftSchema>

export const ListingRevisionCommandSchema = ListingDraftSchema
export type ListingRevisionCommand = z.infer<typeof ListingRevisionCommandSchema>

export const ListingSummarySchema = ListingDraftObjectSchema.extend({
	id: z.string().uuid(),
	state: z.enum(['draft', 'pending_review', 'published', 'rejected', 'unpublished']),
	version: z.number().int().positive(),
})
export type ListingSummary = z.infer<typeof ListingSummarySchema>

export const ListingCommandResultSchema = ListingSummarySchema.extend({ replayed: z.boolean() })
export type ListingCommandResult = z.infer<typeof ListingCommandResultSchema>

export const PublicStorefrontSchema = z.object({
	id: z.string().uuid(),
	slug: z.string().min(1).max(120),
	displayName: z.string().min(3).max(120),
	description: z.string().min(10).max(2000),
	locations: z.array(z.object({ id: z.string().uuid(), label: z.string().min(2).max(120), city: z.string().min(2).max(120) })),
	listings: z.array(ListingSummarySchema),
})

export const ListingReviewCommandSchema = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().min(3).max(1000) })
export const VendorApplicationReviewSchema = z.object({ decision: z.enum(['approve', 'reject', 'restrict']), note: z.string().trim().min(3).max(1000) })
export const VendorApplicationReviewResultSchema = z.object({ vendorId: z.string().uuid(), state: z.enum(['approved', 'rejected', 'restricted']) })
const StorefrontFieldsSchema = z.object({
	displayName: z.string().trim().min(3).max(120),
	slug: z
		.string()
		.trim()
		.min(3)
		.max(120)
		.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
	description: z.string().trim().min(10).max(2000),
})
export const StorefrontUpdateSchema = StorefrontFieldsSchema.partial().refine(
	(value) => Object.values(value).some((field) => field !== undefined),
	'At least one storefront field is required.',
)
export type StorefrontUpdate = z.infer<typeof StorefrontUpdateSchema>
export const StorefrontUpdateResultSchema = z.object({ vendorId: z.string().uuid(), replayed: z.boolean() })
export const VendorApplicationCommandSchema = z.object({
	...StorefrontFieldsSchema.shape,
	location: z.object({
		label: z.string().trim().min(2).max(120),
		city: z.string().trim().min(2).max(120),
		address: z.string().trim().min(5).max(500),
		latitude: z.number().min(-90).max(90).optional(),
		longitude: z.number().min(-180).max(180).optional(),
	}),
})
export const VendorApplicationResultSchema = z.object({
	vendorId: z.string().uuid(),
	locationId: z.string().uuid(),
	sessionId: z.string().uuid(),
	state: z.literal('pending'),
	replayed: z.boolean(),
})

export const PublicListingBrowseQuerySchema = z.object({
	kind: ListingKindSchema.optional(),
	category: ListingCategorySchema.optional(),
	q: z.string().trim().min(1).max(100).optional(),
	cursor: z.string().uuid().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
})
export const PublicListingPageSchema = z.object({ items: z.array(ListingSummarySchema), nextCursor: z.string().uuid().nullable() })
export type PublicListingPage = z.infer<typeof PublicListingPageSchema>

export const MediaProcessingCommandSchema = z.object({
	captionText: z.string().trim().min(1).max(20_000).optional(),
	noSpeechDeclared: z.boolean().default(false),
	description: z.string().trim().min(10).max(1000).optional(),
})
export const MediaAssetSchema = z.object({ id: z.string().uuid(), state: z.enum(['quarantined', 'ready', 'rejected']) })

export const CatalogImportCommandSchema = z.object({
	templateVersion: z.literal('v1'),
	csv: z.string().min(1).max(1_000_000),
	mode: z.enum(['dry_run', 'commit']),
})
export const CatalogImportResultSchema = z.object({
	id: z.string().uuid(),
	state: z.enum(['dry_run', 'committed', 'rejected']),
	rowCount: z.number().int().nonnegative(),
	validRowCount: z.number().int().nonnegative(),
	rowErrors: z.array(z.object({ rowNumber: z.number().int().positive(), errors: z.array(z.string()) })),
	replayed: z.boolean(),
})
export type CatalogImportResult = z.infer<typeof CatalogImportResultSchema>

export const DiscoveryPreferenceUpdateSchema = z.object({ personalizationOptIn: z.boolean() })
export const DiscoveryPreferenceSchema = z.object({ personalizationOptIn: z.boolean() })
export const EngagementMutationSchema = z.object({ saved: z.boolean() })
export const VendorFollowMutationSchema = z.object({ following: z.boolean() })
export const RecommendationSchema = ListingSummarySchema.extend({ reason: z.string().min(1).max(200) })
export const RecommendationPageSchema = z.object({ items: z.array(RecommendationSchema) })

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
