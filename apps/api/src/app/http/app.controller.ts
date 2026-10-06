import { Body, Controller, Get, Headers, Param, Post, Query, Req, Res } from '@nestjs/common'
import {
	ApiBody,
	ApiCreatedResponse,
	ApiForbiddenResponse,
	ApiHeader,
	ApiOkResponse,
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiSecurity,
	ApiTags,
} from '@nestjs/swagger'

import { FoundationService } from '../foundation/foundation.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { AuthenticatedSession } from './authenticated-session.decorator'
import type { RequestWithContext } from './request-context'
import { OpenApiSchemaRefs } from './swagger'

interface MediaResponse {
	status(code: number): this
	setHeader(name: string, value: string | number): this
	end(body?: Buffer): void
}

@ApiTags('foundation')
@Controller()
export class AppController {
	constructor(
		private readonly foundation: FoundationService,
		private readonly realtime: RealtimeGateway,
	) {}

	@Get('health')
	@ApiOperation({ summary: 'Read API health and readiness.' })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.healthResponse })
	async health(@Req() request: RequestWithContext) {
		const [health] = await Promise.all([this.foundation.health(request.requestId), this.realtime.ready()])
		return health
	}

	@Get('public/vendors')
	@ApiOperation({ summary: 'Browse explicitly published Vendor summaries without a session.' })
	@ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
	@ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.publicVendorPage })
	browsePublicVendors(@Query() query: unknown) {
		return this.foundation.browsePublicVendors(query)
	}

	@Get('public/vendors/:slug')
	@ApiOperation({ summary: 'Read a structured public storefront with only published offerings and basic locations.' })
	@ApiParam({ name: 'slug' })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.publicStorefront })
	publicStorefront(@Param('slug') slug: string) {
		return this.foundation.readPublicStorefront(slug)
	}

	@Get('public/media/:mediaId/video')
	@ApiOperation({ summary: 'Stream a moderated video only while its listing and Vendor remain published.' })
	@ApiParam({ name: 'mediaId', schema: { type: 'string', format: 'uuid' } })
	async publicVideo(@Param('mediaId') mediaId: string, @Headers('range') range: string | undefined, @Res() response: MediaResponse) {
		const { body, contentType } = await this.foundation.readPublicMedia(mediaId, 'video')
		response
			.setHeader('Content-Type', contentType)
			.setHeader('Cache-Control', 'no-store')
			.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
			.setHeader('Accept-Ranges', 'bytes')
		if (range) {
			const match = /^bytes=(\d*)-(\d*)$/.exec(range)
			const start = match?.[1] ? Number(match[1]) : match?.[2] ? Math.max(0, body.length - Number(match[2])) : NaN
			const end = match?.[1] ? (match[2] ? Number(match[2]) : body.length - 1) : body.length - 1
			if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= body.length || end < start) {
				response.status(416).setHeader('Content-Range', `bytes */${body.length}`).end()
				return
			}
			const slice = body.subarray(start, Math.min(end, body.length - 1) + 1)
			response
				.status(206)
				.setHeader('Content-Range', `bytes ${start}-${start + slice.length - 1}/${body.length}`)
				.setHeader('Content-Length', slice.length)
				.end(slice)
			return
		}
		response.setHeader('Content-Length', body.length).end(body)
	}

	@Get('public/media/:mediaId/poster')
	@ApiOperation({ summary: 'Read a moderated poster only while its listing and Vendor remain published.' })
	async publicPoster(@Param('mediaId') mediaId: string, @Res() response: MediaResponse) {
		const { body, contentType } = await this.foundation.readPublicMedia(mediaId, 'poster')
		response
			.setHeader('Content-Type', contentType)
			.setHeader('Cache-Control', 'no-store')
			.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
			.setHeader('Content-Length', body.length)
			.end(body)
	}

	@Get('public/media/:mediaId/captions.vtt')
	@ApiOperation({ summary: 'Read reviewed WebVTT captions for a currently published video.' })
	async publicCaptions(@Param('mediaId') mediaId: string, @Res() response: MediaResponse) {
		const { body, contentType } = await this.foundation.readPublicMedia(mediaId, 'captions')
		response
			.setHeader('Content-Type', contentType)
			.setHeader('Cache-Control', 'no-store')
			.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
			.setHeader('Content-Length', body.length)
			.end(body)
	}

	@Post('vendor-applications')
	@ApiOperation({ summary: 'Create a private Vendor application, structured storefront, basic Location, and scoped Owner session.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.vendorApplicationCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.vendorApplicationResult })
	createVendorApplication(@AuthenticatedSession() sessionId: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown) {
		return this.foundation.createVendorApplication(sessionId, key, body)
	}

	@Get('vendor/catalog')
	@ApiOperation({ summary: 'Read the active Vendor private storefront, locations, and listings across all publication states.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.vendorCatalog })
	readVendorCatalog(@AuthenticatedSession() sessionId: string | undefined) {
		return this.foundation.readVendorCatalog(sessionId)
	}

	@Get('account/vendor-memberships')
	@ApiOperation({ summary: 'List the signed-in adult account’s eligible Vendor Owner memberships.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.vendorMemberships })
	@ApiForbiddenResponse({ schema: OpenApiSchemaRefs.apiError })
	listOwnerMemberships(@AuthenticatedSession() sessionId: string | undefined) {
		return this.foundation.listOwnerMemberships(sessionId)
	}

	@Post('account/active-vendor')
	@ApiOperation({ summary: 'Select an eligible Vendor Owner membership after recent MFA, or return to the Customer scope.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiBody({ schema: OpenApiSchemaRefs.activeVendorSelection })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.activeVendorSelectionResult })
	@ApiForbiddenResponse({ schema: OpenApiSchemaRefs.apiError })
	async selectActiveVendor(@AuthenticatedSession() sessionId: string | undefined, @Body() body: unknown) {
		const resolvedSessionId = sessionId
		const result = await this.foundation.selectActiveVendor(resolvedSessionId, body)
		await this.realtime.revokeSession(resolvedSessionId)
		return result
	}

	@Get('platform/review-queue')
	@ApiOperation({ summary: 'Read scoped pending Vendor applications and approved-Vendor listings awaiting Platform review.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiQuery({ name: 'applicationCursor', required: false, schema: { type: 'string', format: 'uuid' } })
	@ApiQuery({ name: 'listingCursor', required: false, schema: { type: 'string', format: 'uuid' } })
	@ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.platformReviewQueue })
	readPlatformReviewQueue(@AuthenticatedSession() sessionId: string | undefined, @Query() query: unknown) {
		return this.foundation.readPlatformReviewQueue(sessionId, query)
	}

	@Get('platform/catalog-health')
	@ApiOperation({ summary: 'Read scoped catalog review, import, media, and search projection health.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.catalogHealth })
	readPlatformCatalogHealth(@AuthenticatedSession() sessionId: string | undefined) {
		return this.foundation.readPlatformCatalogHealth(sessionId)
	}

	@Get('public/listings')
	@ApiOperation({ summary: 'Browse approved, published Product and Service listings from the rebuildable search projection.' })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.publicListingPage })
	browsePublicListings(@Query() query: unknown) {
		return this.foundation.browsePublicListings(query)
	}

	@Get('public/recommendations')
	@ApiOperation({ summary: 'Return deterministic public discovery recommendations with an explainable reason.' })
	recommendations(@AuthenticatedSession() sessionId: string | undefined) {
		return this.foundation.recommendPublicListings(sessionId)
	}

	@Get('customer/discovery')
	@ApiOperation({ summary: 'Read the current Customer saved listings, followed Vendors, and personalization preference.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.customerDiscoveryState })
	readCustomerDiscoveryState(@AuthenticatedSession() sessionId: string | undefined) {
		return this.foundation.readCustomerDiscoveryState(sessionId)
	}

	@Post('discovery/preference')
	@ApiOperation({ summary: 'Set an explicit, revocable personalization preference.' })
	@ApiSecurity('junction-auth-cookie')
	setDiscoveryPreference(@AuthenticatedSession() sessionId: string | undefined, @Body() body: unknown) {
		return this.foundation.setDiscoveryPreference(sessionId, body)
	}

	@Post('listings/:listingId/save')
	@ApiOperation({ summary: 'Save or remove a published listing for the current Customer.' })
	@ApiSecurity('junction-auth-cookie')
	saveListing(@AuthenticatedSession() sessionId: string | undefined, @Param('listingId') listingId: string, @Body() body: { saved?: unknown }) {
		return this.foundation.saveListing(sessionId, listingId, body.saved === true)
	}

	@Post('vendors/:vendorId/follow')
	@ApiOperation({ summary: 'Follow or unfollow an approved Vendor for the current Customer.' })
	@ApiSecurity('junction-auth-cookie')
	followVendor(@AuthenticatedSession() sessionId: string | undefined, @Param('vendorId') vendorId: string, @Body() body: { following?: unknown }) {
		return this.foundation.followVendor(sessionId, vendorId, body.following === true)
	}

	@Get('inventory/listings/:listingId/availability')
	@ApiOperation({ summary: 'Read derived stock availability for a Product at an assigned Vendor Location.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiParam({ name: 'listingId', schema: { type: 'string', format: 'uuid' } })
	@ApiQuery({ name: 'locationId', required: true, schema: { type: 'string', format: 'uuid' } })
	@ApiQuery({ name: 'sku', required: false, schema: { type: 'string' } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.inventoryAvailability })
	readInventoryAvailability(@AuthenticatedSession() sessionId: string | undefined, @Param('listingId') listingId: string, @Query() query: unknown) {
		return this.foundation.readInventoryAvailability(sessionId, listingId, query)
	}

	@Post('inventory/movements')
	@ApiOperation({ summary: 'Append an idempotent received, adjustment, or damage movement for a Vendor Product.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.inventoryMovementCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.inventoryMovementResult })
	createInventoryMovement(@AuthenticatedSession() sessionId: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown) {
		return this.foundation.createInventoryMovement(sessionId, key, body)
	}

	@Post('listings')
	@ApiOperation({ summary: 'Create a private Vendor-owned fixed-price listing.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.listingDraft })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.listingCommandResult })
	createListing(@AuthenticatedSession() sessionId: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown) {
		return this.foundation.createListing(sessionId, key, body)
	}

	@Post('vendor-storefront')
	@ApiOperation({ summary: 'Update the active Vendor structured storefront before or after approval.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.storefrontUpdate })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.storefrontUpdateResult })
	updateStorefront(@AuthenticatedSession() sessionId: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown) {
		return this.foundation.updateStorefront(sessionId, key, body)
	}

	@Post('listings/:listingId/revise')
	@ApiOperation({ summary: 'Revise a draft, rejected, or unpublished listing before resubmission.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.listingRevisionCommand })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.listingCommandResult })
	reviseListing(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('listingId') listingId: string,
		@Body() body: unknown,
	) {
		return this.foundation.reviseListing(sessionId, key, listingId, body)
	}

	@Post('listings/:listingId/submit')
	@ApiOperation({ summary: 'Submit a private listing for Platform publication review.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.listingCommandResult })
	submitListing(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('listingId') listingId: string,
	) {
		return this.foundation.submitListingForReview(sessionId, key, listingId)
	}

	@Post('listings/:listingId/review')
	@ApiOperation({ summary: 'Approve or reject a pending listing after policy review.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.listingReviewCommand })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.listingCommandResult })
	reviewListing(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('listingId') listingId: string,
		@Body() body: unknown,
	) {
		return this.foundation.reviewListing(sessionId, key, listingId, body)
	}

	@Post('listings/:listingId/unpublish')
	@ApiOperation({ summary: 'Unpublish a Vendor listing and remove its public search projection.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.listingCommandResult })
	unpublishListing(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('listingId') listingId: string,
	) {
		return this.foundation.unpublishListing(sessionId, key, listingId)
	}

	@Post('listings/:listingId/short-video')
	@ApiOperation({ summary: 'Create quarantined short-video metadata; upload, scanning, and processing are required before publication.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiBody({ schema: OpenApiSchemaRefs.mediaProcessingCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.mediaAsset })
	processShortVideo(@AuthenticatedSession() sessionId: string | undefined, @Param('listingId') listingId: string, @Body() body: unknown) {
		return this.foundation.processShortVideo(sessionId, listingId, body)
	}

	@Post('listings/:listingId/video-upload-intents')
	@ApiOperation({ summary: 'Create a scoped, ten-minute signed PUT grant for a private quarantine object.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.mediaUploadIntentCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.mediaUploadIntent })
	createVideoUploadIntent(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('listingId') listingId: string,
		@Body() body: unknown,
	) {
		return this.foundation.createVideoUploadIntent(sessionId, key, listingId, body)
	}

	@Post('media/:mediaId/complete-upload')
	@ApiOperation({ summary: 'Verify and seal an uploaded MP4 in private quarantine; safe processing is still required.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiBody({ schema: OpenApiSchemaRefs.mediaUploadCompleteCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.mediaAsset })
	completeVideoUpload(@AuthenticatedSession() sessionId: string | undefined, @Param('mediaId') mediaId: string, @Body() body: unknown) {
		return this.foundation.completeVideoUpload(sessionId, mediaId, body)
	}

	@Get('platform/media-review-queue')
	@ApiOperation({ summary: 'Read processed, private videos awaiting scoped Platform media moderation.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
	@ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.mediaReviewQueue })
	readPlatformMediaQueue(@AuthenticatedSession() sessionId: string | undefined, @Query() query: unknown) {
		return this.foundation.readPlatformMediaQueue(sessionId, query)
	}

	@Get('platform/media/:mediaId/preview')
	@ApiOperation({ summary: 'Issue short-lived private processed-video and poster preview grants to a scoped reviewer.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.mediaPreview })
	previewMediaForReview(@AuthenticatedSession() sessionId: string | undefined, @Param('mediaId') mediaId: string) {
		return this.foundation.previewMediaForReview(sessionId, mediaId)
	}

	@Post('platform/media/:mediaId/review')
	@ApiOperation({ summary: 'Approve or reject a scanned, processed media version after Platform moderation.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.mediaReviewCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.mediaReviewResult })
	reviewMedia(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('mediaId') mediaId: string,
		@Body() body: unknown,
	) {
		return this.foundation.reviewMedia(sessionId, key, mediaId, body)
	}

	@Post('catalog-imports')
	@ApiOperation({ summary: 'Dry-run or idempotently commit the versioned Vendor catalog CSV template.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.catalogImportCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.catalogImportResult })
	importCatalog(@AuthenticatedSession() sessionId: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown) {
		return this.foundation.importCatalogCsv(sessionId, key, body)
	}

	@Get('catalog-exports/v1')
	@ApiOperation({ summary: 'Export only the active Vendor catalog in the versioned CSV template.' })
	@ApiSecurity('junction-auth-cookie')
	exportCatalog(@AuthenticatedSession() sessionId: string | undefined) {
		return this.foundation.exportCatalogCsv(sessionId)
	}

	@Post('vendor-applications/:vendorId/review')
	@ApiOperation({ summary: 'Approve, reject, or restrict a Vendor application before public publication is enabled.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.vendorApplicationReview })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.vendorApplicationReviewResult })
	reviewVendorApplication(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('vendorId') vendorId: string,
		@Body() body: unknown,
	) {
		return this.foundation.reviewVendorApplication(sessionId, key, vendorId, body)
	}

	@Get('access-context')
	@ApiOperation({ summary: 'Derive the current scoped access context.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.accessContext })
	@ApiForbiddenResponse({ schema: OpenApiSchemaRefs.apiError })
	accessContext(@AuthenticatedSession() sessionId: string | undefined) {
		return this.foundation.accessContext(sessionId)
	}

	@Post('identity/verification-session')
	@ApiOperation({ summary: 'Create a Didit sandbox verification session for the authenticated account.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.identityVerificationSession })
	@ApiForbiddenResponse({ schema: OpenApiSchemaRefs.apiError })
	identityVerificationSession(@AuthenticatedSession() sessionId: string | undefined) {
		return this.foundation.issueIdentityVerificationSession(sessionId)
	}

	@Get('identity/verification-status')
	@ApiOperation({ summary: 'Read the authoritative Didit age-verification state for the authenticated account.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.identityVerificationStatus })
	@ApiForbiddenResponse({ schema: OpenApiSchemaRefs.apiError })
	identityVerificationStatus(@AuthenticatedSession() sessionId: string | undefined) {
		return this.foundation.identityVerificationStatus(sessionId)
	}

	@Post('identity/didit-webhook')
	@ApiOperation({ summary: 'Record a signed Didit sandbox status update for later age-level reconciliation.' })
	@ApiHeader({ name: 'x-signature-v2', required: true })
	@ApiForbiddenResponse({ schema: OpenApiSchemaRefs.apiError })
	diditWebhook(@Headers('x-signature-v2') signatureV2: string | undefined, @Req() request: { rawBody?: Buffer }) {
		return this.foundation.receiveDiditWebhook(request.rawBody, signatureV2)
	}

	@Get('foundation/locations/:locationId')
	@ApiOperation({ summary: 'Read an active Vendor Location within the derived access scope.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiParam({ name: 'locationId', format: 'uuid' })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.locationRead })
	@ApiForbiddenResponse({ schema: OpenApiSchemaRefs.apiError })
	location(@AuthenticatedSession() sessionId: string | undefined, @Param('locationId') locationId: string) {
		return this.foundation.readLocation(sessionId, locationId)
	}
}
