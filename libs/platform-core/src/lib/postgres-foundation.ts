import { randomUUID } from 'node:crypto'

import { PrismaPg } from '@prisma/adapter-pg'
import {
	type AccessContext,
	AccessContextSchema,
	AuditMarkerCommandSchema,
	DemoPersonaKeySchema,
	DemoSessionSchema,
	DemoWorkspaceSchema,
	type DomainEvent,
	DomainEventSchema,
	IdempotencyKeySchema,
	LocationReadSchema,
	PublicVendorBrowseQuerySchema,
	PublicVendorPageSchema,
	type RealtimeFoundationEvent,
	RealtimeFoundationEventSchema,
	SyntheticAccountProvisionSchema,
	SyntheticAccountSchema,
	SyntheticProviderCallbackSchema,
	SyntheticStaffGrantResultSchema,
	SyntheticStaffGrantSchema,
	SyntheticStaffRevokeResultSchema,
} from 'contracts'

import { Prisma, PrismaClient } from '../../generated/prisma/index.js'
import { AccessDeniedError, assertElevatedSession, assertScope } from './access.js'
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
	constructor(url: string) {
		const schema = new URL(url).searchParams.get('schema') ?? 'public'
		if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('Unsupported database schema name.')
		this.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, options: `-c search_path=${schema},public` }, { schema }) })
	}
	close() {
		return this.db.$disconnect()
	}
	async health() {
		await this.db.workspace.count()
	}

	private async workspaceLock(tx: Transaction, id: string) {
		await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${id}::uuid FOR UPDATE`
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
			UPDATE "DemoPersona"
			SET "commandEventsUsed" = "commandEventsUsed" + 1
			WHERE id = ${personaId}::uuid
				AND "commandEventsUsed" < "commandEventsLimit"
		`
		if (consumed !== 1) throw new AccessDeniedError('Synthetic demo persona command quota reached.')
	}

	private async derive(tx: Transaction, sessionId: string | undefined): Promise<AccessContext> {
		if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) throw new AccessDeniedError()
		const session = await tx.session.findUnique({ where: { id: sessionId }, include: { user: true, demoPersona: true } })
		if (!session || session.revokedAt || session.expiresAt <= new Date() || Boolean(session.user) === Boolean(session.demoPersona))
			throw new AccessDeniedError()
		if (session.user && !isVerifiedAdult(session.user)) throw new AccessDeniedError()
		await this.workspaceLock(tx, session.workspaceId)
		// Lock identity/session/membership rows so revocation cannot race an accepted write.
		await tx.$queryRaw`SELECT id FROM "Session" WHERE id = ${session.id}::uuid FOR UPDATE`
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
			await tx.$queryRaw`SELECT id FROM "DemoPersona" WHERE id = ${session.demoPersona.id}::uuid FOR SHARE`
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
			return AccessContextSchema.parse({
				actor: { kind: 'demo_persona', personaId: persona.id },
				workspaceId: session.workspaceId,
				activeVendorId: null,
				memberships: [],
				locationIds: [],
				capabilities: ['platform:foundation:read'],
				session: { id: session.id, expiresAt: session.expiresAt.toISOString(), revokedAt: null, mfaVerifiedAt: null, recentAuthAt: null },
			})
		}
		if (!session.user) throw new AccessDeniedError()
		await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${session.user.id}::uuid FOR SHARE`
		const user = await tx.user.findUniqueOrThrow({ where: { id: session.user.id } })
		if (!isVerifiedAdult(user)) throw new AccessDeniedError()
		let memberships: AccessContext['memberships'] = []
		if (session.activeVendorId) {
			await tx.$queryRaw`SELECT id FROM "VendorMembership" WHERE "userId" = ${session.user.id}::uuid AND "vendorId" = ${session.activeVendorId}::uuid FOR SHARE`
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
	accessContext(sessionId: string | undefined) {
		return this.db.$transaction((tx) => this.derive(tx, sessionId))
	}

	async readLocation(sessionId: string | undefined, locationId: string) {
		if (!/^[0-9a-f-]{36}$/i.test(locationId)) throw new AccessDeniedError()
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
			where: { publicSlug: { not: null }, publishedAt: { not: null }, workspace: { kind: 'synthetic' } },
			orderBy: { id: 'asc' },
			take: query.limit + 1,
			...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
		})
		const items = vendors.slice(0, query.limit).map((vendor) => ({ id: vendor.id, slug: vendor.publicSlug }))
		return PublicVendorPageSchema.parse({ items, nextCursor: vendors.length > query.limit ? (items.at(-1)?.id ?? null) : null })
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
		if (!/^[0-9a-f-]{36}$/i.test(staffId)) throw new AccessDeniedError()
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
	async acceptAuditMarker(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		return this.acceptAuditMarkerForMethod(sessionId, keyInput, input, auditMarkerMethod, false)
	}
	async acceptElevatedAuditMarker(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		return this.acceptAuditMarkerForMethod(sessionId, keyInput, input, elevatedAuditMarkerMethod, true)
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
		const key = DemoPersonaKeySchema.parse(keyInput)
		if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) throw new AccessDeniedError()
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
				await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${id}::uuid FOR UPDATE`
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
				await tx.auditLog.deleteMany({ where: { workspaceId: id } })
				await tx.demoWorkspace.update({ where: { id: demo.id }, data: { purgedAt: now } })
				purged.push(id)
			})
		return purged
	}

	async claim(workerId: string, leaseMs = 30000): Promise<DurableClaim | undefined> {
		if (!Number.isFinite(leaseMs) || leaseMs <= 0) throw new Error('Invalid lease.')
		await this.db.$executeRaw`
      UPDATE "OutboxEvent" SET state = 'dead_letter', "claimedBy" = NULL, "claimedAt" = NULL, "claimToken" = NULL
      WHERE state = 'in_flight' AND attempts >= 3 AND "claimedAt" <= clock_timestamp() - ${leaseMs} * interval '1 millisecond'`
		const token = randomUUID()
		const records = await this.db.$queryRaw<DurableClaim[]>`
      UPDATE "OutboxEvent" SET state = 'in_flight', "claimedBy" = ${workerId}, "claimedAt" = clock_timestamp(), "claimToken" = ${token}::uuid, attempts = attempts + 1
      WHERE id = (SELECT id FROM "OutboxEvent" WHERE (state = 'pending' AND "availableAt" <= clock_timestamp()) OR (state = 'in_flight' AND "claimedAt" <= clock_timestamp() - ${leaseMs} * interval '1 millisecond') ORDER BY "occurredAt", id FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id, "claimToken", payload, attempts`
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
			await this.complete(claim)
			return { processed: true }
		} catch {
			await this.fail(claim)
			return { processed: false, retryScheduled: claim.attempts < 3 }
		}
	}
}
