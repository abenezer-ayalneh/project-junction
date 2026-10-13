import { createHash, randomUUID } from 'node:crypto'

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
	DiscoveryPreferenceUpdateSchema,
	EngagementMutationSchema,
	HealthResponseSchema,
	IdempotencyKeySchema,
	IdentityVerificationSessionSchema,
	IdentityVerificationStatusSchema,
	ImageUploadIntentCommandSchema,
	InventoryAvailabilityQuerySchema,
	InventoryMovementCommandSchema,
	InventoryTransferCommandSchema,
	ListingDraftSchema,
	ListingReviewCommandSchema,
	ListingRevisionCommandSchema,
	MediaProcessingCommandSchema,
	MediaRetentionHoldCommandSchema,
	MediaReviewCommandSchema,
	MediaReviewQueueQuerySchema,
	MediaUploadCompleteCommandSchema,
	MediaUploadIntentCommandSchema,
	PublicListingBrowseQuerySchema,
	PublicProductAvailabilityQuerySchema,
	StorefrontUpdateSchema,
	VendorApplicationCommandSchema,
	VendorApplicationReviewSchema,
	VendorFollowMutationSchema,
} from 'contracts'
import { AccessDeniedError, applicationRuntimeMode, DiditSandboxAdapter, PostgresFoundation } from 'platform-core'
import { getAuth } from 'platform-core/auth'

export function diditObservedAt(value: unknown): Date | undefined {
	if (typeof value === 'string') return new Date(value)
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
	return new Date(value < 100_000_000_000 ? value * 1_000 : value)
}

@Injectable()
export class FoundationService {
	private readonly logger = new Logger(FoundationService.name)
	private readonly durable: PostgresFoundation

	private databaseUrl(): string {
		return this.configService.getOrThrow<string>('DATABASE_URL')
	}

	async onModuleDestroy() {
		await this.durable.close()
	}

	constructor(private readonly configService: ConfigService) {
		if (this.configService.get<string>('FOUNDATION_STORAGE') !== 'postgresql')
			throw new Error('FOUNDATION_STORAGE=postgresql is required for the API runtime.')
		this.durable = new PostgresFoundation(this.databaseUrl())
	}

	exportBookingCalendar(sessionId: string | undefined, id: string) {
		return this.durable.exportBookingCalendar(sessionId, id)
	}

	readBookingAttendance(sessionId: string | undefined, id: string, staff = false) {
		return this.durable.readBookingAttendance(sessionId, id, staff)
	}
	readBookingAttendanceProof(sessionId: string | undefined, id: string) {
		return this.durable.readBookingAttendanceProof(sessionId, id)
	}
	joinBooking(sessionId: string | undefined, key: string | undefined, id: string, input: unknown) {
		return this.durable.joinBooking(sessionId, key, id, input)
	}
	confirmBookingAttendance(sessionId: string | undefined, key: string | undefined, id: string, input: unknown) {
		return this.durable.confirmBookingAttendance(sessionId, key, id, input)
	}
	reportBookingNoShow(sessionId: string | undefined, key: string | undefined, id: string, input: unknown) {
		return this.durable.reportBookingNoShow(sessionId, key, id, input)
	}
	contestBookingAttendance(sessionId: string | undefined, key: string | undefined, id: string, input: unknown) {
		return this.durable.contestBookingAttendance(sessionId, key, id, input)
	}

	readBookingMeeting(sessionId: string | undefined, id: string, vendor = false) {
		return this.durable.readBookingMeeting(sessionId, id, vendor)
	}
	configureLocalMeetConnection(sessionId: string | undefined, key: string | undefined, id: string, input: unknown) {
		return this.durable.configureLocalMeetConnection(sessionId, key, id, input)
	}
	replaceBookingMeeting(sessionId: string | undefined, key: string | undefined, id: string, input: unknown) {
		return this.durable.replaceBookingMeeting(sessionId, key, id, input)
	}
	proposeBookingSubstitution(sessionId: string | undefined, key: string | undefined, id: string, input: unknown) {
		return this.durable.proposeBookingSubstitution(sessionId, key, id, input)
	}
	decideBookingSubstitution(sessionId: string | undefined, key: string | undefined, id: string, input: unknown) {
		return this.durable.decideBookingSubstitution(sessionId, key, id, input)
	}
	readBookingSubstitution(sessionId: string | undefined, id: string) {
		return this.durable.readBookingSubstitution(sessionId, id)
	}
	joinBookingWaitlist(sessionId: string | undefined, key: string | undefined, input: unknown) {
		return this.durable.joinBookingWaitlist(sessionId, key, input)
	}
	removeBookingWaitlist(sessionId: string | undefined, id: string, key: string | undefined) {
		return this.durable.removeBookingWaitlist(sessionId, id, key)
	}
	readBookingWaitlist(sessionId: string | undefined, id: string, key?: string) {
		return this.durable.readBookingWaitlist(sessionId, id, key)
	}
	amendBooking(sessionId: string | undefined, key: string | undefined, id: string, input: unknown) {
		return this.durable.amendBooking(sessionId, key, id, input)
	}
	cancelBooking(sessionId: string | undefined, key: string | undefined, id: string, input: unknown, provider = false) {
		return this.durable.cancelBooking(sessionId, key, id, input, provider)
	}
	startBookingPayment(sessionId: string | undefined, key: string | undefined, input: unknown) {
		return this.durable.startBookingPayment(sessionId, key, input)
	}
	recordLocalBookingPaymentResult(sessionId: string | undefined, key: string | undefined, id: string, input: unknown) {
		return this.durable.recordLocalBookingPaymentResult(sessionId, key, id, input)
	}
	readBookingPayment(sessionId: string | undefined, id: string) {
		return this.durable.readBookingPayment(sessionId, id)
	}
	readBooking(sessionId: string | undefined, id: string) {
		return this.durable.readBooking(sessionId, id)
	}
	createBookingHold(sessionId: string | undefined, key: string | undefined, input: unknown) {
		return this.durable.createBookingHold(sessionId, key, input)
	}
	readBookingHold(sessionId: string | undefined, holdId: string) {
		return this.durable.readBookingHold(sessionId, holdId)
	}
	releaseBookingHold(sessionId: string | undefined, key: string | undefined, holdId: string) {
		return this.durable.releaseBookingHold(sessionId, key, holdId)
	}

	readLocationSchedule(sessionId: string | undefined, locationId: string) {
		return this.durable.readLocationSchedule(sessionId, locationId)
	}
	configureLocationSchedule(sessionId: string | undefined, key: string | undefined, locationId: string, input: unknown) {
		return this.durable.configureLocationSchedule(sessionId, key, locationId, input)
	}
	readStaffSchedule(sessionId: string | undefined, staffId: string) {
		return this.durable.readStaffSchedule(sessionId, staffId)
	}
	configureStaffSchedule(sessionId: string | undefined, key: string | undefined, staffId: string, input: unknown) {
		return this.durable.configureStaffSchedule(sessionId, key, staffId, input)
	}
	readServiceSchedulingRules(sessionId: string | undefined, listingId: string) {
		return this.durable.readServiceSchedulingRules(sessionId, listingId)
	}
	configureServiceSchedulingRules(sessionId: string | undefined, key: string | undefined, listingId: string, input: unknown) {
		return this.durable.configureServiceSchedulingRules(sessionId, key, listingId, input)
	}
	readPublicServiceSlots(listingId: string, input: unknown) {
		return this.durable.readPublicServiceSlots(listingId, input)
	}

	readServiceConfiguration(sessionId: string | undefined, listingId: string) {
		return this.durable.readServiceConfiguration(sessionId, listingId)
	}
	configureService(sessionId: string | undefined, key: string | undefined, listingId: string, input: unknown) {
		return this.durable.configureService(sessionId, key, listingId, input)
	}
	readStaffProfiles(sessionId: string | undefined) {
		return this.durable.readStaffProfiles(sessionId)
	}
	readStaffProfile(sessionId: string | undefined, staffId: string) {
		return this.durable.readStaffProfile(sessionId, staffId)
	}
	createStaffProfile(sessionId: string | undefined, key: string | undefined, input: unknown) {
		return this.durable.createStaffProfile(sessionId, key, input)
	}
	updateStaffProfile(sessionId: string | undefined, key: string | undefined, staffId: string, input: unknown) {
		return this.durable.updateStaffProfile(sessionId, key, staffId, input)
	}
	setStaffPublicConsent(sessionId: string | undefined, key: string | undefined, staffId: string, input: unknown) {
		return this.durable.setStaffPublicConsent(sessionId, key, staffId, input)
	}
	readPublicServiceDefinition(listingId: string) {
		return this.durable.readPublicServiceDefinition(listingId)
	}

	async health(requestId?: string) {
		await this.durable.health()
		const runtimeMode = applicationRuntimeMode()
		if (runtimeMode === 'staging' && process.env['DIDIT_AGE_18_WORKFLOW_CONFIRMED'] !== 'true') {
			throw new Error('The Didit age-18 sandbox workflow has not been confirmed.')
		}
		return HealthResponseSchema.parse({
			status: 'ok',
			service: 'api',
			runtimeMode,
			storage: 'postgresql',
			requestId: requestId ?? randomUUID(),
		})
	}

	async accessContext(sessionId: string | undefined) {
		const context = await this.durable.accessContext(sessionId)
		return {
			actor: context.actor,
			workspaceId: context.workspaceId,
			activeVendorId: context.activeVendorId,
			locationIds: context.locationIds,
			capabilities: context.capabilities,
		}
	}

	listOwnerMemberships(sessionId: string | undefined) {
		return this.durable.listOwnerMemberships(sessionId)
	}

	selectActiveVendor(sessionId: string | undefined, body: unknown) {
		return this.durable.selectActiveVendor(sessionId, body)
	}

	async authenticateFromCookie(cookieHeader: string | undefined) {
		if (!cookieHeader) return undefined
		const session = await getAuth().api.getSession({ headers: new Headers({ cookie: cookieHeader }) })
		if (!session?.user.emailVerified) return undefined
		await this.durable.ensureAuthenticatedSession({
			sessionId: session.session.id,
			userId: session.user.id,
			email: session.user.email,
			expiresAt: new Date(session.session.expiresAt),
		})
		return session.session.id
	}

	async issueIdentityVerificationSession(sessionId: string | undefined) {
		if (applicationRuntimeMode() !== 'staging') throw new AccessDeniedError('Identity verification is deferred until public release.')
		const { userId } = await this.durable.authenticatedIdentity(sessionId)
		const adapter = new DiditSandboxAdapter(
			this.configService.getOrThrow<string>('DIDIT_API_KEY'),
			this.configService.getOrThrow<string>('DIDIT_WEBHOOK_SECRET'),
		)
		const callbackUrl = new URL('/account?identity=didit', this.configService.getOrThrow<string>('BETTER_AUTH_URL')).toString()
		const issued = IdentityVerificationSessionSchema.parse(
			await adapter.createSession(userId, this.configService.getOrThrow<string>('DIDIT_WORKFLOW_ID'), callbackUrl),
		)
		await this.durable.recordDiditSessionIssued(userId, issued.sessionId)
		return issued
	}

	async identityVerificationStatus(sessionId: string | undefined) {
		if (applicationRuntimeMode() !== 'staging') throw new AccessDeniedError('Identity verification is deferred until public release.')
		return IdentityVerificationStatusSchema.parse(await this.durable.identityVerificationStatus(sessionId))
	}

	async receiveDiditWebhook(rawBody: Buffer | undefined, signatureV2: string | undefined) {
		if (applicationRuntimeMode() !== 'staging') throw new AccessDeniedError('Identity verification is deferred until public release.')
		if (!rawBody) return this.rejectDiditWebhook('missing-body')
		const adapter = new DiditSandboxAdapter(
			this.configService.getOrThrow<string>('DIDIT_API_KEY'),
			this.configService.getOrThrow<string>('DIDIT_WEBHOOK_SECRET'),
		)
		let payload: unknown
		try {
			payload = adapter.verifyWebhook(rawBody, signatureV2)
		} catch {
			return this.rejectDiditWebhook('signature')
		}
		if (!payload || typeof payload !== 'object') return this.rejectDiditWebhook('payload-shape')
		const event = payload as Record<string, unknown>
		const createdAt = diditObservedAt(event['created_at'])
		if (
			event['webhook_type'] !== 'status.updated' ||
			(event['environment'] !== undefined && event['environment'] !== 'sandbox') ||
			typeof event['session_id'] !== 'string' ||
			!event['session_id'] ||
			event['session_id'].length > 200 ||
			typeof event['vendor_data'] !== 'string' ||
			!/^[0-9a-f-]{36}$/i.test(event['vendor_data']) ||
			typeof event['status'] !== 'string' ||
			!event['status'] ||
			event['status'].length > 100 ||
			!createdAt ||
			Number.isNaN(createdAt.valueOf())
		)
			return this.rejectDiditWebhook('payload-shape', this.diditWebhookShape(event))
		try {
			return await this.durable.recordDiditSessionUpdate({
				eventId: createHash('sha256').update(rawBody).digest('hex'),
				sessionId: event['session_id'],
				userId: event['vendor_data'],
				eventType: event['webhook_type'],
				status: event['status'],
				observedAt: createdAt.toISOString(),
				sandboxMode: true,
			})
		} catch (error) {
			if (error instanceof AccessDeniedError) return this.rejectDiditWebhook('session-correlation')
			throw error
		}
	}

	private diditWebhookShape(event: Record<string, unknown>): string {
		const label = (value: unknown) => (typeof value === 'string' ? value.slice(0, 100) : typeof value)
		return JSON.stringify({
			webhookType: label(event['webhook_type']),
			environment: label(event['environment']),
			status: label(event['status']),
			hasSessionId: typeof event['session_id'] === 'string' && event['session_id'].length > 0,
			hasVendorData: typeof event['vendor_data'] === 'string' && event['vendor_data'].length > 0,
			createdAt: label(event['created_at']),
		})
	}

	private rejectDiditWebhook(reason: 'missing-body' | 'signature' | 'payload-shape' | 'session-correlation', detail?: string): never {
		this.logger.warn(`Didit webhook rejected: ${reason}${detail ? ` (${detail})` : ''}`)
		throw new AccessDeniedError()
	}

	async readLocation(sessionId: string | undefined, locationId: string) {
		return this.durable.readLocation(sessionId, locationId)
	}

	async browsePublicVendors(query: unknown) {
		return this.durable.browsePublicVendors(query)
	}

	browsePublicListings(query: unknown) {
		PublicListingBrowseQuerySchema.parse(query)
		return this.durable.browsePublicListings(query)
	}

	readPublicProductAvailability(listingId: string, query: unknown) {
		PublicProductAvailabilityQuerySchema.parse(query)
		return this.durable.readPublicProductAvailability(listingId, query)
	}

	readPublicListing(listingId: string) {
		return this.durable.readPublicListing(listingId)
	}

	readPublicStorefront(slug: string) {
		return this.durable.readPublicStorefront(slug)
	}

	readPublicMedia(mediaId: string, kind: 'video' | 'poster' | 'captions' | 'image') {
		return this.durable.readPublicMedia(mediaId, kind)
	}

	readVendorCatalog(sessionId: string | undefined) {
		return this.durable.readVendorCatalog(sessionId)
	}

	readCustomerDiscoveryState(sessionId: string | undefined) {
		return this.durable.readCustomerDiscoveryState(sessionId)
	}

	readPlatformReviewQueue(sessionId: string | undefined, query: unknown) {
		return this.durable.readPlatformReviewQueue(sessionId, query)
	}

	readPlatformCatalogHealth(sessionId: string | undefined) {
		return this.durable.readPlatformCatalogHealth(sessionId)
	}

	recommendPublicListings(sessionId: string | undefined) {
		return this.durable.recommendPublicListings(sessionId)
	}

	setDiscoveryPreference(sessionId: string | undefined, body: unknown) {
		DiscoveryPreferenceUpdateSchema.parse(body)
		return this.durable.setDiscoveryPreference(sessionId, body)
	}

	saveListing(sessionId: string | undefined, listingId: string, saved: boolean) {
		EngagementMutationSchema.parse({ saved })
		return this.durable.saveListing(sessionId, listingId, saved)
	}

	followVendor(sessionId: string | undefined, vendorId: string, following: boolean) {
		VendorFollowMutationSchema.parse({ following })
		return this.durable.followVendor(sessionId, vendorId, following)
	}

	readGoodsLocationConfiguration(sessionId: string | undefined, locationId: string) {
		return this.durable.readGoodsLocationConfiguration(sessionId, locationId)
	}
	configureGoodsLocation(sessionId: string | undefined, key: string | undefined, locationId: string, input: unknown) {
		return this.durable.configureGoodsLocation(sessionId, key, locationId, input)
	}
	publishVendorCoupon(sessionId: string | undefined, key: string | undefined, input: unknown) {
		return this.durable.publishVendorCoupon(sessionId, key, input)
	}
	publishPlatformCampaign(sessionId: string | undefined, key: string | undefined, input: unknown) {
		return this.durable.publishPlatformCampaign(sessionId, key, input)
	}
	publishCommissionRate(sessionId: string | undefined, key: string | undefined, input: unknown) {
		return this.durable.publishCommissionRate(sessionId, key, input)
	}
	readPromotionDefinition(sessionId: string | undefined, id: string, kind: 'vendor_coupon' | 'platform_campaign') {
		return this.durable.readPromotionDefinition(sessionId, id, kind)
	}
	readCommissionRate(sessionId: string | undefined, id: string) {
		return this.durable.readCommissionRate(sessionId, id)
	}
	resolveVendorCoupon(sessionId: string | undefined, input: unknown) {
		return this.durable.resolveVendorCoupon(sessionId, input)
	}
	readMixedPurchase(sessionId: string | undefined, id: string) {
		return this.durable.readMixedPurchase(sessionId, id)
	}
	attachMixedInvoice(sessionId: string | undefined, key: string | undefined, id: string, input: unknown) {
		return this.durable.attachMixedInvoice(sessionId, key, id, input)
	}
	readCurrentMixedPayment(sessionId: string | undefined) {
		return this.durable.readCurrentMixedPayment(sessionId)
	}
	startMixedPayment(sessionId: string | undefined, key: string | undefined, input: unknown) {
		return this.durable.startMixedPayment(sessionId, key, input)
	}
	readMixedPayment(sessionId: string | undefined, id: string) {
		return this.durable.readMixedPayment(sessionId, id)
	}
	simulateMixedPayment(sessionId: string | undefined, key: string | undefined, id: string, input: unknown) {
		return this.durable.simulateMixedPayment(sessionId, key, id, input)
	}
	receiveMixedPaymentWebhook(raw: Buffer | undefined, signature: string | undefined) {
		return this.durable.receiveMixedPaymentWebhook(raw, signature)
	}
	readCurrentMixedHold(sessionId: string | undefined) {
		return this.durable.readCurrentMixedHold(sessionId)
	}
	createMixedHold(sessionId: string | undefined, key: string | undefined, input: unknown) {
		return this.durable.createMixedHold(sessionId, key, input)
	}
	readMixedHold(sessionId: string | undefined, id: string) {
		return this.durable.readMixedHold(sessionId, id)
	}
	releaseMixedHold(sessionId: string | undefined, key: string | undefined, id: string) {
		return this.durable.releaseMixedHold(sessionId, key, id)
	}
	readCheckoutEligibility(sessionId: string | undefined) {
		return this.durable.readCheckoutEligibility(sessionId)
	}

	readMixedCart(sessionId: string | undefined) {
		return this.durable.readMixedCart(sessionId)
	}
	writeMixedCart(sessionId: string | undefined, key: string | undefined, input: unknown) {
		return this.durable.writeMixedCart(sessionId, key, input)
	}
	previewMixedCartMerge(sessionId: string | undefined, input: unknown) {
		return this.durable.previewMixedCartMerge(sessionId, input)
	}
	createMixedQuote(sessionId: string | undefined, key: string | undefined, input: unknown) {
		return this.durable.createMixedQuote(sessionId, key, input)
	}
	readMixedQuote(sessionId: string | undefined, id: string) {
		return this.durable.readMixedQuote(sessionId, id)
	}
	createGoodsQuote(sessionId: string | undefined, key: string | undefined, input: unknown) {
		return this.durable.createGoodsQuote(sessionId, key, input)
	}
	createGoodsHold(sessionId: string | undefined, key: string | undefined, input: unknown) {
		return this.durable.createGoodsHold(sessionId, key, input)
	}
	readGoodsHold(sessionId: string | undefined, holdId: string) {
		return this.durable.readGoodsHold(sessionId, holdId)
	}
	releaseGoodsHold(sessionId: string | undefined, key: string | undefined, holdId: string) {
		return this.durable.releaseGoodsHold(sessionId, key, holdId)
	}

	startGoodsPayment(sessionId: string | undefined, key: string | undefined, input: unknown) {
		return this.durable.startGoodsPayment(sessionId, key, input)
	}
	recordLocalGoodsPaymentResult(sessionId: string | undefined, key: string | undefined, paymentId: string, input: unknown) {
		return this.durable.recordLocalGoodsPaymentResult(sessionId, key, paymentId, input)
	}
	readGoodsPayment(sessionId: string | undefined, paymentId: string) {
		return this.durable.readGoodsPayment(sessionId, paymentId)
	}
	readGoodsPurchase(sessionId: string | undefined, purchaseId: string) {
		return this.durable.readGoodsPurchase(sessionId, purchaseId)
	}
	readGoodsVendorOrder(sessionId: string | undefined, orderId: string) {
		return this.durable.readGoodsVendorOrder(sessionId, orderId)
	}

	cancelGoodsOrder(sessionId: string | undefined, key: string | undefined, orderId: string, input: unknown, actor: 'vendor' | 'platform') {
		return this.durable.cancelGoodsOrder(sessionId, key, orderId, input, actor)
	}
	readGoodsCancellation(sessionId: string | undefined, cancellationId: string) {
		return this.durable.readGoodsCancellation(sessionId, cancellationId)
	}
	readPlatformGoodsOrder(sessionId: string | undefined, orderId: string) {
		return this.durable.readPlatformGoodsOrder(sessionId, orderId)
	}

	readGoodsFulfillment(sessionId: string | undefined, orderId: string, customer: boolean) {
		return this.durable.readGoodsFulfillment(sessionId, orderId, customer)
	}
	prepareGoodsFulfillment(sessionId: string | undefined, key: string | undefined, id: string) {
		return this.durable.prepareGoodsFulfillment(sessionId, key, id)
	}
	readyGoodsPickup(sessionId: string | undefined, key: string | undefined, id: string) {
		return this.durable.readyGoodsPickup(sessionId, key, id)
	}
	acknowledgeGoodsPickup(sessionId: string | undefined, key: string | undefined, id: string, input: unknown) {
		return this.durable.acknowledgeGoodsPickup(sessionId, key, id, input)
	}
	collectGoodsPickup(sessionId: string | undefined, key: string | undefined, id: string, input: unknown) {
		return this.durable.collectGoodsPickup(sessionId, key, id, input)
	}
	inspectGoodsPickup(sessionId: string | undefined, key: string | undefined, id: string, input: unknown) {
		return this.durable.inspectGoodsPickup(sessionId, key, id, input)
	}

	submitGoodsReturn(sessionId: string | undefined, key: string | undefined, orderId: string, input: unknown) {
		return this.durable.submitGoodsReturn(sessionId, key, orderId, input)
	}
	actOnGoodsReturn(sessionId: string | undefined, key: string | undefined, id: string, input: unknown, actor: 'customer' | 'vendor') {
		return this.durable.actOnGoodsReturn(sessionId, key, id, input, actor)
	}
	readGoodsReturn(sessionId: string | undefined, id: string, actor: 'customer' | 'vendor') {
		return this.durable.readGoodsReturn(sessionId, id, actor)
	}
	acknowledgeDelivery(sessionId: string | undefined, key: string | undefined, id: string, input: unknown) {
		return this.durable.acknowledgeDelivery(sessionId, key, id, input)
	}
	inspectDelivery(sessionId: string | undefined, key: string | undefined, id: string, input: unknown) {
		return this.durable.inspectDelivery(sessionId, key, id, input)
	}

	deliveryHandoff(sessionId: string | undefined, key: string | undefined, id: string, input: unknown) {
		return this.durable.deliveryHandoff(sessionId, key, id, input)
	}

	deliveryMilestone(sessionId: string | undefined, key: string | undefined, id: string, input: unknown) {
		return this.durable.deliveryMilestone(sessionId, key, id, input)
	}
	readDelivery(sessionId: string | undefined, id: string, customer = false) {
		return this.durable.readDelivery(sessionId, id, customer)
	}

	readInventoryAvailability(sessionId: string | undefined, listingId: string, query: unknown) {
		InventoryAvailabilityQuerySchema.parse(query)
		return this.durable.readInventoryAvailability(sessionId, listingId, query)
	}

	createInventoryTransfer(sessionId: string | undefined, idempotencyKey: string | undefined, body: unknown) {
		InventoryTransferCommandSchema.parse(body)
		IdempotencyKeySchema.parse(idempotencyKey)
		return this.durable.createInventoryTransfer(sessionId, idempotencyKey, body)
	}

	createInventoryMovement(sessionId: string | undefined, idempotencyKey: string | undefined, body: unknown) {
		InventoryMovementCommandSchema.parse(body)
		IdempotencyKeySchema.parse(idempotencyKey)
		return this.durable.createInventoryMovement(sessionId, idempotencyKey, body)
	}

	createListing(sessionId: string | undefined, idempotencyKey: string | undefined, body: unknown) {
		ListingDraftSchema.parse(body)
		return this.durable.createListing(sessionId, idempotencyKey, body)
	}

	updateStorefront(sessionId: string | undefined, idempotencyKey: string | undefined, body: unknown) {
		StorefrontUpdateSchema.parse(body)
		return this.durable.updateStorefront(sessionId, idempotencyKey, body)
	}

	reviseListing(sessionId: string | undefined, idempotencyKey: string | undefined, listingId: string, body: unknown) {
		ListingRevisionCommandSchema.parse(body)
		return this.durable.reviseListing(sessionId, idempotencyKey, listingId, body)
	}

	submitListingForReview(sessionId: string | undefined, idempotencyKey: string | undefined, listingId: string) {
		return this.durable.submitListingForReview(sessionId, idempotencyKey, listingId)
	}

	reviewListing(sessionId: string | undefined, idempotencyKey: string | undefined, listingId: string, body: unknown) {
		ListingReviewCommandSchema.parse(body)
		return this.durable.reviewListing(sessionId, idempotencyKey, listingId, body)
	}

	unpublishListing(sessionId: string | undefined, idempotencyKey: string | undefined, listingId: string) {
		return this.durable.unpublishListing(sessionId, idempotencyKey, listingId)
	}

	processShortVideo(sessionId: string | undefined, listingId: string, body: unknown) {
		MediaProcessingCommandSchema.parse(body)
		return this.durable.processShortVideo(sessionId, listingId, body)
	}

	createVideoUploadIntent(sessionId: string | undefined, idempotencyKey: string | undefined, listingId: string, body: unknown) {
		MediaUploadIntentCommandSchema.parse(body)
		return this.durable.createVideoUploadIntent(sessionId, idempotencyKey, listingId, body)
	}

	createImageUploadIntent(sessionId: string | undefined, idempotencyKey: string | undefined, listingId: string, body: unknown) {
		ImageUploadIntentCommandSchema.parse(body)
		IdempotencyKeySchema.parse(idempotencyKey)
		return this.durable.createImageUploadIntent(sessionId, idempotencyKey, listingId, body)
	}

	completeVideoUpload(sessionId: string | undefined, mediaId: string, body: unknown) {
		MediaUploadCompleteCommandSchema.parse(body)
		return this.durable.completeVideoUpload(sessionId, mediaId, body)
	}

	completeImageUpload(sessionId: string | undefined, mediaId: string, body: unknown) {
		MediaUploadCompleteCommandSchema.parse(body)
		return this.durable.completeImageUpload(sessionId, mediaId, body)
	}

	readPlatformMediaQueue(sessionId: string | undefined, query: unknown) {
		MediaReviewQueueQuerySchema.parse(query)
		return this.durable.readPlatformMediaQueue(sessionId, query)
	}

	previewMediaForReview(sessionId: string | undefined, mediaId: string) {
		return this.durable.previewMediaForReview(sessionId, mediaId)
	}

	reviewMedia(sessionId: string | undefined, idempotencyKey: string | undefined, mediaId: string, body: unknown) {
		MediaReviewCommandSchema.parse(body)
		return this.durable.reviewMedia(sessionId, idempotencyKey, mediaId, body)
	}

	setMediaRetentionHold(sessionId: string | undefined, idempotencyKey: string | undefined, mediaId: string, body: unknown) {
		MediaRetentionHoldCommandSchema.parse(body)
		return this.durable.setMediaRetentionHold(sessionId, idempotencyKey, mediaId, body)
	}

	importCatalogCsv(sessionId: string | undefined, idempotencyKey: string | undefined, body: unknown) {
		return this.durable.importCatalogCsv(sessionId, idempotencyKey, body)
	}

	exportCatalogCsv(sessionId: string | undefined) {
		return this.durable.exportCatalogCsv(sessionId)
	}

	reviewVendorApplication(sessionId: string | undefined, idempotencyKey: string | undefined, vendorId: string, body: unknown) {
		VendorApplicationReviewSchema.parse(body)
		return this.durable.reviewVendorApplication(sessionId, idempotencyKey, vendorId, body)
	}

	createVendorApplication(sessionId: string | undefined, idempotencyKey: string | undefined, body: unknown) {
		VendorApplicationCommandSchema.parse(body)
		return this.durable.createVendorApplication(sessionId, idempotencyKey, body)
	}

	async realtimeHighWaterCursor(sessionId: string | undefined): Promise<string | null> {
		return this.durable.realtimeHighWaterCursor(sessionId)
	}

	async realtimeReplay(sessionId: string | undefined) {
		return this.durable.realtimeReplay(sessionId)
	}

	async acknowledgeRealtimeCursor(sessionId: string | undefined, cursor: string) {
		return this.durable.acknowledgeRealtimeCursor(sessionId, cursor)
	}

	async realtimeFoundationEventForCommand(sessionId: string | undefined, commandId: string) {
		return this.durable.realtimeFoundationEventForCommand(sessionId, commandId)
	}

	realtimeDomainEventForEventId(eventId: string) {
		return this.durable.realtimeDomainEventForEventId(eventId)
	}

	async acceptAuditMarker(sessionId: string | undefined, idempotencyKey: string | undefined, body: unknown) {
		return this.durable.acceptAuditMarker(sessionId, idempotencyKey, body)
	}

	async acceptElevatedAuditMarker(sessionId: string | undefined, idempotencyKey: string | undefined, body: unknown) {
		return this.durable.acceptElevatedAuditMarker(sessionId, idempotencyKey, body)
	}

	processOneOutboxEvent(workerId: string) {
		return this.durable.processOne(workerId)
	}
}
