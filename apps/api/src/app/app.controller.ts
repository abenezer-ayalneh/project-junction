import { Body, Controller, Delete, Get, Headers, Param, Post, Query, Req } from '@nestjs/common'
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

import { FoundationService } from './foundation.service'
import { RealtimeGateway } from './realtime.gateway'
import type { RequestWithContext } from './request-context'
import { OpenApiSchemaRefs } from './swagger'

interface CookieResponse {
	cookie(name: string, value: string, options: { httpOnly: boolean; sameSite: 'lax'; secure: boolean; path: string; expires: Date }): void
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
	health(@Req() request: RequestWithContext) {
		return this.foundation.health(request.requestId)
	}

	@Get('public/vendors')
	@ApiOperation({ summary: 'Browse explicitly published synthetic Vendor summaries without a session.' })
	@ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
	@ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } })
	@ApiOkResponse({ schema: OpenApiSchemaRefs.publicVendorPage })
	browsePublicVendors(@Query() query: unknown) {
		return this.foundation.browsePublicVendors(query)
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
