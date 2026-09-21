import { randomUUID } from 'node:crypto'

import { PrismaPg } from '@prisma/adapter-pg'
import { type AccessContext, AccessContextSchema, AuditMarkerCommandSchema, type DomainEvent, DomainEventSchema, IdempotencyKeySchema } from 'contracts'

import { Prisma, PrismaClient } from '../../generated/prisma/index.js'
import { AccessDeniedError, assertScope } from './access.js'
import { IdempotencyConflictError, stableHash } from './idempotency.js'

type Transaction = Prisma.TransactionClient
export interface DurableClaim {
	id: string
	claimToken: string
	payload: unknown
	attempts: number
}
const method = 'POST /v1/foundation/audit-markers'
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue

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

	private async derive(tx: Transaction, sessionId: string | undefined): Promise<AccessContext> {
		if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) throw new AccessDeniedError()
		const session = await tx.session.findUnique({ where: { id: sessionId }, include: { user: true } })
		if (!session || !session.user || !session.user.verifiedAt || session.revokedAt || session.expiresAt <= new Date()) throw new AccessDeniedError()
		await this.workspaceLock(tx, session.workspaceId)
		// Lock identity/session/membership rows so revocation cannot race an accepted write.
		await tx.$queryRaw`SELECT id FROM "Session" WHERE id = ${session.id}::uuid FOR UPDATE`
		const current = await tx.session.findUniqueOrThrow({ where: { id: session.id } })
		if (
			current.revokedAt ||
			current.expiresAt <= new Date() ||
			current.userId !== session.userId ||
			current.workspaceId !== session.workspaceId ||
			current.activeVendorId !== session.activeVendorId ||
			current.activeRole !== session.activeRole
		)
			throw new AccessDeniedError()
		await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${session.user.id}::uuid FOR SHARE`
		const user = await tx.user.findUniqueOrThrow({ where: { id: session.user.id } })
		if (!user.verifiedAt) throw new AccessDeniedError()
		let memberships: AccessContext['memberships'] = []
		if (session.activeVendorId) {
			await tx.$queryRaw`SELECT id FROM "VendorMembership" WHERE "userId" = ${session.user.id}::uuid AND "vendorId" = ${session.activeVendorId}::uuid FOR SHARE`
			const membership = await tx.vendorMembership.findUnique({
				where: { userId_vendorId: { userId: session.user.id, vendorId: session.activeVendorId } },
				include: { vendor: { include: { locations: true } } },
			})
			if (
				!membership ||
				membership.revokedAt ||
				membership.role !== session.activeRole ||
				membership.vendor.workspaceId !== session.workspaceId ||
				!['vendor_owner', 'vendor_staff'].includes(membership.role)
			)
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
		const command = AuditMarkerCommandSchema.parse(input)
		const key = IdempotencyKeySchema.parse(keyInput)
		return this.db.$transaction(async (tx) => {
			const context = await this.derive(tx, sessionId)
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

	async receiveProviderWebhook(workspaceId: string, provider: string, eventId: string | undefined, signature: string | undefined, body: unknown) {
		if (provider !== 'fake-payment' || signature !== 'synthetic-test-signature' || !eventId || eventId.length > 200) throw new AccessDeniedError()
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
			await tx.providerInboxEvent.create({
				data: { provider, providerEventId: eventId, workspaceId, payloadHash, payload: json(body), processedAt: new Date() },
			})
			const id = randomUUID()
			await this.enqueue(tx, {
				eventId: id,
				type: 'ProviderCallbackReceived',
				aggregateId: id,
				aggregateVersion: 1,
				workspaceId,
				causationId: id,
				correlationId: id,
				idempotencyKey: null,
				occurredAt: new Date().toISOString(),
				schemaVersion: 1,
				payload: { provider, eventId },
			})
			return { accepted: true, duplicate: false }
		})
	}

	async createDemoWorkspace() {
		return this.db.$transaction(async (tx) => {
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(773001)`
			if ((await tx.demoWorkspace.count({ where: { purgedAt: null, expiresAt: { gt: new Date() } } })) >= 100)
				throw new AccessDeniedError('Synthetic workspace quota reached.')
			const workspace = await tx.workspace.create({ data: { kind: 'demo' } })
			const demo = await tx.demoWorkspace.create({ data: { workspaceId: workspace.id, expiresAt: new Date(Date.now() + 86400000) } })
			return { id: workspace.id, createdAt: demo.createdAt.toISOString(), expiresAt: demo.expiresAt.toISOString(), state: 'active' as const }
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
