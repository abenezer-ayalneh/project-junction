/* eslint-disable @typescript-eslint/no-non-null-assertion -- assertions below establish fixture/claim presence */
import { randomUUID } from 'node:crypto'

import { DomainEventSchema } from 'contracts'

import { AccessDeniedError } from './access.js'
import { FakeExternalEffectAdapter } from './external-effects.js'
import { IdempotencyConflictError } from './idempotency.js'
import type { MediaStore } from './media-store.js'
import { PostgresFoundation } from './postgres-foundation.js'
import { SumsubSandboxAdapter } from './sumsub.js'

async function* noMediaObjects(): AsyncGenerator<{ key: string; lastModified: Date }> {
	await Promise.resolve()
	for (const object of [] as Array<{ key: string; lastModified: Date }>) yield object
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
		const workspace = await repository.db.workspace.create({ data: { kind: 'synthetic' } })
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
				effects: await repository.db.syntheticExternalEffect.count(),
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
			expect(await repository.db.syntheticExternalEffect.count()).toBe(before.effects)
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

	it('records a Sumsub review once without granting adult access', async () => {
		const authSession = { sessionId: randomUUID(), userId: randomUUID(), email: `${randomUUID()}@example.com`, expiresAt: new Date(Date.now() + 3600000) }
		await repository.ensureAuthenticatedSession(authSession)
		const applicantId = randomUUID().replaceAll('-', '').slice(0, 24)
		const review = {
			eventId: randomUUID(),
			applicantId,
			userId: authSession.userId,
			levelName: 'age-18',
			eventType: 'applicantReviewed',
			answer: 'GREEN',
			status: 'completed',
			observedAt: '2026-09-25 06:00:00.000',
			sandboxMode: true,
		}
		const results = await Promise.all([repository.recordSumsubReview(review), other.recordSumsubReview(review)])
		expect(results.filter((result) => !result.duplicate)).toHaveLength(1)
		expect(await repository.db.providerInboxEvent.count({ where: { provider: 'sumsub-sandbox', providerEventId: review.eventId } })).toBe(1)
		await expect(repository.accessContext(authSession.sessionId)).rejects.toThrow(AccessDeniedError)
		await expect(repository.recordSumsubReview({ ...review, eventId: randomUUID(), userId: randomUUID() })).rejects.toThrow(AccessDeniedError)
		let currentStatus = 'completed'
		let currentAnswer: 'GREEN' | 'RED' | null = 'GREEN'
		let currentLevel = 'age-18'
		const request = jest.fn((url: string) =>
			Promise.resolve(
				new Response(
					JSON.stringify(
						url.endsWith('/status')
							? {
									levelName: currentLevel,
									reviewStatus: currentStatus,
									reviewResult: currentAnswer ? { reviewAnswer: currentAnswer } : undefined,
								}
							: { id: applicantId, externalUserId: authSession.userId },
					),
					{ status: 200 },
				),
			),
		)
		const adapter = new SumsubSandboxAdapter('app-token', 'app-secret', 'webhook-secret', request as typeof fetch)
		await expect(repository.reconcileOneSumsubReview(adapter, 'age-18')).resolves.toEqual({ processed: true, state: 'verified' })
		let user = await repository.db.user.findUniqueOrThrow({ where: { id: authSession.userId } })
		expect(user.adultVerificationState).toBe('verified')
		expect(user.verifiedAt).not.toBeNull()
		await expect(repository.accessContext(authSession.sessionId)).resolves.toMatchObject({ actor: { kind: 'user', userId: authSession.userId } })
		const deactivatedEventId = randomUUID()
		await repository.recordSumsubReview({
			...review,
			eventId: deactivatedEventId,
			eventType: 'applicantDeactivated',
			observedAt: '2026-09-25 06:01:00.000',
		})
		expect(
			(
				await repository.db.providerInboxEvent.findUniqueOrThrow({
					where: { provider_providerEventId: { provider: 'sumsub-sandbox', providerEventId: deactivatedEventId } },
				})
			).reconciliationState,
		).toBe('reconciled')
		user = await repository.db.user.findUniqueOrThrow({ where: { id: authSession.userId } })
		expect(user.adultVerificationState).toBe('unverified')
		expect(user.verifiedAt).toBeNull()
		await expect(repository.accessContext(authSession.sessionId)).rejects.toThrow(AccessDeniedError)
		await repository.recordSumsubReview({ ...review, eventId: randomUUID() })
		await expect(repository.reconcileOneSumsubReview(adapter, 'age-18')).resolves.toEqual({ processed: true, state: 'unverified' })
		await expect(repository.accessContext(authSession.sessionId)).rejects.toThrow(AccessDeniedError)
		await repository.recordSumsubReview({
			...review,
			eventId: randomUUID(),
			eventType: 'applicantActivated',
			observedAt: '2026-09-25 06:02:00.000',
		})
		await expect(repository.reconcileOneSumsubReview(adapter, 'age-18')).resolves.toEqual({ processed: true, state: 'verified' })
		await expect(repository.accessContext(authSession.sessionId)).resolves.toMatchObject({ actor: { kind: 'user', userId: authSession.userId } })
		await repository.recordSumsubReview({ ...review, eventId: randomUUID(), eventType: 'applicantReset', answer: null, status: 'init' })
		currentStatus = 'init'
		currentAnswer = null
		await expect(repository.reconcileOneSumsubReview(adapter, 'age-18')).resolves.toEqual({ processed: true, state: 'unverified' })
		user = await repository.db.user.findUniqueOrThrow({ where: { id: authSession.userId } })
		expect(user.adultVerificationState).toBe('unverified')
		expect(user.verifiedAt).toBeNull()
		await expect(repository.accessContext(authSession.sessionId)).rejects.toThrow(AccessDeniedError)
		await repository.recordSumsubReview({ ...review, eventId: randomUUID(), answer: 'RED' })
		currentStatus = 'completed'
		currentAnswer = 'RED'
		await expect(repository.reconcileOneSumsubReview(adapter, 'age-18')).resolves.toEqual({ processed: true, state: 'rejected' })
		user = await repository.db.user.findUniqueOrThrow({ where: { id: authSession.userId } })
		expect(user.adultVerificationState).toBe('rejected')
		expect(user.verifiedAt).toBeNull()
		await repository.recordSumsubReview({ ...review, eventId: randomUUID() })
		currentAnswer = 'GREEN'
		currentLevel = 'different-level'
		await expect(repository.reconcileOneSumsubReview(adapter, 'age-18')).resolves.toEqual({ processed: true, state: 'unverified' })
		user = await repository.db.user.findUniqueOrThrow({ where: { id: authSession.userId } })
		expect(user.verifiedAt).toBeNull()
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

	it('publishes real workspaces instead of synthetic fixtures in staging', async () => {
		const real = await repository.db.workspace.create({ data: { kind: 'real' } })
		const slug = `real-${randomUUID()}`
		const realVendor = await repository.db.vendor.create({
			data: { workspaceId: real.id, publicSlug: slug, publishedAt: new Date(), applicationState: 'approved' },
		})
		const syntheticSlug = `synthetic-${randomUUID()}`
		const syntheticVendor = await repository.db.vendor.create({
			data: { workspaceId, publicSlug: syntheticSlug, publishedAt: new Date(), applicationState: 'approved' },
		})
		const previous = process.env['JUNCTION_RUNTIME_MODE']
		process.env['JUNCTION_RUNTIME_MODE'] = 'staging'
		const staging = new PostgresFoundation(process.env['DATABASE_URL']!)
		try {
			const page = await staging.browsePublicVendors({ limit: 100 })
			expect(page.items.some((item) => item.slug === slug)).toBe(true)
			expect(page.items.some((item) => item.slug === syntheticSlug)).toBe(false)
		} finally {
			await staging.close()
			await repository.db.vendor.deleteMany({ where: { id: { in: [realVendor.id, syntheticVendor.id] } } })
			if (previous === undefined) delete process.env['JUNCTION_RUNTIME_MODE']
			else process.env['JUNCTION_RUNTIME_MODE'] = previous
		}
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
	it('does not acknowledge synthetic outbox effects through the staging worker', async () => {
		const command = await repository.acceptAuditMarker(sessionId, randomUUID(), { marker: 'staging delivery boundary' })
		const event = await repository.db.outboxEvent.findFirstOrThrow({
			where: { workspaceId, type: 'FoundationCommandAccepted', payload: { path: ['aggregateId'], equals: command.commandId } },
		})
		const previous = process.env['JUNCTION_RUNTIME_MODE']
		process.env['JUNCTION_RUNTIME_MODE'] = 'staging'
		try {
			const claim = await repository.claim(randomUUID())
			if (claim) expect(DomainEventSchema.parse(claim.payload).type).toBe('MediaQuarantined')
			expect((await repository.db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).state).toBe('pending')
		} finally {
			if (previous === undefined) delete process.env['JUNCTION_RUNTIME_MODE']
			else process.env['JUNCTION_RUNTIME_MODE'] = previous
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
	it('accepts only a timestamped legacy default during the mixed-version window', async () => {
		const legacyWorkspace = await repository.db.workspace.create({ data: { kind: 'synthetic' } })
		const legacyUser = await repository.db.user.create({ data: { email: `${randomUUID()}@example.invalid`, verifiedAt: new Date() } })
		const legacySession = await repository.db.session.create({
			data: { userId: legacyUser.id, workspaceId: legacyWorkspace.id, expiresAt: new Date(Date.now() + 3600000) },
		})
		expect(legacyUser.adultVerificationState).toBe('legacy_verified_compat')
		await expect(repository.accessContext(legacySession.id)).resolves.toMatchObject({ actor: { kind: 'user', userId: legacyUser.id } })
		await repository.db.user.update({ where: { id: legacyUser.id }, data: { adultVerificationState: 'unverified' } })
		await expect(repository.accessContext(legacySession.id)).rejects.toThrow(AccessDeniedError)
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
	it('provisions a synthetic verified account and grants then revokes its scoped Staff session', async () => {
		const account = await repository.createSyntheticAccount({ email: `${randomUUID()}@example.invalid`, adultVerificationState: 'verified' })
		const grant = await repository.grantSyntheticStaff(sessionId, { userId: account.id, locationIds: [locationId] })
		const grantAudit = await repository.db.auditLog.findFirstOrThrow({ where: { action: 'synthetic.staff-granted' } })
		expect(grantAudit.workspaceId).toBe(workspaceId)
		expect(grantAudit.actorId).toBe(userId)
		expect(grantAudit.metadata).toEqual({ staffId: grant.staffId, userId: account.id, vendorId, locationIds: [locationId] })
		await expect(repository.accessContext(grant.sessionId)).resolves.toMatchObject({
			actor: { kind: 'user', userId: account.id },
			activeVendorId: vendorId,
		})
		await expect(repository.readLocation(grant.sessionId, locationId)).resolves.toEqual({ id: locationId, vendorId, workspaceId })
		await expect(repository.exportCatalogCsv(grant.sessionId)).rejects.toThrow(AccessDeniedError)
		await expect(
			repository.createListing(grant.sessionId, randomUUID(), {
				kind: 'product',
				category: 'goods',
				title: 'Staff denied item',
				description: 'A listing requiring Vendor Owner authority.',
				priceCents: 1000,
			}),
		).rejects.toThrow(AccessDeniedError)
		const revoked = await repository.revokeSyntheticStaff(sessionId, grant.staffId)
		expect(revoked.result).toEqual({ revoked: true })
		expect(revoked.revokedSessionIds).toEqual([grant.sessionId])
		await expect(repository.revokeSyntheticStaff(sessionId, grant.staffId)).rejects.toThrow(AccessDeniedError)
		const revokeAudit = await repository.db.auditLog.findFirstOrThrow({ where: { action: 'synthetic.staff-revoked' } })
		expect(revokeAudit.workspaceId).toBe(workspaceId)
		expect(revokeAudit.actorId).toBe(userId)
		expect(revokeAudit.metadata).toEqual({ staffId: grant.staffId, userId: account.id, vendorId, revokedSessionIds: [grant.sessionId] })
		await expect(repository.accessContext(grant.sessionId)).rejects.toThrow(AccessDeniedError)
		const pending = await repository.createSyntheticAccount({ email: `${randomUUID()}@example.invalid`, adultVerificationState: 'pending' })
		await expect(repository.grantSyntheticStaff(sessionId, { userId: pending.id, locationIds: [locationId] })).rejects.toThrow(AccessDeniedError)
	})
	it('lists only explicitly published non-demo Vendor summaries without leaking scope data', async () => {
		await repository.db.vendor.update({
			where: { id: vendorId },
			data: { publicSlug: 'published-foundation', publishedAt: new Date(), applicationState: 'approved' },
		})
		const unpublished = await repository.db.vendor.create({ data: { workspaceId } })
		const demo = await repository.createDemoWorkspace()
		const demoVendor = await repository.db.vendor.findFirstOrThrow({ where: { workspaceId: demo.id } })
		await repository.db.vendor.update({ where: { id: demoVendor.id }, data: { publicSlug: 'must-not-leak', publishedAt: new Date() } })
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
		const reviewer = await repository.db.demoPersona.create({
			data: { workspaceId, key: `reviewer-${randomUUID()}`, role: 'platform_owner', locationIds: [] },
		})
		const reviewerSession = await repository.db.session.create({
			data: { demoPersonaId: reviewer.id, workspaceId, activeRole: 'platform_owner', expiresAt: new Date(Date.now() + 3600000) },
		})
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
				description: 'A verified synthetic Vendor storefront for catalog acceptance.',
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
				description: 'A synthetic Vendor used to verify public suspension.',
			},
		})
		const reviewer = await repository.db.demoPersona.create({ data: { workspaceId, key: `restrict-${randomUUID()}`, role: 'trust', locationIds: [] } })
		const reviewerSession = await repository.db.session.create({
			data: { demoPersonaId: reviewer.id, workspaceId, activeRole: 'trust', expiresAt: new Date(Date.now() + 3600000) },
		})
		expect((await repository.browsePublicVendors({ limit: 100 })).items.some((item) => item.id === vendor.id)).toBe(true)
		await expect(
			repository.reviewVendorApplication(reviewerSession.id, randomUUID(), vendor.id, { decision: 'restrict', note: 'synthetic suspension check' }),
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

		const foreignWorkspace = await repository.db.workspace.create({ data: { kind: 'synthetic' } })
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
		const reviewer = await repository.db.demoPersona.create({ data: { workspaceId, key: `trust-${randomUUID()}`, role: 'trust', locationIds: [] } })
		const reviewerSession = await repository.db.session.create({
			data: { demoPersonaId: reviewer.id, workspaceId, activeRole: 'trust', expiresAt: new Date(Date.now() + 3600000) },
		})
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
		const otherWorkspace = await repository.db.workspace.create({ data: { kind: 'synthetic' } })
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
				description: 'A synthetic Vendor for visibility checks.',
			},
		})
		const listing = await repository.db.listing.create({
			data: {
				vendorId: vendor.id,
				kind: 'product',
				category: 'home',
				title: 'Restricted test tray',
				description: 'A synthetic published listing for visibility checks.',
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
	it('deduplicates concurrent webhook delivery and rejects payload substitution', async () => {
		const eventId = randomUUID()
		const results = await Promise.all(
			[repository, other].map((repo) =>
				repo.receiveProviderWebhook(workspaceId, 'fake-payment', eventId, {
					providerReference: 'payment-intent-concurrent',
					outcome: 'confirmed',
				}),
			),
		)
		expect(results.filter((result) => !result.duplicate)).toHaveLength(1)
		await expect(
			repository.receiveProviderWebhook(workspaceId, 'fake-payment', eventId, {
				providerReference: 'payment-intent-concurrent',
				outcome: 'timed_out',
			}),
		).rejects.toThrow(IdempotencyConflictError)
		await expect(
			repository.receiveProviderWebhook(workspaceId, 'unsupported', randomUUID(), {
				providerReference: 'payment-intent-unsupported',
				outcome: 'confirmed',
			}),
		).rejects.toThrow(AccessDeniedError)
	})
	it('keeps timed-out callbacks pending until a distinct confirmed callback reconciles their provider reference', async () => {
		const providerReference = `payment-intent-${randomUUID()}`
		const timedOutEventId = randomUUID()
		await repository.receiveProviderWebhook(workspaceId, 'fake-payment', timedOutEventId, {
			providerReference,
			outcome: 'timed_out',
		})
		const pending = await repository.db.providerInboxEvent.findUniqueOrThrow({
			where: { provider_providerEventId: { provider: 'fake-payment', providerEventId: timedOutEventId } },
		})
		expect(pending).toMatchObject({ reconciliationState: 'pending_reconciliation', reconciledAt: null })
		const confirmedEventId = randomUUID()
		await Promise.all(
			[repository, other].map((repo) =>
				repo.receiveProviderWebhook(workspaceId, 'fake-payment', confirmedEventId, {
					providerReference,
					outcome: 'confirmed',
				}),
			),
		)
		const reconciled = await repository.db.providerInboxEvent.findUniqueOrThrow({
			where: { provider_providerEventId: { provider: 'fake-payment', providerEventId: timedOutEventId } },
		})
		expect(reconciled.reconciliationState).toBe('reconciled')
		expect(reconciled.reconciledAt).toBeInstanceOf(Date)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId, type: 'ProviderTimeoutReconciled' } })).toBe(1)
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
	it('applies a synthetic external effect once when the worker crashes before acknowledgement', async () => {
		// Earlier real-account fixtures share this integration database but are not
		// part of the synthetic receiver's delivery queue under test.
		await repository.db.outboxEvent.updateMany({
			where: { workspaceId: { not: workspaceId }, state: { in: ['pending', 'in_flight'] } },
			data: { state: 'delivered', claimedBy: null, claimedAt: null, claimToken: null },
		})
		await repository.db.outboxEvent.updateMany({
			where: { workspaceId, state: { in: ['pending', 'in_flight'] } },
			data: { state: 'delivered', claimedBy: null, claimedAt: null, claimToken: null },
		})
		await repository.acceptAuditMarker(sessionId, randomUUID(), { marker: 'external effect crash window' })
		const originalClaim = (await repository.claim('crashed-after-effect'))!
		const event = DomainEventSchema.parse(originalClaim.payload)
		const receiver = new FakeExternalEffectAdapter(other.db)
		const deliveries = await Promise.all([receiver.deliver(event), new FakeExternalEffectAdapter(repository.db).deliver(event)])
		expect(deliveries).toContainEqual({ duplicate: false })
		expect(deliveries).toContainEqual({ duplicate: true })
		expect(await repository.db.outboxReceipt.count({ where: { eventId: event.eventId } })).toBe(0)
		await repository.db.outboxEvent.update({ where: { id: originalClaim.id }, data: { claimedAt: new Date(0) } })
		await expect(other.processOne('recovered-after-effect')).resolves.toEqual({ processed: true })
		await expect(repository.complete(originalClaim)).rejects.toThrow('Stale outbox claim')
		await expect(receiver.deliver(event)).resolves.toEqual({ duplicate: true })
		await expect(receiver.deliver({ ...event, payload: { marker: 'substituted' } })).rejects.toThrow('different content')
		expect(await repository.db.syntheticExternalEffect.count({ where: { eventId: event.eventId, workspaceId } })).toBe(1)
		expect(await repository.db.outboxReceipt.count({ where: { eventId: event.eventId, workspaceId } })).toBe(1)
		expect((await repository.db.outboxEvent.findUniqueOrThrow({ where: { id: originalClaim.id } })).state).toBe('delivered')
	})
	it('derives a workspace-only realtime high-water cursor from the current session', async () => {
		const cursor = await repository.realtimeHighWaterCursor(sessionId)
		const accepted = await repository.acceptAuditMarker(sessionId, randomUUID(), { marker: 'realtime high-water' })
		const replay = await repository.realtimeReplay(sessionId, cursor ?? undefined)
		expect(replay.cursor).not.toBeNull()
		expect(replay.restRefetchRequired).toBe(false)
		expect(replay.events).toHaveLength(1)
		expect(replay.events[0]).toEqual(expect.objectContaining({ type: 'FoundationCommandAccepted', scope: { workspaceId }, payload: {} }))
		const durableEvent = await repository.realtimeFoundationEventForCommand(sessionId, accepted.commandId)
		expect(durableEvent).not.toBeNull()
		expect(replay.events[0]?.eventId).toBe(durableEvent?.eventId)
		expect(await repository.realtimeReplay(sessionId, replay.cursor ?? undefined)).toMatchObject({ events: [], restRefetchRequired: false })
		await repository.db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } })
		await expect(repository.realtimeHighWaterCursor(sessionId)).rejects.toThrow(AccessDeniedError)
		await repository.db.session.update({ where: { id: sessionId }, data: { revokedAt: null } })
	})
	it('bounds replay and requires a REST refetch for an unknown or over-limit cursor', async () => {
		const cursor = await repository.realtimeHighWaterCursor(sessionId)
		for (let index = 0; index <= 25; index++) await repository.acceptAuditMarker(sessionId, randomUUID(), { marker: `replay bound ${index}` })
		await expect(repository.realtimeReplay(sessionId, cursor ?? undefined)).resolves.toMatchObject({ events: [], restRefetchRequired: true })
		await expect(repository.realtimeReplay(sessionId, randomUUID())).resolves.toMatchObject({ events: [], restRefetchRequired: true })
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
	it('issues one scoped demo persona session at a time, then purges only expired demo-owned records', async () => {
		const demo = await repository.createDemoWorkspace()
		const owner = await repository.accessContext(demo.session.id)
		expect(owner.actor.kind).toBe('demo_persona')
		expect(owner.activeVendorId).not.toBeNull()
		await repository.acceptAuditMarker(demo.session.id, randomUUID(), { marker: 'demo data' })
		const demoEvent = await repository.db.outboxEvent.findFirstOrThrow({ where: { workspaceId: demo.id, type: 'FoundationCommandAccepted' } })
		await new FakeExternalEffectAdapter(other.db).deliver(DomainEventSchema.parse(demoEvent.payload))
		expect(await repository.db.syntheticExternalEffect.count({ where: { workspaceId: demo.id } })).toBe(1)
		const customer = await repository.switchDemoPersona(demo.session.id, demo.id, 'customer')
		await expect(repository.accessContext(demo.session.id)).rejects.toThrow(AccessDeniedError)
		expect((await repository.accessContext(customer.id)).activeVendorId).toBeNull()
		await expect(repository.readLocation(customer.id, owner.locationIds[0])).rejects.toThrow(AccessDeniedError)
		await repository.db.demoWorkspace.updateMany({ where: { workspaceId: demo.id }, data: { expiresAt: new Date(0) } })
		await expect(repository.accessContext(customer.id)).rejects.toThrow(AccessDeniedError)
		expect(await repository.purgeExpiredDemoWorkspaces()).toEqual([demo.id])
		expect(await repository.db.auditLog.count({ where: { workspaceId: demo.id } })).toBe(0)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: demo.id } })).toBe(0)
		expect(await repository.db.syntheticExternalEffect.count({ where: { workspaceId: demo.id } })).toBe(0)
		expect(await repository.db.session.count({ where: { workspaceId: demo.id } })).toBe(0)
		expect(await repository.db.demoPersona.count({ where: { workspaceId: demo.id } })).toBe(0)
		expect(await repository.db.idempotencyRecord.count({ where: { workspaceId: demo.id } })).toBe(0)
		expect(await repository.db.auditLog.count({ where: { workspaceId } })).toBeGreaterThan(0)
		expect(await repository.purgeExpiredDemoWorkspaces()).toEqual([])
	})
	it('purges expired demo listings and their private media objects without orphaning records', async () => {
		const deletedKeys: string[] = []
		let failFirstDelete = true
		const store: MediaStore = {
			createUploadGrant: () => Promise.reject(new Error('Not used in demo purge test.')),
			sealUpload: () => Promise.reject(new Error('Not used in demo purge test.')),
			readPrivate: () => Promise.reject(new Error('Not used in demo purge test.')),
			writePrivate: () => Promise.reject(new Error('Not used in demo purge test.')),
			deletePrivate: (key) => {
				if (failFirstDelete) {
					failFirstDelete = false
					return Promise.reject(new Error('Local object store is unavailable.'))
				}
				deletedKeys.push(key)
				return Promise.resolve()
			},
			listPrivate: noMediaObjects,
			createReadGrant: () => Promise.reject(new Error('Not used in demo purge test.')),
		}
		const purger = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, store)
		try {
			const demo = await purger.createDemoWorkspace()
			const vendor = await purger.db.vendor.findFirstOrThrow({ where: { workspaceId: demo.id } })
			const listing = await purger.db.listing.create({
				data: {
					vendorId: vendor.id,
					kind: 'product',
					category: 'home',
					title: 'Disposable demo item',
					description: 'Temporary media purge fixture.',
					priceCents: 100,
				},
			})
			await purger.db.listingRevision.create({ data: { listingId: listing.id, version: 1, state: 'draft', risk: 'low', snapshot: {} } })
			await purger.db.mediaAsset.create({
				data: {
					listingId: listing.id,
					kind: 'short_video',
					state: 'quarantined',
					uploadKey: `quarantine/uploads/${demo.id}`,
					sealedKey: `quarantine/sealed/${demo.id}`,
					renditionKey: `private/processed/${demo.id}.mp4`,
					posterKey: `private/processed/${demo.id}.jpg`,
				},
			})
			await purger.db.demoWorkspace.updateMany({ where: { workspaceId: demo.id }, data: { expiresAt: new Date(0) } })
			await expect(purger.purgeExpiredDemoWorkspaces()).rejects.toThrow('Local object store is unavailable.')
			expect(await purger.db.listing.count({ where: { id: listing.id } })).toBe(1)
			expect(await purger.db.demoWorkspace.findFirstOrThrow({ where: { workspaceId: demo.id } })).toMatchObject({ purgedAt: null })
			expect(await purger.purgeExpiredDemoWorkspaces()).toEqual([demo.id])
			expect(deletedKeys).toEqual(
				expect.arrayContaining([
					`quarantine/uploads/${demo.id}`,
					`quarantine/sealed/${demo.id}`,
					`private/processed/${demo.id}.mp4`,
					`private/processed/${demo.id}.jpg`,
				]),
			)
			expect(await purger.db.mediaAsset.count({ where: { listingId: listing.id } })).toBe(0)
			expect(await purger.db.listing.count({ where: { id: listing.id } })).toBe(0)
			expect(await purger.purgeExpiredDemoWorkspaces()).toEqual([])
		} finally {
			await purger.close()
		}
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
	it('bounds new fake provider callbacks in a demo workspace without charging a duplicate delivery', async () => {
		const demo = await repository.createDemoWorkspace()
		await repository.db.demoWorkspace.updateMany({ where: { workspaceId: demo.id }, data: { providerEventsLimit: 1 } })
		const firstEventId = randomUUID()
		const firstCallback = { providerReference: `demo-provider-${randomUUID()}`, outcome: 'confirmed' as const }
		await expect(repository.receiveProviderWebhook(demo.id, 'fake-payment', firstEventId, firstCallback)).resolves.toEqual({
			accepted: true,
			duplicate: false,
		})
		await expect(repository.receiveProviderWebhook(demo.id, 'fake-payment', firstEventId, firstCallback)).resolves.toEqual({
			accepted: true,
			duplicate: true,
		})
		await expect(
			repository.receiveProviderWebhook(demo.id, 'fake-payment', randomUUID(), {
				providerReference: `demo-provider-${randomUUID()}`,
				outcome: 'confirmed',
			}),
		).rejects.toThrow(AccessDeniedError)
		expect((await repository.db.demoWorkspace.findFirstOrThrow({ where: { workspaceId: demo.id } })).providerEventsUsed).toBe(1)
	})
	it('bounds demo persona commands without charging an idempotent replay', async () => {
		const demo = await repository.createDemoWorkspace()
		const persona = await repository.db.demoPersona.findUniqueOrThrow({ where: { workspaceId_key: { workspaceId: demo.id, key: 'vendor_owner' } } })
		await repository.db.demoPersona.update({ where: { id: persona.id }, data: { commandEventsLimit: 1 } })
		const key = randomUUID()
		await expect(repository.acceptAuditMarker(demo.session.id, key, { marker: 'first demo command' })).resolves.toMatchObject({ replayed: false })
		await expect(repository.acceptAuditMarker(demo.session.id, key, { marker: 'first demo command' })).resolves.toMatchObject({ replayed: true })
		await expect(repository.acceptAuditMarker(demo.session.id, randomUUID(), { marker: 'quota exceeded' })).rejects.toThrow(AccessDeniedError)
		expect((await repository.db.demoPersona.findUniqueOrThrow({ where: { id: persona.id } })).commandEventsUsed).toBe(1)
	})
	it('denies real foreign resource IDs across Vendor and workspace command boundaries without writes', async () => {
		const secondWorkspace = await repository.db.workspace.create({ data: { kind: 'synthetic' } })
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
		const reviewer = await repository.db.demoPersona.create({ data: { workspaceId, key: `isolation-${randomUUID()}`, role: 'trust', locationIds: [] } })
		const reviewerSession = await repository.db.session.create({
			data: { demoPersonaId: reviewer.id, workspaceId, activeRole: 'trust', expiresAt: new Date(Date.now() + 3600000) },
		})
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
		const foreignStaff = await repository.db.staff.create({ data: { vendorId: foreignVendor.id, userId: foreignOwner.id } })
		const counts = async () => ({
			audit: await repository.db.auditLog.count(),
			outbox: await repository.db.outboxEvent.count(),
			effects: await repository.db.syntheticExternalEffect.count(),
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
		await expect(repository.revokeSyntheticStaff(sessionId, foreignStaff.id)).rejects.toThrow(AccessDeniedError)
		await expect(repository.saveListing(sessionId, foreignPublished.id, true)).rejects.toThrow(AccessDeniedError)
		await expect(repository.followVendor(sessionId, foreignVendor.id, true)).rejects.toThrow(AccessDeniedError)
		await expect(repository.realtimeReplay(sessionId, (await repository.realtimeHighWaterCursor(foreignSession.id)) ?? undefined)).resolves.toMatchObject({
			events: [],
			restRefetchRequired: true,
		})
		await expect(repository.realtimeFoundationEventForCommand(sessionId, foreignCommand.commandId)).resolves.toBeNull()
		expect(await counts()).toEqual(before)
		expect(await repository.db.listing.findUniqueOrThrow({ where: { id: foreignPending.id } })).toMatchObject({ state: 'pending_review' })
		expect(await repository.db.vendor.findUniqueOrThrow({ where: { id: foreignVendor.id } })).toMatchObject({ applicationState: 'approved' })
		expect(await repository.db.staff.findUnique({ where: { id: foreignStaff.id } })).not.toBeNull()
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
			effects: await repository.db.syntheticExternalEffect.count(),
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
			effects: await repository.db.syntheticExternalEffect.count(),
			revisions: await repository.db.listingRevision.count(),
		}).toEqual(before)
	})
})
