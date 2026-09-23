import { randomUUID } from 'node:crypto'

import { PrismaPg } from '@prisma/adapter-pg'
import {
	type AccessContext,
	AccessContextSchema,
	AuditMarkerCommandSchema,
	CatalogImportCommandSchema,
	CatalogImportResultSchema,
	DemoPersonaKeySchema,
	DemoSessionSchema,
	DemoWorkspaceSchema,
	DiscoveryPreferenceSchema,
	DiscoveryPreferenceUpdateSchema,
	type DomainEvent,
	DomainEventSchema,
	EngagementMutationSchema,
	IdempotencyKeySchema,
	ListingCommandResultSchema,
	ListingDraftSchema,
	ListingReviewCommandSchema,
	ListingRevisionCommandSchema,
	LocationReadSchema,
	MediaAssetSchema,
	MediaProcessingCommandSchema,
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
	VendorFollowMutationSchema,
} from 'contracts'

import { Prisma, PrismaClient } from '../../generated/prisma/index.js'
import { AccessDeniedError, assertElevatedSession, assertScope } from './access.js'
import { type ExternalEffectAdapter, FakeExternalEffectAdapter } from './external-effects.js'
import { IdempotencyConflictError, stableHash } from './idempotency.js'

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
	private readonly externalEffects: ExternalEffectAdapter
	constructor(url: string, externalEffects?: ExternalEffectAdapter) {
		const schema = new URL(url).searchParams.get('schema') ?? 'public'
		if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('Unsupported database schema name.')
		this.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, options: `-c search_path=${schema},public` }, { schema }) })
		this.externalEffects = externalEffects ?? new FakeExternalEffectAdapter(this.db)
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

	accessContext(sessionId: string | undefined) {
		return this.db.$transaction((tx) => this.derive(tx, sessionId))
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

	async browsePublicVendors(queryInput: unknown) {
		const query = PublicVendorBrowseQuerySchema.parse(queryInput)
		const vendors = await this.db.vendor.findMany({
			where: { publicSlug: { not: null }, publishedAt: { not: null }, applicationState: 'approved', workspace: { kind: 'synthetic' } },
			orderBy: { id: 'asc' },
			take: query.limit + 1,
			...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
		})
		const items = vendors.slice(0, query.limit).map((vendor) => ({ id: vendor.id, slug: vendor.publicSlug }))
		return PublicVendorPageSchema.parse({ items, nextCursor: vendors.length > query.limit ? (items.at(-1)?.id ?? null) : null })
	}

	async readPublicStorefront(slug: string) {
		const vendor = await this.db.vendor.findFirst({
			where: { publicSlug: slug, publishedAt: { not: null }, applicationState: 'approved', workspace: { kind: 'synthetic' } },
			include: { locations: true, listings: { where: { state: 'published' }, orderBy: { publishedAt: 'desc' }, include: { variants: true } } },
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

	async createVendorApplication(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const application = VendorApplicationCommandSchema.parse(input)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const userId = this.customerId(context)
			if (context.activeVendorId) throw new AccessDeniedError()
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
				const session = await tx.session.create({
					data: {
						userId,
						workspaceId: context.workspaceId,
						activeVendorId: vendor.id,
						activeRole: 'vendor_owner',
						expiresAt: context.session.expiresAt,
					},
				})
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
					sessionId: session.id,
					state: 'pending',
					replayed: false,
				})
			})
			return VendorApplicationResultSchema.parse({ ...result.outcome, replayed: result.replayed })
		})
	}

	async reviewVendorApplication(sessionId: string | undefined, keyInput: string | undefined, vendorId: string, input: unknown) {
		this.requireResourceId(vendorId)
		const key = IdempotencyKeySchema.parse(keyInput)
		const review = VendorApplicationReviewSchema.parse(input)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			if (!context.capabilities.includes('platform:vendor:review')) throw new AccessDeniedError()
			const result = await this.replayOrCreate(tx, context, key, 'POST /v1/vendor-applications/:vendorId/review', { vendorId, review }, async () => {
				const vendor = await tx.vendor.findUnique({ where: { id: vendorId } })
				if (!vendor || vendor.workspaceId !== context.workspaceId) throw new AccessDeniedError()
				const state = review.decision === 'approve' ? 'approved' : review.decision === 'reject' ? 'rejected' : 'restricted'
				await tx.vendor.update({ where: { id: vendorId }, data: { applicationState: state, applicationReviewedAt: new Date() } })
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
			const result = await this.replayOrCreate(tx, context, key, 'POST /v1/listings/:listingId/revise', { listingId, draft }, async () => {
				const listing = await tx.listing.findFirst({ where: { id: listingId, vendorId: vendor.id } })
				if (!listing || !['draft', 'rejected', 'unpublished'].includes(listing.state)) throw new AccessDeniedError()
				const { variants, ...listingDraft } = draft
				const updated = await tx.listing.update({
					where: { id: listing.id },
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
			const result = await this.replayOrCreate(tx, context, key, 'POST /v1/listings/:listingId/review', { listingId, review }, async () => {
				const listing = await tx.listing.findUnique({ where: { id: listingId } })
				if (!listing || listing.state !== 'pending_review') throw new AccessDeniedError()
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
			const accessible = Boolean(command.captionText || (command.noSpeechDeclared && command.description))
			const media = await tx.mediaAsset.create({
				data: {
					listingId,
					kind: 'short_video',
					state: accessible ? 'ready' : 'quarantined',
					captionText: command.captionText,
					noSpeechDeclared: command.noSpeechDeclared,
					description: command.description,
					quarantineReason: accessible ? null : 'caption or no-speech description required',
					processedAt: new Date(),
				},
			})
			await this.enqueue(tx, this.catalogEvent(context, 'MediaProcessed', media.id, 1, null, { listingId, mediaId: media.id, state: media.state }))
			return MediaAssetSchema.parse({ id: media.id, state: media.state })
		})
	}

	async importCatalogCsv(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const command = CatalogImportCommandSchema.parse(input)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const vendor = await this.vendorForWrite(tx, context)
			const result = await this.replayOrCreate(tx, context, key, 'POST /v1/catalog-imports', command, async () => {
				const lines = command.csv.trim().split(/\r?\n/)
				const [header, ...data] = lines
				if (header !== 'kind,category,title,description,priceCents,durationMinutes') throw new AccessDeniedError('CSV template v1 header is required.')
				const rows = data.map((line, index) => {
					const [kind, category, title, description, priceCents, durationMinutes] = line.split(',').map((field) => field.trim())
					const parsed = ListingDraftSchema.safeParse({
						kind,
						category,
						title,
						description,
						priceCents: Number(priceCents),
						durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
					})
					return {
						rowNumber: index + 2,
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
				const valid = rows.flatMap((row) => (row.parsed.success ? [{ draft: row.parsed.data }] : []))
				const rowErrors = rows.flatMap((row) =>
					row.parsed.success ? [] : [{ rowNumber: row.rowNumber, errors: row.parsed.error.issues.map((issue) => issue.message) }],
				)
				const state = command.mode === 'commit' && valid.length === rows.length ? 'committed' : command.mode === 'commit' ? 'rejected' : 'dry_run'
				const job = await tx.catalogImportJob.create({
					data: {
						vendorId: vendor.id,
						templateVersion: command.templateVersion,
						sourceHash: stableHash(command.csv),
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
							status: row.parsed.success ? (state === 'committed' ? 'committed' : 'valid') : 'error',
							errors: json(row.parsed.success ? [] : row.parsed.error.issues.map((issue) => issue.message)),
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
				return CatalogImportResultSchema.parse({ id: job.id, state, rowCount: rows.length, validRowCount: valid.length, rowErrors, replayed: false })
			})
			return { ...result.outcome, replayed: result.replayed }
		})
	}

	async exportCatalogCsv(sessionId: string | undefined) {
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
			const vendor = await this.vendorForWrite(tx, context)
			const listings = await tx.listing.findMany({ where: { vendorId: vendor.id }, orderBy: { id: 'asc' } })
			const escape = (value: string | number | null) => `"${String(value ?? '').replaceAll('"', '""')}"`
			return [
				'kind,category,title,description,priceCents,durationMinutes',
				...listings.map((listing) =>
					[listing.kind, listing.category, listing.title, listing.description, listing.priceCents, listing.durationMinutes].map(escape).join(','),
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
					vendor: { applicationState: 'approved', publishedAt: { not: null }, workspace: { kind: 'synthetic' } },
				},
			},
			orderBy: { listingId: 'asc' },
			take: query.limit + 1,
			...(query.cursor ? { cursor: { listingId: query.cursor }, skip: 1 } : {}),
			include: { listing: { include: { variants: true } } },
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
				vendor: { applicationState: 'approved', publishedAt: { not: null }, workspace: { kind: 'synthetic' } },
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
			await this.db.$transaction(async (tx) => {
				const id = demo.workspaceId
				await tx.$queryRaw`SELECT id FROM "workspaces" WHERE id = ${id}::uuid FOR UPDATE`
				const current = await tx.demoWorkspace.findUnique({ where: { id: demo.id } })
				if (!current || current.purgedAt || current.expiresAt > now) return
				const workspace = await tx.workspace.findUnique({ where: { id } })
				if (workspace?.kind !== 'demo') throw new AccessDeniedError()
				await tx.session.deleteMany({ where: { workspaceId: id } })
				await tx.demoPersona.deleteMany({ where: { workspaceId: id } })
				await tx.vendorMembership.deleteMany({ where: { vendor: { workspaceId: id } } })
				await tx.location.deleteMany({ where: { vendor: { workspaceId: id } } })
				await tx.vendor.deleteMany({ where: { workspaceId: id } })
				await tx.idempotencyRecord.deleteMany({ where: { workspaceId: id } })
				await tx.providerInboxEvent.deleteMany({ where: { workspaceId: id } })
				await tx.outboxEvent.deleteMany({ where: { workspaceId: id } })
				await tx.outboxReceipt.deleteMany({ where: { workspaceId: id } })
				await tx.syntheticExternalEffect.deleteMany({ where: { workspaceId: id } })
				await tx.auditLog.deleteMany({ where: { workspaceId: id } })
				await tx.demoWorkspace.update({ where: { id: demo.id }, data: { purgedAt: now } })
				purged.push(id)
			})
		return purged
	}

	async claim(workerId: string, leaseMs = 30000): Promise<DurableClaim | undefined> {
		if (!Number.isFinite(leaseMs) || leaseMs <= 0) throw new Error('Invalid lease.')
		await this.db.$executeRaw`
      UPDATE "outbox_events" SET state = 'dead_letter', "claimed_by" = NULL, "claimed_at" = NULL, "claim_token" = NULL
      WHERE state = 'in_flight' AND attempts >= 3 AND "claimed_at" <= clock_timestamp() - ${leaseMs} * interval '1 millisecond'`
		const token = randomUUID()
		const records = await this.db.$queryRaw<DurableClaim[]>`
      UPDATE "outbox_events" SET state = 'in_flight', "claimed_by" = ${workerId}, "claimed_at" = clock_timestamp(), "claim_token" = ${token}::uuid, attempts = attempts + 1
      WHERE id = (SELECT id FROM "outbox_events" WHERE (state = 'pending' AND "available_at" <= clock_timestamp()) OR (state = 'in_flight' AND "claimed_at" <= clock_timestamp() - ${leaseMs} * interval '1 millisecond') ORDER BY "occurred_at", id FOR UPDATE SKIP LOCKED LIMIT 1)
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
		const claim = await this.claim(workerId)
		if (!claim) return { processed: false }
		try {
			const event = DomainEventSchema.parse(claim.payload)
			if (event.type === 'FoundationCommandAccepted') await this.externalEffects.deliver(event)
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
		if (!workspace || !['synthetic', 'demo'].includes(workspace.kind) || workspace.demos.some((d) => d.purgedAt || d.expiresAt <= new Date()))
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
		return AccessContextSchema.parse({
			actor: { kind: 'user', userId: session.user.id },
			workspaceId: session.workspaceId,
			activeVendorId: session.activeVendorId,
			memberships,
			locationIds: memberships[0]?.locationIds ?? [],
			capabilities: ['platform:foundation:read', 'platform:foundation:write'],
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
			!context.memberships.some((membership) => membership.active && ['vendor_owner', 'vendor_staff'].includes(membership.role))
		)
			throw new AccessDeniedError()
		const vendor = await tx.vendor.findUnique({ where: { id: context.activeVendorId } })
		if (!vendor || vendor.workspaceId !== context.workspaceId) throw new AccessDeniedError()
		return vendor
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
			| 'CatalogImportCommitted'
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
