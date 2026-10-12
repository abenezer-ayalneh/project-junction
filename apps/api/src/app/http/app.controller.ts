import { Body, Controller, Get, Header, Headers, HttpCode, Param, Post, Put, Query, Req, Res } from '@nestjs/common'
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
import { GoodsFulfillmentCommandSchema } from 'contracts'

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

	@Get('public/media/:mediaId/image')
	@ApiOperation({ summary: 'Read an approved listing image only while its Listing and Vendor remain published.' })
	async publicImage(@Param('mediaId') mediaId: string, @Res() response: MediaResponse) {
		const { body, contentType } = await this.foundation.readPublicMedia(mediaId, 'image')
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

	@Get('public/listings/:listingId/availability')
	@ApiOperation({ summary: 'Check current Product stock for a selected Location and SKU. This does not reserve stock.' })
	@ApiParam({ name: 'listingId', schema: { type: 'string', format: 'uuid' } })
	@ApiQuery({ name: 'locationId', required: true, schema: { type: 'string', format: 'uuid' } })
	@ApiQuery({ name: 'sku', required: false, schema: { type: 'string', minLength: 1, maxLength: 80 } })
	@ApiQuery({ name: 'quantity', required: false, schema: { type: 'integer', minimum: 1, maximum: 2147483647, default: 1 } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.publicProductAvailability })
	publicProductAvailability(@Param('listingId') listingId: string, @Query() query: unknown) {
		return this.foundation.readPublicProductAvailability(listingId, query)
	}

	@Get('public/listings/:listingId')
	@ApiOperation({ summary: 'Read one approved, published Listing with its public Vendor and locations.' })
	@ApiParam({ name: 'listingId', schema: { type: 'string', format: 'uuid' } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.publicListingDetail })
	publicListing(@Param('listingId') listingId: string) {
		return this.foundation.readPublicListing(listingId)
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

	@Post('customer/bookings/:bookingId/cancel')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'Cancel a Booking under purchased policy and scoped customer authority.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.bookingCancellationCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.bookingCancellationResult })
	customerCancelBooking(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('bookingId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.cancelBooking(sessionId, key, id, body, false)
	}
	@Post('vendor/bookings/:bookingId/cancel')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'Cancel a Booking under purchased policy and scoped vendor authority.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.bookingCancellationCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.bookingCancellationResult })
	vendorCancelBooking(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('bookingId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.cancelBooking(sessionId, key, id, body, true)
	}
	@Post('customer/bookings/:bookingId/amend')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'Atomically amend a paid Booking and settle the controlled local price delta.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.bookingAmendmentCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.bookingAmendmentResult })
	amendBooking(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('bookingId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.amendBooking(sessionId, key, id, body)
	}
	@Post('vendor/bookings/:bookingId/substitutions')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'proposeBookingSubstitution within scoped Booking authority.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.bookingSubstitutionCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.bookingSubstitutionResult })
	proposeBookingSubstitution(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('bookingId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.proposeBookingSubstitution(sessionId, key, id, body)
	}
	@Post('customer/bookings/substitutions/:proposalId/decision')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'decideBookingSubstitution within scoped Booking authority.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.bookingSubstitutionDecision })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.bookingSubstitutionResult })
	decideBookingSubstitution(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('proposalId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.decideBookingSubstitution(sessionId, key, id, body)
	}
	@Get('customer/bookings/substitutions/:proposalId')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'readBookingSubstitution within scoped Booking authority.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.bookingSubstitutionRead })
	readBookingSubstitution(@AuthenticatedSession() sessionId: string | undefined, @Param('proposalId') id: string) {
		return this.foundation.readBookingSubstitution(sessionId, id)
	}
	@Post('customer/bookings/waitlists')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'joinBookingWaitlist within scoped Booking authority.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.bookingWaitlistCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.bookingWaitlistResult })
	joinBookingWaitlist(@AuthenticatedSession() sessionId: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown) {
		return this.foundation.joinBookingWaitlist(sessionId, key, body)
	}
	@Get('customer/bookings/waitlists/:waitlistId')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'readBookingWaitlist within scoped Booking authority.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.bookingWaitlistRead })
	readBookingWaitlist(@AuthenticatedSession() sessionId: string | undefined, @Param('waitlistId') id: string) {
		return this.foundation.readBookingWaitlist(sessionId, id)
	}
	@Post('customer/bookings/waitlists/:waitlistId/remove')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'removeBookingWaitlist within scoped Booking authority.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.bookingWaitlistResult })
	removeBookingWaitlist(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('waitlistId') id: string,
	) {
		return this.foundation.removeBookingWaitlist(sessionId, id, key)
	}
	@Get('customer/bookings/:bookingId/meeting')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'customerBookingMeeting with private participant authority and local provider boundaries.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.bookingMeetingRead })
	customerBookingMeeting(@AuthenticatedSession() sessionId: string | undefined, @Param('bookingId') id: string) {
		return this.foundation.readBookingMeeting(sessionId, id)
	}
	@Get('vendor/bookings/:bookingId/meeting')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'vendorBookingMeeting with private participant authority and local provider boundaries.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.bookingMeetingRead })
	vendorBookingMeeting(@AuthenticatedSession() sessionId: string | undefined, @Param('bookingId') id: string) {
		return this.foundation.readBookingMeeting(sessionId, id, true)
	}
	@Put('vendor/staff/:staffId/local-meet-connection')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'configureLocalMeetConnection with private participant authority and local provider boundaries.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.staffMeetConnectionCommand })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.staffMeetConnectionResult })
	configureLocalMeetConnection(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('staffId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.configureLocalMeetConnection(sessionId, key, id, body)
	}
	@Post('vendor/bookings/:bookingId/meeting/replacement')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'replaceBookingMeeting with private participant authority and local provider boundaries.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.bookingMeetingReplacementCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.bookingMeetingResult })
	replaceBookingMeeting(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('bookingId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.replaceBookingMeeting(sessionId, key, id, body)
	}
	@Get('customer/bookings/:bookingId/attendance')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'customerBookingAttendance with scoped attendance evidence.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.bookingAttendanceRead })
	customerBookingAttendance(@AuthenticatedSession() sessionId: string | undefined, @Param('bookingId') id: string) {
		return this.foundation.readBookingAttendance(sessionId, id)
	}
	@Get('vendor/bookings/:bookingId/attendance')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'vendorBookingAttendance with scoped attendance evidence.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.bookingAttendanceRead })
	vendorBookingAttendance(@AuthenticatedSession() sessionId: string | undefined, @Param('bookingId') id: string) {
		return this.foundation.readBookingAttendance(sessionId, id, true)
	}
	@Get('customer/bookings/:bookingId/attendance/proof')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'readBookingAttendanceProof with scoped attendance evidence.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.bookingAttendanceProof })
	readBookingAttendanceProof(@AuthenticatedSession() sessionId: string | undefined, @Param('bookingId') id: string) {
		return this.foundation.readBookingAttendanceProof(sessionId, id)
	}
	@Post('customer/bookings/:bookingId/join')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'joinBooking with scoped attendance evidence.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.bookingJoinCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.bookingJoinResult })
	joinBooking(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('bookingId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.joinBooking(sessionId, key, id, body)
	}
	@Post('vendor/bookings/:bookingId/attendance/confirm')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'confirmBookingAttendance with scoped attendance evidence.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.bookingAttendanceConfirmCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.bookingAttendanceResult })
	confirmBookingAttendance(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('bookingId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.confirmBookingAttendance(sessionId, key, id, body)
	}
	@Post('vendor/bookings/:bookingId/no-show')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'reportBookingNoShow with scoped attendance evidence.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.bookingNoShowCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.bookingNoShowResult })
	reportBookingNoShow(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('bookingId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.reportBookingNoShow(sessionId, key, id, body)
	}
	@Post('customer/bookings/:bookingId/contest')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'contestBookingAttendance with scoped attendance evidence.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.bookingContestCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.bookingNoShowResult })
	contestBookingAttendance(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('bookingId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.contestBookingAttendance(sessionId, key, id, body)
	}
	@Get('customer/bookings/:bookingId/calendar.ics')
	@Header('Cache-Control', 'no-store')
	@Header('Content-Type', 'text/calendar; charset=utf-8')
	@Header('Content-Disposition', 'attachment; filename="booking.ics"')
	@ApiOperation({ summary: 'Export current Customer-owned Booking terms as a private read-only iCal event.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: { type: 'string' } })
	exportBookingCalendar(@AuthenticatedSession() sessionId: string | undefined, @Param('bookingId') id: string) {
		return this.foundation.exportBookingCalendar(sessionId, id)
	}
	@Post('customer/bookings/payments')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'Start a controlled local appointment payment without extending the hold.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.bookingPaymentStart })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.bookingPaymentResult })
	startBookingPayment(@AuthenticatedSession() sessionId: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown) {
		return this.foundation.startBookingPayment(sessionId, key, body)
	}
	@Post('customer/bookings/payments/:paymentId/local-result')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'Persist a controlled local appointment payment result for reconciliation.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.bookingPaymentReceiptCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.bookingPaymentResult })
	recordLocalBookingPaymentResult(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('paymentId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.recordLocalBookingPaymentResult(sessionId, key, id, body)
	}
	@Get('customer/bookings/payments/:paymentId')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'Read and reconcile a Customer-owned appointment payment.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.bookingPaymentRead })
	readBookingPayment(@AuthenticatedSession() sessionId: string | undefined, @Param('paymentId') id: string) {
		return this.foundation.readBookingPayment(sessionId, id)
	}
	@Get('customer/bookings/:bookingId')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'Read a Customer-owned paid Booking and immutable purchase terms.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.bookingRead })
	readBooking(@AuthenticatedSession() sessionId: string | undefined, @Param('bookingId') id: string) {
		return this.foundation.readBooking(sessionId, id)
	}
	@Post('customer/bookings/holds')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({
		summary: 'Revalidate current Service terms and atomically hold one qualified Staff for fifteen minutes. No Booking or payment is committed.',
	})
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.bookingHoldCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.bookingHoldResult })
	createBookingHold(@AuthenticatedSession() sessionId: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown) {
		return this.foundation.createBookingHold(sessionId, key, body)
	}

	@Get('customer/bookings/holds/:holdId')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'Read a Customer-owned appointment hold and its accepted terms; exact expiry frees capacity once.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.bookingHoldRead })
	readBookingHold(@AuthenticatedSession() sessionId: string | undefined, @Param('holdId') holdId: string) {
		return this.foundation.readBookingHold(sessionId, holdId)
	}

	@Post('customer/bookings/holds/:holdId/release')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'Release only the Customer’s uncommitted appointment hold; retries never allocate again.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.bookingHoldReleaseResult })
	releaseBookingHold(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('holdId') holdId: string,
	) {
		return this.foundation.releaseBookingHold(sessionId, key, holdId)
	}

	@Post('public/listings/:listingId/slots')
	@Header('Cache-Control', 'no-store')
	@HttpCode(200)
	@ApiOperation({
		summary: 'Calculate current fixed-duration Service slots; named Staff requires consent, any Staff stays private. No allocation is created.',
	})
	@ApiBody({ schema: OpenApiSchemaRefs.serviceSlotSelection })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.serviceSlotsResult })
	serviceSlots(@Param('listingId') listingId: string, @Body() body: unknown) {
		return this.foundation.readPublicServiceSlots(listingId, body)
	}

	@Get('locations/:locationId/schedule')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'Read an assigned Location calendar as Owner or enabled Scheduler.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.locationScheduleResult })
	locationSchedule(@AuthenticatedSession() sessionId: string | undefined, @Param('locationId') locationId: string) {
		return this.foundation.readLocationSchedule(sessionId, locationId)
	}

	@Put('locations/:locationId/schedule')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'Set assigned Location hours, breaks, timezone and date replacements as Owner or enabled Scheduler.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.locationScheduleCommand })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.locationScheduleResult })
	configureLocationSchedule(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('locationId') locationId: string,
		@Body() body: unknown,
	) {
		return this.foundation.configureLocationSchedule(sessionId, key, locationId, body)
	}

	@Get('vendor/staff/:staffId/schedule')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'Read a Staff calendar as assigned Owner/Scheduler or linked Staff.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.staffScheduleResult })
	staffSchedule(@AuthenticatedSession() sessionId: string | undefined, @Param('staffId') staffId: string) {
		return this.foundation.readStaffSchedule(sessionId, staffId)
	}

	@Put('vendor/staff/:staffId/schedule')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'Set assigned Staff mode calendars with hours, breaks, timezone and date replacements.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.staffScheduleCommand })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.staffScheduleResult })
	configureStaffSchedule(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('staffId') staffId: string,
		@Body() body: unknown,
	) {
		return this.foundation.configureStaffSchedule(sessionId, key, staffId, body)
	}

	@Get('listings/:listingId/scheduling-rules')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'Read Service timezone, slot interval, lead time and horizon as assigned Owner.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.serviceSchedulingRulesResult })
	serviceSchedulingRules(@AuthenticatedSession() sessionId: string | undefined, @Param('listingId') listingId: string) {
		return this.foundation.readServiceSchedulingRules(sessionId, listingId)
	}

	@Put('listings/:listingId/scheduling-rules')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'Set uniform Service timezone, slot interval, lead time and horizon as assigned Owner.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.serviceSchedulingRulesCommand })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.serviceSchedulingRulesResult })
	configureServiceSchedulingRules(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('listingId') listingId: string,
		@Body() body: unknown,
	) {
		return this.foundation.configureServiceSchedulingRules(sessionId, key, listingId, body)
	}

	@Get('public/listings/:listingId/service-definition')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({ summary: 'Read Service Options, add-ons and qualified modes; private Staff identities are omitted. No slots are reserved.' })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.publicServiceDefinition })
	publicServiceDefinition(@Param('listingId') listingId: string) {
		return this.foundation.readPublicServiceDefinition(listingId)
	}

	@Get('listings/:listingId/service-configuration')
	@ApiOperation({ summary: 'Read Service configuration for an active Owner within all eligible Location grants.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.serviceConfigurationResult })
	serviceConfiguration(@AuthenticatedSession() sessionId: string | undefined, @Param('listingId') listingId: string) {
		return this.foundation.readServiceConfiguration(sessionId, listingId)
	}

	@Put('listings/:listingId/service-configuration')
	@ApiOperation({ summary: 'Configure fixed Service Options, add-ons and Staff qualifications within assigned Locations.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.serviceConfigurationCommand })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.serviceConfigurationResult })
	configureService(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('listingId') listingId: string,
		@Body() body: unknown,
	) {
		return this.foundation.configureService(sessionId, key, listingId, body)
	}

	@Get('vendor/staff')
	@ApiOperation({ summary: 'Read private Staff profiles for the active Vendor Owner.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.staffProfiles })
	staffProfiles(@AuthenticatedSession() sessionId: string | undefined) {
		return this.foundation.readStaffProfiles(sessionId)
	}

	@Post('vendor/staff')
	@ApiOperation({ summary: 'Create a private Staff scheduling profile without granting authentication access or public consent.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.staffProfileCreate })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.staffProfileResult })
	createStaffProfile(@AuthenticatedSession() sessionId: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown) {
		return this.foundation.createStaffProfile(sessionId, key, body)
	}

	@Get('vendor/staff/:staffId')
	@ApiOperation({ summary: 'Read a Staff profile as its linked member or active Vendor Owner.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiOkResponse({ schema: OpenApiSchemaRefs.staffProfileResult })
	staffProfile(@AuthenticatedSession() sessionId: string | undefined, @Param('staffId') staffId: string) {
		return this.foundation.readStaffProfile(sessionId, staffId)
	}

	@Put('vendor/staff/:staffId')
	@ApiOperation({ summary: 'Rename a Staff profile as Owner; prior public display consent is withdrawn.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.staffProfileUpdate })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.staffProfileResult })
	updateStaffProfile(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('staffId') staffId: string,
		@Body() body: unknown,
	) {
		return this.foundation.updateStaffProfile(sessionId, key, staffId, body)
	}

	@Put('vendor/staff/:staffId/public-consent')
	@ApiOperation({ summary: 'Set public display consent only for the authenticated Staff member’s linked profile.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.staffConsentCommand })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.staffProfileResult })
	setStaffConsent(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('staffId') staffId: string,
		@Body() body: unknown,
	) {
		return this.foundation.setStaffPublicConsent(sessionId, key, staffId, body)
	}

	@Get('locations/:locationId/goods-configuration')
	@ApiOperation({ summary: 'Read goods fulfillment settings for an assigned Owner Location.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiParam({ name: 'locationId', schema: { type: 'string', format: 'uuid' } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.goodsLocationConfigurationResult })
	readGoodsConfiguration(@AuthenticatedSession() sessionId: string | undefined, @Param('locationId') locationId: string) {
		return this.foundation.readGoodsLocationConfiguration(sessionId, locationId)
	}

	@Put('locations/:locationId/goods-configuration')
	@ApiOperation({ summary: 'Configure pickup, PostGIS delivery zones and goods policy for an assigned Owner Location.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiParam({ name: 'locationId', schema: { type: 'string', format: 'uuid' } })
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.goodsLocationConfigurationCommand })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.goodsLocationConfigurationResult })
	configureGoodsLocation(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('locationId') locationId: string,
		@Body() body: unknown,
	) {
		return this.foundation.configureGoodsLocation(sessionId, key, locationId, body)
	}

	@Post('customer/goods/quotes')
	@ApiOperation({ summary: 'Quote goods across Vendor groups with current stock, prices, fulfillment and policy snapshots. No stock is reserved.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.goodsQuoteCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.goodsQuoteResult })
	createGoodsQuote(@AuthenticatedSession() sessionId: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown) {
		return this.foundation.createGoodsQuote(sessionId, key, body)
	}

	@Post('customer/goods/holds')
	@ApiOperation({ summary: 'Revalidate a quote and reserve all goods atomically for fifteen minutes.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.goodsHoldCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.goodsHoldResult })
	createGoodsHold(@AuthenticatedSession() sessionId: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown) {
		return this.foundation.createGoodsHold(sessionId, key, body)
	}

	@Get('customer/goods/holds/:holdId')
	@ApiOperation({ summary: 'Read the current state and snapshots of the Customer’s goods hold; expired holds release once.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiParam({ name: 'holdId', schema: { type: 'string', format: 'uuid' } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.goodsHoldRead })
	readGoodsHold(@AuthenticatedSession() sessionId: string | undefined, @Param('holdId') holdId: string) {
		return this.foundation.readGoodsHold(sessionId, holdId)
	}

	@Post('customer/goods/holds/:holdId/release')
	@ApiOperation({ summary: 'Release all uncommitted goods reservations once. A new attempt requires a fresh quote.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiParam({ name: 'holdId', schema: { type: 'string', format: 'uuid' } })
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.goodsHoldReleaseResult })
	releaseGoodsHold(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('holdId') holdId: string,
	) {
		return this.foundation.releaseGoodsHold(sessionId, key, holdId)
	}

	@Post('customer/goods/payments')
	@ApiOperation({ summary: 'Begin a controlled local payment for held goods. No live charge is made; retries preserve the original payment window.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.goodsPaymentStartCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.goodsPaymentResult })
	startGoodsPayment(@AuthenticatedSession() sessionId: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown) {
		return this.foundation.startGoodsPayment(sessionId, key, body)
	}

	@Post('customer/goods/payments/:paymentId/local-result')
	@ApiOperation({
		summary:
			'Record a controlled local simulator result for this Customer payment. Reconciliation determines Purchase or refund; not a live provider webhook.',
	})
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiParam({ name: 'paymentId', schema: { type: 'string', format: 'uuid' } })
	@ApiBody({ schema: OpenApiSchemaRefs.goodsLocalPaymentResultCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.goodsPaymentResult })
	recordLocalGoodsPaymentResult(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('paymentId') paymentId: string,
		@Body() body: unknown,
	) {
		return this.foundation.recordLocalGoodsPaymentResult(sessionId, key, paymentId, body)
	}

	@Get('customer/goods/payments/:paymentId')
	@ApiOperation({ summary: 'Read and reconcile this Customer payment from its recorded provider result. Unknown results never imply success.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiParam({ name: 'paymentId', schema: { type: 'string', format: 'uuid' } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.goodsPaymentRead })
	readGoodsPayment(@AuthenticatedSession() sessionId: string | undefined, @Param('paymentId') paymentId: string) {
		return this.foundation.readGoodsPayment(sessionId, paymentId)
	}

	@Get('customer/goods/purchases/:purchaseId')
	@ApiOperation({ summary: 'Read the Customer’s paid goods Purchase with immutable commercial snapshots and independently scoped Vendor Orders.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiParam({ name: 'purchaseId', schema: { type: 'string', format: 'uuid' } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.goodsPurchaseRead })
	readGoodsPurchase(@AuthenticatedSession() sessionId: string | undefined, @Param('purchaseId') purchaseId: string) {
		return this.foundation.readGoodsPurchase(sessionId, purchaseId)
	}

	@Get('vendor/goods/orders/:orderId')
	@ApiOperation({ summary: 'Read one goods Order for an assigned active Vendor Owner. Other Vendor components are omitted.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiParam({ name: 'orderId', schema: { type: 'string', format: 'uuid' } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.goodsVendorOrderRead })
	readGoodsVendorOrder(@AuthenticatedSession() sessionId: string | undefined, @Param('orderId') orderId: string) {
		return this.foundation.readGoodsVendorOrder(sessionId, orderId)
	}

	@Post('vendor/goods/orders/:orderId/cancellations')
	@ApiOperation({
		summary:
			'Cancel exact pre-fulfillment goods quantities for an assigned Owner; append stock disposition and pending proportional refund without changing other Orders.',
	})
	@ApiSecurity('junction-auth-cookie')
	@ApiParam({ name: 'orderId', schema: { type: 'string', format: 'uuid' } })
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.goodsOrderCancellationCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.goodsOrderCancellationResult })
	cancelVendorGoodsOrder(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('orderId') orderId: string,
		@Body() body: unknown,
	) {
		return this.foundation.cancelGoodsOrder(sessionId, key, orderId, body, 'vendor')
	}

	@Post('platform/goods/orders/:orderId/cancellations')
	@ApiOperation({
		summary: 'Cancel exact goods quantities under a live, expiring Platform Finance grant for this Order. Catalog review privilege is insufficient.',
	})
	@ApiSecurity('junction-auth-cookie')
	@ApiParam({ name: 'orderId', schema: { type: 'string', format: 'uuid' } })
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.goodsOrderCancellationCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.goodsOrderCancellationResult })
	cancelPlatformGoodsOrder(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('orderId') orderId: string,
		@Body() body: unknown,
	) {
		return this.foundation.cancelGoodsOrder(sessionId, key, orderId, body, 'platform')
	}

	@Get('goods/cancellations/:cancellationId')
	@ApiOperation({
		summary: 'Read a cancellation and its current refund state as the owning Customer, assigned Owner or Order-scoped Platform Finance authority.',
	})
	@ApiSecurity('junction-auth-cookie')
	@ApiParam({ name: 'cancellationId', schema: { type: 'string', format: 'uuid' } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.goodsOrderCancellationResult })
	readGoodsCancellation(@AuthenticatedSession() sessionId: string | undefined, @Param('cancellationId') cancellationId: string) {
		return this.foundation.readGoodsCancellation(sessionId, cancellationId)
	}

	@Get('platform/goods/orders/:orderId')
	@ApiOperation({ summary: 'Read only the goods Order covered by the current expiring Platform Finance cancellation grant.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiParam({ name: 'orderId', schema: { type: 'string', format: 'uuid' } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.goodsVendorOrderRead })
	readPlatformGoodsOrder(@AuthenticatedSession() sessionId: string | undefined, @Param('orderId') orderId: string) {
		return this.foundation.readPlatformGoodsOrder(sessionId, orderId)
	}

	@Get('vendor/goods/orders/:orderId/fulfillment')
	@ApiOperation({ summary: 'Read existing fulfillment for an assigned Owner or explicitly enabled Fulfillment Staff. Customer code is omitted.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiParam({ name: 'orderId', schema: { type: 'string', format: 'uuid' } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.goodsFulfillmentRead })
	readVendorGoodsFulfillment(@AuthenticatedSession() sessionId: string | undefined, @Param('orderId') orderId: string) {
		return this.foundation.readGoodsFulfillment(sessionId, orderId, false)
	}

	@Get('customer/goods/orders/:orderId/fulfillment')
	@ApiOperation({ summary: 'Read the Customer’s pickup status and private one-time code/QR during its window/grace. Terminal pickups omit the code.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiParam({ name: 'orderId', schema: { type: 'string', format: 'uuid' } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.goodsCustomerPickupRead })
	readCustomerGoodsFulfillment(@AuthenticatedSession() sessionId: string | undefined, @Param('orderId') orderId: string) {
		return this.foundation.readGoodsFulfillment(sessionId, orderId, true)
	}

	@Post('vendor/goods/fulfillments/:fulfillmentId/prepare')
	@ApiOperation({ summary: 'Begin preparation for an active paid Order under current assigned fulfillment authority.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiParam({ name: 'fulfillmentId', schema: { type: 'string', format: 'uuid' } })
	@ApiBody({ schema: OpenApiSchemaRefs.goodsFulfillmentCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.goodsFulfillmentResult })
	prepareGoodsFulfillment(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('fulfillmentId') id: string,
		@Body() body: unknown,
	) {
		GoodsFulfillmentCommandSchema.parse(body)
		return this.foundation.prepareGoodsFulfillment(sessionId, key, id)
	}

	@Post('vendor/goods/fulfillments/:fulfillmentId/ready')
	@ApiOperation({
		summary: 'Mark prepared pickup goods ready once. Start 72-hour collection and 48-hour grace using immutable policies/remaining quantities.',
	})
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiParam({ name: 'fulfillmentId', schema: { type: 'string', format: 'uuid' } })
	@ApiBody({ schema: OpenApiSchemaRefs.goodsFulfillmentCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.goodsFulfillmentResult })
	readyGoodsPickup(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('fulfillmentId') id: string,
		@Body() body: unknown,
	) {
		GoodsFulfillmentCommandSchema.parse(body)
		return this.foundation.readyGoodsPickup(sessionId, key, id)
	}

	@Post('customer/goods/fulfillments/:fulfillmentId/acknowledgements')
	@ApiOperation({
		summary:
			'Record a private authenticated Customer acknowledgement for controlled code-unavailable/accessibility fallback. A distinct assigned witness must collect.',
	})
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiParam({ name: 'fulfillmentId', schema: { type: 'string', format: 'uuid' } })
	@ApiBody({ schema: OpenApiSchemaRefs.goodsPickupAcknowledgementCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.goodsPickupAcknowledgementResult })
	acknowledgeGoodsPickup(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('fulfillmentId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.acknowledgeGoodsPickup(sessionId, key, id, body)
	}

	@Post('vendor/goods/fulfillments/:fulfillmentId/collect')
	@ApiOperation({
		summary:
			'Collect pickup once with Customer code/QR, or fresh private Customer acknowledgement plus distinct authorized witness evidence. Does not move stock again.',
	})
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiParam({ name: 'fulfillmentId', schema: { type: 'string', format: 'uuid' } })
	@ApiBody({ schema: OpenApiSchemaRefs.goodsPickupCollectionCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.goodsFulfillmentResult })
	collectGoodsPickup(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('fulfillmentId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.collectGoodsPickup(sessionId, key, id, body)
	}

	@Post('vendor/goods/fulfillments/:fulfillmentId/inspect')
	@ApiOperation({
		summary:
			'Inspect all expired pickup quantities as the assigned Owner. Record disposition and policy refund atomically; stock is not restored merely by expiry.',
	})
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiParam({ name: 'fulfillmentId', schema: { type: 'string', format: 'uuid' } })
	@ApiBody({ schema: OpenApiSchemaRefs.goodsPickupInspectionCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.goodsFulfillmentResult })
	inspectGoodsPickup(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('fulfillmentId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.inspectGoodsPickup(sessionId, key, id, body)
	}

	@Post('customer/goods/orders/:orderId/returns')
	@ApiOperation({ summary: 'Submit an eligible exact goods line quantity after verified handoff.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiParam({ name: 'orderId', schema: { type: 'string', format: 'uuid' } })
	@ApiBody({ schema: OpenApiSchemaRefs.goodsReturnSubmitCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.goodsReturnResult })
	submitGoodsReturn(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('orderId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.submitGoodsReturn(sessionId, key, id, body)
	}
	@Post('customer/goods/returns/:returnId/actions')
	@ApiOperation({ summary: 'Record scoped customer return lifecycle evidence or inspection outcome.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiParam({ name: 'returnId', schema: { type: 'string', format: 'uuid' } })
	@ApiBody({ schema: OpenApiSchemaRefs.goodsReturnActionCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.goodsReturnResult })
	customerReturnAction(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('returnId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.actOnGoodsReturn(sessionId, key, id, body, 'customer')
	}
	@Get('customer/goods/returns/:returnId')
	@ApiOperation({ summary: 'Read scoped return evidence and current refund reconciliation.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiParam({ name: 'returnId', schema: { type: 'string', format: 'uuid' } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.goodsReturnRead })
	customerReadReturn(@AuthenticatedSession() sessionId: string | undefined, @Param('returnId') id: string) {
		return this.foundation.readGoodsReturn(sessionId, id, 'customer')
	}
	@Post('vendor/goods/returns/:returnId/actions')
	@ApiOperation({ summary: 'Record scoped vendor return lifecycle evidence or inspection outcome.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiParam({ name: 'returnId', schema: { type: 'string', format: 'uuid' } })
	@ApiBody({ schema: OpenApiSchemaRefs.goodsReturnActionCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.goodsReturnResult })
	vendorReturnAction(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('returnId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.actOnGoodsReturn(sessionId, key, id, body, 'vendor')
	}
	@Get('vendor/goods/returns/:returnId')
	@ApiOperation({ summary: 'Read scoped return evidence and current refund reconciliation.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiParam({ name: 'returnId', schema: { type: 'string', format: 'uuid' } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.goodsReturnRead })
	vendorReadReturn(@AuthenticatedSession() sessionId: string | undefined, @Param('returnId') id: string) {
		return this.foundation.readGoodsReturn(sessionId, id, 'vendor')
	}
	@Post('customer/goods/fulfillments/:fulfillmentId/delivery-acknowledgements')
	@ApiOperation({ summary: 'Record Customer confirmation for an address correction or witnessed handoff.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiParam({ name: 'fulfillmentId', schema: { type: 'string', format: 'uuid' } })
	@ApiBody({ schema: OpenApiSchemaRefs.goodsDeliveryAcknowledgementCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.goodsDeliveryAcknowledgementResult })
	acknowledgeDelivery(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('fulfillmentId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.acknowledgeDelivery(sessionId, key, id, body)
	}

	@Post('vendor/goods/fulfillments/:fulfillmentId/delivery-inspection')
	@ApiOperation({ summary: 'Inspect every undelivered quantity and allocate stock recovery and refunds once.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiParam({ name: 'fulfillmentId', schema: { type: 'string', format: 'uuid' } })
	@ApiBody({ schema: OpenApiSchemaRefs.goodsPickupInspectionCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.goodsDeliveryMilestoneResult })
	inspectDelivery(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('fulfillmentId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.inspectDelivery(sessionId, key, id, body)
	}

	@Post('vendor/goods/fulfillments/:fulfillmentId/delivery-milestones')
	@ApiOperation({ summary: 'Record ordered Vendor delivery dispatch, failure or one corrected retry within the original paid zone and 48-hour policy.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiParam({ name: 'fulfillmentId', schema: { type: 'string', format: 'uuid' } })
	@ApiBody({ schema: OpenApiSchemaRefs.goodsDeliveryMilestoneCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.goodsDeliveryMilestoneResult })
	deliveryMilestone(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('fulfillmentId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.deliveryMilestone(sessionId, key, id, body)
	}

	@Get('vendor/goods/fulfillments/:fulfillmentId/delivery')
	@ApiOperation({ summary: 'Read current Vendor delivery milestones under assigned live fulfillment authority.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiParam({ name: 'fulfillmentId', schema: { type: 'string', format: 'uuid' } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.goodsDeliveryProgressRead })
	readVendorDelivery(@AuthenticatedSession() sessionId: string | undefined, @Param('fulfillmentId') id: string) {
		return this.foundation.readDelivery(sessionId, id, false)
	}

	@Get('customer/goods/fulfillments/:fulfillmentId/delivery')
	@ApiOperation({ summary: 'Read only the Customer own goods delivery attempt, corrected address and ordered milestones.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiParam({ name: 'fulfillmentId', schema: { type: 'string', format: 'uuid' } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.goodsCustomerDeliveryRead })
	readCustomerDelivery(@AuthenticatedSession() sessionId: string | undefined, @Param('fulfillmentId') id: string) {
		return this.foundation.readDelivery(sessionId, id, true)
	}

	@Post('vendor/goods/fulfillments/:fulfillmentId/delivery-handoff')
	@ApiOperation({ summary: 'Complete Vendor delivery once using Customer-only code or fulfillment-bound QR. Browser success is not authoritative.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiParam({ name: 'fulfillmentId', schema: { type: 'string', format: 'uuid' } })
	@ApiBody({ schema: OpenApiSchemaRefs.goodsDeliveryHandoffCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.goodsDeliveryMilestoneResult })
	deliveryHandoff(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('fulfillmentId') id: string,
		@Body() body: unknown,
	) {
		return this.foundation.deliveryHandoff(sessionId, key, id, body)
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

	@Post('inventory/transfers')
	@ApiOperation({ summary: 'Transfer stock atomically between two assigned Locations of the active Vendor.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.inventoryTransferCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.inventoryTransferResult })
	createInventoryTransfer(@AuthenticatedSession() sessionId: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown) {
		return this.foundation.createInventoryTransfer(sessionId, key, body)
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

	@Post('listings/:listingId/image-upload-intents')
	@ApiOperation({ summary: 'Create a scoped signed PUT grant for a Listing image held in private quarantine.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.imageUploadIntentCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.mediaUploadIntent })
	createImageUploadIntent(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('listingId') listingId: string,
		@Body() body: unknown,
	) {
		return this.foundation.createImageUploadIntent(sessionId, key, listingId, body)
	}

	@Post('media/:mediaId/complete-upload')
	@ApiOperation({ summary: 'Verify and seal an uploaded MP4 in private quarantine; safe processing is still required.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiBody({ schema: OpenApiSchemaRefs.mediaUploadCompleteCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.mediaAsset })
	completeVideoUpload(@AuthenticatedSession() sessionId: string | undefined, @Param('mediaId') mediaId: string, @Body() body: unknown) {
		return this.foundation.completeVideoUpload(sessionId, mediaId, body)
	}

	@Post('media/:mediaId/complete-image-upload')
	@ApiOperation({ summary: 'Verify and seal an uploaded Listing image in private quarantine; safe processing is still required.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiBody({ schema: OpenApiSchemaRefs.mediaUploadCompleteCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.mediaAsset })
	completeImageUpload(@AuthenticatedSession() sessionId: string | undefined, @Param('mediaId') mediaId: string, @Body() body: unknown) {
		return this.foundation.completeImageUpload(sessionId, mediaId, body)
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

	@Post('platform/media/:mediaId/retention-hold')
	@ApiOperation({ summary: 'Place or release an evidence-preservation hold on a scoped media version.' })
	@ApiSecurity('junction-auth-cookie')
	@ApiHeader({ name: 'idempotency-key', required: true })
	@ApiBody({ schema: OpenApiSchemaRefs.mediaRetentionHoldCommand })
	@ApiCreatedResponse({ schema: OpenApiSchemaRefs.mediaRetentionResult })
	setMediaRetentionHold(
		@AuthenticatedSession() sessionId: string | undefined,
		@Headers('idempotency-key') key: string | undefined,
		@Param('mediaId') mediaId: string,
		@Body() body: unknown,
	) {
		return this.foundation.setMediaRetentionHold(sessionId, key, mediaId, body)
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
