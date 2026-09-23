import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
	type AccessContext,
	AccessContextSchema,
	AuditMarkerCommandSchema,
	type CommandOutcome,
	DiscoveryPreferenceUpdateSchema,
	type DomainEvent,
	EngagementMutationSchema,
	HealthResponseSchema,
	IdempotencyKeySchema,
	InventoryAvailabilityQuerySchema,
	InventoryMovementCommandSchema,
	ListingDraftSchema,
	ListingReviewCommandSchema,
	ListingRevisionCommandSchema,
	LocationReadSchema,
	MediaProcessingCommandSchema,
	PublicListingBrowseQuerySchema,
	PublicVendorBrowseQuerySchema,
	PublicVendorPageSchema,
	StorefrontUpdateSchema,
	SyntheticAccountProvisionSchema,
	VendorApplicationCommandSchema,
	VendorApplicationReviewSchema,
	VendorFollowMutationSchema,
} from 'contracts'
import {
	AccessDeniedError,
	assertElevatedSession,
	assertScope,
	DemoWorkspaceService,
	IdempotencyStore,
	InMemoryOutbox,
	PostgresFoundation,
	PROVIDER_WEBHOOK_ADAPTER,
	ProviderInbox,
	type ProviderWebhookAdapter,
	SessionRegistry,
} from 'platform-core'

const SYNTHETIC_IDS = {
	location: '00000000-0000-4000-8000-000000000004',
	user: '00000000-0000-4000-8000-000000000001',
	session: '00000000-0000-4000-8000-000000000002',
	vendor: '00000000-0000-4000-8000-000000000005',
	workspace: '00000000-0000-4000-8000-000000000003',
}

@Injectable()
export class FoundationService {
	private readonly durable: PostgresFoundation | undefined

	private databaseUrl(): string {
		return this.configService.getOrThrow<string>('DATABASE_URL')
	}

	async onModuleDestroy() {
		await this.durable?.close()
	}

	private readonly sessions = new SessionRegistry()
	private readonly idempotency = new IdempotencyStore()
	private readonly outbox = new InMemoryOutbox()
	private readonly inbox = new ProviderInbox()
	private readonly demos = new DemoWorkspaceService()
	private readonly demoSessionCookieName = 'junction_demo_session'

	constructor(
		private readonly configService: ConfigService,
		@Inject(PROVIDER_WEBHOOK_ADAPTER) private readonly providerWebhookAdapter: ProviderWebhookAdapter,
	) {
		this.durable = this.configService.get<string>('FOUNDATION_STORAGE') === 'postgresql' ? new PostgresFoundation(this.databaseUrl()) : undefined
		this.sessions.register(this.syntheticContext())
	}

	async health(requestId?: string) {
		await this.durable?.health()
		return HealthResponseSchema.parse({
			status: 'ok',
			service: 'api',
			runtimeMode: 'synthetic',
			storage: this.durable ? 'postgresql' : 'in-memory-test-double',
			requestId: requestId ?? randomUUID(),
		})
	}

	async accessContext(sessionId: string | undefined) {
		const context = this.durable ? await this.durable.accessContext(sessionId) : this.sessions.derive(sessionId)
		return {
			actor: context.actor,
			workspaceId: context.workspaceId,
			activeVendorId: context.activeVendorId,
			locationIds: context.locationIds,
			capabilities: context.capabilities,
		}
	}

	resolveSessionId(headerSessionId: string | undefined, cookieHeader: string | undefined) {
		if (headerSessionId) return headerSessionId
		const signedSession = cookieHeader
			?.split(';')
			.map((value) => value.trim())
			.find((value) => value.startsWith(`${this.demoSessionCookieName}=`))
			?.slice(this.demoSessionCookieName.length + 1)
		if (!signedSession) return undefined
		try {
			const decoded = decodeURIComponent(signedSession)
			const separator = decoded.lastIndexOf('.')
			if (separator <= 0) return undefined
			const sessionId = decoded.slice(0, separator)
			const signature = decoded.slice(separator + 1)
			if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return undefined
			const expected = createHmac('sha256', this.demoSessionSecret()).update(sessionId).digest('hex')
			const expectedBytes = Buffer.from(expected, 'hex')
			const suppliedBytes = Buffer.from(signature, 'hex')
			return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes) ? sessionId : undefined
		} catch {
			return undefined
		}
	}

	demoSessionCookie(sessionId: string, expiresAt: string) {
		const signature = createHmac('sha256', this.demoSessionSecret()).update(sessionId).digest('hex')
		return { name: this.demoSessionCookieName, value: `${sessionId}.${signature}`, expires: new Date(expiresAt) }
	}

	async readLocation(sessionId: string | undefined, locationId: string) {
		if (this.durable) return this.durable.readLocation(sessionId, locationId)
		const context = this.sessions.derive(sessionId)
		if (!context.activeVendorId || !context.locationIds.includes(locationId)) throw new AccessDeniedError()
		assertScope(context, { workspaceId: context.workspaceId, vendorId: context.activeVendorId, locationId })
		return LocationReadSchema.parse({ id: locationId, vendorId: context.activeVendorId, workspaceId: context.workspaceId })
	}

	async browsePublicVendors(query: unknown) {
		if (this.durable) return this.durable.browsePublicVendors(query)
		PublicVendorBrowseQuerySchema.parse(query)
		return PublicVendorPageSchema.parse({ items: [{ id: SYNTHETIC_IDS.vendor, slug: 'synthetic-foundation' }], nextCursor: null })
	}

	private requireDurableCatalog() {
		if (!this.durable) throw new AccessDeniedError('Catalog operations require the PostgreSQL synthetic runtime.')
		return this.durable
	}

	browsePublicListings(query: unknown) {
		PublicListingBrowseQuerySchema.parse(query)
		return this.requireDurableCatalog().browsePublicListings(query)
	}

	readPublicStorefront(slug: string) {
		return this.requireDurableCatalog().readPublicStorefront(slug)
	}

	recommendPublicListings(sessionId: string | undefined) {
		return this.requireDurableCatalog().recommendPublicListings(sessionId)
	}

	setDiscoveryPreference(sessionId: string | undefined, body: unknown) {
		DiscoveryPreferenceUpdateSchema.parse(body)
		return this.requireDurableCatalog().setDiscoveryPreference(sessionId, body)
	}

	saveListing(sessionId: string | undefined, listingId: string, saved: boolean) {
		EngagementMutationSchema.parse({ saved })
		return this.requireDurableCatalog().saveListing(sessionId, listingId, saved)
	}

	followVendor(sessionId: string | undefined, vendorId: string, following: boolean) {
		VendorFollowMutationSchema.parse({ following })
		return this.requireDurableCatalog().followVendor(sessionId, vendorId, following)
	}

	readInventoryAvailability(sessionId: string | undefined, listingId: string, query: unknown) {
		InventoryAvailabilityQuerySchema.parse(query)
		return this.requireDurableCatalog().readInventoryAvailability(sessionId, listingId, query)
	}

	createInventoryMovement(sessionId: string | undefined, idempotencyKey: string | undefined, body: unknown) {
		InventoryMovementCommandSchema.parse(body)
		IdempotencyKeySchema.parse(idempotencyKey)
		return this.requireDurableCatalog().createInventoryMovement(sessionId, idempotencyKey, body)
	}

	createListing(sessionId: string | undefined, idempotencyKey: string | undefined, body: unknown) {
		ListingDraftSchema.parse(body)
		return this.requireDurableCatalog().createListing(sessionId, idempotencyKey, body)
	}

	updateStorefront(sessionId: string | undefined, idempotencyKey: string | undefined, body: unknown) {
		StorefrontUpdateSchema.parse(body)
		return this.requireDurableCatalog().updateStorefront(sessionId, idempotencyKey, body)
	}

	reviseListing(sessionId: string | undefined, idempotencyKey: string | undefined, listingId: string, body: unknown) {
		ListingRevisionCommandSchema.parse(body)
		return this.requireDurableCatalog().reviseListing(sessionId, idempotencyKey, listingId, body)
	}

	submitListingForReview(sessionId: string | undefined, idempotencyKey: string | undefined, listingId: string) {
		return this.requireDurableCatalog().submitListingForReview(sessionId, idempotencyKey, listingId)
	}

	reviewListing(sessionId: string | undefined, idempotencyKey: string | undefined, listingId: string, body: unknown) {
		ListingReviewCommandSchema.parse(body)
		return this.requireDurableCatalog().reviewListing(sessionId, idempotencyKey, listingId, body)
	}

	unpublishListing(sessionId: string | undefined, idempotencyKey: string | undefined, listingId: string) {
		return this.requireDurableCatalog().unpublishListing(sessionId, idempotencyKey, listingId)
	}

	processShortVideo(sessionId: string | undefined, listingId: string, body: unknown) {
		MediaProcessingCommandSchema.parse(body)
		return this.requireDurableCatalog().processShortVideo(sessionId, listingId, body)
	}

	importCatalogCsv(sessionId: string | undefined, idempotencyKey: string | undefined, body: unknown) {
		return this.requireDurableCatalog().importCatalogCsv(sessionId, idempotencyKey, body)
	}

	exportCatalogCsv(sessionId: string | undefined) {
		return this.requireDurableCatalog().exportCatalogCsv(sessionId)
	}

	reviewVendorApplication(sessionId: string | undefined, idempotencyKey: string | undefined, vendorId: string, body: unknown) {
		VendorApplicationReviewSchema.parse(body)
		return this.requireDurableCatalog().reviewVendorApplication(sessionId, idempotencyKey, vendorId, body)
	}

	createVendorApplication(sessionId: string | undefined, idempotencyKey: string | undefined, body: unknown) {
		VendorApplicationCommandSchema.parse(body)
		return this.requireDurableCatalog().createVendorApplication(sessionId, idempotencyKey, body)
	}

	async createSyntheticAccount(provisioningSecret: string | undefined, input: unknown) {
		if (!this.syntheticProvisioningSecretMatches(provisioningSecret)) throw new AccessDeniedError()
		SyntheticAccountProvisionSchema.parse(input)
		if (!this.durable) throw new AccessDeniedError()
		return this.durable.createSyntheticAccount(input)
	}

	async grantSyntheticStaff(sessionId: string | undefined, input: unknown) {
		if (!this.durable) throw new AccessDeniedError()
		return this.durable.grantSyntheticStaff(sessionId, input)
	}

	async revokeSyntheticStaff(sessionId: string | undefined, staffId: string) {
		if (!this.durable) throw new AccessDeniedError()
		return this.durable.revokeSyntheticStaff(sessionId, staffId)
	}

	async realtimeHighWaterCursor(sessionId: string | undefined): Promise<string | null> {
		if (this.durable) return this.durable.realtimeHighWaterCursor(sessionId)
		this.sessions.derive(sessionId)
		return null
	}

	async realtimeReplay(sessionId: string | undefined, cursor: string | undefined) {
		if (this.durable) return this.durable.realtimeReplay(sessionId, cursor)
		this.sessions.derive(sessionId)
		return { cursor: null, events: [], restRefetchRequired: cursor !== undefined }
	}

	async realtimeFoundationEventForCommand(sessionId: string | undefined, commandId: string) {
		if (this.durable) return this.durable.realtimeFoundationEventForCommand(sessionId, commandId)
		this.sessions.derive(sessionId)
		return null
	}

	async acceptAuditMarker(sessionId: string | undefined, idempotencyKey: string | undefined, body: unknown): Promise<CommandOutcome> {
		return this.acceptAuditMarkerForMode(sessionId, idempotencyKey, body, false)
	}

	async acceptElevatedAuditMarker(sessionId: string | undefined, idempotencyKey: string | undefined, body: unknown): Promise<CommandOutcome> {
		return this.acceptAuditMarkerForMode(sessionId, idempotencyKey, body, true)
	}

	private async acceptAuditMarkerForMode(
		sessionId: string | undefined,
		idempotencyKey: string | undefined,
		body: unknown,
		requireElevatedSession: boolean,
	): Promise<CommandOutcome> {
		if (this.durable)
			return requireElevatedSession
				? this.durable.acceptElevatedAuditMarker(sessionId, idempotencyKey, body)
				: this.durable.acceptAuditMarker(sessionId, idempotencyKey, body)
		const context = this.sessions.derive(sessionId)
		if (requireElevatedSession) assertElevatedSession(context)
		this.requireCapability(context, 'platform:foundation:write')
		const command = AuditMarkerCommandSchema.parse(body)
		if (command.scope) assertScope(context, command.scope)
		const key = IdempotencyKeySchema.parse(idempotencyKey)
		const actorId = context.actor.kind === 'user' ? context.actor.userId : context.actor.personaId

		const result = this.idempotency.execute(key, { actorId, workspaceId: context.workspaceId, vendorId: context.activeVendorId }, command, () => {
			if (context.actor.kind === 'demo_persona') this.demos.consumeCommandQuota(context.actor.personaId)
			const commandId = randomUUID()
			this.outbox.publish(this.eventFor(context, commandId, key, 'FoundationCommandAccepted', { marker: command.marker }))
			return { commandId, status: 'accepted' as const, marker: command.marker }
		})

		return { ...result.outcome, replayed: result.replayed }
	}

	receiveProviderWebhook(provider: string, eventId: string | undefined, signature: string | undefined, rawBody: Buffer | undefined, body: unknown) {
		const webhook = this.providerWebhookAdapter.verify({ provider, eventId, signature, rawBody, body })
		if (this.durable) {
			const workspace = this.configService.get<string>('SYNTHETIC_WEBHOOK_WORKSPACE_ID')
			if (!workspace) throw new AccessDeniedError()
			return this.durable.receiveProviderWebhook(workspace, webhook.provider, webhook.eventId, webhook.callback)
		}

		const received = this.inbox.receive(webhook.provider, webhook.eventId, webhook.callback, () => {
			this.outbox.publish({
				eventId: randomUUID(),
				type: 'ProviderCallbackReceived',
				aggregateId: randomUUID(),
				aggregateVersion: 1,
				workspaceId: SYNTHETIC_IDS.workspace,
				causationId: randomUUID(),
				correlationId: randomUUID(),
				idempotencyKey: null,
				occurredAt: new Date().toISOString(),
				schemaVersion: 1,
				payload: { provider: webhook.provider, eventId: webhook.eventId, providerReference: webhook.callback.providerReference },
			})
			return { accepted: true }
		})
		return { accepted: true, duplicate: received.duplicate }
	}

	private demoSessionSecret() {
		const secret = this.configService.get<string>('SYNTHETIC_DEMO_SESSION_SECRET')
		if (!secret) throw new AccessDeniedError('Demo session is not accepted.')
		return secret
	}

	private syntheticProvisioningSecretMatches(supplied: string | undefined): boolean {
		const expected = this.configService.get<string>('SYNTHETIC_ACCOUNT_PROVISIONING_SECRET')
		if (!expected || !supplied) return false
		const expectedBytes = Buffer.from(expected)
		const suppliedBytes = Buffer.from(supplied)
		return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes)
	}

	async createDemoWorkspace() {
		if (this.durable) return this.durable.createDemoWorkspace()
		const demo = this.demos.create()
		const context = this.demos.context(demo.session.id)
		if (!context) throw new Error('Demo fixture session is missing.')
		this.sessions.register(context)
		return demo
	}

	async switchDemoPersona(sessionId: string | undefined, workspaceId: string, key: string) {
		if (this.durable) return this.durable.switchDemoPersona(sessionId, workspaceId, key)
		const current = this.sessions.derive(sessionId)
		if (current.actor.kind !== 'demo_persona' || current.workspaceId !== workspaceId || !sessionId) throw new AccessDeniedError()
		try {
			const switched = this.demos.switchPersona(workspaceId, sessionId, key)
			this.sessions.revoke(sessionId)
			this.sessions.register(switched.next)
			return { id: switched.next.session.id, personaKey: key, expiresAt: switched.next.session.expiresAt }
		} catch {
			throw new AccessDeniedError()
		}
	}

	processOneOutboxEvent(workerId: string) {
		if (this.durable) return this.durable.processOne(workerId)
		const record = this.outbox.claim(workerId)
		if (!record) return { processed: false }
		this.outbox.complete(record.id, workerId)
		return { processed: true, eventId: record.event.eventId }
	}

	purgeExpiredDemoWorkspaces(now = new Date()) {
		return this.durable ? this.durable.purgeExpiredDemoWorkspaces(now) : this.demos.purgeExpired(now)
	}

	private requireCapability(context: AccessContext, capability: AccessContext['capabilities'][number]) {
		if (!context.capabilities.includes(capability)) throw new AccessDeniedError()
	}

	private eventFor(
		context: AccessContext,
		aggregateId: string,
		idempotencyKey: string,
		type: DomainEvent['type'],
		payload: Record<string, unknown>,
	): DomainEvent {
		return {
			eventId: randomUUID(),
			type,
			aggregateId,
			aggregateVersion: 1,
			workspaceId: context.workspaceId,
			causationId: aggregateId,
			correlationId: aggregateId,
			idempotencyKey,
			occurredAt: new Date().toISOString(),
			schemaVersion: 1,
			payload,
		}
	}

	private syntheticContext(): AccessContext {
		return AccessContextSchema.parse({
			actor: { kind: 'user', userId: SYNTHETIC_IDS.user },
			workspaceId: SYNTHETIC_IDS.workspace,
			activeVendorId: SYNTHETIC_IDS.vendor,
			locationIds: [SYNTHETIC_IDS.location],
			memberships: [{ vendorId: SYNTHETIC_IDS.vendor, role: 'vendor_owner', locationIds: [SYNTHETIC_IDS.location], active: true }],
			capabilities: ['platform:foundation:read', 'platform:foundation:write', 'demo:workspace:create', 'demo:workspace:purge'],
			session: {
				id: SYNTHETIC_IDS.session,
				expiresAt: '2099-01-01T00:00:00.000Z',
				revokedAt: null,
				mfaVerifiedAt: new Date().toISOString(),
				recentAuthAt: new Date().toISOString(),
			},
		})
	}
}
