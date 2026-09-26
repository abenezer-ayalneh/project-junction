import { Body, Controller, Delete, Get, Headers, Param, Post, Query, Req, Res } from '@nestjs/common'
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
import { DemoPersonaKeySchema } from 'contracts'

import { FoundationService } from '../foundation/foundation.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import type { RequestWithContext } from './request-context'
import { OpenApiSchemaRefs } from './swagger'

interface CookieResponse {
	cookie(name: string, value: string, options: { httpOnly: boolean; sameSite: 'lax'; secure: boolean; path: string; expires: Date }): void
}

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
	@ApiOperation({ summary: 'Read synthetic API health.' })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.healthResponse })
	async health(@Req() request: RequestWithContext) {
		const [health] = await Promise.all([this.foundation.health(request.requestId), this.realtime.ready()])
		return health
	}

	@Get('public/vendors')
	@ApiOperation({ summary: 'Browse explicitly published synthetic Vendor summaries without a session.' })
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
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.vendorApplicationCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.vendorApplicationResult })
	createVendorApplication(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Body() body: unknown,
	) {
		return this.foundation.createVendorApplication(this.foundation.resolveSessionId(sessionId, cookie), key, body)
	}

	@Get('vendor/catalog')
	@ApiOperation({ summary: 'Read the active Vendor private storefront, locations, and listings across all publication states.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.vendorCatalog })
	readVendorCatalog(@Headers('x-junction-session') sessionId: string | undefined, @Headers('cookie') cookie: string | undefined) {
		return this.foundation.readVendorCatalog(this.foundation.resolveSessionId(sessionId, cookie))
	}

	@Get('account/vendor-memberships')
	@ApiOperation({ summary: 'List the signed-in adult account’s eligible Vendor Owner memberships.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.vendorMemberships })
	@ApiForbiddenResponse({ schema: OpenApiSchemaRefs.apiError })
	listOwnerMemberships(@Headers('x-junction-session') sessionId: string | undefined, @Headers('cookie') cookie: string | undefined) {
		return this.foundation.listOwnerMemberships(this.foundation.resolveSessionId(sessionId, cookie))
	}

	@Post('account/active-vendor')
	@ApiOperation({ summary: 'Select an eligible Vendor Owner membership after recent MFA, or return to the Customer scope.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiBody({ schema: OpenApiSchemaRefs.activeVendorSelection })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.activeVendorSelectionResult })
	@ApiForbiddenResponse({ schema: OpenApiSchemaRefs.apiError })
	async selectActiveVendor(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Body() body: unknown,
	) {
		const resolvedSessionId = this.foundation.resolveSessionId(sessionId, cookie)
		const result = await this.foundation.selectActiveVendor(resolvedSessionId, body)
		await this.realtime.revokeSession(resolvedSessionId)
		return result
	}

	@Get('platform/review-queue')
	@ApiOperation({ summary: 'Read scoped pending Vendor applications and approved-Vendor listings awaiting Platform review.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiQuery({ name: 'applicationCursor', required: false, schema: { type: 'string', format: 'uuid' } })
	@ApiQuery({ name: 'listingCursor', required: false, schema: { type: 'string', format: 'uuid' } })
	@ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.platformReviewQueue })
	readPlatformReviewQueue(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Query() query: unknown,
	) {
		return this.foundation.readPlatformReviewQueue(this.foundation.resolveSessionId(sessionId, cookie), query)
	}

	@Get('platform/catalog-health')
	@ApiOperation({ summary: 'Read scoped catalog review, import, media, and search projection health.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.catalogHealth })
	readPlatformCatalogHealth(@Headers('x-junction-session') sessionId: string | undefined, @Headers('cookie') cookie: string | undefined) {
		return this.foundation.readPlatformCatalogHealth(this.foundation.resolveSessionId(sessionId, cookie))
	}

	@Get('public/listings')
	@ApiOperation({ summary: 'Browse approved, published Product and Service listings from the rebuildable search projection.' })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.publicListingPage })
	browsePublicListings(@Query() query: unknown) {
		return this.foundation.browsePublicListings(query)
	}

	@Get('public/recommendations')
	@ApiOperation({ summary: 'Return deterministic public discovery recommendations with an explainable reason.' })
	recommendations(@Headers('x-junction-session') sessionId: string | undefined, @Headers('cookie') cookie: string | undefined) {
		return this.foundation.recommendPublicListings(this.foundation.resolveSessionId(sessionId, cookie))
	}

	@Get('customer/discovery')
	@ApiOperation({ summary: 'Read the current Customer saved listings, followed Vendors, and personalization preference.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.customerDiscoveryState })
	readCustomerDiscoveryState(@Headers('x-junction-session') sessionId: string | undefined, @Headers('cookie') cookie: string | undefined) {
		return this.foundation.readCustomerDiscoveryState(this.foundation.resolveSessionId(sessionId, cookie))
	}

	@Post('discovery/preference')
	@ApiOperation({ summary: 'Set an explicit, revocable personalization preference.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	setDiscoveryPreference(@Headers('x-junction-session') sessionId: string | undefined, @Headers('cookie') cookie: string | undefined, @Body() body: unknown) {
		return this.foundation.setDiscoveryPreference(this.foundation.resolveSessionId(sessionId, cookie), body)
	}

	@Post('listings/:listingId/save')
	@ApiOperation({ summary: 'Save or remove a published listing for the current Customer.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	saveListing(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Param('listingId') listingId: string,
		@Body() body: { saved?: unknown },
	) {
		return this.foundation.saveListing(this.foundation.resolveSessionId(sessionId, cookie), listingId, body.saved === true)
	}

	@Post('vendors/:vendorId/follow')
	@ApiOperation({ summary: 'Follow or unfollow an approved Vendor for the current Customer.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	followVendor(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Param('vendorId') vendorId: string,
		@Body() body: { following?: unknown },
	) {
		return this.foundation.followVendor(this.foundation.resolveSessionId(sessionId, cookie), vendorId, body.following === true)
	}

	@Get('inventory/listings/:listingId/availability')
	@ApiOperation({ summary: 'Read derived stock availability for a Product at an assigned Vendor Location.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiParam({ name: 'listingId', schema: { type: 'string', format: 'uuid' } })
	@ApiQuery({ name: 'locationId', required: true, schema: { type: 'string', format: 'uuid' } })
	@ApiQuery({ name: 'sku', required: false, schema: { type: 'string' } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.inventoryAvailability })
	readInventoryAvailability(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Param('listingId') listingId: string,
		@Query() query: unknown,
	) {
		return this.foundation.readInventoryAvailability(this.foundation.resolveSessionId(sessionId, cookie), listingId, query)
	}

	@Post('inventory/movements')
	@ApiOperation({ summary: 'Append an idempotent received, adjustment, or damage movement for a Vendor Product.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.inventoryMovementCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.inventoryMovementResult })
	createInventoryMovement(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Body() body: unknown,
	) {
		return this.foundation.createInventoryMovement(this.foundation.resolveSessionId(sessionId, cookie), key, body)
	}

	@Post('listings')
	@ApiOperation({ summary: 'Create a private Vendor-owned fixed-price listing.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.listingDraft })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.listingCommandResult })
	createListing(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Body() body: unknown,
	) {
		return this.foundation.createListing(this.foundation.resolveSessionId(sessionId, cookie), key, body)
	}

	@Post('vendor-storefront')
	@ApiOperation({ summary: 'Update the active Vendor structured storefront before or after approval.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.storefrontUpdate })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.storefrontUpdateResult })
	updateStorefront(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Body() body: unknown,
	) {
		return this.foundation.updateStorefront(this.foundation.resolveSessionId(sessionId, cookie), key, body)
	}

	@Post('listings/:listingId/revise')
	@ApiOperation({ summary: 'Revise a draft, rejected, or unpublished listing before resubmission.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.listingRevisionCommand })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.listingCommandResult })
	reviseListing(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('listingId') listingId: string,
		@Body() body: unknown,
	) {
		return this.foundation.reviseListing(this.foundation.resolveSessionId(sessionId, cookie), key, listingId, body)
	}

	@Post('listings/:listingId/submit')
	@ApiOperation({ summary: 'Submit a private listing for Platform publication review.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.listingCommandResult })
	submitListing(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('listingId') listingId: string,
	) {
		return this.foundation.submitListingForReview(this.foundation.resolveSessionId(sessionId, cookie), key, listingId)
	}

	@Post('listings/:listingId/review')
	@ApiOperation({ summary: 'Approve or reject a pending listing after policy review.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.listingReviewCommand })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.listingCommandResult })
	reviewListing(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('listingId') listingId: string,
		@Body() body: unknown,
	) {
		return this.foundation.reviewListing(this.foundation.resolveSessionId(sessionId, cookie), key, listingId, body)
	}

	@Post('listings/:listingId/unpublish')
	@ApiOperation({ summary: 'Unpublish a Vendor listing and remove its public search projection.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.listingCommandResult })
	unpublishListing(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('listingId') listingId: string,
	) {
		return this.foundation.unpublishListing(this.foundation.resolveSessionId(sessionId, cookie), key, listingId)
	}

	@Post('listings/:listingId/short-video')
	@ApiOperation({ summary: 'Create quarantined short-video metadata; upload, scanning, and processing are required before publication.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.mediaProcessingCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.mediaAsset })
	processShortVideo(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Param('listingId') listingId: string,
		@Body() body: unknown,
	) {
		return this.foundation.processShortVideo(this.foundation.resolveSessionId(sessionId, cookie), listingId, body)
	}

	@Post('listings/:listingId/video-upload-intents')
	@ApiOperation({ summary: 'Create a scoped, ten-minute signed PUT grant for a private quarantine object.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.mediaUploadIntentCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.mediaUploadIntent })
	createVideoUploadIntent(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('listingId') listingId: string,
		@Body() body: unknown,
	) {
		return this.foundation.createVideoUploadIntent(this.foundation.resolveSessionId(sessionId, cookie), key, listingId, body)
	}

	@Post('media/:mediaId/complete-upload')
	@ApiOperation({ summary: 'Verify and seal an uploaded MP4 in private quarantine; safe processing is still required.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.mediaUploadCompleteCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.mediaAsset })
	completeVideoUpload(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Param('mediaId') mediaId: string,
		@Body() body: unknown,
	) {
		return this.foundation.completeVideoUpload(this.foundation.resolveSessionId(sessionId, cookie), mediaId, body)
	}

	@Get('platform/media-review-queue')
	@ApiOperation({ summary: 'Read processed, private videos awaiting scoped Platform media moderation.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
	@ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.mediaReviewQueue })
	readPlatformMediaQueue(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Query() query: unknown,
	) {
		return this.foundation.readPlatformMediaQueue(this.foundation.resolveSessionId(sessionId, cookie), query)
	}

	@Get('platform/media/:mediaId/preview')
	@ApiOperation({ summary: 'Issue short-lived private processed-video and poster preview grants to a scoped reviewer.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.mediaPreview })
	previewMediaForReview(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Param('mediaId') mediaId: string,
	) {
		return this.foundation.previewMediaForReview(this.foundation.resolveSessionId(sessionId, cookie), mediaId)
	}

	@Post('platform/media/:mediaId/review')
	@ApiOperation({ summary: 'Approve or reject a scanned, processed media version after Platform moderation.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.mediaReviewCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.mediaReviewResult })
	reviewMedia(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('mediaId') mediaId: string,
		@Body() body: unknown,
	) {
		return this.foundation.reviewMedia(this.foundation.resolveSessionId(sessionId, cookie), key, mediaId, body)
	}

	@Post('catalog-imports')
	@ApiOperation({ summary: 'Dry-run or idempotently commit the versioned Vendor catalog CSV template.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.catalogImportCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.catalogImportResult })
	importCatalog(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Body() body: unknown,
	) {
		return this.foundation.importCatalogCsv(this.foundation.resolveSessionId(sessionId, cookie), key, body)
	}

	@Get('catalog-exports/v1')
	@ApiOperation({ summary: 'Export only the active Vendor catalog in the versioned CSV template.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	exportCatalog(@Headers('x-junction-session') sessionId: string | undefined, @Headers('cookie') cookie: string | undefined) {
		return this.foundation.exportCatalogCsv(this.foundation.resolveSessionId(sessionId, cookie))
	}

	@Post('vendor-applications/:vendorId/review')
	@ApiOperation({ summary: 'Approve, reject, or restrict a Vendor application before public publication is enabled.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true })
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.vendorApplicationReview })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.vendorApplicationReviewResult })
	reviewVendorApplication(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('vendorId') vendorId: string,
		@Body() body: unknown,
	) {
		return this.foundation.reviewVendorApplication(this.foundation.resolveSessionId(sessionId, cookie), key, vendorId, body)
	}

	@Post('synthetic/accounts')
	@ApiOperation({ summary: 'Provision a local synthetic account for foundation verification.' })
	@ApiHeader({ name: 'x-synthetic-provisioning-secret', required: true, description: 'Local-only synthetic provisioning secret.' })
	@ApiBody({ schema: OpenApiSchemaRefs.syntheticAccountProvision })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.syntheticAccount })
	createSyntheticAccount(@Headers('x-synthetic-provisioning-secret') secret: string | undefined, @Body() body: unknown) {
		return this.foundation.createSyntheticAccount(secret, body)
	}

	@Get('access-context')
	@ApiOperation({ summary: 'Derive the current scoped access context.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true, description: 'Synthetic session identifier.' })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.accessContext })
	@ApiForbiddenResponse({ schema: OpenApiSchemaRefs.apiError })
	accessContext(@Headers('x-junction-session') sessionId: string | undefined, @Headers('cookie') cookie: string | undefined) {
		return this.foundation.accessContext(this.foundation.resolveSessionId(sessionId, cookie))
	}

	@Post('identity/verification-session')
	@ApiOperation({ summary: 'Issue a short-lived Sumsub sandbox SDK token for the authenticated account.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.identityVerificationSession })
	@ApiForbiddenResponse({ schema: OpenApiSchemaRefs.apiError })
	identityVerificationSession(@Headers('x-junction-session') sessionId: string | undefined, @Headers('cookie') cookie: string | undefined) {
		return this.foundation.issueIdentityVerificationSession(this.foundation.resolveSessionId(sessionId, cookie))
	}

	@Post('identity/sumsub-webhook')
	@ApiOperation({ summary: 'Record a signed Sumsub sandbox review for later age-level reconciliation.' })
	@ApiHeader({ name: 'x-payload-digest', required: true })
	@ApiHeader({ name: 'x-payload-digest-alg', required: true })
	@ApiForbiddenResponse({ schema: OpenApiSchemaRefs.apiError })
	sumsubWebhook(
		@Headers('x-payload-digest') digest: string | undefined,
		@Headers('x-payload-digest-alg') algorithm: string | undefined,
		@Req() request: { rawBody?: Buffer },
	) {
		return this.foundation.receiveSumsubReview(request.rawBody, digest, algorithm)
	}

	@Get('foundation/locations/:locationId')
	@ApiOperation({ summary: 'Read an active Vendor Location within the derived access scope.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true, description: 'Synthetic session identifier.' })
	@ApiParam({ name: 'locationId', format: 'uuid' })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.locationRead })
	@ApiForbiddenResponse({ schema: OpenApiSchemaRefs.apiError })
	location(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Param('locationId') locationId: string,
	) {
		return this.foundation.readLocation(this.foundation.resolveSessionId(sessionId, cookie), locationId)
	}

	@Post('foundation/audit-markers')
	@ApiOperation({ summary: 'Record an idempotent synthetic foundation audit marker.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true, description: 'Synthetic session identifier.' })
	@ApiHeader({ name: 'idempotency-key', required: true, description: 'A 16-200 character URL-safe request key.' })
	@ApiBody({ schema: OpenApiSchemaRefs.auditMarkerCommand })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.commandOutcome })
	@ApiForbiddenResponse({ schema: OpenApiSchemaRefs.apiError })
	auditMarker(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Headers('idempotency-key') idempotencyKey: string | undefined,
		@Body() body: unknown,
	) {
		const resolvedSessionId = this.foundation.resolveSessionId(sessionId, cookie)
		return this.foundation.acceptAuditMarker(resolvedSessionId, idempotencyKey, body).then(async (outcome) => {
			await this.realtime.publishFoundationCommand(resolvedSessionId, outcome.commandId, outcome.replayed).catch(() => undefined)
			return outcome
		})
	}

	@Post('foundation/elevated-audit-markers')
	@ApiOperation({ summary: 'Record an elevated synthetic audit marker with Vendor Owner MFA and recent authentication.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true, description: 'A current Vendor Owner session with MFA and recent authentication.' })
	@ApiHeader({ name: 'idempotency-key', required: true, description: 'A 16-200 character URL-safe request key.' })
	@ApiBody({ schema: OpenApiSchemaRefs.auditMarkerCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.commandOutcome })
	@ApiForbiddenResponse({ schema: OpenApiSchemaRefs.apiError })
	elevatedAuditMarker(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Headers('idempotency-key') idempotencyKey: string | undefined,
		@Body() body: unknown,
	) {
		const resolvedSessionId = this.foundation.resolveSessionId(sessionId, cookie)
		return this.foundation.acceptElevatedAuditMarker(resolvedSessionId, idempotencyKey, body).then(async (outcome) => {
			await this.realtime.publishFoundationCommand(resolvedSessionId, outcome.commandId, outcome.replayed).catch(() => undefined)
			return outcome
		})
	}

	@Post('foundation/staff')
	@ApiOperation({ summary: 'Grant a verified synthetic account a scoped Vendor Staff session.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true, description: 'Current synthetic Vendor Owner session.' })
	@ApiBody({ schema: OpenApiSchemaRefs.syntheticStaffGrant })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.syntheticStaffGrantResult })
	grantSyntheticStaff(@Headers('x-junction-session') sessionId: string | undefined, @Headers('cookie') cookie: string | undefined, @Body() body: unknown) {
		return this.foundation.grantSyntheticStaff(this.foundation.resolveSessionId(sessionId, cookie), body)
	}

	@Delete('foundation/staff/:staffId')
	@ApiOperation({ summary: 'Revoke a synthetic Vendor Staff binding and its active scoped sessions.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true, description: 'Current synthetic Vendor Owner session.' })
	@ApiParam({ name: 'staffId', format: 'uuid' })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.syntheticStaffRevokeResult })
	async revokeSyntheticStaff(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Param('staffId') staffId: string,
	) {
		const revoked = await this.foundation.revokeSyntheticStaff(this.foundation.resolveSessionId(sessionId, cookie), staffId)
		await Promise.all(revoked.revokedSessionIds.map((id) => this.realtime.revokeSession(id).catch(() => undefined)))
		return revoked.result
	}

	@Post('webhooks/:provider')
	@ApiOperation({ summary: 'Accept a synthetic provider callback into the durable inbox.' })
	@ApiParam({ name: 'provider', enum: ['fake-payment'] })
	@ApiHeader({ name: 'x-provider-event-id', required: true, description: 'Provider event identifier.' })
	@ApiHeader({ name: 'x-provider-signature', required: true, description: 'HMAC-SHA256 of the raw request body, prefixed with sha256=.' })
	@ApiBody({ schema: OpenApiSchemaRefs.syntheticProviderCallback })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.providerWebhookReceipt })
	@ApiForbiddenResponse({ schema: OpenApiSchemaRefs.apiError })
	providerWebhook(
		@Param('provider') provider: string,
		@Headers('x-provider-event-id') eventId: string | undefined,
		@Headers('x-provider-signature') signature: string | undefined,
		@Req() request: { rawBody?: Buffer },
		@Body() body: unknown,
	) {
		return this.foundation.receiveProviderWebhook(provider, eventId, signature, request.rawBody, body)
	}

	@Post('demo/workspaces')
	@ApiOperation({ summary: 'Create an isolated synthetic workspace that expires after 24 hours.' })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.demoWorkspace })
	@ApiForbiddenResponse({ schema: OpenApiSchemaRefs.apiError })
	async createDemoWorkspace(@Req() request: { res: CookieResponse }) {
		const demo = await this.foundation.createDemoWorkspace()
		this.setDemoSessionCookie(request.res, demo.session.id, demo.session.expiresAt)
		return demo
	}

	@Post('demo/workspaces/:workspaceId/personas/:personaKey/sessions')
	@ApiOperation({ summary: 'Switch the active synthetic demo persona and issue a fresh scoped session.' })
	@ApiSecurity('junction-session')
	@ApiHeader({ name: 'x-junction-session', required: true, description: 'The current demo session identifier. It is revoked after switching.' })
	@ApiParam({ name: 'workspaceId', format: 'uuid' })
	@ApiParam({ name: 'personaKey', enum: DemoPersonaKeySchema.options })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.demoSession })
	@ApiForbiddenResponse({ schema: OpenApiSchemaRefs.apiError })
	switchDemoPersona(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('cookie') cookie: string | undefined,
		@Param('workspaceId') workspaceId: string,
		@Param('personaKey') personaKey: string,
		@Req() request: { res: CookieResponse },
	) {
		const resolvedSessionId = this.foundation.resolveSessionId(sessionId, cookie)
		return this.foundation.switchDemoPersona(resolvedSessionId, workspaceId, personaKey).then(async (session) => {
			await this.realtime.revokeSession(resolvedSessionId).catch(() => undefined)
			this.setDemoSessionCookie(request.res, session.id, session.expiresAt)
			return session
		})
	}

	private setDemoSessionCookie(response: CookieResponse, sessionId: string, expiresAt: string) {
		const cookie = this.foundation.demoSessionCookie(sessionId, expiresAt)
		response.cookie(cookie.name, cookie.value, {
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env['NODE_ENV'] === 'production',
			path: '/v1',
			expires: cookie.expires,
		})
	}
}
