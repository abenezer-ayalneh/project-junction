/* eslint-disable @typescript-eslint/no-non-null-assertion -- assertions below establish fixture/claim presence */
import { randomUUID } from 'node:crypto'

import { AccessDeniedError } from './access.js'
import { IdempotencyConflictError } from './idempotency.js'
import { PostgresFoundation } from './postgres-foundation.js'

const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('Phase 00 real PostgreSQL', () => {
	let repository: PostgresFoundation
	let other: PostgresFoundation
	let sessionId: string
	let workspaceId: string
	let vendorId: string
	let locationId: string
	beforeAll(async () => {
		repository = new PostgresFoundation(process.env['DATABASE_URL']!)
		other = new PostgresFoundation(process.env['DATABASE_URL']!)
		const workspace = await repository.db.workspace.create({ data: { kind: 'synthetic' } })
		workspaceId = workspace.id
		const user = await repository.db.user.create({ data: { email: `${randomUUID()}@example.invalid`, verifiedAt: new Date() } })
		const vendor = await repository.db.vendor.create({ data: { workspaceId } })
		vendorId = vendor.id
		const location = await repository.db.location.create({ data: { vendorId } })
		locationId = location.id
		await repository.db.vendorMembership.create({ data: { userId: user.id, vendorId, role: 'vendor_owner', locationIds: [locationId] } })
		const session = await repository.db.session.create({
			data: { userId: user.id, workspaceId, activeVendorId: vendorId, activeRole: 'vendor_owner', expiresAt: new Date(Date.now() + 3600000) },
		})
		sessionId = session.id
	})
	afterAll(async () => {
		await repository?.close()
		await other?.close()
	})

	it('commits one audit/event/outcome under concurrent replay and across connections', async () => {
		const key = randomUUID()
		const results = await Promise.all(
			Array.from({ length: 8 }, (_, i) => (i % 2 ? repository : other).acceptAuditMarker(sessionId, key, { marker: 'concurrent' })),
		)
		expect(results.filter((result) => !result.replayed)).toHaveLength(1)
		expect(new Set(results.map((result) => result.commandId)).size).toBe(1)
		expect(await repository.db.auditLog.count({ where: { correlationId: results[0].commandId } })).toBe(1)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId } })).toBe(1)
		await expect(other.acceptAuditMarker(sessionId, key, { marker: 'mismatch' })).rejects.toThrow(IdempotencyConflictError)
	})
	it('denies stale roles, revoked/expired sessions and substituted scope', async () => {
		for (const scope of [{ workspaceId: randomUUID() }, { workspaceId, vendorId: randomUUID() }, { workspaceId, vendorId, locationId: randomUUID() }]) {
			await expect(repository.acceptAuditMarker(sessionId, randomUUID(), { marker: 'deny', scope })).rejects.toThrow(AccessDeniedError)
		}
		await repository.db.session.update({ where: { id: sessionId }, data: { activeRole: 'vendor_staff' } })
		await expect(repository.accessContext(sessionId)).rejects.toThrow(AccessDeniedError)
		await repository.db.session.update({ where: { id: sessionId }, data: { activeRole: 'vendor_owner', revokedAt: new Date() } })
		await expect(repository.accessContext(sessionId)).rejects.toThrow(AccessDeniedError)
		await repository.db.session.update({ where: { id: sessionId }, data: { revokedAt: null, expiresAt: new Date(0) } })
		await expect(repository.accessContext(sessionId)).rejects.toThrow(AccessDeniedError)
		await repository.db.session.update({ where: { id: sessionId }, data: { expiresAt: new Date(Date.now() + 3600000) } })
		expect((await repository.accessContext(sessionId)).locationIds).toEqual([locationId])
	})
	it('rolls back the business write when outbox enqueue fails', async () => {
		const before = await repository.db.auditLog.count()
		await repository.db.$executeRawUnsafe(
			`CREATE FUNCTION reject_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$`,
		)
		await repository.db.$executeRawUnsafe(`CREATE TRIGGER reject_outbox BEFORE INSERT ON "OutboxEvent" FOR EACH ROW EXECUTE FUNCTION reject_outbox()`)
		try {
			await expect(repository.acceptAuditMarker(sessionId, randomUUID(), { marker: 'rollback' })).rejects.toThrow()
		} finally {
			await repository.db.$executeRawUnsafe('DROP TRIGGER reject_outbox ON "OutboxEvent"')
		}
		expect(await repository.db.auditLog.count()).toBe(before)
		expect(await repository.db.idempotencyRecord.count({ where: { outcome: { path: ['marker'], equals: 'rollback' } } })).toBe(0)
	})
	it('deduplicates concurrent webhook delivery and rejects payload substitution', async () => {
		const eventId = randomUUID()
		const results = await Promise.all(
			[repository, other].map((repo) => repo.receiveProviderWebhook(workspaceId, 'fake-payment', eventId, 'synthetic-test-signature', { state: 'ok' })),
		)
		expect(results.filter((result) => !result.duplicate)).toHaveLength(1)
		await expect(repository.receiveProviderWebhook(workspaceId, 'fake-payment', eventId, 'synthetic-test-signature', { state: 'changed' })).rejects.toThrow(
			IdempotencyConflictError,
		)
		await expect(repository.receiveProviderWebhook(workspaceId, 'fake-payment', randomUUID(), 'bad', {})).rejects.toThrow(AccessDeniedError)
	})
	it('claims distinct work, fences stale workers, and deduplicates consumer replay', async () => {
		const [first, second] = await Promise.all([repository.claim('one'), other.claim('two')])
		expect(first).toBeDefined()
		expect(second).toBeDefined()
		expect(first!.id).not.toBe(second!.id)
		await repository.complete(second!)
		await repository.db.outboxEvent.update({ where: { id: first!.id }, data: { claimedAt: new Date(0) } })
		const recovered = await other.claim('one') // even reusing worker name must fence old token
		expect(recovered!.id).toBe(first!.id)
		await expect(repository.complete(first!)).rejects.toThrow('Stale outbox claim')
		await other.complete(recovered!)
		await repository.db.outboxEvent.update({ where: { id: recovered!.id }, data: { state: 'pending' } })
		await repository.complete((await repository.claim('replay'))!)
		expect(await repository.db.outboxReceipt.count({ where: { workspaceId } })).toBe(2)
	})
	it('backs off failed attempts and dead-letters exhausted work', async () => {
		await repository.acceptAuditMarker(sessionId, randomUUID(), { marker: 'retry' })
		for (let attempt = 1; attempt <= 3; attempt++) {
			const claim = (await repository.claim('failure'))!
			expect(claim.attempts).toBe(attempt)
			await repository.fail(claim)
			const row = await repository.db.outboxEvent.findUniqueOrThrow({ where: { id: claim.id } })
			expect(row.state).toBe(attempt === 3 ? 'dead_letter' : 'pending')
			expect(await repository.claim('too-early')).toBeUndefined()
			await repository.db.outboxEvent.update({ where: { id: claim.id }, data: { availableAt: new Date(0) } })
		}
	})
	it('dead-letters repeated worker crashes after the lease budget', async () => {
		await repository.acceptAuditMarker(sessionId, randomUUID(), { marker: 'crash budget' })
		let id = ''
		for (let attempt = 1; attempt <= 3; attempt++) {
			const claim = (await repository.claim('crashing-worker'))!
			id = claim.id
			expect(claim.attempts).toBe(attempt)
			await repository.db.outboxEvent.update({ where: { id }, data: { claimedAt: new Date(0) } })
		}
		expect(await repository.claim('recovery')).toBeUndefined()
		expect((await repository.db.outboxEvent.findUniqueOrThrow({ where: { id } })).state).toBe('dead_letter')
	})
	it('purges only expired demo-owned records and denies expired access', async () => {
		const demo = await repository.createDemoWorkspace()
		const user = await repository.db.user.create({ data: { email: `${randomUUID()}@example.invalid`, verifiedAt: new Date() } })
		const session = await repository.db.session.create({ data: { workspaceId: demo.id, userId: user.id, expiresAt: new Date(Date.now() + 3600000) } })
		await repository.acceptAuditMarker(session.id, randomUUID(), { marker: 'demo data' })
		await repository.db.demoWorkspace.updateMany({ where: { workspaceId: demo.id }, data: { expiresAt: new Date(0) } })
		await expect(repository.accessContext(session.id)).rejects.toThrow(AccessDeniedError)
		expect(await repository.purgeExpiredDemoWorkspaces()).toEqual([demo.id])
		expect(await repository.db.auditLog.count({ where: { workspaceId: demo.id } })).toBe(0)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: demo.id } })).toBe(0)
		expect(await repository.db.session.count({ where: { workspaceId: demo.id } })).toBe(0)
		expect(await repository.db.idempotencyRecord.count({ where: { workspaceId: demo.id } })).toBe(0)
		expect(await repository.db.auditLog.count({ where: { workspaceId } })).toBeGreaterThan(0)
		expect(await repository.purgeExpiredDemoWorkspaces()).toEqual([])
	})
})
