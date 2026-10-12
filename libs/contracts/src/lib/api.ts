import { z } from 'zod'

import { OwnershipScopeSchema } from './access-context.js'
import { DomainEventSchema } from './events.js'

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
	actor: z.object({ kind: z.literal('user'), userId: z.string().uuid() }),
	workspaceId: z.string().uuid(),
	activeVendorId: z.string().uuid().nullable(),
	locationIds: z.array(z.string().uuid()),
	capabilities: z.array(z.string()),
})

export type AccessContextResponse = z.infer<typeof AccessContextResponseSchema>

export const VendorMembershipsSchema = z.object({
	activeVendorId: z.string().uuid().nullable(),
	items: z.array(z.object({ vendorId: z.string().uuid(), displayName: z.string().min(1), active: z.boolean() })),
})

export const ActiveVendorSelectionSchema = z.object({ vendorId: z.string().uuid().nullable() })
export const ActiveVendorSelectionResultSchema = z.object({ activeVendorId: z.string().uuid().nullable() })

export const IdentityVerificationSessionSchema = z.object({
	url: z.string().url().max(2048),
	sessionId: z.string().min(1).max(200),
})

export const IdentityVerificationStatusSchema = z.object({
	status: z.enum(['unverified', 'verified', 'rejected']),
})

export type IdentityVerificationStatus = z.infer<typeof IdentityVerificationStatusSchema>

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

// Public stock checks are advisory; only an accepted checkout hold reserves stock.
export const PublicProductAvailabilityQuerySchema = InventoryAvailabilityQuerySchema.extend({
	quantity: z.coerce.number().int().min(1).max(2_147_483_647).default(1),
}).strict()

export const PublicProductAvailabilitySchema = z
	.object({
		listingId: z.string().uuid(),
		locationId: z.string().uuid(),
		sku: z.string().nullable(),
		available: z.number().int().nonnegative(),
		requestedQuantity: z.number().int().positive(),
		canFulfill: z.boolean(),
		checkedAt: z.string().datetime(),
	})
	.strict()

export const InventoryMovementResultSchema = InventoryAvailabilitySchema.extend({
	movementId: z.string().uuid(),
	reason: z.enum(['received', 'adjusted', 'damaged']),
	quantityDelta: z.number().int(),
	replayed: z.boolean(),
})

export const InventoryTransferCommandSchema = z
	.object({
		sourceLocationId: z.string().uuid(),
		destinationLocationId: z.string().uuid(),
		listingId: z.string().uuid(),
		sku: z.string().trim().min(1).max(80).optional(),
		quantity: z.number().int().min(1).max(2_147_483_647),
		note: z.string().trim().min(5).max(500),
	})
	.refine((value) => value.sourceLocationId !== value.destinationLocationId, {
		path: ['destinationLocationId'],
		message: 'Choose a different destination Location.',
	})

export const InventoryTransferResultSchema = z.object({
	transferId: z.string().uuid(),
	sourceMovementId: z.string().uuid(),
	destinationMovementId: z.string().uuid(),
	source: InventoryAvailabilitySchema,
	destination: InventoryAvailabilitySchema,
	quantity: z.number().int().positive(),
	replayed: z.boolean(),
})

const GoodsMoneySchema = z.number().int().min(0).max(2_147_483_647)
const GoodsPointSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
export const GoodsDeliveryZoneSchema = z
	.object({
		id: z.string().uuid(),
		label: z.string().trim().min(1).max(80),
		polygon: z.array(GoodsPointSchema).min(4).max(100),
		feeCents: GoodsMoneySchema,
		minimumCents: GoodsMoneySchema,
		freeDeliveryThresholdCents: GoodsMoneySchema.nullable(),
		etaMinutes: z.number().int().min(1).max(10080),
	})
	.strict()
	.refine(({ polygon }) => polygon[0][0] === polygon[polygon.length - 1][0] && polygon[0][1] === polygon[polygon.length - 1][1], {
		path: ['polygon'],
		message: 'Close the polygon with its first point.',
	})
export const GoodsLocationConfigurationSchema = z
	.object({
		pickupEnabled: z.boolean(),
		returnTemplate: z.enum(['standard', 'flexible']),
		deliveryZones: z.array(GoodsDeliveryZoneSchema).max(20),
	})
	.strict()
	.refine(({ deliveryZones }) => new Set(deliveryZones.map(({ id }) => id)).size === deliveryZones.length, {
		path: ['deliveryZones'],
		message: 'Zone IDs must be unique.',
	})
export const GoodsLocationConfigurationCommandSchema = z
	.object({
		expectedVersion: z.number().int().nonnegative(),
		configuration: GoodsLocationConfigurationSchema,
	})
	.strict()
export const GoodsLocationConfigurationResultSchema = z
	.object({
		locationId: z.string().uuid(),
		version: z.number().int().nonnegative(),
		configuration: GoodsLocationConfigurationSchema.nullable(),
		replayed: z.boolean(),
	})
	.strict()
export const GoodsAddressSnapshotSchema = z
	.object({
		contactName: z.string().trim().min(1).max(120),
		phone: z.string().trim().min(5).max(40),
		locality: z.string().trim().min(1).max(120),
		address: z.string().trim().min(1).max(300),
		instructions: z.string().trim().max(500).optional(),
		point: GoodsPointSchema,
	})
	.strict()
export const GoodsFulfillmentSelectionSchema = z.discriminatedUnion('method', [
	z.object({ method: z.literal('pickup') }).strict(),
	z.object({ method: z.literal('delivery'), zoneId: z.string().uuid(), address: GoodsAddressSnapshotSchema }).strict(),
])
export const GoodsQuoteLineSelectionSchema = z
	.object({
		listingId: z.string().uuid(),
		sku: z.string().trim().min(1).max(80).optional(),
		quantity: z.number().int().min(1).max(2_147_483_647),
	})
	.strict()
export const GoodsQuoteCommandSchema = z
	.object({
		groups: z
			.array(
				z
					.object({
						vendorId: z.string().uuid(),
						locationId: z.string().uuid(),
						fulfillment: GoodsFulfillmentSelectionSchema,
						lines: z.array(GoodsQuoteLineSelectionSchema).min(1).max(50),
					})
					.strict(),
			)
			.min(1)
			.max(10),
	})
	.strict()
	.superRefine(({ groups }, ctx) => {
		if (new Set(groups.map(({ vendorId }) => vendorId)).size !== groups.length)
			ctx.addIssue({ code: 'custom', path: ['groups'], message: 'Select one Location and fulfillment method per Vendor.' })
		for (const [index, group] of groups.entries()) {
			const keys = group.lines.map(({ listingId, sku }) => JSON.stringify([listingId, sku ?? null]))
			if (new Set(keys).size !== keys.length)
				ctx.addIssue({ code: 'custom', path: ['groups', index, 'lines'], message: 'Combine duplicate line quantities.' })
		}
	})
export type GoodsQuoteCommand = z.infer<typeof GoodsQuoteCommandSchema>
export const GoodsPolicySnapshotSchema = z
	.object({
		returnTemplate: z.enum(['standard', 'flexible']),
		changeOfMindDays: z.union([z.literal(7), z.literal(14)]),
		faultProtectionDays: z.literal(30),
		restockingFeeCents: z.literal(0),
		startsAt: z.literal('verified_handoff'),
	})
	.strict()
export const GoodsQuoteSnapshotSchema = z
	.object({
		currency: z.literal('ETB'),
		totalCents: GoodsMoneySchema,
		groups: z
			.array(
				z
					.object({
						vendorId: z.string().uuid(),
						locationId: z.string().uuid(),
						configurationVersion: z.number().int().positive(),
						fulfillment: GoodsFulfillmentSelectionSchema,
						deliveryZone: GoodsDeliveryZoneSchema.nullable(),
						deliveryFeeCents: GoodsMoneySchema,
						etaMinutes: z.number().int().positive().nullable(),
						pickupWindowHours: z.literal(72).nullable(),
						pickupGraceHours: z.literal(48).nullable(),
						failedDeliveryRetryHours: z.literal(48).nullable(),
						lines: z
							.array(
								z
									.object({
										listingId: z.string().uuid(),
										listingVersion: z.number().int().positive(),
										sku: z.string().nullable(),
										quantity: z.number().int().positive(),
										unitPriceCents: GoodsMoneySchema,
										subtotalCents: GoodsMoneySchema,
										policy: GoodsPolicySnapshotSchema,
									})
									.strict(),
							)
							.min(1),
					})
					.strict(),
			)
			.min(1),
	})
	.strict()
export type GoodsQuoteSnapshot = z.infer<typeof GoodsQuoteSnapshotSchema>
export const GoodsQuoteResultSchema = z
	.object({
		quoteId: z.string().uuid(),
		expiresAt: z.string().datetime(),
		snapshot: GoodsQuoteSnapshotSchema,
		replayed: z.boolean(),
	})
	.strict()
export const GoodsHoldCommandSchema = z.object({ quoteId: z.string().uuid() }).strict()
export const GoodsHoldResultSchema = z
	.object({
		holdId: z.string().uuid(),
		quoteId: z.string().uuid(),
		expiresAt: z.string().datetime(),
		currency: z.literal('ETB'),
		totalCents: GoodsMoneySchema,
		replayed: z.boolean(),
	})
	.strict()
export const GoodsHoldReadSchema = GoodsHoldResultSchema.omit({ replayed: true }).extend({
	state: z.enum(['holding', 'awaiting_payment', 'committed', 'released', 'expired', 'compensating']),
	snapshot: GoodsQuoteSnapshotSchema,
})
export const GoodsHoldReleaseResultSchema = z
	.object({
		holdId: z.string().uuid(),
		state: z.enum(['released', 'expired']),
		replayed: z.boolean(),
	})
	.strict()

export const PublicVendorBrowseQuerySchema = z.object({
	cursor: z.string().uuid().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type PublicVendorBrowseQuery = z.infer<typeof PublicVendorBrowseQuerySchema>

export const PublicVendorSummarySchema = z.object({
	id: z.string().uuid(),
	slug: z.string().min(1).max(120),
	displayName: z.string().min(3).max(120),
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

export const ListingRevisionCommandSchema = ListingDraftSchema.and(z.object({ expectedVersion: z.number().int().positive() }))
export type ListingRevisionCommand = z.infer<typeof ListingRevisionCommandSchema>

export const ListingSummarySchema = ListingDraftObjectSchema.extend({
	id: z.string().uuid(),
	state: z.enum(['draft', 'pending_review', 'published', 'rejected', 'unpublished']),
	version: z.number().int().positive(),
	shortVideo: z.object({ id: z.string().uuid(), description: z.string().nullable(), hasCaptions: z.boolean() }).optional(),
	images: z.array(
		z.object({ id: z.string().uuid(), alt: z.string().min(3).max(1000), width: z.number().int().positive(), height: z.number().int().positive() }),
	),
})
export type ListingSummary = z.infer<typeof ListingSummarySchema>

export const PublicListingVendorSchema = z.object({
	id: z.string().uuid(),
	slug: z.string().min(1).max(120),
	displayName: z.string().min(3).max(120),
})

export const PublicListingSummarySchema = ListingSummarySchema.extend({ vendor: PublicListingVendorSchema })
export type PublicListingSummary = z.infer<typeof PublicListingSummarySchema>

export const PublicListingDetailSchema = PublicListingSummarySchema.extend({
	locations: z.array(
		z.object({
			id: z.string().uuid(),
			label: z.string().min(2).max(120),
			city: z.string().min(2).max(120),
			goodsConfiguration: GoodsLocationConfigurationSchema.nullable().optional(),
		}),
	),
})
export type PublicListingDetail = z.infer<typeof PublicListingDetailSchema>

export const ListingCommandResultSchema = ListingSummarySchema.extend({ replayed: z.boolean() })
export type ListingCommandResult = z.infer<typeof ListingCommandResultSchema>

export const PublicStorefrontSchema = z.object({
	id: z.string().uuid(),
	slug: z.string().min(1).max(120),
	displayName: z.string().min(3).max(120),
	description: z.string().min(10).max(2000),
	logoImage: z
		.object({ id: z.string().uuid(), alt: z.string().min(3).max(1000), width: z.number().int().positive(), height: z.number().int().positive() })
		.optional(),
	coverImage: z
		.object({ id: z.string().uuid(), alt: z.string().min(3).max(1000), width: z.number().int().positive(), height: z.number().int().positive() })
		.optional(),
	locations: z.array(z.object({ id: z.string().uuid(), label: z.string().min(2).max(120), city: z.string().min(2).max(120) })),
	listings: z.array(ListingSummarySchema),
})

export const VendorCatalogSchema = z.object({
	id: z.string().uuid(),
	applicationState: z.enum(['pending', 'approved', 'rejected', 'restricted']),
	slug: z.string().nullable(),
	displayName: z.string().nullable(),
	description: z.string().nullable(),
	logoImage: z
		.object({ id: z.string().uuid(), alt: z.string().min(3).max(1000), width: z.number().int().positive(), height: z.number().int().positive() })
		.nullable(),
	coverImage: z
		.object({ id: z.string().uuid(), alt: z.string().min(3).max(1000), width: z.number().int().positive(), height: z.number().int().positive() })
		.nullable(),
	locations: z.array(z.object({ id: z.string().uuid(), label: z.string().nullable(), city: z.string().nullable(), address: z.string().nullable() })),
	listings: z.array(ListingSummarySchema),
})
export type VendorCatalog = z.infer<typeof VendorCatalogSchema>

export const PlatformReviewQueueQuerySchema = z.object({
	applicationCursor: z.string().uuid().optional(),
	listingCursor: z.string().uuid().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const PlatformReviewQueueSchema = z.object({
	applications: z.array(
		z.object({
			id: z.string().uuid(),
			slug: z.string().nullable(),
			displayName: z.string().nullable(),
			description: z.string().nullable(),
			locations: z.array(z.object({ label: z.string().nullable(), city: z.string().nullable(), address: z.string().nullable() })),
		}),
	),
	listings: z.array(
		z.object({
			vendorId: z.string().uuid(),
			vendorName: z.string().nullable(),
			listing: ListingSummarySchema,
		}),
	),
	applicationsNextCursor: z.string().uuid().nullable(),
	listingsNextCursor: z.string().uuid().nullable(),
})
export type PlatformReviewQueue = z.infer<typeof PlatformReviewQueueSchema>

export const CatalogHealthSchema = z.object({
	publishedListings: z.number().int().nonnegative(),
	projectedListings: z.number().int().nonnegative(),
	laggingListings: z.number().int().nonnegative(),
	oldestLagSeconds: z.number().nonnegative(),
	reviewEvents: z.number().int().nonnegative(),
	pendingReviews: z.number().int().nonnegative(),
	oldestReviewLagSeconds: z.number().nonnegative(),
	importJobs: z.number().int().nonnegative(),
	importDryRuns: z.number().int().nonnegative(),
	oldestImportDryRunSeconds: z.number().nonnegative(),
	mediaPending: z.number().int().nonnegative(),
	mediaDeadLetters: z.number().int().nonnegative(),
	checkedAt: z.string().datetime(),
})
export type CatalogHealth = z.infer<typeof CatalogHealthSchema>

export const ListingReviewCommandSchema = z.object({
	decision: z.enum(['approve', 'reject']),
	expectedVersion: z.number().int().positive(),
	note: z.string().trim().min(3).max(1000),
})
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
export const StorefrontUpdateSchema = StorefrontFieldsSchema.partial()
	.extend({ logoMediaId: z.string().uuid().nullable().optional(), coverMediaId: z.string().uuid().nullable().optional() })
	.refine((value) => Object.values(value).some((field) => field !== undefined), 'At least one storefront field is required.')
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
	sessionId: z.string().uuid().optional(),
	state: z.literal('pending'),
	replayed: z.boolean(),
})

export const PublicListingBrowseQuerySchema = z
	.object({
		kind: ListingKindSchema.optional(),
		category: ListingCategorySchema.optional(),
		q: z.string().trim().min(1).max(100).optional(),
		vendor: z
			.string()
			.trim()
			.min(3)
			.max(120)
			.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
			.optional(),
		minPriceCents: z.coerce.number().int().positive().max(100_000_000).optional(),
		maxPriceCents: z.coerce.number().int().positive().max(100_000_000).optional(),
		sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
		cursor: z.string().uuid().optional(),
		limit: z.coerce.number().int().min(1).max(100).default(20),
	})
	.superRefine((value, ctx) => {
		if (value.minPriceCents !== undefined && value.maxPriceCents !== undefined && value.minPriceCents > value.maxPriceCents)
			ctx.addIssue({ code: 'custom', path: ['maxPriceCents'], message: 'must be greater than or equal to minPriceCents' })
	})
export const PublicListingPageSchema = z.object({
	items: z.array(PublicListingSummarySchema),
	nextCursor: z.string().uuid().nullable(),
	total: z.number().int().nonnegative(),
})
export type PublicListingPage = z.infer<typeof PublicListingPageSchema>

export const Phase01MediaLimits = {
	maxUploadBytes: 25 * 1024 * 1024,
	maxDurationSeconds: 30,
	maxSourceWidth: 1920,
	maxSourceHeight: 1080,
	maxProcessedLongEdge: 1280,
	maxProcessedShortEdge: 720,
	maxCaptionBytes: 100 * 1024,
	uploadIntentSeconds: 10 * 60,
} as const

export const Phase01ImageLimits = {
	maxUploadBytes: 10 * 1024 * 1024,
	maxSourceWidth: 4096,
	maxSourceHeight: 4096,
	maxProcessedLongEdge: 1600,
	uploadIntentSeconds: 10 * 60,
} as const

export const MediaProcessingCommandSchema = z.object({
	captionText: z
		.string()
		.refine((value) => new TextEncoder().encode(value).length <= Phase01MediaLimits.maxCaptionBytes, 'WebVTT exceeds 100 KiB')
		.refine((value) => /^WEBVTT(?:\s|$)/.test(value) && /\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}/.test(value), 'A WebVTT cue is required')
		.optional(),
	noSpeechDeclared: z.boolean().default(false),
	description: z.string().trim().min(10).max(1000).optional(),
})
export const MediaAssetSchema = z.object({ id: z.string().uuid(), state: z.enum(['pending_upload', 'quarantined', 'needs_moderation', 'ready', 'rejected']) })

export const MediaReviewQueueQuerySchema = z.object({ cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) })
export const MediaReviewQueueSchema = z.object({
	items: z.array(
		z.object({
			id: z.string().uuid(),
			kind: z.enum(['short_video', 'listing_image']),
			listingId: z.string().uuid(),
			listingTitle: z.string(),
			vendorName: z.string().nullable(),
			version: z.number().int().positive(),
			durationSeconds: z.number().positive().nullable(),
			outputWidth: z.number().int().positive(),
			outputHeight: z.number().int().positive(),
			captioned: z.boolean(),
			noSpeechDeclared: z.boolean(),
			description: z.string().nullable(),
		}),
	),
	nextCursor: z.string().uuid().nullable(),
})
export type MediaReviewQueue = z.infer<typeof MediaReviewQueueSchema>

export const MediaReviewCommandSchema = z.object({
	decision: z.enum(['approve', 'reject']),
	expectedVersion: z.number().int().positive(),
	note: z.string().trim().min(3).max(1000),
})
export const MediaRetentionHoldCommandSchema = z.object({
	expectedVersion: z.number().int().positive(),
	held: z.boolean(),
	reason: z.string().trim().min(3).max(1000),
})
export const MediaRetentionResultSchema = z.object({
	mediaId: z.string().uuid(),
	version: z.number().int().positive(),
	held: z.boolean(),
	dueAt: z.string().datetime().nullable(),
	deletedAt: z.string().datetime().nullable(),
})
export const MediaReviewResultSchema = z.object({
	id: z.string().uuid(),
	state: z.enum(['ready', 'rejected']),
	version: z.number().int().positive(),
	replayed: z.boolean(),
})

export const MediaPreviewSchema = z.object({
	mediaId: z.string().uuid(),
	kind: z.enum(['short_video', 'listing_image']),
	videoUrl: z.string().url().nullable(),
	posterUrl: z.string().url().nullable(),
	imageUrl: z.string().url().nullable(),
	captionText: z.string().nullable(),
	noSpeechDeclared: z.boolean(),
	description: z.string().nullable(),
	expiresAt: z.string().datetime(),
})
export type MediaPreview = z.infer<typeof MediaPreviewSchema>

export const MediaUploadIntentCommandSchema = MediaProcessingCommandSchema.extend({
	bytes: z.number().int().min(1).max(Phase01MediaLimits.maxUploadBytes),
	sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).superRefine((value, ctx) => {
	if (!value.captionText && !(value.noSpeechDeclared && value.description))
		ctx.addIssue({ code: 'custom', path: ['captionText'], message: 'WebVTT captions or a no-speech description are required' })
})

export const MediaUploadIntentSchema = z.object({
	mediaId: z.string().uuid(),
	state: z.literal('pending_upload'),
	url: z.string().url(),
	method: z.literal('PUT'),
	headers: z.record(z.string(), z.string()),
	expiresAt: z.string().datetime(),
	replayed: z.boolean(),
})

export const MediaUploadCompleteCommandSchema = z.object({ sha256: z.string().regex(/^[0-9a-f]{64}$/) })

export const ImageUploadIntentCommandSchema = z.object({
	alt: z.string().trim().min(3).max(1000),
	bytes: z.number().int().min(1).max(Phase01ImageLimits.maxUploadBytes),
	contentType: z.enum(['image/jpeg', 'image/png']),
	sha256: z.string().regex(/^[0-9a-f]{64}$/),
})
export const ImageUploadIntentSchema = MediaUploadIntentSchema

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
	rows: z.array(
		z.object({
			rowNumber: z.number().int().positive(),
			status: z.enum(['valid', 'error', 'committed']),
			preview: z.record(z.string(), z.unknown()),
			errors: z.array(z.string()),
		}),
	),
	replayed: z.boolean(),
})
export type CatalogImportResult = z.infer<typeof CatalogImportResultSchema>

export const DiscoveryPreferenceUpdateSchema = z.object({ personalizationOptIn: z.boolean() })
export const DiscoveryPreferenceSchema = z.object({ personalizationOptIn: z.boolean() })
export const CustomerDiscoveryStateSchema = z.object({
	personalizationOptIn: z.boolean(),
	savedListingIds: z.array(z.string().uuid()),
	followedVendorIds: z.array(z.string().uuid()),
})
export type CustomerDiscoveryState = z.infer<typeof CustomerDiscoveryStateSchema>
export const EngagementMutationSchema = z.object({ saved: z.boolean() })
export const VendorFollowMutationSchema = z.object({ following: z.boolean() })
export const RecommendationSchema = ListingSummarySchema.extend({ reason: z.string().min(1).max(200) })
export const RecommendationPageSchema = z.object({ items: z.array(RecommendationSchema) })
export type RecommendationPage = z.infer<typeof RecommendationPageSchema>

export const ProviderWebhookReceiptSchema = z.object({
	accepted: z.literal(true),
	duplicate: z.boolean(),
})

export type ProviderWebhookReceipt = z.infer<typeof ProviderWebhookReceiptSchema>

export const RealtimeRoomSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('workspace'), workspaceId: z.string().uuid() }),
	z.object({ kind: z.literal('vendor'), workspaceId: z.string().uuid(), vendorId: z.string().uuid() }),
	z.object({ kind: z.literal('location'), workspaceId: z.string().uuid(), vendorId: z.string().uuid(), locationId: z.string().uuid() }),
])

export type RealtimeRoom = z.infer<typeof RealtimeRoomSchema>

export const RealtimeJoinRequestSchema = z.object({
	room: RealtimeRoomSchema,
})

export type RealtimeJoinRequest = z.infer<typeof RealtimeJoinRequestSchema>

export const RealtimeCursorAckSchema = z.object({ cursor: z.string().uuid() })
export type RealtimeCursorAck = z.infer<typeof RealtimeCursorAckSchema>

export const RealtimeEventTypeSchema = DomainEventSchema.shape.type

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
	runtimeMode: z.enum(['local', 'staging']),
	storage: z.literal('postgresql'),
	requestId: z.string().uuid(),
})

// Private operational journal: persisted independently of database PITR.
export const MediaDeletionEntrySchema = z
	.object({
		format: z.literal(1),
		mediaId: z.string().uuid(),
		workspaceId: z.string().uuid(),
		policy: z.literal('rejected-media-v1'),
		decidedAt: z.string().datetime(),
		keys: z.array(z.string().min(1)).max(4),
	})
	.strict()
	.superRefine((entry, context) => {
		for (const key of entry.keys) {
			const segments = key.split('/')
			const managed =
				key.startsWith('quarantine/uploads/') || key.startsWith('quarantine/sealed/')
					? segments.at(-1) === entry.mediaId
					: key.startsWith('private/processed/') && segments[2] === entry.mediaId
			if (!managed || segments.includes('..') || [...key].some((character) => character.charCodeAt(0) < 32))
				context.addIssue({ code: 'custom', path: ['keys'], message: 'Deletion key must belong to this media asset.' })
		}
	})
export type MediaDeletionEntry = z.infer<typeof MediaDeletionEntrySchema>

export const GoodsPaymentStartCommandSchema = z.object({ holdId: z.string().uuid() }).strict()
export const GoodsLocalPaymentResultCommandSchema = z.object({ outcome: z.enum(['succeeded', 'failed', 'unknown']) }).strict()
export const GoodsPaymentReadSchema = z
	.object({
		paymentId: z.string().uuid(),
		holdId: z.string().uuid(),
		state: z.enum(['processing', 'unknown', 'succeeded', 'failed', 'refund_pending', 'partially_refunded', 'refunded']),
		amountCents: GoodsMoneySchema,
		currency: z.literal('ETB'),
		provider: z.literal('local-controlled'),
		refundedCents: GoodsMoneySchema.default(0),
		pendingRefundCents: GoodsMoneySchema.default(0),
		holdState: z.enum(['holding', 'awaiting_payment', 'committed', 'released', 'expired', 'compensating']),
		expiresAt: z.string().datetime(),
		purchaseId: z.string().uuid().nullable(),
		refunds: z.array(z.object({ refundId: z.string().uuid(), amountCents: GoodsMoneySchema, state: z.enum(['pending', 'succeeded']) }).strict()),
	})
	.strict()
export const GoodsPaymentResultSchema = GoodsPaymentReadSchema.extend({ replayed: z.boolean() })
export const GoodsVendorOrderReadSchema = z
	.object({
		orderId: z.string().uuid(),
		purchaseId: z.string().uuid(),
		vendorId: z.string().uuid(),
		locationId: z.string().uuid(),
		state: z.enum(['confirmed', 'partially_cancelled', 'cancelled']),
		cancellations: z
			.array(
				z
					.object({
						cancellationId: z.string().uuid(),
						itemRefundCents: GoodsMoneySchema,
						deliveryRefundCents: GoodsMoneySchema,
						refundId: z.string().uuid(),
						refundState: z.enum(['pending', 'succeeded']),
					})
					.strict(),
			)
			.default([]),
		snapshot: GoodsQuoteSnapshotSchema.shape.groups.element,
		lines: z.array(
			z
				.object({
					lineId: z.string().uuid(),
					snapshot: GoodsQuoteSnapshotSchema.shape.groups.element.shape.lines.element,
					cancelledQuantity: z.number().int().nonnegative().default(0),
					remainingQuantity: z.number().int().nonnegative().optional(),
				})
				.strict(),
		),
	})
	.strict()
export const GoodsPurchaseReadSchema = z
	.object({
		purchaseId: z.string().uuid(),
		holdId: z.string().uuid(),
		paymentId: z.string().uuid(),
		paidAt: z.string().datetime(),
		snapshot: GoodsQuoteSnapshotSchema,
		orders: z.array(GoodsVendorOrderReadSchema),
	})
	.strict()

export const GoodsOrderCancellationCommandSchema = z
	.object({
		note: z.string().trim().min(5).max(500),
		lines: z
			.array(
				z
					.object({
						lineId: z.string().uuid(),
						quantity: z.number().int().positive().max(2147483647),
						stockDisposition: z.enum(['restock', 'damaged']),
					})
					.strict(),
			)
			.min(1)
			.max(50),
	})
	.strict()
	.superRefine((value, context) => {
		if (new Set(value.lines.map((line) => line.lineId)).size !== value.lines.length)
			context.addIssue({ code: 'custom', path: ['lines'], message: 'Select each Order line once.' })
	})
export const GoodsOrderCancellationResultSchema = z
	.object({
		cancellationId: z.string().uuid(),
		orderId: z.string().uuid(),
		state: z.enum(['partially_cancelled', 'cancelled']),
		itemRefundCents: GoodsMoneySchema,
		deliveryRefundCents: GoodsMoneySchema,
		currency: z.literal('ETB'),
		reviewRequired: z.literal(true),
		lines: z.array(
			z
				.object({
					lineId: z.string().uuid(),
					quantity: z.number().int().positive(),
					stockDisposition: z.enum(['restock', 'damaged']),
					refundCents: GoodsMoneySchema,
				})
				.strict(),
		),
		refund: z.object({ refundId: z.string().uuid(), amountCents: GoodsMoneySchema, state: z.enum(['pending', 'succeeded']) }).strict(),
		replayed: z.boolean(),
	})
	.strict()
