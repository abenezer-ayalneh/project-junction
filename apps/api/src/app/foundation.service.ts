import { randomUUID } from 'node:crypto'

import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
	type AccessContext,
	AccessContextSchema,
	AuditMarkerCommandSchema,
	type CommandOutcome,
	type DomainEvent,
	HealthResponseSchema,
	IdempotencyKeySchema,
} from 'contracts'
import {
	AccessDeniedError,
	assertScope,
	DemoWorkspaceService,
	IdempotencyStore,
	InMemoryOutbox,
	PostgresFoundation,
	ProviderInbox,
	SessionRegistry,
} from 'platform-core'

const SYNTHETIC_IDS = {
	user: '00000000-0000-4000-8000-000000000001',
	session: '00000000-0000-4000-8000-000000000002',
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

	constructor(private readonly configService: ConfigService) {
		this.durable = this.configService.get<string>('FOUNDATION_STORAGE') === 'postgresql' ? new PostgresFoundation(this.databaseUrl()) : undefined
		this.sessions.register(this.syntheticContext())
	}

	async health() {
		await this.durable?.health()
		return HealthResponseSchema.parse({
			status: 'ok',
			service: 'api',
			runtimeMode: 'synthetic',
			storage: this.durable ? 'postgresql' : 'in-memory-test-double',
			requestId: randomUUID(),
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

	async acceptAuditMarker(sessionId: string | undefined, idempotencyKey: string | undefined, body: unknown): Promise<CommandOutcome> {
		if (this.durable) return this.durable.acceptAuditMarker(sessionId, idempotencyKey, body)
		const context = this.sessions.derive(sessionId)
		this.requireCapability(context, 'platform:foundation:write')
		const command = AuditMarkerCommandSchema.parse(body)
		if (command.scope) assertScope(context, command.scope)
		const key = IdempotencyKeySchema.parse(idempotencyKey)
		const actorId = context.actor.kind === 'user' ? context.actor.userId : context.actor.personaId

		const result = this.idempotency.execute(key, { actorId, workspaceId: context.workspaceId, vendorId: context.activeVendorId }, command, () => {
			const commandId = randomUUID()
			this.outbox.publish(this.eventFor(context, commandId, key, 'FoundationCommandAccepted', { marker: command.marker }))
			return { commandId, status: 'accepted' as const, marker: command.marker }
		})

		return { ...result.outcome, replayed: result.replayed }
	}

	receiveProviderWebhook(provider: string, eventId: string | undefined, signature: string | undefined, body: unknown) {
		if (this.durable) {
			const workspace = this.configService.get<string>('SYNTHETIC_WEBHOOK_WORKSPACE_ID')
			if (!workspace) throw new AccessDeniedError()
			return this.durable.receiveProviderWebhook(workspace, provider, eventId, signature, body)
		}
		if (provider !== 'fake-payment' || signature !== 'synthetic-test-signature' || !eventId) {
			throw new AccessDeniedError('Provider callback is not accepted.')
		}

		const received = this.inbox.receive(provider, eventId, body, () => {
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
				payload: { provider, eventId },
			})
			return { accepted: true }
		})
		return { accepted: true, duplicate: received.duplicate }
	}

	createDemoWorkspace() {
		return this.durable ? this.durable.createDemoWorkspace() : this.demos.create()
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
			activeVendorId: null,
			locationIds: [],
			memberships: [],
			capabilities: ['platform:foundation:read', 'platform:foundation:write', 'demo:workspace:create', 'demo:workspace:purge'],
			session: {
				id: SYNTHETIC_IDS.session,
				expiresAt: '2099-01-01T00:00:00.000Z',
				revokedAt: null,
				mfaVerifiedAt: '2099-01-01T00:00:00.000Z',
				recentAuthAt: '2099-01-01T00:00:00.000Z',
			},
		})
	}
}
