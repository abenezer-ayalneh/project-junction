import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common'
import { ApiHeader, ApiTags } from '@nestjs/swagger'

import { FoundationService } from './foundation.service'

@ApiTags('foundation')
@ApiHeader({
	name: 'x-junction-session',
	required: false,
	description: 'Synthetic session identifier for protected foundation endpoints.',
})
@Controller()
export class AppController {
	constructor(private readonly foundation: FoundationService) {}

	@Get('health')
	health() {
		return this.foundation.health()
	}

	@Get('access-context')
	accessContext(@Headers('x-junction-session') sessionId: string | undefined) {
		return this.foundation.accessContext(sessionId)
	}

	@Post('foundation/audit-markers')
	auditMarker(
		@Headers('x-junction-session') sessionId: string | undefined,
		@Headers('idempotency-key') idempotencyKey: string | undefined,
		@Body() body: unknown,
	) {
		return this.foundation.acceptAuditMarker(sessionId, idempotencyKey, body)
	}

	@Post('webhooks/:provider')
	providerWebhook(
		@Param('provider') provider: string,
		@Headers('x-provider-event-id') eventId: string | undefined,
		@Headers('x-provider-signature') signature: string | undefined,
		@Body() body: unknown,
	) {
		return this.foundation.receiveProviderWebhook(provider, eventId, signature, body)
	}

	@Post('demo/workspaces')
	createDemoWorkspace() {
		return this.foundation.createDemoWorkspace()
	}
}
