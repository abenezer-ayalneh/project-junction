/* eslint-disable @typescript-eslint/no-non-null-assertion -- assertions below establish fixture/claim presence */
import { randomUUID } from 'node:crypto'

import { DomainEventSchema } from 'contracts'

import { Prisma } from '../../generated/prisma/index.js'
import { AccessDeniedError } from './access.js'
import { DiditSandboxAdapter } from './didit.js'
import { IdempotencyConflictError } from './idempotency.js'
import type { MediaStore } from './media-store.js'
import { PostgresFoundation } from './postgres-foundation.js'

async function* noMediaObjects(): AsyncGenerator<{ key: string; lastModified: Date }> {
	await Promise.resolve()
	for (const object of [] as Array<{ key: string; lastModified: Date }>) yield object
}

async function createReviewerSession(repository: PostgresFoundation, workspaceId: string) {
	const userId = randomUUID()
	const sessionId = randomUUID()
	const email = `${userId}@example.com`
	const expiresAt = new Date(Date.now() + 3600000)
	await repository.db.user.create({ data: { id: userId, email, adultVerificationState: 'verified', verifiedAt: new Date() } })
	await repository.db.session.create({ data: { id: sessionId, userId, workspaceId, mfaVerifiedAt: new Date(), recentAuthAt: new Date(), expiresAt } })
	await repository.db.platformReviewerGrant.create({ data: { userId, grantedBy: 'integration-test' } })
	await repository.db
		.$executeRaw`INSERT INTO junction_auth."user" (id, name, email, "emailVerified") VALUES (${userId}, ${'Integration reviewer'}, ${email}, true)`
	await repository.db
		.$executeRaw`INSERT INTO junction_auth.session (id, "expiresAt", token, "updatedAt", "userId") VALUES (${sessionId}, ${expiresAt}, ${randomUUID()}, now(), ${userId})`
	return { id: sessionId }
}

const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('Phase 00 and Phase 01 real PostgreSQL', () => {
	let repository: PostgresFoundation
	let other: PostgresFoundation
	let sessionId: string
	let userId: string
	let workspaceId: string
	let vendorId: string
	let locationId: string
	beforeAll(async () => {
		repository = new PostgresFoundation(process.env['DATABASE_URL']!)
		other = new PostgresFoundation(process.env['DATABASE_URL']!)
		const workspace = await repository.db.workspace.create({ data: { kind: 'real' } })
		workspaceId = workspace.id
		const user = await repository.db.user.create({
			data: { email: `${randomUUID()}@example.invalid`, adultVerificationState: 'verified', verifiedAt: new Date() },
		})
		userId = user.id
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

	it('bridges an authenticated session without treating verified email as adult verification', async () => {
		const authSession = { sessionId: randomUUID(), userId: randomUUID(), email: `${randomUUID()}@example.com`, expiresAt: new Date(Date.now() + 3600000) }
		await Promise.all([repository.ensureAuthenticatedSession(authSession), other.ensureAuthenticatedSession(authSession)])
		expect(await repository.db.session.count({ where: { id: authSession.sessionId } })).toBe(1)
		const user = await repository.db.user.findUniqueOrThrow({ where: { id: authSession.userId } })
		expect(user.adultVerificationState).toBe('unverified')
		expect((await repository.db.session.findUniqueOrThrow({ where: { id: authSession.sessionId } })).activeRole).toBeNull()
		await repository.db.session.update({ where: { id: authSession.sessionId }, data: { activeRole: 'customer' } })
		await repository.ensureAuthenticatedSession(authSession)
		expect((await repository.db.session.findUniqueOrThrow({ where: { id: authSession.sessionId } })).activeRole).toBeNull()
		await expect(repository.authenticatedIdentity(authSession.sessionId)).resolves.toEqual({ userId: authSession.userId, email: authSession.email })
		await expect(repository.identityVerificationStatus(authSession.sessionId)).resolves.toEqual({ status: 'unverified' })
		await repository.db.user.update({ where: { id: authSession.userId }, data: { adultVerificationState: 'verified', verifiedAt: new Date() } })
		await expect(repository.identityVerificationStatus(authSession.sessionId)).resolves.toEqual({ status: 'verified' })
		await repository.db.user.update({ where: { id: authSession.userId }, data: { adultVerificationState: 'rejected', verifiedAt: null } })
		await expect(repository.identityVerificationStatus(authSession.sessionId)).resolves.toEqual({ status: 'rejected' })
		await expect(repository.accessContext(authSession.sessionId)).rejects.toThrow(AccessDeniedError)
	})
	it('places separate authenticated accounts in one real review workspace', async () => {
		const accounts = [0, 1].map(() => ({
			sessionId: randomUUID(),
			userId: randomUUID(),
			email: `${randomUUID()}@example.com`,
			expiresAt: new Date(Date.now() + 3600000),
		}))
		await Promise.all(accounts.map((account, index) => (index ? other : repository).ensureAuthenticatedSession(account)))
		const sessions = await repository.db.session.findMany({
			where: { id: { in: accounts.map((account) => account.sessionId) } },
			include: { workspace: true },
		})
		expect(sessions).toHaveLength(2)
		expect(sessions.map((session) => session.workspaceId)).toEqual([sessions[0].workspaceId, sessions[0].workspaceId])
		expect(sessions.every((session) => session.workspace.kind === 'real')).toBe(true)
		expect(sessions[0].workspaceId).not.toBe(workspaceId)
	})
	it('keeps a real Vendor Owner on the Better Auth session and restores the role on a new sign-in', async () => {
		const userId = randomUUID()
		const email = `${randomUUID()}@example.com`
		const sessionId = randomUUID()
		const expiresAt = new Date(Date.now() + 3600000)
		await repository.ensureAuthenticatedSession({ sessionId, userId, email, expiresAt })
		await repository.db.user.update({ where: { id: userId }, data: { adultVerificationState: 'verified', verifiedAt: new Date() } })
		const key = randomUUID()
		const application = {
			displayName: 'Real Vendor Workspace',
			slug: `real-owner-${randomUUID().slice(0, 8)}`,
			description: 'A private staging Vendor application.',
			location: { label: 'Main location', city: 'Addis Ababa', address: 'Bole, Addis Ababa, Ethiopia' },
		}
		const created = await repository.createVendorApplication(sessionId, key, application)
		expect(created.sessionId).toBe(sessionId)
		await expect(repository.createVendorApplication(sessionId, key, application)).resolves.toEqual({ ...created, replayed: true })
		await repository.ensureAuthenticatedSession({ sessionId, userId, email, expiresAt })
		await expect(repository.accessContext(sessionId)).resolves.toMatchObject({ activeVendorId: created.vendorId })
		const nextSessionId = randomUUID()
		await repository.ensureAuthenticatedSession({ sessionId: nextSessionId, userId, email, expiresAt })
		await expect(repository.accessContext(nextSessionId)).resolves.toMatchObject({ activeVendorId: created.vendorId })
	})
	it('switches only among the real account’s current Owner memberships after recent MFA', async () => {
		const userId = randomUUID()
		const sessionId = randomUUID()
		await repository.ensureAuthenticatedSession({
			sessionId,
			userId,
			email: `${randomUUID()}@example.com`,
			expiresAt: new Date(Date.now() + 3600000),
		})
		await repository.db.user.update({ where: { id: userId }, data: { adultVerificationState: 'verified', verifiedAt: new Date() } })
		const session = await repository.db.session.findUniqueOrThrow({ where: { id: sessionId } })
		const first = await repository.db.vendor.create({ data: { workspaceId: session.workspaceId, displayName: 'First workshop' } })
		const second = await repository.db.vendor.create({ data: { workspaceId: session.workspaceId, displayName: 'Second workshop' } })
		await repository.db.vendorMembership.createMany({
			data: [
				{ userId, vendorId: first.id, role: 'vendor_owner', locationIds: [] },
				{ userId, vendorId: second.id, role: 'vendor_owner', locationIds: [] },
			],
		})
		expect((await repository.listOwnerMemberships(sessionId)).items).toHaveLength(2)
		await expect(repository.selectActiveVendor(sessionId, { vendorId: first.id })).rejects.toThrow(AccessDeniedError)
		await repository.markVerifiedSecondFactor(sessionId, userId, new Date())
		await expect(repository.selectActiveVendor(sessionId, { vendorId: first.id })).resolves.toEqual({ activeVendorId: first.id })
		await expect(repository.accessContext(sessionId)).resolves.toMatchObject({ activeVendorId: first.id })
		const beforeAudit = await repository.db.auditLog.count({ where: { action: 'session.active-vendor-selected', actorId: userId } })
		await expect(repository.selectActiveVendor(sessionId, { vendorId: randomUUID() })).rejects.toThrow(AccessDeniedError)
		expect(await repository.db.auditLog.count({ where: { action: 'session.active-vendor-selected', actorId: userId } })).toBe(beforeAudit)
		await expect(repository.selectActiveVendor(sessionId, { vendorId: second.id })).resolves.toEqual({ activeVendorId: second.id })
		await expect(repository.accessContext(sessionId)).resolves.toMatchObject({ activeVendorId: second.id })
		await expect(repository.selectActiveVendor(sessionId, { vendorId: null })).resolves.toEqual({ activeVendorId: null })
		await expect(repository.accessContext(sessionId)).resolves.toMatchObject({ activeVendorId: null })
	})
	it('denies a staging session immediately after Better Auth sign-out', async () => {
		const sessionId = randomUUID()
		const userId = randomUUID()
		const email = `${randomUUID()}@example.com`
		const expiresAt = new Date(Date.now() + 3600000)
		await repository.ensureAuthenticatedSession({ sessionId, userId, email, expiresAt })
		await repository.db.user.update({ where: { id: userId }, data: { adultVerificationState: 'verified', verifiedAt: new Date() } })
		await repository.db
			.$executeRaw`INSERT INTO junction_auth."user" (id, name, email, "emailVerified") VALUES (${userId}, ${'Staging reviewer'}, ${email}, true)`
		await repository.db
			.$executeRaw`INSERT INTO junction_auth.session (id, "expiresAt", token, "updatedAt", "userId") VALUES (${sessionId}, ${expiresAt}, ${randomUUID()}, now(), ${userId})`
		const previous = process.env['JUNCTION_RUNTIME_MODE']
		process.env['JUNCTION_RUNTIME_MODE'] = 'staging'
		try {
			await expect(repository.accessContext(sessionId)).resolves.toMatchObject({ actor: { kind: 'user', userId } })
			await repository.db.$executeRaw`DELETE FROM junction_auth.session WHERE id = ${sessionId}`
			await expect(repository.accessContext(sessionId)).rejects.toThrow(AccessDeniedError)
			const before = {
				vendors: await repository.db.vendor.count(),
				audits: await repository.db.auditLog.count(),
				outbox: await repository.db.outboxEvent.count(),
			}
			await expect(
				repository.createVendorApplication(sessionId, randomUUID(), {
					displayName: 'Expired Auth Vendor',
					slug: `expired-auth-${randomUUID().slice(0, 8)}`,
					description: 'This application must not be created after sign-out.',
					location: { label: 'Main location', city: 'Addis Ababa', address: 'Bole, Addis Ababa, Ethiopia' },
				}),
			).rejects.toThrow(AccessDeniedError)
			expect(await repository.db.vendor.count()).toBe(before.vendors)
			expect(await repository.db.auditLog.count()).toBe(before.audits)
			expect(await repository.db.outboxEvent.count()).toBe(before.outbox)
		} finally {
			await repository.db.$executeRaw`DELETE FROM junction_auth.session WHERE id = ${sessionId}`
			await repository.db.$executeRaw`DELETE FROM junction_auth."user" WHERE id = ${userId}`
			if (previous === undefined) delete process.env['JUNCTION_RUNTIME_MODE']
			else process.env['JUNCTION_RUNTIME_MODE'] = previous
		}
	})
	it('grants real reviewer access only with current MFA and removes it on revocation', async () => {
		const accounts = [0, 1].map(() => ({
			sessionId: randomUUID(),
			userId: randomUUID(),
			email: `${randomUUID()}@example.com`,
			expiresAt: new Date(Date.now() + 3600000),
		}))
		await Promise.all(accounts.map((account) => repository.ensureAuthenticatedSession(account)))
		const [reviewer, applicant] = accounts
		const applicantSession = await repository.db.session.findUniqueOrThrow({ where: { id: applicant.sessionId } })
		await repository.db.user.updateMany({
			where: { id: { in: accounts.map((account) => account.userId) } },
			data: { adultVerificationState: 'verified', verifiedAt: new Date() },
		})
		const vendor = await repository.db.vendor.create({ data: { workspaceId: applicantSession.workspaceId } })
		await expect(repository.readPlatformReviewQueue(reviewer.sessionId, { limit: 10 })).rejects.toThrow(AccessDeniedError)
		await repository.db.platformReviewerGrant.create({ data: { userId: reviewer.userId, grantedBy: 'integration-operator' } })
		const queue = await repository.readPlatformReviewQueue(reviewer.sessionId, { limit: 100 })
		expect(queue.applications.some((item) => item.id === vendor.id)).toBe(true)
		await expect(
			repository.createVendorApplication(reviewer.sessionId, randomUUID(), {
				displayName: 'Reviewer Vendor',
				slug: `reviewer-vendor-${randomUUID().slice(0, 8)}`,
				description: 'A reviewer cannot also submit a Vendor application.',
				location: { label: 'Main location', city: 'Addis Ababa', address: 'Bole, Addis Ababa, Ethiopia' },
			}),
		).rejects.toThrow('Platform reviewers cannot create Vendor applications.')
		const before = {
			audit: await repository.db.auditLog.count({ where: { workspaceId: applicantSession.workspaceId } }),
			outbox: await repository.db.outboxEvent.count({ where: { workspaceId: applicantSession.workspaceId } }),
		}
		await expect(
			repository.reviewVendorApplication(reviewer.sessionId, randomUUID(), vendor.id, { decision: 'approve', note: 'requires MFA' }),
		).rejects.toThrow(AccessDeniedError)
		expect(await repository.db.vendor.findUniqueOrThrow({ where: { id: vendor.id } })).toMatchObject({ applicationState: 'pending' })
		expect(await repository.db.auditLog.count({ where: { workspaceId: applicantSession.workspaceId } })).toBe(before.audit)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: applicantSession.workspaceId } })).toBe(before.outbox)
		await repository.markVerifiedSecondFactor(reviewer.sessionId, reviewer.userId, new Date())
		await repository.reviewVendorApplication(reviewer.sessionId, randomUUID(), vendor.id, { decision: 'approve', note: 'reviewed by real user' })
		expect(await repository.db.vendor.findUniqueOrThrow({ where: { id: vendor.id } })).toMatchObject({ applicationState: 'approved' })
		await repository.db.platformReviewerGrant.update({ where: { userId: reviewer.userId }, data: { revokedAt: new Date() } })
		const nextVendor = await repository.db.vendor.create({ data: { workspaceId: applicantSession.workspaceId } })
		const after = {
			audit: await repository.db.auditLog.count({ where: { workspaceId: applicantSession.workspaceId } }),
			outbox: await repository.db.outboxEvent.count({ where: { workspaceId: applicantSession.workspaceId } }),
		}
		await expect(
			repository.reviewVendorApplication(reviewer.sessionId, randomUUID(), nextVendor.id, { decision: 'approve', note: 'revoked' }),
		).rejects.toThrow(AccessDeniedError)
		expect(await repository.db.vendor.findUniqueOrThrow({ where: { id: nextVendor.id } })).toMatchObject({ applicationState: 'pending' })
		expect(await repository.db.auditLog.count({ where: { workspaceId: applicantSession.workspaceId } })).toBe(after.audit)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: applicantSession.workspaceId } })).toBe(after.outbox)
	})

	it('records a Didit status update once and grants adult access only after reconciliation', async () => {
		const authSession = { sessionId: randomUUID(), userId: randomUUID(), email: `${randomUUID()}@example.com`, expiresAt: new Date(Date.now() + 3600000) }
		await repository.ensureAuthenticatedSession(authSession)
		const diditSessionId = `session-${randomUUID()}`
		await repository.recordDiditSessionIssued(authSession.userId, diditSessionId)
		const update = {
			eventId: randomUUID(),
			sessionId: diditSessionId,
			userId: authSession.userId,
			eventType: 'status.updated',
			status: 'Approved',
			observedAt: '2026-09-25T06:00:00.000Z',
			sandboxMode: true,
		}
		const results = await Promise.all([repository.recordDiditSessionUpdate(update), other.recordDiditSessionUpdate(update)])
		expect(results.filter((result) => !result.duplicate)).toHaveLength(1)
		expect(await repository.db.providerInboxEvent.count({ where: { provider: 'didit-sandbox', providerEventId: update.eventId } })).toBe(1)
		await expect(repository.accessContext(authSession.sessionId)).rejects.toThrow(AccessDeniedError)
		await expect(repository.recordDiditSessionUpdate({ ...update, eventId: randomUUID(), userId: randomUUID() })).rejects.toThrow(AccessDeniedError)
		let currentStatus = 'Approved'
		const request = jest.fn(() => Promise.resolve(new Response(JSON.stringify({ status: currentStatus }), { status: 200 })))
		const adapter = new DiditSandboxAdapter('didit-api-key', 'webhook-secret', request as typeof fetch)
		await expect(repository.reconcileOneDiditSession(adapter)).resolves.toEqual({ processed: true, state: 'verified' })
		let user = await repository.db.user.findUniqueOrThrow({ where: { id: authSession.userId } })
		expect(user.adultVerificationState).toBe('verified')
		expect(user.verifiedAt).not.toBeNull()
		await expect(repository.accessContext(authSession.sessionId)).resolves.toMatchObject({ actor: { kind: 'user', userId: authSession.userId } })
		await repository.recordDiditSessionUpdate({ ...update, eventId: randomUUID(), status: 'In Review', observedAt: '2026-09-25T06:01:00.000Z' })
		user = await repository.db.user.findUniqueOrThrow({ where: { id: authSession.userId } })
		expect(user.adultVerificationState).toBe('unverified')
		expect(user.verifiedAt).toBeNull()
		await expect(repository.accessContext(authSession.sessionId)).rejects.toThrow(AccessDeniedError)
		await expect(repository.reconcileOneDiditSession(adapter)).resolves.toEqual({ processed: true, state: 'unverified' })
		await repository.recordDiditSessionUpdate({ ...update, eventId: randomUUID(), status: 'Declined', observedAt: '2026-09-25T06:02:00.000Z' })
		currentStatus = 'Declined'
		await expect(repository.reconcileOneDiditSession(adapter)).resolves.toEqual({ processed: true, state: 'rejected' })
		user = await repository.db.user.findUniqueOrThrow({ where: { id: authSession.userId } })
		expect(user.adultVerificationState).toBe('rejected')
		expect(user.verifiedAt).toBeNull()
	})

	it('reconciles an issued Didit session when a signed callback is delayed or lost', async () => {
		const authSession = { sessionId: randomUUID(), userId: randomUUID(), email: `${randomUUID()}@example.com`, expiresAt: new Date(Date.now() + 3600000) }
		await repository.ensureAuthenticatedSession(authSession)
		const diditSessionId = `session-${randomUUID()}`
		await repository.recordDiditSessionIssued(authSession.userId, diditSessionId)
		const request = jest.fn(() => Promise.resolve(new Response(JSON.stringify({ status: 'Approved' }), { status: 200 })))
		const adapter = new DiditSandboxAdapter('didit-api-key', 'webhook-secret', request as typeof fetch)
		await expect(repository.reconcileOneDiditSession(adapter)).resolves.toEqual({ processed: true, state: 'unverified' })
		expect(
			await repository.db.providerInboxEvent.count({
				where: { provider: 'didit-sandbox', providerReference: diditSessionId, reconciliationState: 'pending_review' },
			}),
		).toBe(1)
		await expect(repository.reconcileOneDiditSession(adapter)).resolves.toEqual({ processed: true, state: 'verified' })
		expect(
			await repository.db.identityVerificationSession.findUniqueOrThrow({
				where: { provider_providerReference: { provider: 'didit-sandbox', providerReference: diditSessionId } },
			}),
		).toMatchObject({ state: 'reconciled' })
		expect(await repository.db.user.findUniqueOrThrow({ where: { id: authSession.userId } })).toMatchObject({ adultVerificationState: 'verified' })
	})

	it('does not grant access from an older Didit session after a newer session is issued', async () => {
		const authSession = { sessionId: randomUUID(), userId: randomUUID(), email: `${randomUUID()}@example.com`, expiresAt: new Date(Date.now() + 3600000) }
		await repository.ensureAuthenticatedSession(authSession)
		const olderSessionId = `session-${randomUUID()}`
		await repository.recordDiditSessionIssued(authSession.userId, olderSessionId)
		await repository.recordDiditSessionUpdate({
			eventId: randomUUID(),
			sessionId: olderSessionId,
			userId: authSession.userId,
			eventType: 'status.updated',
			status: 'Approved',
			observedAt: '2026-10-01T10:00:00.000Z',
			sandboxMode: true,
		})
		const newerSessionId = `session-${randomUUID()}`
		await repository.recordDiditSessionIssued(authSession.userId, newerSessionId)
		const adapter = new DiditSandboxAdapter(
			'didit-api-key',
			'webhook-secret',
			jest.fn(() => Promise.resolve(new Response(JSON.stringify({ status: 'Approved' }), { status: 200 }))) as typeof fetch,
		)
		await expect(repository.reconcileOneDiditSession(adapter)).resolves.toEqual({ processed: true, state: 'unverified' })
		expect(await repository.db.user.findUniqueOrThrow({ where: { id: authSession.userId } })).toMatchObject({ adultVerificationState: 'unverified' })
		expect(
			await repository.db.identityVerificationSession.findUniqueOrThrow({
				where: { provider_providerReference: { provider: 'didit-sandbox', providerReference: olderSessionId } },
			}),
		).toMatchObject({ state: 'superseded' })
		expect(
			await repository.db.identityVerificationSession.findUniqueOrThrow({
				where: { provider_providerReference: { provider: 'didit-sandbox', providerReference: newerSessionId } },
			}),
		).toMatchObject({ state: 'issued' })
	})

	it('binds a verified second factor only to its matching real session', async () => {
		const authSession = { sessionId: randomUUID(), userId: randomUUID(), email: `${randomUUID()}@example.com`, expiresAt: new Date(Date.now() + 3600000) }
		await repository.ensureAuthenticatedSession(authSession)
		const verifiedAt = new Date()
		await expect(repository.markVerifiedSecondFactor(authSession.sessionId, randomUUID(), verifiedAt)).rejects.toThrow(AccessDeniedError)
		let session = await repository.db.session.findUniqueOrThrow({ where: { id: authSession.sessionId } })
		expect(session.mfaVerifiedAt).toBeNull()
		expect(session.recentAuthAt).toBeNull()
		await repository.markVerifiedSecondFactor(authSession.sessionId, authSession.userId, verifiedAt)
		session = await repository.db.session.findUniqueOrThrow({ where: { id: authSession.sessionId } })
		expect(session.mfaVerifiedAt).toEqual(verifiedAt)
		expect(session.recentAuthAt).toEqual(verifiedAt)
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
	it('keeps internal audit events out of the real delivery stream', async () => {
		const command = await repository.acceptAuditMarker(sessionId, randomUUID(), { marker: 'staging delivery boundary' })
		const event = await repository.db.outboxEvent.findFirstOrThrow({
			where: { workspaceId, type: 'FoundationCommandAccepted', payload: { path: ['aggregateId'], equals: command.commandId } },
		})
		{
			const claim = await repository.claim(randomUUID())
			if (claim) {
				const claimedEvent = DomainEventSchema.parse(claim.payload)
				expect(claimedEvent.type).not.toBe('FoundationCommandAccepted')
				expect((await repository.db.workspace.findUniqueOrThrow({ where: { id: claimedEvent.workspaceId } })).kind).toBe('real')
			}
			expect((await repository.db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).state).toBe('pending')
		}
	})
	it('exposes only public catalog events from real workspaces to realtime', async () => {
		const real = await repository.db.workspace.create({ data: { kind: 'real' } })
		const makeEvent = (type: 'ListingPublished' | 'VendorApplicationSubmitted', scopedWorkspaceId: string) =>
			DomainEventSchema.parse({
				eventId: randomUUID(),
				type,
				aggregateId: randomUUID(),
				aggregateVersion: 1,
				workspaceId: scopedWorkspaceId,
				causationId: randomUUID(),
				correlationId: randomUUID(),
				idempotencyKey: null,
				occurredAt: new Date().toISOString(),
				schemaVersion: 1,
				payload: {},
			})
		const publicEvent = makeEvent('ListingPublished', real.id)
		const privateEvent = makeEvent('VendorApplicationSubmitted', real.id)
		const nextPublicEvent = makeEvent('ListingPublished', real.id)
		const records = []
		for (const event of [publicEvent, privateEvent, nextPublicEvent]) {
			records.push(
				await repository.db.outboxEvent.create({
					data: {
						eventId: event.eventId,
						workspaceId: event.workspaceId,
						type: event.type,
						payload: event as Prisma.InputJsonValue,
						occurredAt: new Date(event.occurredAt),
					},
				}),
			)
		}
		await expect(repository.realtimeDomainEventForEventId(publicEvent.eventId)).resolves.toMatchObject({
			eventId: publicEvent.eventId,
			type: 'ListingPublished',
			scope: { workspaceId: real.id },
			payload: {},
		})
		await expect(repository.realtimeDomainEventForEventId(privateEvent.eventId)).resolves.toBeNull()
		const userId = randomUUID()
		const sessionId = randomUUID()
		const email = `${randomUUID()}@example.com`
		const expiresAt = new Date(Date.now() + 3600000)
		await repository.db.user.create({ data: { id: userId, email, adultVerificationState: 'verified', verifiedAt: new Date() } })
		await repository.db.session.create({ data: { id: sessionId, userId, workspaceId: real.id, expiresAt } })
		await repository.db
			.$executeRaw`INSERT INTO junction_auth."user" (id, name, email, "emailVerified") VALUES (${userId}, ${'Public catalog test'}, ${email}, true)`
		await repository.db
			.$executeRaw`INSERT INTO junction_auth.session (id, "expiresAt", token, "updatedAt", "userId") VALUES (${sessionId}, ${expiresAt}, ${randomUUID()}, now(), ${userId})`
		const previous = process.env['JUNCTION_RUNTIME_MODE']
		process.env['JUNCTION_RUNTIME_MODE'] = 'staging'
		try {
			await expect(repository.realtimeHighWaterCursor(sessionId)).resolves.toBe(records[2].id)
			await repository.db.session.update({ where: { id: sessionId }, data: { realtimeCursor: records[0].id } })
			await expect(repository.realtimeReplay(sessionId)).resolves.toMatchObject({
				cursor: records[2].id,
				restRefetchRequired: false,
				events: [{ eventId: nextPublicEvent.eventId, type: 'ListingPublished' }],
			})
		} finally {
			if (previous === undefined) delete process.env['JUNCTION_RUNTIME_MODE']
			else process.env['JUNCTION_RUNTIME_MODE'] = previous
			await repository.db.$executeRaw`DELETE FROM junction_auth.session WHERE id = ${sessionId}`
			await repository.db.$executeRaw`DELETE FROM junction_auth."user" WHERE id = ${userId}`
		}
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
	it('denies a user while adult verification is pending or rejected', async () => {
		await repository.db.user.update({ where: { id: userId }, data: { adultVerificationState: 'pending' } })
		await expect(repository.accessContext(sessionId)).rejects.toThrow(AccessDeniedError)
		await repository.db.user.update({ where: { id: userId }, data: { adultVerificationState: 'rejected' } })
		await expect(repository.accessContext(sessionId)).rejects.toThrow(AccessDeniedError)
		await repository.db.user.update({ where: { id: userId }, data: { adultVerificationState: 'verified', verifiedAt: new Date() } })
		await expect(repository.accessContext(sessionId)).resolves.toMatchObject({ actor: { kind: 'user', userId } })
	})
	it('denies a timestamped nonverified state in real sessions', async () => {
		const sessionId = randomUUID()
		const userId = randomUUID()
		const email = `${randomUUID()}@example.com`
		const expiresAt = new Date(Date.now() + 3600000)
		await repository.ensureAuthenticatedSession({ sessionId, userId, email, expiresAt })
		await repository.db.user.update({
			where: { id: userId },
			data: { adultVerificationState: 'unverified', verifiedAt: new Date() },
		})
		await repository.db
			.$executeRaw`INSERT INTO junction_auth."user" (id, name, email, "emailVerified") VALUES (${userId}, ${'Legacy state probe'}, ${email}, true)`
		await repository.db
			.$executeRaw`INSERT INTO junction_auth.session (id, "expiresAt", token, "updatedAt", "userId") VALUES (${sessionId}, ${expiresAt}, ${randomUUID()}, now(), ${userId})`
		const previous = process.env['JUNCTION_RUNTIME_MODE']
		process.env['JUNCTION_RUNTIME_MODE'] = 'staging'
		try {
			await expect(repository.accessContext(sessionId)).rejects.toThrow(AccessDeniedError)
			await repository.db.user.update({ where: { id: userId }, data: { adultVerificationState: 'verified' } })
			await expect(repository.accessContext(sessionId)).resolves.toMatchObject({ actor: { kind: 'user', userId } })
		} finally {
			if (previous === undefined) delete process.env['JUNCTION_RUNTIME_MODE']
			else process.env['JUNCTION_RUNTIME_MODE'] = previous
		}
	})
	it('requires fresh MFA and recent authentication for elevated mutations', async () => {
		await expect(repository.acceptElevatedAuditMarker(sessionId, randomUUID(), { marker: 'elevated deny' })).rejects.toThrow(AccessDeniedError)
		await repository.db.session.update({ where: { id: sessionId }, data: { mfaVerifiedAt: new Date(), recentAuthAt: new Date() } })
		const accepted = await repository.acceptElevatedAuditMarker(sessionId, randomUUID(), { marker: 'elevated accept' })
		expect(accepted.status).toBe('accepted')
		const settled = await repository.db.outboxEvent.updateMany({
			where: { payload: { path: ['aggregateId'], equals: accepted.commandId } },
			data: { state: 'delivered' },
		})
		expect(settled.count).toBe(1)
		await repository.db.session.update({ where: { id: sessionId }, data: { recentAuthAt: new Date(Date.now() - 16 * 60 * 1000) } })
		await expect(repository.acceptElevatedAuditMarker(sessionId, randomUUID(), { marker: 'elevated stale' })).rejects.toThrow(AccessDeniedError)
		await repository.db.session.update({ where: { id: sessionId }, data: { recentAuthAt: new Date() } })
	})
	it('reads a Location only while its active membership remains valid', async () => {
		await expect(repository.readLocation(sessionId, locationId)).resolves.toEqual({ id: locationId, vendorId, workspaceId })
		const otherLocation = await repository.db.location.create({ data: { vendorId } })
		await expect(repository.readLocation(sessionId, otherLocation.id)).rejects.toThrow(AccessDeniedError)
		await repository.db.vendorMembership.update({ where: { userId_vendorId: { userId, vendorId } }, data: { revokedAt: new Date() } })
		await expect(repository.readLocation(sessionId, locationId)).rejects.toThrow(AccessDeniedError)
		await repository.db.vendorMembership.update({ where: { userId_vendorId: { userId, vendorId } }, data: { revokedAt: null } })
	})
	it('keeps the private Vendor catalog scoped to a current Owner membership', async () => {
		const listing = await repository.db.listing.create({
			data: {
				vendorId,
				kind: 'product',
				category: 'home',
				title: 'Private catalog basket',
				description: 'A draft visible to its Vendor Owner before review.',
				priceCents: 5000,
			},
		})
		const catalog = await repository.readVendorCatalog(sessionId)
		expect(catalog).toMatchObject({
			id: vendorId,
			applicationState: 'pending',
		})
		expect(catalog.locations.some((location) => location.id === locationId)).toBe(true)
		expect(catalog.listings.some((item) => item.id === listing.id && item.state === 'draft')).toBe(true)
		const outsider = await repository.db.user.create({
			data: { email: `${randomUUID()}@example.invalid`, adultVerificationState: 'verified', verifiedAt: new Date() },
		})
		const outsiderSession = await repository.db.session.create({
			data: { userId: outsider.id, workspaceId, expiresAt: new Date(Date.now() + 3600000) },
		})
		await expect(repository.readVendorCatalog(outsiderSession.id)).rejects.toThrow(AccessDeniedError)
		await repository.db.vendorMembership.update({ where: { userId_vendorId: { userId, vendorId } }, data: { revokedAt: new Date() } })
		try {
			await expect(repository.readVendorCatalog(sessionId)).rejects.toThrow(AccessDeniedError)
		} finally {
			await repository.db.vendorMembership.update({ where: { userId_vendorId: { userId, vendorId } }, data: { revokedAt: null } })
		}
	})
	it('lists only explicitly published real Vendor summaries without leaking scope data', async () => {
		await repository.db.vendor.update({
			where: { id: vendorId },
			data: { publicSlug: 'published-foundation', publishedAt: new Date(), applicationState: 'approved' },
		})
		const unpublished = await repository.db.vendor.create({ data: { workspaceId } })
		await expect(repository.browsePublicVendors({ limit: 1 })).resolves.toEqual({
			items: [{ id: vendorId, slug: 'published-foundation' }],
			nextCursor: null,
		})
		expect(unpublished.publicSlug).toBeNull()
	})
	it('keeps catalog private through application approval and maintains the public projection through publish and unpublish', async () => {
		await repository.db.vendor.update({ where: { id: vendorId }, data: { applicationState: 'pending', publishedAt: null } })
		const listing = await repository.createListing(sessionId, randomUUID(), {
			kind: 'product',
			category: 'goods',
			title: 'Handwoven basket',
			description: 'A handwoven storage basket for a dry home.',
			priceCents: 12500,
		})
		const submitted = await repository.submitListingForReview(sessionId, randomUUID(), listing.id)
		expect(submitted.state).toBe('pending_review')
		const reviewerSession = await createReviewerSession(repository, workspaceId)
		await expect(repository.readPlatformReviewQueue(sessionId, {})).rejects.toThrow(AccessDeniedError)
		await expect(repository.readPlatformCatalogHealth(sessionId)).rejects.toThrow(AccessDeniedError)
		const pendingQueue = await repository.readPlatformReviewQueue(reviewerSession.id, {})
		const initialHealth = await repository.readPlatformCatalogHealth(reviewerSession.id)
		expect(initialHealth.publishedListings).toBeGreaterThanOrEqual(0)
		expect(initialHealth.pendingReviews).toBeGreaterThanOrEqual(1)
		expect(initialHealth.oldestReviewLagSeconds).toBeGreaterThanOrEqual(0)
		expect(initialHealth.mediaDeadLetters).toBeGreaterThanOrEqual(0)
		expect(pendingQueue.applications.some((application) => application.id === vendorId)).toBe(true)
		expect(pendingQueue.listings.some((item) => item.listing.id === listing.id)).toBe(false)
		await expect(
			repository.reviewListing(reviewerSession.id, randomUUID(), listing.id, {
				decision: 'approve',
				expectedVersion: submitted.version,
				note: 'low-risk listing',
			}),
		).rejects.toThrow(AccessDeniedError)
		await expect(
			repository.reviewVendorApplication(reviewerSession.id, randomUUID(), vendorId, { decision: 'approve', note: 'approved vendor application' }),
		).resolves.toMatchObject({ state: 'approved' })
		expect((await repository.db.vendor.findUniqueOrThrow({ where: { id: vendorId } })).publishedAt).not.toBeNull()
		await expect(
			repository.reviewVendorApplication(reviewerSession.id, randomUUID(), vendorId, { decision: 'reject', note: 'stale application decision' }),
		).rejects.toThrow(AccessDeniedError)
		const listingQueue = await repository.readPlatformReviewQueue(reviewerSession.id, {})
		expect(listingQueue.applications.some((application) => application.id === vendorId)).toBe(false)
		expect(listingQueue.listings.some((item) => item.listing.id === listing.id && item.vendorId === vendorId)).toBe(true)
		const rejected = await repository.reviewListing(reviewerSession.id, randomUUID(), listing.id, {
			decision: 'reject',
			expectedVersion: submitted.version,
			note: 'request a clearer product description',
		})
		expect(rejected.state).toBe('rejected')
		const revised = await repository.reviseListing(sessionId, randomUUID(), listing.id, {
			expectedVersion: rejected.version,
			kind: 'product',
			category: 'goods',
			title: 'Handwoven basket',
			description: 'A handwoven storage basket with a clear fixed price for a dry home.',
			priceCents: 12500,
		})
		expect(revised).toMatchObject({ state: 'draft', version: 3 })
		await expect(
			repository.reviseListing(sessionId, randomUUID(), listing.id, {
				expectedVersion: rejected.version,
				kind: 'product',
				category: 'goods',
				title: 'Stale basket title',
				description: 'A stale draft that must not overwrite the current revision.',
				priceCents: 12500,
			}),
		).rejects.toThrow(AccessDeniedError)
		const resubmitted = await repository.submitListingForReview(sessionId, randomUUID(), listing.id)
		await expect(
			repository.reviewListing(reviewerSession.id, randomUUID(), listing.id, {
				decision: 'approve',
				expectedVersion: submitted.version,
				note: 'stale listing version',
			}),
		).rejects.toThrow(AccessDeniedError)
		const published = await repository.reviewListing(reviewerSession.id, randomUUID(), listing.id, {
			decision: 'approve',
			expectedVersion: resubmitted.version,
			note: 'revision is low risk',
		})
		expect(published.state).toBe('published')
		expect((await repository.readPlatformCatalogHealth(reviewerSession.id)).laggingListings).toBe(0)
		await repository.db.searchDocument.delete({ where: { listingId: listing.id } })
		const laggingHealth = await repository.readPlatformCatalogHealth(reviewerSession.id)
		expect(laggingHealth.laggingListings).toBe(1)
		expect(laggingHealth.oldestLagSeconds).toBeGreaterThanOrEqual(0)
		await repository.rebuildSearchDocuments()
		expect((await repository.readPlatformCatalogHealth(reviewerSession.id)).laggingListings).toBe(0)
		await expect(
			repository.updateStorefront(sessionId, randomUUID(), {
				slug: 'published-foundation',
				displayName: 'Foundation Vendor',
				description: 'A verified Vendor storefront for catalog acceptance.',
			}),
		).resolves.toMatchObject({ vendorId, replayed: false })
		await repository.db.location.update({ where: { id: locationId }, data: { label: 'Foundation location', city: 'Addis Ababa' } })
		await expect(repository.browsePublicListings({ kind: 'product' })).resolves.toMatchObject({
			items: [expect.objectContaining({ id: listing.id, state: 'published' })],
		})
		await expect(repository.readPublicStorefront('published-foundation')).resolves.toMatchObject({
			id: vendorId,
			locations: [expect.objectContaining({ id: locationId })],
			listings: [expect.objectContaining({ id: listing.id })],
		})
		const removed = await repository.unpublishListing(sessionId, randomUUID(), listing.id)
		expect(removed.state).toBe('unpublished')
		expect((await repository.browsePublicListings({ kind: 'product' })).items.find((item) => item.id === listing.id)).toBeUndefined()
	})
	it('creates a private Vendor application with a scoped owner session before Platform approval', async () => {
		const applicant = await repository.db.user.create({
			data: { email: `${randomUUID()}@example.invalid`, adultVerificationState: 'verified', verifiedAt: new Date() },
		})
		const applicantSession = await repository.db.session.create({ data: { userId: applicant.id, workspaceId, expiresAt: new Date(Date.now() + 3600000) } })
		const key = randomUUID()
		const application = {
			displayName: 'Aster Workshop',
			slug: `aster-${randomUUID().slice(0, 8)}`,
			description: 'A small local workshop creating practical household goods.',
			location: { label: 'Main studio', city: 'Addis Ababa', address: 'Bole, Addis Ababa, Ethiopia', latitude: 8.9806, longitude: 38.7578 },
		}
		const created = await repository.createVendorApplication(applicantSession.id, key, application)
		expect(created).toMatchObject({ state: 'pending', replayed: false })
		expect(created.sessionId).toBe(applicantSession.id)
		await expect(repository.createVendorApplication(applicantSession.id, key, application)).resolves.toEqual({ ...created, replayed: true })
		const privateListing = await repository.createListing(created.sessionId, randomUUID(), {
			kind: 'product',
			category: 'home',
			title: 'Aster tray',
			description: 'A practical handcrafted tray for organized home storage.',
			priceCents: 5000,
		})
		const variantListing = await repository.createListing(created.sessionId, randomUUID(), {
			kind: 'product',
			category: 'home',
			title: 'Aster tote',
			description: 'A durable reusable tote available in two clearly priced sizes.',
			variants: [
				{ sku: 'aster-tote-small', label: 'Small', priceCents: 4500 },
				{ sku: 'aster-tote-large', label: 'Large', priceCents: 6000 },
			],
		})
		expect(await repository.db.listingVariant.count({ where: { listingId: variantListing.id } })).toBe(2)
		await repository.submitListingForReview(created.sessionId, randomUUID(), privateListing.id)
		expect((await repository.browsePublicListings({ q: 'Aster tray' })).items).toHaveLength(0)
		await expect(repository.exportCatalogCsv(created.sessionId)).resolves.toContain('Aster tray')
		await expect(repository.exportCatalogCsv(sessionId)).resolves.not.toContain('Aster tray')
	})
	it('restricts an approved Vendor and removes its storefront from public discovery', async () => {
		const vendor = await repository.db.vendor.create({
			data: {
				workspaceId,
				applicationState: 'approved',
				publishedAt: new Date(),
				publicSlug: `restrict-${randomUUID().slice(0, 8)}`,
				displayName: 'Restrictable Vendor',
				description: 'A Vendor used to verify public suspension.',
			},
		})
		const reviewerSession = await createReviewerSession(repository, workspaceId)
		expect((await repository.browsePublicVendors({ limit: 100 })).items.some((item) => item.id === vendor.id)).toBe(true)
		await expect(
			repository.reviewVendorApplication(reviewerSession.id, randomUUID(), vendor.id, { decision: 'restrict', note: 'suspension check' }),
		).resolves.toMatchObject({ state: 'restricted' })
		expect((await repository.db.vendor.findUniqueOrThrow({ where: { id: vendor.id } })).publishedAt).toBeNull()
		expect((await repository.browsePublicVendors({ limit: 100 })).items.some((item) => item.id === vendor.id)).toBe(false)
		await expect(
			repository.reviewVendorApplication(reviewerSession.id, randomUUID(), vendor.id, { decision: 'approve', note: 'stale approval' }),
		).rejects.toThrow(AccessDeniedError)
	})
	it('records scoped inventory movements once, preserves variant stock, and never makes availability negative', async () => {
		const listing = await repository.createListing(sessionId, randomUUID(), {
			kind: 'product',
			category: 'goods',
			title: 'Inventory verification tote',
			description: 'A variant product used only to verify the private inventory ledger boundary.',
			variants: [
				{ sku: 'inventory-tote-small', label: 'Small', priceCents: 4500 },
				{ sku: 'inventory-tote-large', label: 'Large', priceCents: 6000 },
			],
		})
		const receivedKey = randomUUID()
		const received = await repository.createInventoryMovement(sessionId, receivedKey, {
			locationId,
			listingId: listing.id,
			sku: 'inventory-tote-small',
			reason: 'received',
			quantityDelta: 3,
		})
		expect(received).toMatchObject({ onHand: 3, reserved: 0, available: 3, replayed: false })
		await expect(
			repository.createInventoryMovement(sessionId, receivedKey, {
				locationId,
				listingId: listing.id,
				sku: 'inventory-tote-small',
				reason: 'received',
				quantityDelta: 3,
			}),
		).resolves.toEqual({ ...received, replayed: true })

		const damaged = await Promise.allSettled(
			Array.from({ length: 2 }, () =>
				repository.createInventoryMovement(sessionId, randomUUID(), {
					locationId,
					listingId: listing.id,
					sku: 'inventory-tote-small',
					reason: 'damaged',
					quantityDelta: -2,
					note: 'damage verification',
				}),
			),
		)
		expect(damaged.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
		expect(damaged.filter((result) => result.status === 'rejected')).toHaveLength(1)
		await expect(repository.readInventoryAvailability(sessionId, listing.id, { locationId, sku: 'inventory-tote-small' })).resolves.toEqual({
			locationId,
			listingId: listing.id,
			sku: 'inventory-tote-small',
			onHand: 1,
			reserved: 0,
			available: 1,
		})
		expect(await repository.db.inventoryMovement.count({ where: { listingId: listing.id } })).toBe(2)
		await expect(
			repository.createInventoryMovement(sessionId, randomUUID(), {
				locationId,
				listingId: listing.id,
				sku: 'inventory-tote-small',
				reason: 'damaged',
				quantityDelta: -2,
				note: 'must not oversell stock',
			}),
		).rejects.toThrow(AccessDeniedError)
		expect(await repository.db.inventoryMovement.count({ where: { listingId: listing.id } })).toBe(2)
		await expect(
			repository.reviseListing(sessionId, randomUUID(), listing.id, {
				expectedVersion: listing.version,
				kind: 'product',
				category: 'goods',
				title: 'Inventory verification tote',
				description: 'A variant product used only to verify the private inventory ledger boundary.',
				priceCents: 4500,
			}),
		).rejects.toThrow(AccessDeniedError)

		const foreignWorkspace = await repository.db.workspace.create({ data: { kind: 'real' } })
		const foreignVendor = await repository.db.vendor.create({ data: { workspaceId: foreignWorkspace.id } })
		const foreignLocation = await repository.db.location.create({ data: { vendorId: foreignVendor.id } })
		const foreignListing = await repository.db.listing.create({
			data: {
				vendorId: foreignVendor.id,
				kind: 'product',
				category: 'goods',
				title: 'Foreign inventory item',
				description: 'A product from another workspace that must remain unavailable.',
				priceCents: 1000,
			},
		})
		await expect(
			repository.createInventoryMovement(sessionId, randomUUID(), {
				locationId: foreignLocation.id,
				listingId: foreignListing.id,
				reason: 'received',
				quantityDelta: 1,
			}),
		).rejects.toThrow(AccessDeniedError)
		expect(await repository.db.inventoryMovement.count({ where: { listingId: foreignListing.id } })).toBe(0)
	})
	it('retains unsafe video in quarantine and produces replay-safe CSV preview and commit evidence', async () => {
		await repository.db.vendor.update({ where: { id: vendorId }, data: { applicationState: 'approved', publishedAt: new Date() } })
		const listing = await repository.createListing(sessionId, randomUUID(), {
			kind: 'service',
			category: 'repair',
			title: 'Phone screen repair',
			description: 'Fixed-duration screen repair at a published price.',
			priceCents: 30000,
			durationMinutes: 60,
		})
		const video = await repository.processShortVideo(sessionId, listing.id, { noSpeechDeclared: false })
		expect(video.state).toBe('quarantined')
		await expect(repository.processShortVideo(sessionId, listing.id, { captionText: 'Captioned dialogue' })).rejects.toThrow()
		const captioned = await repository.processShortVideo(sessionId, listing.id, {
			captionText: 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nCaptioned dialogue',
		})
		expect(captioned.state).toBe('quarantined')
		expect((await repository.db.mediaAsset.findUniqueOrThrow({ where: { id: captioned.id } })).processedAt).toBeNull()
		const submitted = await repository.submitListingForReview(sessionId, randomUUID(), listing.id)
		const reviewerSession = await createReviewerSession(repository, workspaceId)
		await expect(
			repository.reviewListing(reviewerSession.id, randomUUID(), listing.id, {
				decision: 'approve',
				expectedVersion: submitted.version,
				note: 'review video safety',
			}),
		).rejects.toThrow(AccessDeniedError)
		const csv = 'kind,category,title,description,priceCents,durationMinutes\nproduct,goods,Local coffee,Fresh locally roasted coffee beans,9000,'
		const dryRun = await repository.importCatalogCsv(sessionId, randomUUID(), { templateVersion: 'v1', mode: 'dry_run', csv })
		expect(dryRun).toMatchObject({ state: 'dry_run', validRowCount: 1, rowErrors: [] })
		const key = randomUUID()
		const first = await repository.importCatalogCsv(sessionId, key, { templateVersion: 'v1', mode: 'commit', csv })
		const replay = await repository.importCatalogCsv(sessionId, key, { templateVersion: 'v1', mode: 'commit', csv })
		expect(first).toMatchObject({ state: 'committed', replayed: false })
		expect(replay).toEqual({ ...first, replayed: true })
		const contentReplay = await repository.importCatalogCsv(sessionId, randomUUID(), { templateVersion: 'v1', mode: 'commit', csv })
		expect(contentReplay).toMatchObject({ id: first.id, replayed: true })
		const quoted = 'kind,category,title,description,priceCents,durationMinutes\nproduct,goods,"Coffee, roasted","A fine ""local"" coffee\nwith aroma",9000,'
		const quotedPreview = await repository.importCatalogCsv(sessionId, randomUUID(), { templateVersion: 'v1', mode: 'dry_run', csv: quoted })
		expect(quotedPreview).toMatchObject({
			rowCount: 1,
			validRowCount: 1,
			rows: [{ rowNumber: 2, status: 'valid', preview: { title: 'Coffee, roasted', description: 'A fine "local" coffee\nwith aroma' } }],
		})
		const concurrent = await Promise.all([
			repository.importCatalogCsv(sessionId, randomUUID(), { templateVersion: 'v1', mode: 'commit', csv: quoted }),
			other.importCatalogCsv(sessionId, randomUUID(), { templateVersion: 'v1', mode: 'commit', csv: quoted }),
		])
		expect(new Set(concurrent.map((result) => result.id)).size).toBe(1)
		expect(concurrent.filter((result) => !result.replayed)).toHaveLength(1)
		const malformed = await repository.importCatalogCsv(sessionId, randomUUID(), {
			templateVersion: 'v1',
			mode: 'dry_run',
			csv: `${csv}\nproduct,goods,"broken,description,9000,`,
		})
		expect(malformed).toMatchObject({ state: 'dry_run', rowCount: 2, validRowCount: 1, rowErrors: [{ rowNumber: 3 }] })
		const exported = await repository.exportCatalogCsv(sessionId)
		const exportPreview = await repository.importCatalogCsv(sessionId, randomUUID(), { templateVersion: 'v1', mode: 'dry_run', csv: exported })
		expect(exportPreview.rowCount).toBeGreaterThan(0)
		expect(exportPreview.rows.some((row) => row.preview['title'] === 'Phone screen repair')).toBe(true)
		expect(exportPreview.rowErrors.flatMap((row) => row.errors)).not.toContain('Expected six CSV fields.')
	})
	it('binds direct video upload intents to ownership and seals completion without publishing', async () => {
		const uploadGrants: Array<{ key: string; bytes: number; expiresIn: number }> = []
		const seals: Array<{ uploadKey: string; sealedKey: string; bytes: number; sha256: string }> = []
		const deletedKeys: string[] = []
		const store: MediaStore = {
			createUploadGrant: (key, bytes, expiresIn) => {
				uploadGrants.push({ key, bytes, expiresIn })
				return Promise.resolve({ url: 'http://127.0.0.1:59000/junction-media-local', method: 'PUT' as const, headers: { 'Content-Type': 'video/mp4' } })
			},
			sealUpload: (uploadKey, sealedKey, bytes, sha256) => {
				seals.push({ uploadKey, sealedKey, bytes, sha256 })
				return Promise.resolve()
			},
			readPrivate: () => Promise.reject(new Error('Not used in upload intent test.')),
			writePrivate: () => Promise.reject(new Error('Not used in upload intent test.')),
			deletePrivate: (key) => {
				deletedKeys.push(key)
				return Promise.resolve()
			},
			listPrivate: noMediaObjects,
			createReadGrant: () => Promise.reject(new Error('Not used in upload intent test.')),
		}
		const mediaRepository = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, store)
		try {
			const listing = await repository.db.listing.create({
				data: {
					vendorId,
					kind: 'service',
					category: 'repair',
					title: 'Video upload fixture',
					description: 'Private media upload test.',
					priceCents: 1000,
					durationMinutes: 30,
				},
			})
			const sha256 = 'a'.repeat(64)
			const command = { bytes: 1024, sha256, noSpeechDeclared: true, description: 'A silent demonstration.' }
			const foreignVendor = await repository.db.vendor.create({ data: { workspaceId } })
			const foreignListing = await repository.db.listing.create({
				data: {
					vendorId: foreignVendor.id,
					kind: 'service',
					category: 'repair',
					title: 'Foreign media fixture',
					description: 'Must remain outside this owner scope.',
					priceCents: 1000,
					durationMinutes: 30,
				},
			})
			await expect(mediaRepository.createVideoUploadIntent(sessionId, randomUUID(), foreignListing.id, command)).rejects.toThrow(AccessDeniedError)
			await expect(
				mediaRepository.createVideoUploadIntent(sessionId, randomUUID(), listing.id, { ...command, bytes: 25 * 1024 * 1024 + 1 }),
			).rejects.toThrow()
			await expect(mediaRepository.createVideoUploadIntent(sessionId, randomUUID(), listing.id, { bytes: 1024, sha256 })).rejects.toThrow()
			const key = randomUUID()
			const first = await mediaRepository.createVideoUploadIntent(sessionId, key, listing.id, command)
			const replay = await mediaRepository.createVideoUploadIntent(sessionId, key, listing.id, command)
			expect(first.state).toBe('pending_upload')
			expect(replay).toMatchObject({ mediaId: first.mediaId, replayed: true })
			expect(uploadGrants).toHaveLength(2)
			expect(uploadGrants[0]).toMatchObject({ bytes: 1024 })
			expect(uploadGrants[0].key).toContain(first.mediaId)
			await expect(mediaRepository.createVideoUploadIntent(sessionId, key, listing.id, { ...command, bytes: 1025 })).rejects.toThrow(
				IdempotencyConflictError,
			)
			await expect(mediaRepository.completeVideoUpload(sessionId, first.mediaId, { sha256: 'b'.repeat(64) })).rejects.toThrow(AccessDeniedError)
			const complete = await mediaRepository.completeVideoUpload(sessionId, first.mediaId, { sha256 })
			expect(complete).toEqual({ id: first.mediaId, state: 'quarantined' })
			expect(await mediaRepository.completeVideoUpload(sessionId, first.mediaId, { sha256 })).toEqual(complete)
			await expect(mediaRepository.createVideoUploadIntent(sessionId, key, listing.id, command)).rejects.toThrow(AccessDeniedError)
			expect(seals).toHaveLength(1)
			expect(seals[0]).toMatchObject({ uploadKey: uploadGrants[0].key, bytes: 1024, sha256 })
			const record = await repository.db.mediaAsset.findUniqueOrThrow({ where: { id: first.mediaId } })
			expect(record.sealedKey).toBe(seals[0].sealedKey)
			expect(record.processedAt).toBeNull()
			const expiredKey = randomUUID()
			const expired = await mediaRepository.createVideoUploadIntent(sessionId, expiredKey, listing.id, command)
			await repository.db.mediaAsset.update({ where: { id: expired.mediaId }, data: { uploadExpiresAt: new Date(0) } })
			await expect(mediaRepository.createVideoUploadIntent(sessionId, expiredKey, listing.id, command)).rejects.toThrow(AccessDeniedError)
			await expect(mediaRepository.completeVideoUpload(sessionId, expired.mediaId, { sha256 })).rejects.toThrow(AccessDeniedError)
			expect(await mediaRepository.expirePendingVideoUploads(new Date(1))).toBe(1)
			expect(deletedKeys).toEqual([uploadGrants.at(-1)?.key])
			expect(await repository.db.mediaAsset.findUniqueOrThrow({ where: { id: expired.mediaId } })).toMatchObject({
				state: 'rejected',
				quarantineReason: 'Upload intent expired.',
			})
			expect(await mediaRepository.expirePendingVideoUploads(new Date(1))).toBe(0)
		} finally {
			await mediaRepository.close()
		}
	})
	it('allows only one concurrent revision of a listing version', async () => {
		const listing = await repository.createListing(sessionId, randomUUID(), {
			kind: 'product',
			category: 'goods',
			title: 'Concurrent revision basket',
			description: 'A local basket used to verify concurrent revision safety.',
			priceCents: 2200,
		})
		const revise = (source: PostgresFoundation, title: string) =>
			source.reviseListing(sessionId, randomUUID(), listing.id, {
				expectedVersion: listing.version,
				kind: 'product',
				category: 'goods',
				title,
				description: 'A local basket used to verify concurrent revision safety.',
				priceCents: 2200,
			})
		const results = await Promise.allSettled([revise(repository, 'First revised basket'), revise(other, 'Second revised basket')])
		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
		const rejected = results.find((result) => result.status === 'rejected')
		expect(rejected?.status === 'rejected' ? rejected.reason : null).toBeInstanceOf(AccessDeniedError)
		expect((await repository.db.listing.findUniqueOrThrow({ where: { id: listing.id } })).version).toBe(2)
		expect(await repository.db.listingRevision.count({ where: { listingId: listing.id, version: 2 } })).toBe(1)
	})
	it('scopes saves and follows to the current user/workspace and makes recommendation personalization explicit', async () => {
		await repository.db.vendor.update({ where: { id: vendorId }, data: { applicationState: 'approved', publishedAt: new Date() } })
		const listing = await repository.db.listing.create({
			data: {
				vendorId,
				kind: 'product',
				category: 'home',
				title: 'Woven storage tray',
				description: 'A durable woven tray for organized household storage.',
				priceCents: 8500,
				state: 'published',
				publishedAt: new Date(),
			},
		})
		await expect(repository.saveListing(sessionId, listing.id, true)).resolves.toEqual({ saved: true })
		await expect(repository.followVendor(sessionId, vendorId, true)).resolves.toEqual({ following: true })
		await repository.setDiscoveryPreference(sessionId, { personalizationOptIn: true })
		const discoveryState = await repository.readCustomerDiscoveryState(sessionId)
		expect(discoveryState.personalizationOptIn).toBe(true)
		expect(discoveryState.savedListingIds).toContain(listing.id)
		expect(discoveryState.followedVendorIds).toContain(vendorId)
		expect((await repository.recommendPublicListings(sessionId)).items).toContainEqual(
			expect.objectContaining({ id: listing.id, reason: 'From a Vendor you follow.' }),
		)
		await repository.setDiscoveryPreference(sessionId, { personalizationOptIn: false })
		expect((await repository.readCustomerDiscoveryState(sessionId)).personalizationOptIn).toBe(false)
		expect((await repository.recommendPublicListings(sessionId)).items.find((item) => item.id === listing.id)?.reason).toBe(
			'Recently published in public discovery.',
		)
		const otherWorkspace = await repository.db.workspace.create({ data: { kind: 'real' } })
		const otherVendor = await repository.db.vendor.create({ data: { workspaceId: otherWorkspace.id, applicationState: 'approved' } })
		await expect(repository.followVendor(sessionId, otherVendor.id, true)).rejects.toThrow(AccessDeniedError)
	})
	it('removes restricted Vendors from every public discovery path without trusting a stale search projection', async () => {
		const slug = `restricted-${randomUUID().slice(0, 8)}`
		const vendor = await repository.db.vendor.create({
			data: {
				workspaceId,
				applicationState: 'approved',
				publishedAt: new Date(),
				publicSlug: slug,
				displayName: 'Restricted test Vendor',
				description: 'A Vendor for visibility checks.',
			},
		})
		const listing = await repository.db.listing.create({
			data: {
				vendorId: vendor.id,
				kind: 'product',
				category: 'home',
				title: 'Restricted test tray',
				description: 'A published listing for visibility checks.',
				priceCents: 8500,
				state: 'published',
				publishedAt: new Date(),
			},
		})
		await repository.db.searchDocument.create({
			data: { listingId: listing.id, kind: listing.kind, category: listing.category, title: listing.title, version: listing.version },
		})
		expect((await repository.browsePublicVendors({})).items).toContainEqual({ id: vendor.id, slug })
		expect((await repository.browsePublicListings({ q: listing.title })).items).toContainEqual(expect.objectContaining({ id: listing.id }))
		expect((await repository.recommendPublicListings(undefined)).items).toContainEqual(expect.objectContaining({ id: listing.id }))
		await expect(repository.readPublicStorefront(slug)).resolves.toMatchObject({ id: vendor.id })
		await repository.db.vendor.update({ where: { id: vendor.id }, data: { applicationState: 'restricted' } })
		expect((await repository.browsePublicVendors({})).items).not.toContainEqual(expect.objectContaining({ id: vendor.id }))
		expect((await repository.browsePublicListings({ q: listing.title })).items).toHaveLength(0)
		expect((await repository.recommendPublicListings(undefined)).items).not.toContainEqual(expect.objectContaining({ id: listing.id }))
		await expect(repository.readPublicStorefront(slug)).rejects.toThrow(AccessDeniedError)
		await expect(repository.saveListing(sessionId, listing.id, true)).rejects.toThrow(AccessDeniedError)
		await expect(repository.followVendor(sessionId, vendor.id, true)).rejects.toThrow(AccessDeniedError)
		expect(await repository.db.searchDocument.count({ where: { listingId: listing.id } })).toBe(1)
	})
	it('requires an optional linked Staff record to agree with the active User and Vendor membership', async () => {
		const staff = await repository.db.staff.create({ data: { vendorId, userId } })
		await repository.db.vendorMembership.update({ where: { userId_vendorId: { userId, vendorId } }, data: { staffId: staff.id } })
		await expect(repository.accessContext(sessionId)).resolves.toMatchObject({ actor: { kind: 'user', userId } })
		const otherUser = await repository.db.user.create({
			data: { email: `${randomUUID()}@example.invalid`, adultVerificationState: 'verified', verifiedAt: new Date() },
		})
		await repository.db.staff.update({ where: { id: staff.id }, data: { userId: otherUser.id } })
		await expect(repository.accessContext(sessionId)).rejects.toThrow(AccessDeniedError)
		await repository.db.staff.update({ where: { id: staff.id }, data: { userId } })
		await expect(repository.accessContext(sessionId)).resolves.toMatchObject({ actor: { kind: 'user', userId } })
	})
	it('rolls back the business write when outbox enqueue fails', async () => {
		const before = await repository.db.auditLog.count()
		await repository.db.$executeRawUnsafe(
			`CREATE FUNCTION reject_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$`,
		)
		await repository.db.$executeRawUnsafe(`CREATE TRIGGER reject_outbox BEFORE INSERT ON "outbox_events" FOR EACH ROW EXECUTE FUNCTION reject_outbox()`)
		try {
			await expect(repository.acceptAuditMarker(sessionId, randomUUID(), { marker: 'rollback' })).rejects.toThrow()
		} finally {
			await repository.db.$executeRawUnsafe('DROP TRIGGER reject_outbox ON "outbox_events"')
		}
		expect(await repository.db.auditLog.count()).toBe(before)
		expect(await repository.db.idempotencyRecord.count({ where: { outcome: { path: ['marker'], equals: 'rollback' } } })).toBe(0)
	})
	it('claims distinct work, fences stale workers, and deduplicates consumer replay', async () => {
		const markerIds = await Promise.all(
			['first', 'second'].map(
				async (label) => (await repository.acceptAuditMarker(sessionId, randomUUID(), { marker: `claim fence ${label}` })).commandId,
			),
		)
		const markerEvents = (await repository.db.outboxEvent.findMany({ where: { workspaceId, state: 'pending' }, select: { id: true, payload: true } }))
			.filter(({ payload }) => markerIds.includes(DomainEventSchema.parse(payload).aggregateId))
			.map(({ id }) => id)
		expect(markerEvents).toHaveLength(2)
		await repository.db.outboxEvent.updateMany({
			where: { id: { in: markerEvents } },
			data: { occurredAt: new Date('2000-01-01T00:00:00.000Z') },
		})
		const [first, second] = await Promise.all([repository.claim('one'), other.claim('two')])
		expect(first).toBeDefined()
		expect(second).toBeDefined()
		expect(first!.id).not.toBe(second!.id)
		expect([first!.id, second!.id].sort()).toEqual(markerEvents.sort())
		await repository.complete(second!)
		await repository.db.outboxEvent.update({ where: { id: first!.id }, data: { claimedAt: new Date(0) } })
		const recovered = await other.claim('one') // even reusing worker name must fence old token
		expect(recovered!.id).toBe(first!.id)
		await expect(repository.complete(first!)).rejects.toThrow('Stale outbox claim')
		await other.complete(recovered!)
		await repository.db.outboxEvent.update({ where: { id: recovered!.id }, data: { state: 'pending' } })
		await repository.complete((await repository.claim('replay'))!)
		expect(
			await repository.db.outboxReceipt.count({
				where: { eventId: { in: [DomainEventSchema.parse(first!.payload).eventId, DomainEventSchema.parse(second!.payload).eventId] } },
			}),
		).toBe(2)
	})
	it('persists a workspace-only realtime replay cursor on the authenticated session', async () => {
		const addPublicEvent = async () => {
			const event = DomainEventSchema.parse({
				eventId: randomUUID(),
				type: 'ListingPublished',
				aggregateId: randomUUID(),
				aggregateVersion: 1,
				workspaceId,
				causationId: randomUUID(),
				correlationId: randomUUID(),
				idempotencyKey: null,
				occurredAt: new Date().toISOString(),
				schemaVersion: 1,
				payload: {},
			})
			return repository.db.outboxEvent.create({
				data: {
					eventId: event.eventId,
					workspaceId,
					type: event.type,
					payload: event as Prisma.InputJsonValue,
					occurredAt: new Date(event.occurredAt),
				},
			})
		}
		const baselineEvent = await addPublicEvent()
		const baseline = await repository.realtimeReplay(sessionId)
		expect(baseline).toMatchObject({ cursor: baselineEvent.id, events: [], restRefetchRequired: false })
		await repository.acknowledgeRealtimeCursor(sessionId, baseline.cursor!)
		expect(await repository.db.session.findUniqueOrThrow({ where: { id: sessionId }, select: { realtimeCursor: true } })).toEqual({
			realtimeCursor: baselineEvent.id,
		})
		const nextEvent = await addPublicEvent()
		const replay = await repository.realtimeReplay(sessionId)
		expect(replay).toMatchObject({
			cursor: nextEvent.id,
			restRefetchRequired: false,
			events: [{ eventId: expect.any(String), type: 'ListingPublished', scope: { workspaceId }, payload: {} }],
		})
		await repository.acknowledgeRealtimeCursor(sessionId, replay.cursor!)
		expect(await repository.realtimeReplay(sessionId)).toMatchObject({ events: [], restRefetchRequired: false })
		await repository.db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } })
		await expect(repository.acknowledgeRealtimeCursor(sessionId, nextEvent.id)).rejects.toThrow(AccessDeniedError)
		await repository.db.session.update({ where: { id: sessionId }, data: { revokedAt: null } })
	})

	it('bounds replay and requires a REST refetch for an unknown or over-limit cursor', async () => {
		const addPublicEvent = async () => {
			const event = DomainEventSchema.parse({
				eventId: randomUUID(),
				type: 'ListingPublished',
				aggregateId: randomUUID(),
				aggregateVersion: 1,
				workspaceId,
				causationId: randomUUID(),
				correlationId: randomUUID(),
				idempotencyKey: null,
				occurredAt: new Date().toISOString(),
				schemaVersion: 1,
				payload: {},
			})
			return repository.db.outboxEvent.create({
				data: {
					eventId: event.eventId,
					workspaceId,
					type: event.type,
					payload: event as Prisma.InputJsonValue,
					occurredAt: new Date(event.occurredAt),
				},
			})
		}
		const baseline = await addPublicEvent()
		await repository.acknowledgeRealtimeCursor(sessionId, baseline.id)
		for (let index = 0; index <= 25; index++) await addPublicEvent()
		await expect(repository.realtimeReplay(sessionId)).resolves.toMatchObject({ events: [], restRefetchRequired: true })
		await repository.db.session.update({ where: { id: sessionId }, data: { realtimeCursor: randomUUID() } })
		await expect(repository.realtimeReplay(sessionId)).resolves.toMatchObject({ events: [], restRefetchRequired: true })
	})

	it('backs off failed attempts and dead-letters exhausted work', async () => {
		await repository.db.outboxEvent.updateMany({
			where: { workspaceId, state: { in: ['pending', 'in_flight'] } },
			data: { state: 'delivered', claimedBy: null, claimedAt: null, claimToken: null },
		})
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
		await repository.db.outboxEvent.updateMany({
			where: { workspaceId, state: { in: ['pending', 'in_flight'] } },
			data: { state: 'delivered', claimedBy: null, claimedAt: null, claimToken: null },
		})
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
	it('reconciles only aged unreferenced media objects with a durable deletion audit and retry', async () => {
		const now = new Date()
		const listing = await repository.db.listing.create({
			data: {
				vendorId,
				kind: 'product',
				category: 'goods',
				title: 'Orphan sweep fixture',
				description: 'A private object reconciliation fixture.',
				priceCents: 100,
			},
		})
		const mediaId = randomUUID()
		const referencedKey = `quarantine/sealed/${listing.id}/${mediaId}`
		await repository.db.mediaAsset.create({
			data: {
				id: mediaId,
				listingId: listing.id,
				kind: 'short_video',
				state: 'rejected',
				sealedKey: referencedKey,
				noSpeechDeclared: true,
				description: 'A rejected fixture video.',
			},
		})
		const orphanKey = `private/processed/${randomUUID()}/orphan.mp4`
		const youngKey = `private/processed/${randomUUID()}/young.mp4`
		const objects = [
			{ key: referencedKey, lastModified: new Date(now.getTime() - 7200000) },
			{ key: orphanKey, lastModified: new Date(now.getTime() - 7200000) },
			{ key: youngKey, lastModified: new Date(now.getTime() - 60000) },
		]
		const deleted: string[] = []
		let failFirst = true
		const store: MediaStore = {
			createUploadGrant: () => Promise.reject(new Error('Not used in orphan sweep test.')),
			sealUpload: () => Promise.reject(new Error('Not used in orphan sweep test.')),
			readPrivate: () => Promise.reject(new Error('Not used in orphan sweep test.')),
			writePrivate: () => Promise.reject(new Error('Not used in orphan sweep test.')),
			deletePrivate: (key) => {
				if (failFirst) {
					failFirst = false
					return Promise.reject(new Error('Object store unavailable.'))
				}
				deleted.push(key)
				return Promise.resolve()
			},
			listPrivate: async function* (prefix) {
				await Promise.resolve()
				for (const object of objects) if (object.key.startsWith(prefix) && !deleted.includes(object.key)) yield object
			},
			createReadGrant: () => Promise.reject(new Error('Not used in orphan sweep test.')),
		}
		const sweeper = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, store)
		try {
			await expect(sweeper.reconcileOrphanMediaObjects(now)).rejects.toThrow('Object store unavailable.')
			expect(deleted).toEqual([])
			expect(await sweeper.reconcileOrphanMediaObjects(now)).toBe(1)
			expect(deleted).toEqual([orphanKey])
			expect(await repository.db.auditLog.count({ where: { action: 'media.orphan-candidate', metadata: { path: ['key'], equals: orphanKey } } })).toBe(2)
			expect(await repository.db.auditLog.count({ where: { action: 'media.orphan-deleted', metadata: { path: ['key'], equals: orphanKey } } })).toBe(1)
		} finally {
			await sweeper.close()
			await repository.db.mediaAsset.delete({ where: { id: mediaId } })
			await repository.db.listing.delete({ where: { id: listing.id } })
		}
	})
	it('denies real foreign resource IDs across Vendor and workspace command boundaries without writes', async () => {
		const secondWorkspace = await repository.db.workspace.create({ data: { kind: 'real' } })
		const sameWorkspaceVendor = await repository.db.vendor.create({ data: { workspaceId, applicationState: 'approved' } })
		const foreignVendor = await repository.db.vendor.create({
			data: { workspaceId: secondWorkspace.id, applicationState: 'approved', publishedAt: new Date() },
		})
		const sameLocation = await repository.db.location.create({ data: { vendorId: sameWorkspaceVendor.id } })
		const foreignLocation = await repository.db.location.create({ data: { vendorId: foreignVendor.id } })
		const foreignOwner = await repository.db.user.create({
			data: { email: `${randomUUID()}@example.invalid`, adultVerificationState: 'verified', verifiedAt: new Date() },
		})
		await repository.db.vendorMembership.create({
			data: { userId: foreignOwner.id, vendorId: foreignVendor.id, role: 'vendor_owner', locationIds: [foreignLocation.id] },
		})
		const foreignSession = await repository.db.session.create({
			data: {
				userId: foreignOwner.id,
				workspaceId: secondWorkspace.id,
				activeVendorId: foreignVendor.id,
				activeRole: 'vendor_owner',
				expiresAt: new Date(Date.now() + 3600000),
			},
		})
		const reviewerSession = await createReviewerSession(repository, workspaceId)
		const draft = {
			kind: 'product',
			category: 'goods',
			title: 'Foreign basket',
			description: 'A handwoven basket with a fixed price.',
			priceCents: 1200,
		} as const
		const sameListing = await repository.db.listing.create({ data: { vendorId: sameWorkspaceVendor.id, ...draft } })
		const foreignListing = await repository.createListing(foreignSession.id, randomUUID(), draft)
		const foreignCommand = await repository.acceptAuditMarker(foreignSession.id, randomUUID(), { marker: 'foreign command cursor' })
		const foreignPending = await repository.createListing(foreignSession.id, randomUUID(), { ...draft, title: 'Pending foreign basket' })
		const foreignSubmitted = await repository.submitListingForReview(foreignSession.id, randomUUID(), foreignPending.id)
		const scopedQueue = await repository.readPlatformReviewQueue(reviewerSession.id, {})
		expect(scopedQueue.listings.some((item) => item.listing.id === foreignPending.id)).toBe(false)
		await expect(repository.readPlatformReviewQueue(reviewerSession.id, { listingCursor: foreignPending.id })).rejects.toThrow(AccessDeniedError)
		const foreignPublished = await repository.db.listing.create({
			data: { vendorId: foreignVendor.id, ...draft, title: 'Published foreign basket', state: 'published' },
		})
		const counts = async () => ({
			audit: await repository.db.auditLog.count(),
			outbox: await repository.db.outboxEvent.count(),
			media: await repository.db.mediaAsset.count(),
			idempotency: await repository.db.idempotencyRecord.count(),
			revisions: await repository.db.listingRevision.count(),
			saves: await repository.db.savedListing.count(),
			follows: await repository.db.vendorFollow.count(),
		})
		const before = await counts()
		for (const id of [sameLocation.id, foreignLocation.id]) await expect(repository.readLocation(sessionId, id)).rejects.toThrow(AccessDeniedError)
		for (const id of [sameListing.id, foreignListing.id]) {
			await expect(repository.reviseListing(sessionId, randomUUID(), id, { ...draft, expectedVersion: 1 })).rejects.toThrow(AccessDeniedError)
			await expect(repository.submitListingForReview(sessionId, randomUUID(), id)).rejects.toThrow(AccessDeniedError)
			await expect(repository.processShortVideo(sessionId, id, { noSpeechDeclared: false })).rejects.toThrow(AccessDeniedError)
		}
		await expect(repository.unpublishListing(sessionId, randomUUID(), foreignPublished.id)).rejects.toThrow(AccessDeniedError)
		await expect(
			repository.reviewListing(reviewerSession.id, randomUUID(), foreignPending.id, {
				decision: 'reject',
				expectedVersion: foreignSubmitted.version,
				note: 'foreign',
			}),
		).rejects.toThrow(AccessDeniedError)
		await expect(
			repository.reviewVendorApplication(reviewerSession.id, randomUUID(), foreignVendor.id, { decision: 'restrict', note: 'foreign' }),
		).rejects.toThrow(AccessDeniedError)
		await expect(repository.saveListing(sessionId, foreignPublished.id, true)).rejects.toThrow(AccessDeniedError)
		await expect(repository.followVendor(sessionId, foreignVendor.id, true)).rejects.toThrow(AccessDeniedError)
		await repository.db.session.update({ where: { id: sessionId }, data: { realtimeCursor: await repository.realtimeHighWaterCursor(foreignSession.id) } })
		await expect(repository.realtimeReplay(sessionId)).resolves.toMatchObject({
			events: [],
			restRefetchRequired: true,
		})
		await expect(repository.realtimeFoundationEventForCommand(sessionId, foreignCommand.commandId)).resolves.toBeNull()
		expect(await counts()).toEqual(before)
		expect(await repository.db.listing.findUniqueOrThrow({ where: { id: foreignPending.id } })).toMatchObject({ state: 'pending_review' })
		expect(await repository.db.vendor.findUniqueOrThrow({ where: { id: foreignVendor.id } })).toMatchObject({ applicationState: 'approved' })
		expect(await repository.exportCatalogCsv(sessionId)).not.toContain('Foreign basket')
	})
	it('rechecks current membership, Vendor restriction, and resource ownership before idempotent replay', async () => {
		const draft = {
			kind: 'product',
			category: 'goods',
			title: 'Scoped item',
			description: 'A scoped product with a fixed price.',
			priceCents: 1300,
		} as const
		const listing = await repository.createListing(sessionId, randomUUID(), draft)
		const key = randomUUID()
		await repository.submitListingForReview(sessionId, key, listing.id)
		const before = {
			audit: await repository.db.auditLog.count(),
			outbox: await repository.db.outboxEvent.count(),
			revisions: await repository.db.listingRevision.count(),
		}
		await repository.db.vendor.update({ where: { id: vendorId }, data: { applicationState: 'restricted' } })
		await expect(repository.submitListingForReview(sessionId, key, listing.id)).rejects.toThrow(AccessDeniedError)
		await expect(repository.exportCatalogCsv(sessionId)).rejects.toThrow(AccessDeniedError)
		await expect(repository.readLocation(sessionId, locationId)).rejects.toThrow(AccessDeniedError)
		await repository.db.vendor.update({ where: { id: vendorId }, data: { applicationState: 'approved' } })
		await repository.db.vendorMembership.update({ where: { userId_vendorId: { userId, vendorId } }, data: { role: 'vendor_staff' } })
		await expect(repository.submitListingForReview(sessionId, key, listing.id)).rejects.toThrow(AccessDeniedError)
		await repository.db.vendorMembership.update({ where: { userId_vendorId: { userId, vendorId } }, data: { role: 'vendor_owner', revokedAt: new Date() } })
		await expect(repository.exportCatalogCsv(sessionId)).rejects.toThrow(AccessDeniedError)
		await repository.db.vendorMembership.update({ where: { userId_vendorId: { userId, vendorId } }, data: { revokedAt: null } })
		await repository.db.listing.update({ where: { id: listing.id }, data: { vendorId: (await repository.db.vendor.create({ data: { workspaceId } })).id } })
		await expect(repository.submitListingForReview(sessionId, key, listing.id)).rejects.toThrow(AccessDeniedError)
		expect({
			audit: await repository.db.auditLog.count(),
			outbox: await repository.db.outboxEvent.count(),
			revisions: await repository.db.listingRevision.count(),
		}).toEqual(before)
	})
})
