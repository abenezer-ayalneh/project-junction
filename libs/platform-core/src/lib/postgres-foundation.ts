import { createHash, randomUUID } from 'node:crypto'

import { PrismaPg } from '@prisma/adapter-pg'
import {
	type AccessContext,
	AccessContextSchema,
	ActiveVendorSelectionResultSchema,
	ActiveVendorSelectionSchema,
	AuditMarkerCommandSchema,
	CatalogHealthSchema,
	CatalogImportCommandSchema,
	CatalogImportResultSchema,
	CustomerDiscoveryStateSchema,
	DemoPersonaKeySchema,
	DemoSessionSchema,
	DemoWorkspaceSchema,
	DiscoveryPreferenceSchema,
	DiscoveryPreferenceUpdateSchema,
	type DomainEvent,
	DomainEventSchema,
	EngagementMutationSchema,
	IdempotencyKeySchema,
	InventoryAvailabilityQuerySchema,
	InventoryAvailabilitySchema,
	InventoryMovementCommandSchema,
	InventoryMovementResultSchema,
	ListingCommandResultSchema,
	ListingDraftSchema,
	ListingReviewCommandSchema,
	ListingRevisionCommandSchema,
	LocationReadSchema,
	MediaAssetSchema,
	MediaPreviewSchema,
	MediaProcessingCommandSchema,
	MediaReviewCommandSchema,
	MediaReviewQueueQuerySchema,
	MediaReviewQueueSchema,
	MediaReviewResultSchema,
	MediaUploadCompleteCommandSchema,
	MediaUploadIntentCommandSchema,
	MediaUploadIntentSchema,
	Phase01MediaLimits,
	PlatformReviewQueueQuerySchema,
	PlatformReviewQueueSchema,
	PublicListingBrowseQuerySchema,
	PublicListingPageSchema,
	PublicStorefrontSchema,
	PublicVendorBrowseQuerySchema,
	PublicVendorPageSchema,
	type RealtimeFoundationEvent,
	RealtimeFoundationEventSchema,
	RecommendationPageSchema,
	StorefrontUpdateSchema,
	SyntheticAccountProvisionSchema,
	SyntheticAccountSchema,
	SyntheticProviderCallbackSchema,
	SyntheticStaffGrantResultSchema,
	SyntheticStaffGrantSchema,
	SyntheticStaffRevokeResultSchema,
	VendorApplicationCommandSchema,
	VendorApplicationResultSchema,
	VendorApplicationReviewSchema,
	VendorCatalogSchema,
	VendorFollowMutationSchema,
	VendorMembershipsSchema,
} from 'contracts'

import { Prisma, PrismaClient } from '../../generated/prisma/index.js'
import { AccessDeniedError, assertElevatedSession, assertRecentMfa, assertScope } from './access.js'
import { CATALOG_CSV_HEADER, decodeCatalogCsvText, encodeCatalogCsvField, parseCatalogCsv } from './catalog-csv.js'
import { type ExternalEffectAdapter, FakeExternalEffectAdapter, UnconfiguredExternalEffectAdapter } from './external-effects.js'
import { IdempotencyConflictError, stableHash } from './idempotency.js'
import { type MediaStore, S3MediaStore } from './media-store.js'
import { SumsubSandboxAdapter } from './sumsub.js'
import { MediaRejectedError, VideoProcessor } from './video-processor.js'

type Transaction = Prisma.TransactionClient
export interface DurableClaim {
	id: string
	claimToken: string
	payload: unknown
	attempts: number
}
const auditMarkerMethod = 'POST /v1/foundation/audit-markers'
const elevatedAuditMarkerMethod = 'POST /v1/foundation/elevated-audit-markers'
const adultVerifiedStates = new Set(['verified', 'legacy_verified_compat'])
const realtimeReplayLimit = 25
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
const DEMO_PERSONAS = [
	{ key: 'customer', role: 'customer' },
	{ key: 'vendor_owner', role: 'vendor_owner' },
	{ key: 'service_staff', role: 'service_staff' },
	{ key: 'support', role: 'support' },
	{ key: 'trust', role: 'trust' },
	{ key: 'finance', role: 'finance' },
	{ key: 'platform_owner', role: 'platform_owner' },
] as const

function isVerifiedAdult(user: { adultVerificationState: string; verifiedAt: Date | null }): boolean {
	return Boolean(user.verifiedAt) && adultVerifiedStates.has(user.adultVerificationState)
}

/** Prisma owns CRUD; parameterized SQL below is restricted to concurrency locks/claims. */
export class PostgresFoundation {
	readonly db: PrismaClient
	private readonly publicWorkspaceKind = process.env['JUNCTION_RUNTIME_MODE'] === 'staging' ? 'real' : 'synthetic'
	private readonly externalEffects: ExternalEffectAdapter
	private readonly mediaStore: MediaStore | undefined
	private readonly videoProcessor: VideoProcessor | undefined
	constructor(url: string, externalEffects?: ExternalEffectAdapter, mediaStore?: MediaStore, videoProcessor?: VideoProcessor) {
		const schema = new URL(url).searchParams.get('schema') ?? 'public'
		if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('Unsupported database schema name.')
		this.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, options: `-c search_path=${schema},public` }, { schema }) })
		this.externalEffects =
			externalEffects ??
			(process.env['JUNCTION_RUNTIME_MODE'] === 'staging' ? new UnconfiguredExternalEffectAdapter() : new FakeExternalEffectAdapter(this.db))
		this.mediaStore = mediaStore ?? S3MediaStore.fromEnvironment()
		this.videoProcessor = videoProcessor ?? VideoProcessor.fromEnvironment()
	}
	close() {
		return this.db.$disconnect()
	}
	async health() {
		await this.db.workspace.count()
	}

	private requireResourceId(value: string) {
		if (!uuidPattern.test(value)) throw new AccessDeniedError()
		return value
	}

	private requireMediaStore(): MediaStore {
		if (!this.mediaStore) throw new Error('Media object storage is not configured.')
		return this.mediaStore
	}

	accessContext(sessionId: string | undefined) {
		return this.db.$transaction((tx) => this.derive(tx, sessionId))
	}

	async listOwnerMemberships(sessionId: string | undefined) {
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			if (context.actor.kind !== 'user') throw new AccessDeniedError()
			const memberships = await tx.vendorMembership.findMany({
				where: {
					userId: context.actor.userId,
					role: 'vendor_owner',
					revokedAt: null,
					vendor: { workspaceId: context.workspaceId, applicationState: { notIn: ['rejected', 'restricted'] } },
				},
				include: { vendor: true },
				orderBy: { vendorId: 'asc' },
			})
			return VendorMembershipsSchema.parse({
				activeVendorId: context.activeVendorId,
				items: memberships.map(({ vendorId, vendor }) => ({
					vendorId,
					displayName: vendor.displayName || vendor.publicSlug || 'Vendor',
					active: context.activeVendorId === vendorId,
				})),
			})
		})
	}

	async selectActiveVendor(sessionId: string | undefined, input: unknown) {
		const { vendorId } = ActiveVendorSelectionSchema.parse(input)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			if (context.actor.kind !== 'user') throw new AccessDeniedError()
			if (vendorId) {
				assertRecentMfa(context)
				await tx.$queryRaw`SELECT id FROM "vendor_memberships" WHERE "user_id" = ${context.actor.userId}::uuid AND "vendor_id" = ${vendorId}::uuid FOR SHARE`
				await tx.$queryRaw`SELECT id FROM "vendors" WHERE id = ${vendorId}::uuid FOR SHARE`
				const membership = await tx.vendorMembership.findUnique({
					where: { userId_vendorId: { userId: context.actor.userId, vendorId } },
					include: { vendor: true },
				})
				if (
					!membership ||
					membership.revokedAt ||
					membership.role !== 'vendor_owner' ||
					membership.vendor.workspaceId !== context.workspaceId ||
					['rejected', 'restricted'].includes(membership.vendor.applicationState)
				)
					throw new AccessDeniedError()
			}
			if (context.activeVendorId !== vendorId) {
				await tx.session.update({ where: { id: context.session.id }, data: { activeVendorId: vendorId, activeRole: vendorId ? 'vendor_owner' : null } })
				await tx.auditLog.create({
					data: {
						workspaceId: context.workspaceId,
						actorId: context.actor.userId,
						action: 'session.active-vendor-selected',
						correlationId: randomUUID(),
						metadata: json({ fromVendorId: context.activeVendorId, toVendorId: vendorId }),
					},
				})
			}
			return ActiveVendorSelectionResultSchema.parse({ activeVendorId: vendorId })
		})
	}

	async ensureAuthenticatedSession(input: { sessionId: string; userId: string; email: string; expiresAt: Date }) {
		this.requireResourceId(input.sessionId)
		this.requireResourceId(input.userId)
		if (input.expiresAt <= new Date()) throw new AccessDeniedError()
		await this.db.$transaction(async (tx) => {
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(20260925, hashtext(${input.userId}))`
			const existing = await tx.session.findUnique({ where: { id: input.sessionId }, include: { workspace: true } })
			if (existing) {
				if (existing.userId !== input.userId || existing.revokedAt || existing.workspace.kind !== 'real') throw new AccessDeniedError()
				if (existing.expiresAt < input.expiresAt || (existing.activeRole === 'customer' && !existing.activeVendorId))
					await tx.session.update({
						where: { id: existing.id },
						data: {
							...(existing.expiresAt < input.expiresAt ? { expiresAt: input.expiresAt } : {}),
							...(existing.activeRole === 'customer' && !existing.activeVendorId ? { activeRole: null } : {}),
						},
					})
				return
			}
			const user = await tx.user.upsert({
				where: { id: input.userId },
				create: { id: input.userId, email: input.email, adultVerificationState: 'unverified' },
				update: { email: input.email },
			})
			// One real marketplace scope lets separately signed-up Vendors reach the same
			// review queue. Serialize creation so concurrent first sign-ups cannot split it.
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(20260925, 1)`
			const prior = await tx.session.findFirst({ where: { userId: user.id, workspace: { kind: 'real' } }, orderBy: { createdAt: 'asc' } })
			const sharedWorkspace = prior?.workspaceId
				? null
				: await tx.workspace.findFirst({ where: { kind: 'real' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } })
			const workspaceId = prior?.workspaceId ?? sharedWorkspace?.id ?? (await tx.workspace.create({ data: { kind: 'real' } })).id
			const ownerMemberships = await tx.vendorMembership.findMany({
				where: {
					userId: user.id,
					role: 'vendor_owner',
					revokedAt: null,
					vendor: { workspaceId, applicationState: { notIn: ['rejected', 'restricted'] } },
				},
				take: 2,
			})
			const activeOwner = ownerMemberships.length === 1 ? ownerMemberships[0] : null
			await tx.session.create({
				data: {
					id: input.sessionId,
					userId: user.id,
					workspaceId,
					expiresAt: input.expiresAt,
					activeVendorId: activeOwner?.vendorId ?? null,
					activeRole: activeOwner ? 'vendor_owner' : null,
				},
			})
		})
	}

	async markVerifiedSecondFactor(sessionId: string, userId: string, verifiedAt: Date) {
		this.requireResourceId(sessionId)
		this.requireResourceId(userId)
		const updated = await this.db.session.updateMany({
			where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: verifiedAt }, workspace: { kind: 'real' } },
			data: { mfaVerifiedAt: verifiedAt, recentAuthAt: verifiedAt },
		})
		if (updated.count !== 1) throw new AccessDeniedError()
	}

	async authenticatedIdentity(sessionId: string | undefined) {
		if (!sessionId) throw new AccessDeniedError()
		this.requireResourceId(sessionId)
		const session = await this.db.session.findUnique({ where: { id: sessionId }, include: { user: true, workspace: true } })
		if (!session?.user || session.revokedAt || session.expiresAt <= new Date() || session.workspace.kind !== 'real') throw new AccessDeniedError()
		return { userId: session.user.id, email: session.user.email }
	}

	async recordSumsubReview(input: {
		eventId: string
		applicantId: string
		userId: string
		levelName: string
		eventType: string
		answer: string | null
		status: string
		observedAt: string
		sandboxMode: boolean
	}) {
		this.requireResourceId(input.userId)
		return this.db.$transaction(async (tx) => {
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'sumsub:' + input.eventId}, 0))`
			const prior = await tx.providerInboxEvent.findUnique({
				where: { provider_providerEventId: { provider: 'sumsub-sandbox', providerEventId: input.eventId } },
			})
			if (prior) return { accepted: true, duplicate: true }
			const session = await tx.session.findFirst({ where: { userId: input.userId, workspace: { kind: 'real' } }, orderBy: { createdAt: 'asc' } })
			if (!session) throw new AccessDeniedError()
			const terminalRevocation = input.eventType === 'applicantDeactivated' || input.eventType === 'applicantDeleted'
			const revocation =
				['applicantDeactivated', 'applicantDeleted', 'applicantReset', 'applicantOnHold', 'applicantLevelChanged'].includes(input.eventType) ||
				(input.eventType === 'applicantReviewed' && input.answer === 'RED')
			if (revocation) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'sumsub-user:' + input.userId}, 0))`
			const now = new Date()
			await tx.providerInboxEvent.create({
				data: {
					provider: 'sumsub-sandbox',
					providerEventId: input.eventId,
					providerReference: input.applicantId,
					workspaceId: session.workspaceId,
					payloadHash: stableHash(input),
					payload: json(input),
					reconciliationState: terminalRevocation ? 'reconciled' : 'pending_review',
					...(terminalRevocation ? { reconciledAt: now, processedAt: now } : {}),
				},
			})
			if (revocation) {
				await tx.user.update({ where: { id: input.userId }, data: { adultVerificationState: 'unverified', verifiedAt: null } })
				await tx.auditLog.create({
					data: {
						workspaceId: session.workspaceId,
						actorId: null,
						action: 'identity.sumsub-revoked',
						correlationId: randomUUID(),
						metadata: json({ userId: input.userId, providerEventId: input.eventId, applicantId: input.applicantId, eventType: input.eventType }),
					},
				})
			}
			return { accepted: true, duplicate: false }
		})
	}

	async reconcileOneSumsubReview(adapter: SumsubSandboxAdapter, requiredLevel: string) {
		const event = await this.db.providerInboxEvent.findFirst({
			where: { provider: 'sumsub-sandbox', reconciliationState: 'pending_review' },
			orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
		})
		if (!event) return { processed: false }
		const payload = event.payload as Record<string, unknown>
		if (typeof payload['userId'] !== 'string' || typeof payload['applicantId'] !== 'string') throw new Error('Invalid stored Sumsub review.')
		const userId = payload['userId']
		const applicantId = payload['applicantId']
		const current = await adapter.currentReview(userId)
		const approved =
			['applicantReviewed', 'applicantActivated'].includes(String(payload['eventType'])) &&
			current.applicantId === applicantId &&
			current.levelName === requiredLevel &&
			current.reviewStatus === 'completed' &&
			current.reviewAnswer === 'GREEN'
		const rejected =
			payload['eventType'] === 'applicantReviewed' &&
			current.applicantId === applicantId &&
			current.levelName === requiredLevel &&
			current.reviewStatus === 'completed' &&
			current.reviewAnswer === 'RED'
		const state = approved ? 'verified' : rejected ? 'rejected' : 'unverified'
		const outcome = await this.db.$transaction(async (tx) => {
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'sumsub-user:' + userId}, 0))`
			const pending = await tx.providerInboxEvent.findUniqueOrThrow({ where: { id: event.id } })
			if (pending.reconciliationState !== 'pending_review') return null
			const laterRevocations = await tx.$queryRaw<Array<{ id: string }>>`
				SELECT id FROM provider_inbox_events
				WHERE provider = 'sumsub-sandbox'
					AND payload->>'userId' = ${userId}
					AND (
						payload->>'eventType' IN ('applicantDeactivated', 'applicantDeleted', 'applicantReset', 'applicantOnHold', 'applicantLevelChanged')
						OR (payload->>'eventType' = 'applicantReviewed' AND payload->>'answer' = 'RED')
					)
					AND payload->>'observedAt' >= ${String(payload['observedAt'])}
				LIMIT 1`
			const realSession = await tx.session.findFirst({ where: { userId, workspaceId: event.workspaceId ?? undefined, workspace: { kind: 'real' } } })
			if (!realSession) throw new AccessDeniedError()
			const reconciledState = approved && laterRevocations.length === 0 ? 'verified' : rejected ? 'rejected' : 'unverified'
			await tx.user.update({
				where: { id: userId },
				data: { adultVerificationState: reconciledState, verifiedAt: reconciledState === 'verified' ? new Date() : null },
			})
			const now = new Date()
			await tx.providerInboxEvent.update({ where: { id: event.id }, data: { reconciliationState: 'reconciled', reconciledAt: now, processedAt: now } })
			await tx.auditLog.create({
				data: {
					workspaceId: event.workspaceId,
					actorId: userId,
					action: 'identity.sumsub-reviewed',
					correlationId: randomUUID(),
					metadata: json({
						providerEventId: event.providerEventId,
						applicantId: current.applicantId,
						levelName: current.levelName,
						state: reconciledState,
					}),
				},
			})
			return reconciledState
		})
		return { processed: outcome !== null, state: outcome ?? state }
	}

	async readLocation(sessionId: string | undefined, locationId: string) {
		this.requireResourceId(locationId)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const location = await tx.location.findUnique({ where: { id: locationId }, include: { vendor: true } })
			if (!location) throw new AccessDeniedError()
			assertScope(context, { workspaceId: location.vendor.workspaceId, vendorId: location.vendorId, locationId: location.id })
			return LocationReadSchema.parse({ id: location.id, vendorId: location.vendorId, workspaceId: location.vendor.workspaceId })
		})
	}

	async readInventoryAvailability(sessionId: string | undefined, listingId: string, queryInput: unknown) {
		this.requireResourceId(listingId)
		const query = InventoryAvailabilityQuerySchema.parse(queryInput)
		this.requireResourceId(query.locationId)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const item = await this.requireInventoryItem(tx, context, query.locationId, listingId, query.sku)
			if (!context.memberships.some((membership) => membership.active && ['vendor_owner', 'vendor_staff'].includes(membership.role)))
				throw new AccessDeniedError()
			const balance = await tx.inventoryMovement.aggregate({
				where: { locationId: item.location.id, listingId: item.listing.id, sku: item.variant?.sku ?? null },
				_sum: { onHandDelta: true, reservedDelta: true },
			})
			const onHand = balance._sum.onHandDelta ?? 0
			const reserved = balance._sum.reservedDelta ?? 0
			return InventoryAvailabilitySchema.parse({
				locationId: item.location.id,
				listingId: item.listing.id,
				sku: item.variant?.sku ?? null,
				onHand,
				reserved,
				available: onHand - reserved,
			})
		})
	}

	async createInventoryMovement(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const command = InventoryMovementCommandSchema.parse(input)
		this.requireResourceId(command.locationId)
		this.requireResourceId(command.listingId)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const vendor = await this.vendorForWrite(tx, context)
			const item = await this.requireInventoryItem(tx, context, command.locationId, command.listingId, command.sku)
			if (item.location.vendorId !== vendor.id) throw new AccessDeniedError()
			const result = await this.replayOrCreate(tx, context, key, 'POST /v1/inventory/movements', command, async () => {
				const balance = await tx.inventoryMovement.aggregate({
					where: {
						locationId: item.location.id,
						listingId: item.listing.id,
						sku: item.variant?.sku ?? null,
					},
					_sum: { onHandDelta: true, reservedDelta: true },
				})
				const onHand = (balance._sum.onHandDelta ?? 0) + command.quantityDelta
				const reserved = balance._sum.reservedDelta ?? 0
				if (onHand < 0 || onHand - reserved < 0) throw new AccessDeniedError('The movement would make available stock negative.')
				const actor = this.actorId(context)
				const movement = await tx.inventoryMovement.create({
					data: {
						locationId: item.location.id,
						listingId: item.listing.id,
						sku: item.variant?.sku ?? null,
						reason: command.reason,
						onHandDelta: command.quantityDelta,
						reservedDelta: 0,
						note: command.note ?? null,
						actorKind: context.actor.kind,
						actorId: actor,
					},
					select: { id: true },
				})
				const aggregateVersion = await tx.inventoryMovement.count({ where: { listingId: item.listing.id } })
				const outcome = InventoryMovementResultSchema.parse({
					movementId: movement.id,
					locationId: item.location.id,
					listingId: item.listing.id,
					sku: item.variant?.sku ?? null,
					reason: command.reason,
					quantityDelta: command.quantityDelta,
					onHand,
					reserved,
					available: onHand - reserved,
					replayed: false,
				})
				await tx.auditLog.create({
					data: {
						workspaceId: context.workspaceId,
						actorId: actor,
						action: 'inventory.stock-moved',
						correlationId: randomUUID(),
						metadata: json({
							movementId: movement.id,
							locationId: item.location.id,
							listingId: item.listing.id,
							sku: item.variant?.sku ?? null,
							reason: command.reason,
							quantityDelta: command.quantityDelta,
						}),
					},
				})
				await this.enqueue(
					tx,
					this.catalogEvent(context, 'StockMoved', item.listing.id, aggregateVersion, key, {
						movementId: movement.id,
						locationId: item.location.id,
						listingId: item.listing.id,
						sku: item.variant?.sku ?? null,
						reason: command.reason,
						quantityDelta: command.quantityDelta,
					}),
				)
				return outcome
			})
			return InventoryMovementResultSchema.parse({ ...result.outcome, replayed: result.replayed })
		})
	}

	async browsePublicVendors(queryInput: unknown) {
		const query = PublicVendorBrowseQuerySchema.parse(queryInput)
		const vendors = await this.db.vendor.findMany({
			where: { publicSlug: { not: null }, publishedAt: { not: null }, applicationState: 'approved', workspace: { kind: this.publicWorkspaceKind } },
			orderBy: { id: 'asc' },
			take: query.limit + 1,
			...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
		})
		const items = vendors.slice(0, query.limit).map((vendor) => ({ id: vendor.id, slug: vendor.publicSlug }))
		return PublicVendorPageSchema.parse({ items, nextCursor: vendors.length > query.limit ? (items.at(-1)?.id ?? null) : null })
	}

	async readPublicStorefront(slug: string) {
		const vendor = await this.db.vendor.findFirst({
			where: { publicSlug: slug, publishedAt: { not: null }, applicationState: 'approved', workspace: { kind: this.publicWorkspaceKind } },
			include: {
				locations: true,
				listings: {
					where: { state: 'published' },
					orderBy: { publishedAt: 'desc' },
					include: { variants: true, media: { where: { state: 'ready', scanVerdict: 'clean' }, orderBy: { moderatedAt: 'desc' }, take: 1 } },
				},
			},
		})
		if (!vendor || !vendor.publicSlug || !vendor.displayName || !vendor.description) throw new AccessDeniedError()
		return PublicStorefrontSchema.parse({
			id: vendor.id,
			slug: vendor.publicSlug,
			displayName: vendor.displayName,
			description: vendor.description,
			locations: vendor.locations.flatMap((location) =>
				location.label && location.city ? [{ id: location.id, label: location.label, city: location.city }] : [],
			),
			listings: vendor.listings.map((listing) => this.listingResult(listing)),
		})
	}

	async readVendorCatalog(sessionId: string | undefined) {
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			if (
				!context.activeVendorId ||
				!context.memberships.some(
					(membership) => membership.active && membership.vendorId === context.activeVendorId && membership.role === 'vendor_owner',
				)
			)
				throw new AccessDeniedError()
			const vendor = await tx.vendor.findFirst({
				where: { id: context.activeVendorId, workspaceId: context.workspaceId },
				include: { locations: { orderBy: { id: 'asc' } }, listings: { orderBy: { id: 'asc' }, include: { variants: true } } },
			})
			if (!vendor) throw new AccessDeniedError()
			return VendorCatalogSchema.parse({
				id: vendor.id,
				applicationState: vendor.applicationState,
				slug: vendor.publicSlug,
				displayName: vendor.displayName,
				description: vendor.description,
				locations: vendor.locations.map((location) => ({
					id: location.id,
					label: location.label,
					city: location.city,
					address: location.address,
				})),
				listings: vendor.listings.map((listing) => this.listingResult(listing)),
			})
		})
	}

	async readPlatformReviewQueue(sessionId: string | undefined, queryInput: unknown) {
		const query = PlatformReviewQueueQuerySchema.parse(queryInput)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			if (!context.capabilities.includes('platform:vendor:review')) throw new AccessDeniedError()
			if (query.applicationCursor) {
				const cursor = await tx.vendor.findFirst({
					where: { id: query.applicationCursor, workspaceId: context.workspaceId, applicationState: 'pending' },
					select: { id: true },
				})
				if (!cursor) throw new AccessDeniedError()
			}
			if (query.listingCursor) {
				const cursor = await tx.listing.findFirst({
					where: { id: query.listingCursor, state: 'pending_review', vendor: { workspaceId: context.workspaceId, applicationState: 'approved' } },
					select: { id: true },
				})
				if (!cursor) throw new AccessDeniedError()
			}
			const [applications, listings] = await Promise.all([
				tx.vendor.findMany({
					where: { workspaceId: context.workspaceId, applicationState: 'pending' },
					orderBy: { id: 'asc' },
					take: query.limit + 1,
					...(query.applicationCursor ? { cursor: { id: query.applicationCursor }, skip: 1 } : {}),
					include: { locations: { orderBy: { id: 'asc' } } },
				}),
				tx.listing.findMany({
					where: { state: 'pending_review', vendor: { workspaceId: context.workspaceId, applicationState: 'approved' } },
					orderBy: { id: 'asc' },
					take: query.limit + 1,
					...(query.listingCursor ? { cursor: { id: query.listingCursor }, skip: 1 } : {}),
					include: { vendor: true, variants: true },
				}),
			])
			const applicationPage = applications.slice(0, query.limit)
			const listingPage = listings.slice(0, query.limit)
			return PlatformReviewQueueSchema.parse({
				applications: applicationPage.map((vendor) => ({
					id: vendor.id,
					slug: vendor.publicSlug,
					displayName: vendor.displayName,
					description: vendor.description,
					locations: vendor.locations.map((location) => ({ label: location.label, city: location.city, address: location.address })),
				})),
				listings: listingPage.map((listing) => ({
					vendorId: listing.vendorId,
					vendorName: listing.vendor.displayName,
					listing: this.listingResult(listing),
				})),
				applicationsNextCursor: applications.length > query.limit ? (applicationPage.at(-1)?.id ?? null) : null,
				listingsNextCursor: listings.length > query.limit ? (listingPage.at(-1)?.id ?? null) : null,
			})
		})
	}

	async readPlatformCatalogHealth(sessionId: string | undefined) {
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			if (!context.capabilities.includes('platform:vendor:review')) throw new AccessDeniedError()
			const workspaceId = context.workspaceId
			const [listings, reviewEvents, pendingVendors, pendingListings, importJobs, importPreviews, mediaPending, mediaDeadLetters] = await Promise.all([
				tx.listing.findMany({
					where: { state: 'published', vendor: { workspaceId, applicationState: 'approved', publishedAt: { not: null } } },
					select: { version: true, updatedAt: true, searchDocument: { select: { version: true, projectedAt: true } } },
				}),
				tx.outboxEvent.count({
					where: { workspaceId, type: { in: ['VendorApplicationReviewed', 'ListingPublished', 'ListingUnpublished', 'MediaReviewed'] } },
				}),
				tx.vendor.findMany({ where: { workspaceId, applicationState: 'pending' }, select: { createdAt: true } }),
				tx.listing.findMany({ where: { state: 'pending_review', vendor: { workspaceId, applicationState: 'approved' } }, select: { updatedAt: true } }),
				tx.catalogImportJob.count({ where: { vendor: { workspaceId } } }),
				tx.catalogImportJob.findMany({ where: { vendor: { workspaceId }, state: 'dry_run' }, select: { createdAt: true } }),
				tx.mediaAsset.count({ where: { state: { in: ['pending_upload', 'quarantined', 'needs_moderation'] }, listing: { vendor: { workspaceId } } } }),
				tx.outboxEvent.count({ where: { workspaceId, type: 'MediaQuarantined', state: 'dead_letter' } }),
			])
			const now = new Date()
			const ageSeconds = (date: Date) => Math.max(0, (now.getTime() - date.getTime()) / 1000)
			const projected = listings.filter(
				(listing) => listing.searchDocument?.version === listing.version && listing.searchDocument.projectedAt >= listing.updatedAt,
			)
			const lagging = listings.filter(
				(listing) =>
					listing.searchDocument?.version !== listing.version || !listing.searchDocument || listing.searchDocument.projectedAt < listing.updatedAt,
			)
			return CatalogHealthSchema.parse({
				publishedListings: listings.length,
				projectedListings: projected.length,
				laggingListings: lagging.length,
				oldestLagSeconds: Math.max(0, ...lagging.map((listing) => ageSeconds(listing.updatedAt))),
				reviewEvents,
				pendingReviews: pendingVendors.length + pendingListings.length,
				oldestReviewLagSeconds: Math.max(
					0,
					...pendingVendors.map((item) => ageSeconds(item.createdAt)),
					...pendingListings.map((item) => ageSeconds(item.updatedAt)),
				),
				importJobs,
				importDryRuns: importPreviews.length,
				oldestImportDryRunSeconds: Math.max(0, ...importPreviews.map((item) => ageSeconds(item.createdAt))),
				mediaPending,
				mediaDeadLetters,
				checkedAt: now.toISOString(),
			})
		})
	}

	async createVendorApplication(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const application = VendorApplicationCommandSchema.parse(input)
		const publicResult = (outcome: { vendorId: string; locationId: string; sessionId?: string; state: 'pending'; replayed: boolean }) =>
			VendorApplicationResultSchema.parse(
				this.publicWorkspaceKind === 'real'
					? { vendorId: outcome.vendorId, locationId: outcome.locationId, state: outcome.state, replayed: outcome.replayed }
					: outcome,
			)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const userId = this.customerId(context)
			if (context.activeVendorId) {
				const originalScopeHash = stableHash({ actorId: userId, workspaceId: context.workspaceId, vendorId: null })
				const prior = await tx.idempotencyRecord.findUnique({
					where: { key_scopeHash_method: { key, scopeHash: originalScopeHash, method: 'POST /v1/vendor-applications' } },
				})
				if (!prior || prior.requestHash !== stableHash(application)) throw new AccessDeniedError()
				const outcome = VendorApplicationResultSchema.parse(prior.outcome)
				if (outcome.vendorId !== context.activeVendorId || outcome.sessionId !== context.session.id) throw new AccessDeniedError()
				return publicResult({ ...outcome, replayed: true })
			}
			const result = await this.replayOrCreate(tx, context, key, 'POST /v1/vendor-applications', application, async () => {
				const vendor = await tx.vendor.create({
					data: {
						workspaceId: context.workspaceId,
						publicSlug: application.slug,
						displayName: application.displayName,
						description: application.description,
					},
				})
				const location = await tx.location.create({
					data: {
						vendorId: vendor.id,
						...application.location,
						latitude: application.location.latitude ?? null,
						longitude: application.location.longitude ?? null,
					},
				})
				await tx.vendorMembership.create({ data: { userId, vendorId: vendor.id, role: 'vendor_owner', locationIds: [location.id] } })
				await tx.session.update({ where: { id: context.session.id }, data: { activeVendorId: vendor.id, activeRole: 'vendor_owner' } })
				await tx.auditLog.create({
					data: {
						workspaceId: context.workspaceId,
						actorId: userId,
						action: 'vendor.application-created',
						correlationId: randomUUID(),
						metadata: json({ vendorId: vendor.id, locationId: location.id }),
					},
				})
				await this.enqueue(tx, this.catalogEvent(context, 'VendorApplicationSubmitted', vendor.id, 1, key, { vendorId: vendor.id, state: 'pending' }))
				return VendorApplicationResultSchema.parse({
					vendorId: vendor.id,
					locationId: location.id,
					sessionId: context.session.id,
					state: 'pending',
					replayed: false,
				})
			})
			return publicResult({ ...result.outcome, replayed: result.replayed })
		})
	}

	async reviewVendorApplication(sessionId: string | undefined, keyInput: string | undefined, vendorId: string, input: unknown) {
		this.requireResourceId(vendorId)
		const key = IdempotencyKeySchema.parse(keyInput)
		const review = VendorApplicationReviewSchema.parse(input)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			if (!context.capabilities.includes('platform:vendor:review')) throw new AccessDeniedError()
			if (context.actor.kind === 'user') assertRecentMfa(context)
			const target = await tx.vendor.findFirst({ where: { id: vendorId, workspaceId: context.workspaceId } })
			if (!target) throw new AccessDeniedError()
			const result = await this.replayOrCreate(tx, context, key, 'POST /v1/vendor-applications/:vendorId/review', { vendorId, review }, async () => {
				const vendor = await tx.vendor.findUnique({ where: { id: vendorId } })
				if (!vendor || vendor.workspaceId !== context.workspaceId) throw new AccessDeniedError()
				if (vendor.applicationState !== 'pending' && !(review.decision === 'restrict' && vendor.applicationState === 'approved'))
					throw new AccessDeniedError('The Vendor application is no longer eligible for this decision.')
				const state = review.decision === 'approve' ? 'approved' : review.decision === 'reject' ? 'rejected' : 'restricted'
				await tx.vendor.update({
					where: { id: vendorId },
					data: { applicationState: state, applicationReviewedAt: new Date(), publishedAt: state === 'approved' ? new Date() : null },
				})
				await tx.auditLog.create({
					data: {
						workspaceId: context.workspaceId,
						actorId: this.actorId(context),
						action: 'vendor.application-reviewed',
						correlationId: randomUUID(),
						metadata: json({ vendorId, state, note: review.note }),
					},
				})
				await this.enqueue(tx, this.catalogEvent(context, 'VendorApplicationReviewed', vendorId, 1, key, { vendorId, state }))
				return { vendorId, state }
			})
			return { ...result.outcome, replayed: result.replayed }
		})
	}

	async updateStorefront(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const storefront = StorefrontUpdateSchema.parse(input)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const vendor = await this.vendorForWrite(tx, context)
			const result = await this.replayOrCreate(tx, context, key, 'POST /v1/vendor-storefront', storefront, async () => {
				const updated = await tx.vendor.update({
					where: { id: vendor.id },
					data: { publicSlug: storefront.slug, displayName: storefront.displayName, description: storefront.description },
				})
				await tx.auditLog.create({
					data: {
						workspaceId: context.workspaceId,
						actorId: this.actorId(context),
						action: 'vendor.storefront-updated',
						correlationId: randomUUID(),
						metadata: json({ vendorId: updated.id, fields: Object.keys(storefront) }),
					},
				})
				await this.enqueue(tx, this.catalogEvent(context, 'StorefrontUpdated', updated.id, 1, key, { vendorId: updated.id }))
				return { vendorId: updated.id }
			})
			return { ...result.outcome, replayed: result.replayed }
		})
	}

	async createListing(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const draft = ListingDraftSchema.parse(input)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const vendor = await this.vendorForWrite(tx, context)
			const result = await this.replayOrCreate(tx, context, key, 'POST /v1/listings', draft, async () => {
				const { variants, ...listingDraft } = draft
				const listing = await tx.listing.create({
					data: {
						vendorId: vendor.id,
						...listingDraft,
						priceCents: listingDraft.priceCents ?? null,
						durationMinutes: listingDraft.durationMinutes ?? null,
					},
				})
				if (variants?.length) await tx.listingVariant.createMany({ data: variants.map((variant) => ({ listingId: listing.id, ...variant })) })
				await tx.listingRevision.create({
					data: { listingId: listing.id, version: listing.version, state: 'draft', risk: 'low', snapshot: json(draft) },
				})
				await tx.auditLog.create({
					data: {
						workspaceId: context.workspaceId,
						actorId: this.actorId(context),
						action: 'listing.created',
						correlationId: randomUUID(),
						metadata: json({ listingId: listing.id, version: 1 }),
					},
				})
				return this.listingResult({ ...listing, variants: variants ?? [] })
			})
			return { ...result.outcome, replayed: result.replayed }
		})
	}

	async reviseListing(sessionId: string | undefined, keyInput: string | undefined, listingId: string, input: unknown) {
		this.requireResourceId(listingId)
		const key = IdempotencyKeySchema.parse(keyInput)
		const draft = ListingRevisionCommandSchema.parse(input)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const vendor = await this.vendorForWrite(tx, context)
			await this.requireOwnedListing(tx, listingId, vendor.id)
			await this.requireInventorySkuBalancePreserved(tx, listingId, draft.variants?.map(({ sku }) => sku) ?? [])
			const result = await this.replayOrCreate(tx, context, key, 'POST /v1/listings/:listingId/revise', { listingId, draft }, async () => {
				const listing = await tx.listing.findFirst({ where: { id: listingId, vendorId: vendor.id } })
				if (!listing || !['draft', 'rejected', 'unpublished'].includes(listing.state) || listing.version !== draft.expectedVersion)
					throw new AccessDeniedError('The listing revision is stale.')
				const { variants, expectedVersion, ...listingDraft } = draft
				const updated = await tx.listing
					.update({
						where: { id: listing.id, version: expectedVersion },
						data: {
							...listingDraft,
							priceCents: listingDraft.priceCents ?? null,
							durationMinutes: listingDraft.durationMinutes ?? null,
							state: 'draft',
							publishedAt: null,
							unpublishedAt: null,
							version: { increment: 1 },
							variants: { deleteMany: {}, create: variants?.map((variant) => ({ ...variant })) ?? [] },
						},
						include: { variants: true },
					})
					.catch((error: unknown) => {
						if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025')
							throw new AccessDeniedError('The listing revision is stale.')
						throw error
					})
				await tx.searchDocument.deleteMany({ where: { listingId: updated.id } })
				await tx.listingRevision.create({
					data: {
						listingId: updated.id,
						version: updated.version,
						state: 'draft',
						risk: 'low',
						snapshot: json(draft),
						reviewNote: 'revised by vendor',
					},
				})
				await tx.auditLog.create({
					data: {
						workspaceId: context.workspaceId,
						actorId: this.actorId(context),
						action: 'listing.revised',
						correlationId: randomUUID(),
						metadata: json({ listingId: updated.id, version: updated.version }),
					},
				})
				await this.enqueue(tx, this.catalogEvent(context, 'ListingRevised', updated.id, updated.version, key, { listingId: updated.id }))
				return this.listingResult(updated)
			})
			return { ...result.outcome, replayed: result.replayed }
		})
	}

	async submitListingForReview(sessionId: string | undefined, keyInput: string | undefined, listingId: string) {
		this.requireResourceId(listingId)
		const key = IdempotencyKeySchema.parse(keyInput)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const vendor = await this.vendorForWrite(tx, context)
			await this.requireOwnedListing(tx, listingId, vendor.id)
			const result = await this.replayOrCreate(tx, context, key, 'POST /v1/listings/:listingId/submit', { listingId }, async () => {
				const listing = await tx.listing.findFirst({ where: { id: listingId, vendorId: vendor.id } })
				if (!listing || !['draft', 'rejected', 'unpublished'].includes(listing.state)) throw new AccessDeniedError()
				const updated = await tx.listing.update({
					where: { id: listing.id },
					data: { state: 'pending_review', version: { increment: 1 } },
					include: { variants: true },
				})
				await tx.listingRevision.create({
					data: {
						listingId: updated.id,
						version: updated.version,
						state: updated.state,
						risk: 'review',
						snapshot: json(this.listingResult(updated)),
						reviewNote: 'awaiting platform review',
					},
				})
				await this.enqueue(tx, this.catalogEvent(context, 'ListingSubmittedForReview', updated.id, updated.version, key, { listingId: updated.id }))
				return this.listingResult(updated)
			})
			return { ...result.outcome, replayed: result.replayed }
		})
	}

	async reviewListing(sessionId: string | undefined, keyInput: string | undefined, listingId: string, input: unknown) {
		this.requireResourceId(listingId)
		const key = IdempotencyKeySchema.parse(keyInput)
		const review = ListingReviewCommandSchema.parse(input)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			if (!context.capabilities.includes('platform:vendor:review')) throw new AccessDeniedError()
			if (context.actor.kind === 'user') assertRecentMfa(context)
			const target = await tx.listing.findFirst({
				where: { id: listingId, vendor: { workspaceId: context.workspaceId, applicationState: 'approved' } },
			})
			if (!target) throw new AccessDeniedError()
			const result = await this.replayOrCreate(tx, context, key, 'POST /v1/listings/:listingId/review', { listingId, review }, async () => {
				const listing = await tx.listing.findUnique({ where: { id: listingId } })
				if (!listing || listing.state !== 'pending_review' || listing.version !== review.expectedVersion)
					throw new AccessDeniedError('The listing review is stale.')
				const vendor = await tx.vendor.findUnique({ where: { id: listing.vendorId } })
				if (!vendor || vendor.workspaceId !== context.workspaceId || vendor.applicationState !== 'approved') throw new AccessDeniedError()
				const unsafeMedia = await tx.mediaAsset.count({ where: { listingId, state: { not: 'ready' } } })
				if (review.decision === 'approve' && unsafeMedia > 0) throw new AccessDeniedError('Media remains quarantined.')
				const state = review.decision === 'approve' ? 'published' : 'rejected'
				const updated = await tx.listing.update({
					where: { id: listingId },
					data: { state, publishedAt: state === 'published' ? new Date() : null, unpublishedAt: null },
					include: { variants: true },
				})
				await tx.listingRevision.update({
					where: { listingId_version: { listingId, version: updated.version } },
					data: { state, reviewedBy: this.actorId(context), reviewNote: review.note },
				})
				if (state === 'published')
					await tx.searchDocument.upsert({
						where: { listingId },
						create: { listingId, kind: updated.kind, title: updated.title, category: updated.category, version: updated.version },
						update: { kind: updated.kind, title: updated.title, category: updated.category, version: updated.version, projectedAt: new Date() },
					})
				await tx.auditLog.create({
					data: {
						workspaceId: context.workspaceId,
						actorId: this.actorId(context),
						action: 'listing.reviewed',
						correlationId: randomUUID(),
						metadata: json({ listingId, state, note: review.note }),
					},
				})
				await this.enqueue(
					tx,
					this.catalogEvent(context, state === 'published' ? 'ListingPublished' : 'ListingUnpublished', listingId, updated.version, key, {
						listingId,
						state,
					}),
				)
				return this.listingResult(updated)
			})
			return { ...result.outcome, replayed: result.replayed }
		})
	}

	async unpublishListing(sessionId: string | undefined, keyInput: string | undefined, listingId: string) {
		this.requireResourceId(listingId)
		const key = IdempotencyKeySchema.parse(keyInput)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const vendor = await this.vendorForWrite(tx, context)
			await this.requireOwnedListing(tx, listingId, vendor.id)
			const result = await this.replayOrCreate(tx, context, key, 'POST /v1/listings/:listingId/unpublish', { listingId }, async () => {
				const listing = await tx.listing.findFirst({ where: { id: listingId, vendorId: vendor.id, state: 'published' } })
				if (!listing) throw new AccessDeniedError()
				const updated = await tx.listing.update({
					where: { id: listingId },
					data: { state: 'unpublished', unpublishedAt: new Date(), version: { increment: 1 } },
					include: { variants: true },
				})
				await tx.searchDocument.deleteMany({ where: { listingId } })
				await tx.listingRevision.create({
					data: {
						listingId,
						version: updated.version,
						state: updated.state,
						risk: 'low',
						snapshot: json(this.listingResult(updated)),
						reviewNote: 'unpublished by vendor',
					},
				})
				await this.enqueue(tx, this.catalogEvent(context, 'ListingUnpublished', listingId, updated.version, key, { listingId }))
				return this.listingResult(updated)
			})
			return { ...result.outcome, replayed: result.replayed }
		})
	}

	async processShortVideo(sessionId: string | undefined, listingId: string, input: unknown) {
		this.requireResourceId(listingId)
		const command = MediaProcessingCommandSchema.parse(input)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const vendor = await this.vendorForWrite(tx, context)
			const listing = await tx.listing.findFirst({ where: { id: listingId, vendorId: vendor.id } })
			if (!listing) throw new AccessDeniedError()
			const accessibilityComplete = Boolean(command.captionText || (command.noSpeechDeclared && command.description))
			const media = await tx.mediaAsset.create({
				data: {
					listingId,
					kind: 'short_video',
					state: 'quarantined',
					captionText: command.captionText,
					noSpeechDeclared: command.noSpeechDeclared,
					description: command.description,
					quarantineReason: accessibilityComplete ? 'video upload and safe processing required' : 'caption or no-speech description required',
				},
			})
			await this.enqueue(tx, this.catalogEvent(context, 'MediaQuarantined', media.id, 1, null, { listingId, mediaId: media.id, state: media.state }))
			return MediaAssetSchema.parse({ id: media.id, state: media.state })
		})
	}

	async createVideoUploadIntent(sessionId: string | undefined, keyInput: string | undefined, listingId: string, input: unknown) {
		this.requireResourceId(listingId)
		const key = IdempotencyKeySchema.parse(keyInput)
		const command = MediaUploadIntentCommandSchema.parse(input)
		const store = this.requireMediaStore()
		const result = await this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const vendor = await this.vendorForWrite(tx, context)
			await this.requireOwnedListing(tx, listingId, vendor.id)
			return this.replayOrCreate(tx, context, key, 'POST /v1/listings/:listingId/video-upload-intents', { listingId, command }, async () => {
				const mediaId = randomUUID()
				const uploadKey = `quarantine/uploads/${context.workspaceId}/${mediaId}`
				const expiresAt = new Date(Date.now() + Phase01MediaLimits.uploadIntentSeconds * 1000)
				await tx.mediaAsset.create({
					data: {
						id: mediaId,
						listingId,
						uploaderId: this.actorId(context),
						kind: 'short_video',
						state: 'pending_upload',
						uploadKey,
						uploadSha256: command.sha256,
						uploadBytes: command.bytes,
						uploadExpiresAt: expiresAt,
						captionText: command.captionText,
						noSpeechDeclared: command.noSpeechDeclared,
						description: command.description,
						quarantineReason: 'upload pending',
					},
				})
				return { mediaId, uploadKey, expiresAt: expiresAt.toISOString() }
			})
		})
		const expiresIn = Math.floor((Date.parse(result.outcome.expiresAt) - Date.now()) / 1000)
		if (expiresIn < 1) throw new AccessDeniedError('The upload intent expired; request a new intent.')
		const current = await this.db.mediaAsset.findUnique({ where: { id: result.outcome.mediaId }, select: { state: true, uploadExpiresAt: true } })
		if (current?.state !== 'pending_upload' || !current.uploadExpiresAt || current.uploadExpiresAt <= new Date())
			throw new AccessDeniedError('The upload intent is no longer pending.')
		const grant = await store.createUploadGrant(result.outcome.uploadKey, command.bytes, expiresIn)
		return MediaUploadIntentSchema.parse({
			...grant,
			mediaId: result.outcome.mediaId,
			state: 'pending_upload',
			expiresAt: result.outcome.expiresAt,
			replayed: result.replayed,
		})
	}

	async completeVideoUpload(sessionId: string | undefined, mediaId: string, input: unknown) {
		this.requireResourceId(mediaId)
		const command = MediaUploadCompleteCommandSchema.parse(input)
		const store = this.requireMediaStore()
		const media = await this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const vendor = await this.vendorForWrite(tx, context)
			const record = await tx.mediaAsset.findFirst({ where: { id: mediaId, listing: { vendorId: vendor.id } } })
			if (!record || record.uploadSha256 !== command.sha256) throw new AccessDeniedError()
			if (record.state === 'quarantined' && record.sealedKey) return record
			if (
				record.state !== 'pending_upload' ||
				!record.uploadKey ||
				!record.uploadBytes ||
				!record.uploadExpiresAt ||
				record.uploadExpiresAt <= new Date()
			)
				throw new AccessDeniedError('The upload intent expired or was already rejected.')
			return record
		})
		if (media.state === 'quarantined' && media.sealedKey) return MediaAssetSchema.parse({ id: media.id, state: media.state })
		if (!media.uploadKey || !media.uploadBytes || !media.uploadSha256) throw new AccessDeniedError()
		const sealedKey = `quarantine/sealed/${media.listingId}/${media.id}`
		await store.sealUpload(media.uploadKey, sealedKey, media.uploadBytes, media.uploadSha256)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const vendor = await this.vendorForWrite(tx, context)
			await this.requireOwnedListing(tx, media.listingId, vendor.id)
			const updated = await tx.mediaAsset.updateMany({
				where: { id: media.id, state: 'pending_upload', uploadSha256: command.sha256 },
				data: { state: 'quarantined', sealedKey, uploadedAt: new Date(), quarantineReason: 'safe processing required' },
			})
			if (updated.count === 0) {
				const existing = await tx.mediaAsset.findUniqueOrThrow({ where: { id: media.id } })
				if (existing.state !== 'quarantined' || existing.sealedKey !== sealedKey) throw new AccessDeniedError()
				return MediaAssetSchema.parse({ id: existing.id, state: existing.state })
			}
			await this.enqueue(
				tx,
				this.catalogEvent(context, 'MediaQuarantined', media.id, 1, null, { listingId: media.listingId, mediaId: media.id, state: 'quarantined' }),
			)
			return MediaAssetSchema.parse({ id: media.id, state: 'quarantined' })
		})
	}

	async processQuarantinedMedia(mediaId: string) {
		this.requireResourceId(mediaId)
		const media = await this.db.mediaAsset.findUnique({ where: { id: mediaId }, include: { listing: { include: { vendor: true } } } })
		if (!media || media.state !== 'quarantined' || !media.sealedKey) return { processed: false }
		const store = this.requireMediaStore()
		if (!this.videoProcessor) throw new Error('Video scanning and processing are not configured.')
		try {
			const body = await store.readPrivate(media.sealedKey, Phase01MediaLimits.maxUploadBytes)
			if (!media.uploadSha256 || createHash('sha256').update(body).digest('hex') !== media.uploadSha256)
				throw new MediaRejectedError('Sealed source checksum mismatch.')
			const output = await this.videoProcessor.process({
				body,
				captionText: media.captionText,
				noSpeechDeclared: media.noSpeechDeclared,
				description: media.description,
			})
			const renditionHash = createHash('sha256').update(output.processed).digest('hex')
			const posterHash = createHash('sha256').update(output.poster).digest('hex')
			const renditionKey = `private/processed/${media.id}/${renditionHash}.mp4`
			const posterKey = `private/processed/${media.id}/${posterHash}.jpg`
			await store.writePrivate(renditionKey, output.processed, 'video/mp4')
			await store.writePrivate(posterKey, output.poster, 'image/jpeg')
			return this.db.$transaction(async (tx) => {
				await this.workspaceLock(tx, media.listing.vendor.workspaceId)
				const updated = await tx.mediaAsset.updateMany({
					where: { id: media.id, state: 'quarantined', sealedKey: media.sealedKey },
					data: {
						state: 'needs_moderation',
						renditionKey,
						posterKey,
						scanVerdict: 'clean',
						durationSeconds: output.durationSeconds,
						sourceWidth: output.sourceWidth,
						sourceHeight: output.sourceHeight,
						outputWidth: output.outputWidth,
						outputHeight: output.outputHeight,
						processedAt: new Date(),
						quarantineReason: 'Platform media moderation required',
						version: { increment: 1 },
					},
				})
				if (updated.count !== 1) return { processed: false }
				await this.enqueue(
					tx,
					this.mediaSystemEvent(media.listing.vendor.workspaceId, 'MediaProcessed', media.id, media.version + 1, {
						listingId: media.listingId,
						mediaId: media.id,
					}),
				)
				return { processed: true, state: 'needs_moderation' }
			})
		} catch (error) {
			if (!(error instanceof MediaRejectedError)) throw error
			return this.db.$transaction(async (tx) => {
				await this.workspaceLock(tx, media.listing.vendor.workspaceId)
				const updated = await tx.mediaAsset.updateMany({
					where: { id: media.id, state: 'quarantined', sealedKey: media.sealedKey },
					data: { state: 'rejected', quarantineReason: error.message, version: { increment: 1 } },
				})
				if (updated.count !== 1) return { processed: false }
				await this.enqueue(
					tx,
					this.mediaSystemEvent(media.listing.vendor.workspaceId, 'MediaRejected', media.id, media.version + 1, {
						listingId: media.listingId,
						mediaId: media.id,
					}),
				)
				return { processed: true, state: 'rejected' }
			})
		}
	}

	async readPlatformMediaQueue(sessionId: string | undefined, queryInput: unknown) {
		const query = MediaReviewQueueQuerySchema.parse(queryInput)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			if (!context.capabilities.includes('platform:vendor:review')) throw new AccessDeniedError()
			const where = { state: 'needs_moderation', listing: { vendor: { workspaceId: context.workspaceId } } }
			if (query.cursor && !(await tx.mediaAsset.findFirst({ where: { ...where, id: query.cursor }, select: { id: true } }))) throw new AccessDeniedError()
			const records = await tx.mediaAsset.findMany({
				where,
				orderBy: { id: 'asc' },
				take: query.limit + 1,
				...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
				include: { listing: { include: { vendor: true } } },
			})
			const page = records.slice(0, query.limit)
			return MediaReviewQueueSchema.parse({
				items: page.map((media) => ({
					id: media.id,
					listingId: media.listingId,
					listingTitle: media.listing.title,
					vendorName: media.listing.vendor.displayName,
					version: media.version,
					durationSeconds: media.durationSeconds,
					outputWidth: media.outputWidth,
					outputHeight: media.outputHeight,
					captioned: Boolean(media.captionText),
					noSpeechDeclared: media.noSpeechDeclared,
					description: media.description,
				})),
				nextCursor: records.length > query.limit ? page.at(-1)?.id : null,
			})
		})
	}

	async previewMediaForReview(sessionId: string | undefined, mediaId: string) {
		this.requireResourceId(mediaId)
		const media = await this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			if (!context.capabilities.includes('platform:vendor:review')) throw new AccessDeniedError()
			const record = await tx.mediaAsset.findFirst({
				where: { id: mediaId, state: 'needs_moderation', listing: { vendor: { workspaceId: context.workspaceId } } },
			})
			if (!record || !record.renditionKey || !record.posterKey) throw new AccessDeniedError()
			return record
		})
		const store = this.requireMediaStore()
		if (!media.renditionKey || !media.posterKey) throw new AccessDeniedError()
		const expiresIn = 300
		const [videoUrl, posterUrl] = await Promise.all([
			store.createReadGrant(media.renditionKey, expiresIn),
			store.createReadGrant(media.posterKey, expiresIn),
		])
		return MediaPreviewSchema.parse({
			mediaId,
			videoUrl,
			posterUrl,
			captionText: media.captionText,
			noSpeechDeclared: media.noSpeechDeclared,
			description: media.description,
			expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
		})
	}

	async reviewMedia(sessionId: string | undefined, keyInput: string | undefined, mediaId: string, input: unknown) {
		this.requireResourceId(mediaId)
		const key = IdempotencyKeySchema.parse(keyInput)
		const command = MediaReviewCommandSchema.parse(input)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			if (!context.capabilities.includes('platform:vendor:review')) throw new AccessDeniedError()
			if (context.actor.kind === 'user') assertRecentMfa(context)
			const media = await tx.mediaAsset.findFirst({ where: { id: mediaId, listing: { vendor: { workspaceId: context.workspaceId } } } })
			if (!media) throw new AccessDeniedError()
			const result = await this.replayOrCreate(tx, context, key, 'POST /v1/platform/media/:mediaId/review', { mediaId, command }, async () => {
				const updated = await tx.mediaAsset.updateMany({
					where: {
						id: mediaId,
						state: 'needs_moderation',
						version: command.expectedVersion,
						scanVerdict: 'clean',
						renditionKey: { not: null },
						posterKey: { not: null },
					},
					data: {
						state: command.decision === 'approve' ? 'ready' : 'rejected',
						moderatedBy: this.actorId(context),
						moderatedAt: new Date(),
						moderationNote: command.note,
						quarantineReason: command.decision === 'approve' ? null : 'Platform media review rejected',
						version: { increment: 1 },
					},
				})
				if (updated.count !== 1) throw new AccessDeniedError('The media review is stale.')
				const state = command.decision === 'approve' ? 'ready' : 'rejected'
				await tx.auditLog.create({
					data: {
						workspaceId: context.workspaceId,
						actorId: this.actorId(context),
						action: 'media.reviewed',
						correlationId: randomUUID(),
						metadata: json({ mediaId, listingId: media.listingId, state, note: command.note }),
					},
				})
				await this.enqueue(
					tx,
					this.catalogEvent(context, 'MediaReviewed', mediaId, command.expectedVersion + 1, key, { mediaId, listingId: media.listingId, state }),
				)
				return { id: mediaId, state, version: command.expectedVersion + 1 }
			})
			return MediaReviewResultSchema.parse({ ...result.outcome, replayed: result.replayed })
		})
	}

	async readPublicMedia(mediaId: string, kind: 'video' | 'poster' | 'captions') {
		this.requireResourceId(mediaId)
		const media = await this.db.mediaAsset.findFirst({
			where: {
				id: mediaId,
				kind: 'short_video',
				state: 'ready',
				scanVerdict: 'clean',
				listing: {
					state: 'published',
					vendor: { applicationState: 'approved', publishedAt: { not: null }, workspace: { kind: this.publicWorkspaceKind } },
				},
			},
			select: { renditionKey: true, posterKey: true, captionText: true },
		})
		if (!media) throw new AccessDeniedError()
		if (kind === 'captions') {
			if (!media.captionText) throw new AccessDeniedError()
			return { body: Buffer.from(media.captionText, 'utf8'), contentType: 'text/vtt; charset=utf-8' }
		}
		const objectKey = kind === 'video' ? media.renditionKey : media.posterKey
		if (!objectKey) throw new AccessDeniedError()
		const contentType = kind === 'video' ? 'video/mp4' : 'image/jpeg'
		const maxBytes = kind === 'video' ? Phase01MediaLimits.maxUploadBytes : 2 * 1024 * 1024
		return { body: await this.requireMediaStore().readPrivate(objectKey, maxBytes, contentType), contentType }
	}

	async importCatalogCsv(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const command = CatalogImportCommandSchema.parse(input)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const vendor = await this.vendorForWrite(tx, context)
			const result = await this.replayOrCreate(tx, context, key, 'POST /v1/catalog-imports', command, async () => {
				const [header, ...data] = parseCatalogCsv(command.csv)
				if (!header || header.error || header.fields.join(',') !== CATALOG_CSV_HEADER)
					throw new AccessDeniedError('CSV template v1 header is required.')
				const rows = data.map((source) => {
					const [kind, category, rawTitle, rawDescription, priceCents, durationMinutes] = source.fields.map((field) => field.trim())
					const title = decodeCatalogCsvText(rawTitle ?? '')
					const description = decodeCatalogCsvText(rawDescription ?? '')
					const parsed = ListingDraftSchema.safeParse({
						kind,
						category,
						title,
						description,
						priceCents: Number(priceCents),
						durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
					})
					return {
						rowNumber: source.rowNumber,
						errors: [...(source.error ? [source.error] : []), ...(source.fields.length !== 6 ? ['Expected six CSV fields.'] : [])],
						parsed,
						preview: {
							kind,
							category,
							title,
							description,
							priceCents: Number(priceCents),
							durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
						},
					}
				})
				const valid = rows.flatMap((row) => (row.parsed.success && row.errors.length === 0 ? [{ draft: row.parsed.data }] : []))
				const rowErrors = rows.flatMap((row) =>
					row.parsed.success && row.errors.length === 0
						? []
						: [
								{
									rowNumber: row.rowNumber,
									errors: [...row.errors, ...(row.parsed.success ? [] : row.parsed.error.issues.map((issue) => issue.message))],
								},
							],
				)
				const sourceHash = stableHash(command.csv)
				await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`catalog-import:${vendor.id}:${sourceHash}:${command.mode}`}, 0))`
				const existing = await tx.catalogImportJob.findUnique({
					where: { vendorId_sourceHash_mode: { vendorId: vendor.id, sourceHash, mode: command.mode } },
					include: { rows: true },
				})
				if (existing) {
					const previousRows = existing.rows.map((row) => ({
						rowNumber: row.rowNumber,
						status: row.status,
						preview: row.preview,
						errors: row.errors,
					}))
					return CatalogImportResultSchema.parse({
						id: existing.id,
						state: existing.state,
						rowCount: existing.rowCount,
						validRowCount: existing.validRowCount,
						rowErrors: previousRows.filter((row) => row.status === 'error').map((row) => ({ rowNumber: row.rowNumber, errors: row.errors })),
						rows: previousRows,
						replayed: true,
					})
				}
				const state = command.mode === 'commit' && valid.length === rows.length ? 'committed' : command.mode === 'commit' ? 'rejected' : 'dry_run'
				const job = await tx.catalogImportJob.create({
					data: {
						vendorId: vendor.id,
						templateVersion: command.templateVersion,
						sourceHash,
						mode: command.mode,
						state,
						rowCount: rows.length,
						validRowCount: valid.length,
						committedAt: state === 'committed' ? new Date() : null,
					},
				})
				for (const row of rows)
					await tx.catalogImportRow.create({
						data: {
							importJobId: job.id,
							rowNumber: row.rowNumber,
							status: row.parsed.success && row.errors.length === 0 ? (state === 'committed' ? 'committed' : 'valid') : 'error',
							errors: json(rowErrors.find((error) => error.rowNumber === row.rowNumber)?.errors ?? []),
							preview: json(row.preview),
						},
					})
				if (state === 'committed')
					for (const row of valid) {
						const listingDraft = {
							kind: row.draft.kind,
							category: row.draft.category,
							title: row.draft.title,
							description: row.draft.description,
							priceCents: row.draft.priceCents,
							durationMinutes: row.draft.durationMinutes,
						}
						const listing = await tx.listing.create({
							data: {
								vendorId: vendor.id,
								...listingDraft,
								priceCents: listingDraft.priceCents ?? null,
								durationMinutes: listingDraft.durationMinutes ?? null,
							},
						})
						await tx.listingRevision.create({
							data: {
								listingId: listing.id,
								version: 1,
								state: 'draft',
								risk: 'low',
								snapshot: json(row.draft),
								reviewNote: `CSV import ${job.id}`,
							},
						})
					}
				if (state === 'committed')
					await this.enqueue(tx, this.catalogEvent(context, 'CatalogImportCommitted', job.id, 1, key, { importJobId: job.id, rows: valid.length }))
				return CatalogImportResultSchema.parse({
					id: job.id,
					state,
					rowCount: rows.length,
					validRowCount: valid.length,
					rowErrors,
					rows: rows.map((row) => ({
						rowNumber: row.rowNumber,
						status: rowErrors.some((error) => error.rowNumber === row.rowNumber) ? 'error' : state === 'committed' ? 'committed' : 'valid',
						preview: row.preview,
						errors: rowErrors.find((error) => error.rowNumber === row.rowNumber)?.errors ?? [],
					})),
					replayed: false,
				})
			})
			return { ...result.outcome, replayed: result.replayed || result.outcome.replayed }
		})
	}

	async exportCatalogCsv(sessionId: string | undefined) {
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const vendor = await this.vendorForWrite(tx, context)
			const listings = await tx.listing.findMany({ where: { vendorId: vendor.id }, orderBy: { id: 'asc' } })
			return [
				CATALOG_CSV_HEADER,
				...listings.map((listing) =>
					[listing.kind, listing.category, listing.title, listing.description, listing.priceCents, listing.durationMinutes]
						.map(encodeCatalogCsvField)
						.join(','),
				),
			].join('\n')
		})
	}

	async browsePublicListings(queryInput: unknown) {
		const query = PublicListingBrowseQuerySchema.parse(queryInput)
		const documents = await this.db.searchDocument.findMany({
			where: {
				kind: query.kind,
				category: query.category,
				...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
				listing: {
					state: 'published',
					vendor: { applicationState: 'approved', publishedAt: { not: null }, workspace: { kind: this.publicWorkspaceKind } },
				},
			},
			orderBy: { listingId: 'asc' },
			take: query.limit + 1,
			...(query.cursor ? { cursor: { listingId: query.cursor }, skip: 1 } : {}),
			include: {
				listing: { include: { variants: true, media: { where: { state: 'ready', scanVerdict: 'clean' }, orderBy: { moderatedAt: 'desc' }, take: 1 } } },
			},
		})
		const items = documents.slice(0, query.limit).map(({ listing }) => this.listingResult(listing))
		return PublicListingPageSchema.parse({ items, nextCursor: documents.length > query.limit ? (items.at(-1)?.id ?? null) : null })
	}

	async setDiscoveryPreference(sessionId: string | undefined, input: unknown) {
		const preference = DiscoveryPreferenceUpdateSchema.parse(input)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const userId = this.customerId(context)
			const result = await tx.discoveryPreference.upsert({
				where: { userId },
				create: { userId, workspaceId: context.workspaceId, personalizationOptIn: preference.personalizationOptIn },
				update: { workspaceId: context.workspaceId, personalizationOptIn: preference.personalizationOptIn },
			})
			return DiscoveryPreferenceSchema.parse(result)
		})
	}

	async readCustomerDiscoveryState(sessionId: string | undefined) {
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const userId = this.customerId(context)
			const [preference, saved, followed] = await Promise.all([
				tx.discoveryPreference.findUnique({ where: { userId } }),
				tx.savedListing.findMany({
					where: {
						userId,
						listing: { state: 'published', vendor: { workspaceId: context.workspaceId, applicationState: 'approved', publishedAt: { not: null } } },
					},
					select: { listingId: true },
				}),
				tx.vendorFollow.findMany({
					where: { userId, vendor: { workspaceId: context.workspaceId, applicationState: 'approved', publishedAt: { not: null } } },
					select: { vendorId: true },
				}),
			])
			return CustomerDiscoveryStateSchema.parse({
				personalizationOptIn: preference?.workspaceId === context.workspaceId && preference.personalizationOptIn,
				savedListingIds: saved.map((row) => row.listingId),
				followedVendorIds: followed.map((row) => row.vendorId),
			})
		})
	}

	async saveListing(sessionId: string | undefined, listingId: string, saved: boolean) {
		this.requireResourceId(listingId)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const userId = this.customerId(context)
			const listing = await tx.listing.findFirst({
				where: {
					id: listingId,
					state: 'published',
					vendor: { workspaceId: context.workspaceId, applicationState: 'approved', publishedAt: { not: null } },
				},
			})
			if (!listing) throw new AccessDeniedError()
			if (saved) await tx.savedListing.upsert({ where: { userId_listingId: { userId, listingId } }, create: { userId, listingId }, update: {} })
			else await tx.savedListing.deleteMany({ where: { userId, listingId } })
			return EngagementMutationSchema.parse({ saved })
		})
	}

	async followVendor(sessionId: string | undefined, vendorId: string, following: boolean) {
		this.requireResourceId(vendorId)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const userId = this.customerId(context)
			const vendor = await tx.vendor.findFirst({
				where: { id: vendorId, workspaceId: context.workspaceId, applicationState: 'approved', publishedAt: { not: null } },
			})
			if (!vendor) throw new AccessDeniedError()
			if (following) await tx.vendorFollow.upsert({ where: { userId_vendorId: { userId, vendorId } }, create: { userId, vendorId }, update: {} })
			else await tx.vendorFollow.deleteMany({ where: { userId, vendorId } })
			return VendorFollowMutationSchema.parse({ following })
		})
	}

	async recommendPublicListings(sessionId: string | undefined) {
		let context: AccessContext | undefined
		if (sessionId) context = await this.db.$transaction((tx) => this.derive(tx, sessionId))
		let followedVendorIds = new Set<string>()
		let savedCategories = new Set<string>()
		if (context?.actor.kind === 'user') {
			const preference = await this.db.discoveryPreference.findUnique({ where: { userId: context.actor.userId } })
			if (preference?.workspaceId === context.workspaceId && preference.personalizationOptIn) {
				const [follows, saved] = await Promise.all([
					this.db.vendorFollow.findMany({ where: { userId: context.actor.userId }, select: { vendorId: true } }),
					this.db.savedListing.findMany({ where: { userId: context.actor.userId }, include: { listing: { select: { category: true } } } }),
				])
				followedVendorIds = new Set(follows.map((row) => row.vendorId))
				savedCategories = new Set(saved.map((row) => row.listing.category))
			}
		}
		const listings = await this.db.listing.findMany({
			where: {
				state: 'published',
				vendor: { applicationState: 'approved', publishedAt: { not: null }, workspace: { kind: this.publicWorkspaceKind } },
			},
			orderBy: { publishedAt: 'desc' },
			take: 20,
			include: { variants: true },
		})
		return RecommendationPageSchema.parse({
			items: listings.map((listing) => ({
				...this.listingResult(listing),
				reason: followedVendorIds.has(listing.vendorId)
					? 'From a Vendor you follow.'
					: savedCategories.has(listing.category)
						? 'Matches a category you saved.'
						: 'Recently published in public discovery.',
			})),
		})
	}

	async rebuildSearchDocuments() {
		const listings = await this.db.listing.findMany({
			where: { state: 'published' },
			select: { id: true, kind: true, title: true, category: true, version: true },
		})
		await this.db.$transaction(async (tx) => {
			await tx.searchDocument.deleteMany()
			for (const listing of listings)
				await tx.searchDocument.create({
					data: { listingId: listing.id, kind: listing.kind, title: listing.title, category: listing.category, version: listing.version },
				})
		})
		return { rebuilt: listings.length }
	}

	async createSyntheticAccount(input: unknown) {
		const account = SyntheticAccountProvisionSchema.parse(input)
		const user = await this.db.user.create({
			data: {
				email: account.email,
				adultVerificationState: account.adultVerificationState,
				verifiedAt: account.adultVerificationState === 'verified' ? new Date() : null,
			},
		})
		return SyntheticAccountSchema.parse({ id: user.id, email: user.email, adultVerificationState: user.adultVerificationState })
	}

	async grantSyntheticStaff(sessionId: string | undefined, input: unknown) {
		const grant = SyntheticStaffGrantSchema.parse(input)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			if (context.actor.kind !== 'user' || !context.activeVendorId || context.memberships[0]?.role !== 'vendor_owner') throw new AccessDeniedError()
			const user = await tx.user.findUnique({ where: { id: grant.userId } })
			const vendor = await tx.vendor.findUnique({ where: { id: context.activeVendorId }, include: { locations: true } })
			if (!user || !isVerifiedAdult(user) || !vendor || grant.locationIds.some((id) => !vendor.locations.some((location) => location.id === id)))
				throw new AccessDeniedError()
			if (await tx.vendorMembership.findUnique({ where: { userId_vendorId: { userId: user.id, vendorId: vendor.id } } })) throw new AccessDeniedError()
			const staff = await tx.staff.create({ data: { vendorId: vendor.id, userId: user.id } })
			await tx.vendorMembership.create({
				data: { userId: user.id, vendorId: vendor.id, role: 'vendor_staff', staffId: staff.id, locationIds: grant.locationIds },
			})
			const session = await tx.session.create({
				data: {
					userId: user.id,
					workspaceId: context.workspaceId,
					activeVendorId: vendor.id,
					activeRole: 'vendor_staff',
					expiresAt: new Date(Date.now() + 3600000),
				},
			})
			await tx.auditLog.create({
				data: {
					workspaceId: context.workspaceId,
					actorId: context.actor.userId,
					action: 'synthetic.staff-granted',
					correlationId: randomUUID(),
					metadata: json({ staffId: staff.id, userId: user.id, vendorId: vendor.id, locationIds: grant.locationIds }),
				},
			})
			return SyntheticStaffGrantResultSchema.parse({
				staffId: staff.id,
				userId: user.id,
				sessionId: session.id,
				expiresAt: session.expiresAt.toISOString(),
			})
		})
	}

	async revokeSyntheticStaff(sessionId: string | undefined, staffId: string) {
		this.requireResourceId(staffId)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			if (context.actor.kind !== 'user' || !context.activeVendorId || context.memberships[0]?.role !== 'vendor_owner') throw new AccessDeniedError()
			const staff = await tx.staff.findUnique({ where: { id: staffId } })
			if (!staff || staff.vendorId !== context.activeVendorId || !staff.userId) throw new AccessDeniedError()
			const sessions = await tx.session.findMany({
				where: {
					userId: staff.userId,
					workspaceId: context.workspaceId,
					activeVendorId: context.activeVendorId,
					activeRole: 'vendor_staff',
					revokedAt: null,
				},
				select: { id: true },
			})
			await tx.session.updateMany({ where: { id: { in: sessions.map(({ id }) => id) } }, data: { revokedAt: new Date() } })
			await tx.vendorMembership.deleteMany({ where: { staffId } })
			await tx.staff.delete({ where: { id: staffId } })
			await tx.auditLog.create({
				data: {
					workspaceId: context.workspaceId,
					actorId: context.actor.userId,
					action: 'synthetic.staff-revoked',
					correlationId: randomUUID(),
					metadata: json({ staffId, userId: staff.userId, vendorId: context.activeVendorId, revokedSessionIds: sessions.map(({ id }) => id) }),
				},
			})
			return { result: SyntheticStaffRevokeResultSchema.parse({ revoked: true }), revokedSessionIds: sessions.map(({ id }) => id) }
		})
	}

	async realtimeHighWaterCursor(sessionId: string | undefined): Promise<string | null> {
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const event = await tx.outboxEvent.findFirst({ where: { workspaceId: context.workspaceId }, orderBy: { id: 'desc' }, select: { id: true } })
			return event?.id ?? null
		})
	}

	async realtimeReplay(sessionId: string | undefined, cursor: string | undefined) {
		if (cursor) this.requireResourceId(cursor)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const highWater = await tx.outboxEvent.findFirst({
				where: { workspaceId: context.workspaceId },
				orderBy: { id: 'desc' },
				select: { id: true },
			})
			if (!cursor) return { cursor: highWater?.id ?? null, events: [], restRefetchRequired: false }
			const cursorEvent = await tx.outboxEvent.findFirst({ where: { id: cursor, workspaceId: context.workspaceId }, select: { id: true } })
			if (!cursorEvent || !highWater) return { cursor: highWater?.id ?? null, events: [], restRefetchRequired: true }
			const records = await tx.outboxEvent.findMany({
				where: { workspaceId: context.workspaceId, id: { gt: cursor, lte: highWater.id } },
				orderBy: { id: 'asc' },
				take: realtimeReplayLimit + 1,
				select: { id: true, eventId: true, type: true, payload: true, occurredAt: true },
			})
			if (records.length > realtimeReplayLimit) return { cursor: highWater.id, events: [], restRefetchRequired: true }
			return {
				cursor: highWater.id,
				events: records.map((record) => this.realtimeEvent(record, context.workspaceId)),
				restRefetchRequired: false,
			}
		})
	}

	async realtimeFoundationEventForCommand(sessionId: string | undefined, commandId: string): Promise<RealtimeFoundationEvent | null> {
		this.requireResourceId(commandId)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const record = await tx.outboxEvent.findFirst({
				where: {
					workspaceId: context.workspaceId,
					type: 'FoundationCommandAccepted',
					payload: { path: ['aggregateId'], equals: commandId },
				},
				select: { id: true, eventId: true, type: true, payload: true, occurredAt: true },
			})
			return record ? this.realtimeEvent(record, context.workspaceId) : null
		})
	}

	async acceptAuditMarker(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		return this.acceptAuditMarkerForMethod(sessionId, keyInput, input, auditMarkerMethod, false)
	}

	async acceptElevatedAuditMarker(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		return this.acceptAuditMarkerForMethod(sessionId, keyInput, input, elevatedAuditMarkerMethod, true)
	}

	async receiveProviderWebhook(workspaceId: string, provider: string, eventId: string | undefined, body: unknown) {
		if (provider !== 'fake-payment' || !eventId || eventId.length > 200) throw new AccessDeniedError()
		const callback = SyntheticProviderCallbackSchema.parse(body)
		return this.db.$transaction(async (tx) => {
			await this.workspaceLock(tx, workspaceId)
			// Provider event identity is global, independent of the configured workspace.
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${provider + ':' + eventId}, 0))`
			const prior = await tx.providerInboxEvent.findUnique({ where: { provider_providerEventId: { provider, providerEventId: eventId } } })
			const payloadHash = stableHash(body)
			if (prior) {
				if (prior.payloadHash !== payloadHash || prior.workspaceId !== workspaceId) throw new IdempotencyConflictError()
				return { accepted: true, duplicate: true }
			}
			await this.consumeDemoProviderQuota(tx, workspaceId)
			const now = new Date()
			await tx.providerInboxEvent.create({
				data: {
					provider,
					providerEventId: eventId,
					workspaceId,
					providerReference: callback.providerReference,
					payloadHash,
					payload: json(callback),
					reconciliationState: callback.outcome === 'timed_out' ? 'pending_reconciliation' : 'reconciled',
					reconciledAt: callback.outcome === 'confirmed' ? now : null,
					processedAt: now,
				},
			})
			await this.enqueueProviderEvent(tx, workspaceId, 'ProviderCallbackReceived', { provider, eventId, providerReference: callback.providerReference })
			if (callback.outcome === 'confirmed') {
				await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${provider + ':' + callback.providerReference}, 0))`
				const reconciled = await tx.providerInboxEvent.updateMany({
					where: { workspaceId, provider, providerReference: callback.providerReference, reconciliationState: 'pending_reconciliation' },
					data: { reconciliationState: 'reconciled', reconciledAt: now },
				})
				if (reconciled.count > 0)
					await this.enqueueProviderEvent(tx, workspaceId, 'ProviderTimeoutReconciled', {
						provider,
						providerReference: callback.providerReference,
						reconciledTimeouts: reconciled.count,
					})
			}
			return { accepted: true, duplicate: false }
		})
	}

	async createDemoWorkspace(now = new Date()) {
		return this.db.$transaction(async (tx) => {
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(773001)`
			if ((await tx.demoWorkspace.count({ where: { purgedAt: null, expiresAt: { gt: now } } })) >= 100)
				throw new AccessDeniedError('Synthetic workspace quota reached.')
			const workspace = await tx.workspace.create({ data: { kind: 'demo' } })
			const expiresAt = new Date(now.getTime() + 86400000)
			const demo = await tx.demoWorkspace.create({ data: { workspaceId: workspace.id, expiresAt } })
			const vendor = await tx.vendor.create({ data: { workspaceId: workspace.id } })
			const location = await tx.location.create({ data: { vendorId: vendor.id } })
			const personas = []
			for (const fixture of DEMO_PERSONAS)
				personas.push(
					await tx.demoPersona.create({
						data: {
							workspaceId: workspace.id,
							key: fixture.key,
							role: fixture.role,
							vendorId: fixture.key === 'vendor_owner' ? vendor.id : null,
							locationIds: fixture.key === 'vendor_owner' ? [location.id] : [],
						},
					}),
				)
			const owner = personas.find((persona) => persona.key === 'vendor_owner')
			if (!owner) throw new Error('Demo owner fixture is missing.')
			const session = await tx.session.create({
				data: { demoPersonaId: owner.id, workspaceId: workspace.id, activeVendorId: vendor.id, activeRole: owner.role, expiresAt },
			})
			return DemoWorkspaceSchema.parse({
				id: workspace.id,
				createdAt: demo.createdAt.toISOString(),
				expiresAt: demo.expiresAt.toISOString(),
				state: 'active',
				personas: personas.map(({ key, role }) => ({ key, role })),
				session: { id: session.id, personaKey: 'vendor_owner', expiresAt: session.expiresAt.toISOString() },
			})
		})
	}

	async switchDemoPersona(sessionId: string | undefined, workspaceId: string, keyInput: string) {
		this.requireResourceId(workspaceId)
		const key = DemoPersonaKeySchema.parse(keyInput)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			if (context.actor.kind !== 'demo_persona' || context.workspaceId !== workspaceId) throw new AccessDeniedError()
			const persona = await tx.demoPersona.findUnique({ where: { workspaceId_key: { workspaceId, key } } })
			const demo = await tx.demoWorkspace.findFirst({ where: { workspaceId, purgedAt: null, expiresAt: { gt: new Date() } } })
			if (!persona || !demo) throw new AccessDeniedError()
			const revoked = await tx.session.updateMany({ where: { id: context.session.id, revokedAt: null }, data: { revokedAt: new Date() } })
			if (revoked.count !== 1) throw new AccessDeniedError()
			const session = await tx.session.create({
				data: {
					demoPersonaId: persona.id,
					workspaceId,
					activeVendorId: persona.vendorId,
					activeRole: persona.role,
					expiresAt: demo.expiresAt,
				},
			})
			await tx.auditLog.create({
				data: {
					workspaceId,
					actorId: context.actor.personaId,
					action: 'demo.persona-switched',
					correlationId: randomUUID(),
					metadata: json({ fromPersonaId: context.actor.personaId, toPersonaId: persona.id, personaKey: key }),
				},
			})
			return DemoSessionSchema.parse({ id: session.id, personaKey: key, expiresAt: session.expiresAt.toISOString() })
		})
	}

	async purgeExpiredDemoWorkspaces(now = new Date()) {
		const demos = await this.db.demoWorkspace.findMany({ where: { purgedAt: null, expiresAt: { lte: now } } })
		const purged: string[] = []
		for (const demo of demos)
			await this.db.$transaction(
				async (tx) => {
					const id = demo.workspaceId
					await tx.$queryRaw`SELECT id FROM "workspaces" WHERE id = ${id}::uuid FOR UPDATE`
					const current = await tx.demoWorkspace.findUnique({ where: { id: demo.id } })
					if (!current || current.purgedAt || current.expiresAt > now) return
					const workspace = await tx.workspace.findUnique({ where: { id } })
					if (workspace?.kind !== 'demo') throw new AccessDeniedError()
					const media = await tx.mediaAsset.findMany({
						where: { listing: { vendor: { workspaceId: id } } },
						select: { uploadKey: true, sealedKey: true, renditionKey: true, posterKey: true },
					})
					const mediaKeys = [
						...new Set(
							media.flatMap((asset) =>
								[asset.uploadKey, asset.sealedKey, asset.renditionKey, asset.posterKey].filter((key): key is string => Boolean(key)),
							),
						),
					]
					if (mediaKeys.length) {
						const store = this.requireMediaStore()
						for (const key of mediaKeys) await store.deletePrivate(key)
					}
					await tx.session.deleteMany({ where: { workspaceId: id } })
					await tx.demoPersona.deleteMany({ where: { workspaceId: id } })
					await tx.vendorMembership.deleteMany({ where: { vendor: { workspaceId: id } } })
					await tx.inventoryMovement.deleteMany({ where: { location: { vendor: { workspaceId: id } } } })
					await tx.mediaAsset.deleteMany({ where: { listing: { vendor: { workspaceId: id } } } })
					await tx.listingRevision.deleteMany({ where: { listing: { vendor: { workspaceId: id } } } })
					await tx.listing.deleteMany({ where: { vendor: { workspaceId: id } } })
					await tx.catalogImportJob.deleteMany({ where: { vendor: { workspaceId: id } } })
					await tx.location.deleteMany({ where: { vendor: { workspaceId: id } } })
					await tx.staff.deleteMany({ where: { vendor: { workspaceId: id } } })
					await tx.vendor.deleteMany({ where: { workspaceId: id } })
					await tx.savedSearch.deleteMany({ where: { workspaceId: id } })
					await tx.discoveryPreference.deleteMany({ where: { workspaceId: id } })
					await tx.idempotencyRecord.deleteMany({ where: { workspaceId: id } })
					await tx.providerInboxEvent.deleteMany({ where: { workspaceId: id } })
					await tx.outboxEvent.deleteMany({ where: { workspaceId: id } })
					await tx.outboxReceipt.deleteMany({ where: { workspaceId: id } })
					await tx.syntheticExternalEffect.deleteMany({ where: { workspaceId: id } })
					await tx.auditLog.deleteMany({ where: { workspaceId: id } })
					await tx.demoWorkspace.update({ where: { id: demo.id }, data: { purgedAt: now } })
					purged.push(id)
				},
				{ timeout: 120_000 },
			)
		return purged
	}

	async expirePendingVideoUploads(now = new Date()) {
		const pending = await this.db.mediaAsset.findMany({
			where: { state: 'pending_upload', uploadExpiresAt: { lte: now }, uploadKey: { not: null } },
			orderBy: { uploadExpiresAt: 'asc' },
			take: 100,
			include: { listing: { include: { vendor: true } } },
		})
		let expired = 0
		for (const media of pending) {
			if (!media.uploadKey) continue
			await this.db.$transaction(
				async (tx) => {
					await this.workspaceLock(tx, media.listing.vendor.workspaceId)
					const current = await tx.mediaAsset.findUnique({ where: { id: media.id } })
					if (!current || current.state !== 'pending_upload' || !current.uploadKey || !current.uploadExpiresAt || current.uploadExpiresAt > now)
						return
					await this.requireMediaStore().deletePrivate(current.uploadKey)
					await tx.mediaAsset.update({
						where: { id: current.id },
						data: { state: 'rejected', quarantineReason: 'Upload intent expired.', version: { increment: 1 } },
					})
					await this.enqueue(
						tx,
						this.mediaSystemEvent(media.listing.vendor.workspaceId, 'MediaRejected', current.id, current.version + 1, {
							listingId: media.listingId,
							mediaId: current.id,
						}),
					)
					expired++
				},
				{ timeout: 30_000 },
			)
		}
		return expired
	}

	async reconcileOrphanMediaObjects(now = new Date()) {
		if (!this.mediaStore) return 0
		const cutoff = new Date(now.getTime() - 60 * 60 * 1000)
		let deleted = 0
		for (const prefix of ['quarantine/uploads/', 'quarantine/sealed/', 'private/processed/']) {
			for await (const object of this.mediaStore.listPrivate(prefix)) {
				if (object.lastModified > cutoff) continue
				const segments = object.key.split('/')
				const candidateId = prefix === 'private/processed/' ? segments[2] : segments.at(-1)
				const referenced = await this.db.mediaAsset.findFirst({
					where: {
						OR: [
							...(candidateId && uuidPattern.test(candidateId) ? [{ id: candidateId }] : []),
							{ uploadKey: object.key },
							{ sealedKey: object.key },
							{ renditionKey: object.key },
							{ posterKey: object.key },
						],
					},
					select: { id: true },
				})
				if (referenced) continue
				await this.db.auditLog.create({
					data: {
						action: 'media.orphan-candidate',
						correlationId: randomUUID(),
						metadata: json({ key: object.key, lastModified: object.lastModified.toISOString() }),
					},
				})
				await this.mediaStore.deletePrivate(object.key)
				await this.db.auditLog.create({
					data: { action: 'media.orphan-deleted', correlationId: randomUUID(), metadata: json({ key: object.key }) },
				})
				deleted++
			}
		}
		return deleted
	}

	async claim(workerId: string, leaseMs = 30000): Promise<DurableClaim | undefined> {
		if (!Number.isFinite(leaseMs) || leaseMs <= 0) throw new Error('Invalid lease.')
		const stagingTypeFilter = process.env['JUNCTION_RUNTIME_MODE'] === 'staging' ? Prisma.sql`AND type = 'MediaQuarantined'` : Prisma.empty
		await this.db.$executeRaw`
      UPDATE "outbox_events" SET state = 'dead_letter', "claimed_by" = NULL, "claimed_at" = NULL, "claim_token" = NULL
      WHERE state = 'in_flight' AND attempts >= 3 AND "claimed_at" <= clock_timestamp() - ${leaseMs} * interval '1 millisecond'`
		const token = randomUUID()
		const records = await this.db.$queryRaw<DurableClaim[]>`
      UPDATE "outbox_events" SET state = 'in_flight', "claimed_by" = ${workerId}, "claimed_at" = clock_timestamp(), "claim_token" = ${token}::uuid, attempts = attempts + 1
      WHERE id = (SELECT id FROM "outbox_events" WHERE ((state = 'pending' AND "available_at" <= clock_timestamp()) OR (state = 'in_flight' AND "claimed_at" <= clock_timestamp() - ${leaseMs} * interval '1 millisecond')) ${stagingTypeFilter} ORDER BY "occurred_at", id FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id, "claim_token" AS "claimToken", payload, attempts`
		return records[0]
	}

	async complete(claim: DurableClaim) {
		const event = DomainEventSchema.parse(claim.payload)
		await this.db.$transaction(async (tx) => {
			await this.workspaceLock(tx, event.workspaceId)
			const updated = await tx.outboxEvent.updateMany({
				where: { id: claim.id, state: 'in_flight', claimToken: claim.claimToken },
				data: { state: 'delivered', claimedBy: null, claimedAt: null, claimToken: null },
			})
			if (updated.count !== 1) throw new Error('Stale outbox claim.')
			// Synthetic consumer effect and acknowledgement are atomic; event identity deduplicates replay.
			await tx.outboxReceipt.upsert({ where: { eventId: event.eventId }, create: { eventId: event.eventId, workspaceId: event.workspaceId }, update: {} })
		})
	}

	async fail(claim: DurableClaim) {
		const updated = await this.db.outboxEvent.updateMany({
			where: { id: claim.id, state: 'in_flight', claimToken: claim.claimToken },
			data: {
				state: claim.attempts >= 3 ? 'dead_letter' : 'pending',
				availableAt: new Date(Date.now() + 1000 * 2 ** Math.min(claim.attempts, 10)),
				claimedBy: null,
				claimedAt: null,
				claimToken: null,
			},
		})
		if (updated.count !== 1) throw new Error('Stale outbox claim.')
	}

	async processOne(workerId: string) {
		const claim = await this.claim(workerId, 240_000)
		if (!claim) return { processed: false }
		try {
			const event = DomainEventSchema.parse(claim.payload)
			if (process.env['JUNCTION_RUNTIME_MODE'] === 'staging' && event.type !== 'MediaQuarantined')
				throw new Error('No real staging delivery handler is configured for this event type.')
			if (event.type === 'FoundationCommandAccepted') await this.externalEffects.deliver(event)
			if (event.type === 'MediaQuarantined') await this.processQuarantinedMedia(event.aggregateId)
			await this.complete(claim)
			return { processed: true }
		} catch {
			await this.fail(claim)
			return { processed: false, retryScheduled: claim.attempts < 3 }
		}
	}

	private async workspaceLock(tx: Transaction, id: string) {
		this.requireResourceId(id)
		await tx.$queryRaw`SELECT id FROM "workspaces" WHERE id = ${id}::uuid FOR UPDATE`
		const workspace = await tx.workspace.findUnique({ where: { id }, include: { demos: true } })
		if (!workspace || !['synthetic', 'demo', 'real'].includes(workspace.kind) || workspace.demos.some((d) => d.purgedAt || d.expiresAt <= new Date()))
			throw new AccessDeniedError()
	}

	private async consumeDemoProviderQuota(tx: Transaction, workspaceId: string) {
		const demo = await tx.demoWorkspace.findFirst({ where: { workspaceId, purgedAt: null, expiresAt: { gt: new Date() } } })
		if (!demo) return
		const consumed = await tx.demoWorkspace.updateMany({
			where: { id: demo.id, providerEventsUsed: { lt: demo.providerEventsLimit } },
			data: { providerEventsUsed: { increment: 1 } },
		})
		if (consumed.count !== 1) throw new AccessDeniedError('Synthetic demo provider quota reached.')
	}

	private async consumeDemoPersonaCommandQuota(tx: Transaction, personaId: string) {
		const consumed = await tx.$executeRaw`
			UPDATE "demo_personas"
			SET "command_events_used" = "command_events_used" + 1
			WHERE id = ${personaId}::uuid
				AND "command_events_used" < "command_events_limit"
		`
		if (consumed !== 1) throw new AccessDeniedError('Synthetic demo persona command quota reached.')
	}

	private async derive(tx: Transaction, sessionId: string | undefined): Promise<AccessContext> {
		if (!sessionId) throw new AccessDeniedError()
		this.requireResourceId(sessionId)
		const session = await tx.session.findUnique({ where: { id: sessionId }, include: { user: true, demoPersona: true } })
		if (!session || session.revokedAt || session.expiresAt <= new Date() || Boolean(session.user) === Boolean(session.demoPersona))
			throw new AccessDeniedError()
		if (session.user && !isVerifiedAdult(session.user)) throw new AccessDeniedError()
		await this.workspaceLock(tx, session.workspaceId)
		// Lock identity/session/membership rows so revocation cannot race an accepted write.
		await tx.$queryRaw`SELECT id FROM "sessions" WHERE id = ${session.id}::uuid FOR UPDATE`
		const current = await tx.session.findUniqueOrThrow({ where: { id: session.id } })
		if (
			current.revokedAt ||
			current.expiresAt <= new Date() ||
			current.userId !== session.userId ||
			current.demoPersonaId !== session.demoPersonaId ||
			current.workspaceId !== session.workspaceId ||
			current.activeVendorId !== session.activeVendorId ||
			current.activeRole !== session.activeRole
		)
			throw new AccessDeniedError()
		if (process.env['JUNCTION_RUNTIME_MODE'] === 'staging') {
			if (!session.user) throw new AccessDeniedError()
			const workspace = await tx.workspace.findUnique({ where: { id: session.workspaceId }, select: { kind: true } })
			if (workspace?.kind !== 'real') throw new AccessDeniedError()
			const authSessions = await tx.$queryRaw<Array<{ id: string }>>`
				SELECT s.id FROM junction_auth.session s
				JOIN junction_auth."user" u ON u.id = s."userId"
				WHERE s.id = ${session.id} AND s."userId" = ${session.user.id}
					AND s."expiresAt" > clock_timestamp() AND u."emailVerified" = true
				FOR SHARE OF s, u`
			if (authSessions.length !== 1) throw new AccessDeniedError()
		}
		if (session.demoPersona) {
			await tx.$queryRaw`SELECT id FROM "demo_personas" WHERE id = ${session.demoPersona.id}::uuid FOR SHARE`
			const persona = await tx.demoPersona.findUnique({ where: { id: session.demoPersona.id } })
			if (!persona || persona.workspaceId !== session.workspaceId || persona.role !== session.activeRole || persona.vendorId !== session.activeVendorId)
				throw new AccessDeniedError()
			if (persona.vendorId) {
				const vendor = await tx.vendor.findUnique({ where: { id: persona.vendorId }, include: { locations: true } })
				if (
					!vendor ||
					vendor.workspaceId !== session.workspaceId ||
					['rejected', 'restricted'].includes(vendor.applicationState) ||
					!['vendor_owner', 'vendor_staff'].includes(persona.role) ||
					persona.locationIds.some((id) => !vendor.locations.some((location) => location.id === id))
				)
					throw new AccessDeniedError()
				return AccessContextSchema.parse({
					actor: { kind: 'demo_persona', personaId: persona.id },
					workspaceId: session.workspaceId,
					activeVendorId: persona.vendorId,
					memberships: [{ vendorId: persona.vendorId, role: persona.role, locationIds: persona.locationIds, active: true }],
					locationIds: persona.locationIds,
					capabilities: ['platform:foundation:read', 'platform:foundation:write'],
					session: {
						id: session.id,
						expiresAt: session.expiresAt.toISOString(),
						revokedAt: null,
						mfaVerifiedAt: null,
						recentAuthAt: null,
					},
				})
			}
			if (persona.locationIds.length !== 0) throw new AccessDeniedError()
			const capabilities = ['platform:foundation:read']
			if (['trust', 'platform_owner'].includes(persona.role)) capabilities.push('platform:vendor:review')
			return AccessContextSchema.parse({
				actor: { kind: 'demo_persona', personaId: persona.id },
				workspaceId: session.workspaceId,
				activeVendorId: null,
				memberships: [],
				locationIds: [],
				capabilities,
				session: { id: session.id, expiresAt: session.expiresAt.toISOString(), revokedAt: null, mfaVerifiedAt: null, recentAuthAt: null },
			})
		}
		if (!session.user) throw new AccessDeniedError()
		await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${session.user.id}::uuid FOR SHARE`
		const user = await tx.user.findUniqueOrThrow({ where: { id: session.user.id } })
		if (!isVerifiedAdult(user)) throw new AccessDeniedError()
		let memberships: AccessContext['memberships'] = []
		if (session.activeVendorId) {
			await tx.$queryRaw`SELECT id FROM "vendor_memberships" WHERE "user_id" = ${session.user.id}::uuid AND "vendor_id" = ${session.activeVendorId}::uuid FOR SHARE`
			const membership = await tx.vendorMembership.findUnique({
				where: { userId_vendorId: { userId: session.user.id, vendorId: session.activeVendorId } },
				include: { vendor: { include: { locations: true } }, staff: true },
			})
			if (
				!membership ||
				membership.revokedAt ||
				membership.role !== session.activeRole ||
				membership.vendor.workspaceId !== session.workspaceId ||
				['rejected', 'restricted'].includes(membership.vendor.applicationState) ||
				!['vendor_owner', 'vendor_staff'].includes(membership.role)
			)
				throw new AccessDeniedError()
			if (membership.staffId && (!membership.staff || membership.staff.vendorId !== membership.vendorId || membership.staff.userId !== session.user.id))
				throw new AccessDeniedError()
			if (membership.locationIds.some((id) => !membership.vendor.locations.some((location) => location.id === id))) throw new AccessDeniedError()
			memberships = [
				{ vendorId: membership.vendorId, role: membership.role as 'vendor_owner' | 'vendor_staff', locationIds: membership.locationIds, active: true },
			]
		} else if (session.activeRole) throw new AccessDeniedError()
		await tx.$queryRaw`SELECT user_id FROM "platform_reviewer_grants" WHERE user_id = ${session.user.id}::uuid FOR SHARE`
		const reviewerGrant = await tx.platformReviewerGrant.findUnique({ where: { userId: session.user.id } })
		const workspace = reviewerGrant?.revokedAt === null ? await tx.workspace.findUnique({ where: { id: session.workspaceId } }) : null
		const capabilities = ['platform:foundation:read', 'platform:foundation:write']
		if (reviewerGrant?.revokedAt === null && workspace?.kind === 'real') capabilities.push('platform:vendor:review')
		return AccessContextSchema.parse({
			actor: { kind: 'user', userId: session.user.id },
			workspaceId: session.workspaceId,
			activeVendorId: session.activeVendorId,
			memberships,
			locationIds: memberships[0]?.locationIds ?? [],
			capabilities,
			session: {
				id: session.id,
				expiresAt: session.expiresAt.toISOString(),
				revokedAt: null,
				mfaVerifiedAt: session.mfaVerifiedAt?.toISOString() ?? null,
				recentAuthAt: session.recentAuthAt?.toISOString() ?? null,
			},
		})
	}

	private actorId(context: AccessContext) {
		return context.actor.kind === 'user' ? context.actor.userId : context.actor.personaId
	}

	private async vendorForWrite(tx: Transaction, context: AccessContext) {
		if (
			!context.activeVendorId ||
			!context.memberships.some((membership) => membership.active && membership.vendorId === context.activeVendorId && membership.role === 'vendor_owner')
		)
			throw new AccessDeniedError()
		const vendor = await tx.vendor.findUnique({ where: { id: context.activeVendorId } })
		if (!vendor || vendor.workspaceId !== context.workspaceId || ['rejected', 'restricted'].includes(vendor.applicationState)) throw new AccessDeniedError()
		return vendor
	}

	private async requireOwnedListing(tx: Transaction, listingId: string, vendorId: string) {
		const listing = await tx.listing.findFirst({ where: { id: listingId, vendorId }, select: { id: true } })
		if (!listing) throw new AccessDeniedError()
	}

	private async requireInventoryItem(tx: Transaction, context: AccessContext, locationId: string, listingId: string, sku?: string) {
		if (!context.activeVendorId) throw new AccessDeniedError()
		const location = await tx.location.findFirst({
			where: { id: locationId, vendorId: context.activeVendorId, vendor: { workspaceId: context.workspaceId } },
			select: { id: true, vendorId: true, vendor: { select: { workspaceId: true } } },
		})
		if (!location) throw new AccessDeniedError()
		assertScope(context, { workspaceId: location.vendor.workspaceId, vendorId: location.vendorId, locationId: location.id })
		const listing = await tx.listing.findFirst({
			where: { id: listingId, vendorId: location.vendorId, kind: 'product' },
			include: { variants: { select: { id: true, sku: true } } },
		})
		if (!listing) throw new AccessDeniedError()
		const variant = sku ? listing.variants.find((candidate) => candidate.sku === sku) : undefined
		if (listing.variants.length ? !variant : Boolean(sku)) throw new AccessDeniedError()
		return { location, listing, variant }
	}

	private async requireInventorySkuBalancePreserved(tx: Transaction, listingId: string, nextSkus: string[]) {
		const balances = await tx.inventoryMovement.groupBy({
			by: ['sku'],
			where: { listingId },
			_sum: { onHandDelta: true, reservedDelta: true },
		})
		const nextSkuSet = new Set(nextSkus)
		for (const balance of balances) {
			const onHand = balance._sum.onHandDelta ?? 0
			const reserved = balance._sum.reservedDelta ?? 0
			if ((onHand !== 0 || reserved !== 0) && (balance.sku === null ? nextSkuSet.size > 0 : !nextSkuSet.has(balance.sku)))
				throw new AccessDeniedError('Product variants with remaining stock cannot be removed or converted.')
		}
	}

	private listingResult(listing: {
		id: string
		kind: string
		category: string
		title: string
		description: string
		priceCents: number | null
		durationMinutes: number | null
		state: string
		version: number
		variants?: Array<{ sku: string; label: string; priceCents: number }>
		media?: Array<{ id: string; description: string | null; captionText: string | null }>
	}) {
		return ListingCommandResultSchema.parse({
			id: listing.id,
			kind: listing.kind,
			category: listing.category,
			title: listing.title,
			description: listing.description,
			priceCents: listing.priceCents ?? undefined,
			durationMinutes: listing.durationMinutes ?? undefined,
			...(listing.variants?.length
				? { variants: listing.variants.map((variant) => ({ sku: variant.sku, label: variant.label, priceCents: variant.priceCents })) }
				: {}),
			state: listing.state,
			version: listing.version,
			...(listing.media?.[0]
				? { shortVideo: { id: listing.media[0].id, description: listing.media[0].description, hasCaptions: Boolean(listing.media[0].captionText) } }
				: {}),
			replayed: false,
		})
	}

	private catalogEvent(
		context: AccessContext,
		type: Extract<
			DomainEvent['type'],
			| 'VendorApplicationSubmitted'
			| 'VendorApplicationReviewed'
			| 'ListingSubmittedForReview'
			| 'ListingRevised'
			| 'ListingPublished'
			| 'ListingUnpublished'
			| 'StorefrontUpdated'
			| 'MediaProcessed'
			| 'MediaQuarantined'
			| 'MediaReviewed'
			| 'CatalogImportCommitted'
			| 'StockMoved'
		>,
		aggregateId: string,
		version: number,
		idempotencyKey: string | null,
		payload: Record<string, unknown>,
	): DomainEvent {
		const id = randomUUID()
		return {
			eventId: id,
			type,
			aggregateId,
			aggregateVersion: version,
			workspaceId: context.workspaceId,
			causationId: id,
			correlationId: id,
			idempotencyKey,
			occurredAt: new Date().toISOString(),
			schemaVersion: 1,
			payload,
		}
	}

	private mediaSystemEvent(
		workspaceId: string,
		type: Extract<DomainEvent['type'], 'MediaProcessed' | 'MediaRejected'>,
		mediaId: string,
		version: number,
		payload: Record<string, unknown>,
	): DomainEvent {
		const id = randomUUID()
		return {
			eventId: id,
			type,
			aggregateId: mediaId,
			aggregateVersion: version,
			workspaceId,
			causationId: id,
			correlationId: id,
			idempotencyKey: null,
			occurredAt: new Date().toISOString(),
			schemaVersion: 1,
			payload,
		}
	}

	private async replayOrCreate<T>(
		tx: Transaction,
		context: AccessContext,
		key: string,
		method: string,
		request: unknown,
		create: () => Promise<T>,
	): Promise<{ outcome: T; replayed: boolean }> {
		const scopeHash = stableHash({ actorId: this.actorId(context), workspaceId: context.workspaceId, vendorId: context.activeVendorId })
		const requestHash = stableHash(request)
		const where = { key_scopeHash_method: { key, scopeHash, method } }
		const prior = await tx.idempotencyRecord.findUnique({ where })
		if (prior) {
			if (prior.requestHash !== requestHash) throw new IdempotencyConflictError()
			return { outcome: prior.outcome as T, replayed: true }
		}
		const outcome = await create()
		await tx.idempotencyRecord.create({
			data: { key, scopeHash, method, workspaceId: context.workspaceId, requestHash, outcome: json(outcome), expiresAt: new Date(Date.now() + 86400000) },
		})
		return { outcome, replayed: false }
	}

	private customerId(context: AccessContext) {
		if (context.actor.kind !== 'user') throw new AccessDeniedError()
		return context.actor.userId
	}

	private realtimeEvent(
		record: { id: string; eventId: string; type: string; payload: Prisma.JsonValue; occurredAt: Date },
		workspaceId: string,
	): RealtimeFoundationEvent {
		const event = DomainEventSchema.parse(record.payload)
		if (event.eventId !== record.eventId || event.type !== record.type || event.workspaceId !== workspaceId) throw new AccessDeniedError()
		return RealtimeFoundationEventSchema.parse({
			eventId: event.eventId,
			type: event.type,
			schemaVersion: event.schemaVersion,
			cursor: record.id,
			occurredAt: record.occurredAt.toISOString(),
			scope: { workspaceId },
			payload: {},
		})
	}

	private event(context: AccessContext, commandId: string, key: string, marker: string): DomainEvent {
		return {
			eventId: randomUUID(),
			type: 'FoundationCommandAccepted',
			aggregateId: commandId,
			aggregateVersion: 1,
			workspaceId: context.workspaceId,
			causationId: commandId,
			correlationId: commandId,
			idempotencyKey: key,
			occurredAt: new Date().toISOString(),
			schemaVersion: 1,
			payload: { marker },
		}
	}

	private enqueue(tx: Transaction, event: DomainEvent) {
		return tx.outboxEvent.create({
			data: { eventId: event.eventId, workspaceId: event.workspaceId, type: event.type, payload: json(event), occurredAt: new Date(event.occurredAt) },
		})
	}

	private async acceptAuditMarkerForMethod(
		sessionId: string | undefined,
		keyInput: string | undefined,
		input: unknown,
		method: string,
		requireElevatedSession: boolean,
	) {
		const command = AuditMarkerCommandSchema.parse(input)
		const key = IdempotencyKeySchema.parse(keyInput)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			if (requireElevatedSession) assertElevatedSession(context)
			if (command.scope) assertScope(context, command.scope)
			const actorId = context.actor.kind === 'user' ? context.actor.userId : context.actor.personaId
			const scopeHash = stableHash({ actorId, workspaceId: context.workspaceId, vendorId: context.activeVendorId })
			const requestHash = stableHash(command)
			const where = { key_scopeHash_method: { key, scopeHash, method } }
			const prior = await tx.idempotencyRecord.findUnique({ where })
			if (prior) {
				if (prior.requestHash !== requestHash) throw new IdempotencyConflictError()
				return { ...(prior.outcome as { commandId: string; status: 'accepted'; marker: string }), replayed: true }
			}
			if (context.actor.kind === 'demo_persona') await this.consumeDemoPersonaCommandQuota(tx, context.actor.personaId)
			const commandId = randomUUID()
			const outcome = { commandId, status: 'accepted' as const, marker: command.marker }
			await tx.auditLog.create({
				data: {
					workspaceId: context.workspaceId,
					actorId,
					action: 'foundation.audit-marker',
					correlationId: commandId,
					metadata: json({ marker: command.marker }),
				},
			})
			await this.enqueue(tx, this.event(context, commandId, key, command.marker))
			await tx.idempotencyRecord.create({
				data: { key, scopeHash, method, workspaceId: context.workspaceId, requestHash, outcome, expiresAt: new Date(Date.now() + 86400000) },
			})
			return { ...outcome, replayed: false }
		})
	}

	private enqueueProviderEvent(
		tx: Transaction,
		workspaceId: string,
		type: Extract<DomainEvent['type'], 'ProviderCallbackReceived' | 'ProviderTimeoutReconciled'>,
		payload: Record<string, unknown>,
	) {
		const id = randomUUID()
		return this.enqueue(tx, {
			eventId: id,
			type,
			aggregateId: id,
			aggregateVersion: 1,
			workspaceId,
			causationId: id,
			correlationId: id,
			idempotencyKey: null,
			occurredAt: new Date().toISOString(),
			schemaVersion: 1,
			payload,
		})
	}
}
