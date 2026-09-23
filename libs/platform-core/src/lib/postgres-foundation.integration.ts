/* eslint-disable @typescript-eslint/no-non-null-assertion -- assertions below establish fixture/claim presence */
import { randomUUID } from 'node:crypto'

import { DomainEventSchema } from 'contracts'

import { AccessDeniedError } from './access.js'
import { FakeExternalEffectAdapter } from './external-effects.js'
import { IdempotencyConflictError } from './idempotency.js'
import { PostgresFoundation } from './postgres-foundation.js'

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
		const revoked = await repository.revokeSyntheticStaff(sessionId, grant.staffId)
		expect(revoked.result).toEqual({ revoked: true })
		expect(revoked.revokedSessionIds).toEqual([grant.sessionId])
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
		await repository.db.vendor.update({ where: { id: vendorId }, data: { applicationState: 'pending' } })
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
		await expect(repository.reviewListing(reviewerSession.id, randomUUID(), listing.id, { decision: 'approve', note: 'low-risk listing' })).rejects.toThrow(
			AccessDeniedError,
		)
		await expect(
			repository.reviewVendorApplication(reviewerSession.id, randomUUID(), vendorId, { decision: 'approve', note: 'approved vendor application' }),
		).resolves.toMatchObject({ state: 'approved' })
		const rejected = await repository.reviewListing(reviewerSession.id, randomUUID(), listing.id, {
			decision: 'reject',
			note: 'request a clearer product description',
		})
		expect(rejected.state).toBe('rejected')
		const revised = await repository.reviseListing(sessionId, randomUUID(), listing.id, {
			kind: 'product',
			category: 'goods',
			title: 'Handwoven basket',
			description: 'A handwoven storage basket with a clear fixed price for a dry home.',
			priceCents: 12500,
		})
		expect(revised).toMatchObject({ state: 'draft', version: 3 })
		await repository.submitListingForReview(sessionId, randomUUID(), listing.id)
		const published = await repository.reviewListing(reviewerSession.id, randomUUID(), listing.id, { decision: 'approve', note: 'revision is low risk' })
		expect(published.state).toBe('published')
		await repository.db.vendor.update({ where: { id: vendorId }, data: { publishedAt: new Date() } })
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
		await repository.submitListingForReview(sessionId, randomUUID(), listing.id)
		const reviewer = await repository.db.demoPersona.create({ data: { workspaceId, key: `trust-${randomUUID()}`, role: 'trust', locationIds: [] } })
		const reviewerSession = await repository.db.session.create({
			data: { demoPersonaId: reviewer.id, workspaceId, activeRole: 'trust', expiresAt: new Date(Date.now() + 3600000) },
		})
		await expect(
			repository.reviewListing(reviewerSession.id, randomUUID(), listing.id, { decision: 'approve', note: 'review video safety' }),
		).rejects.toThrow(AccessDeniedError)
		const csv = 'kind,category,title,description,priceCents,durationMinutes\nproduct,goods,Local coffee,Fresh locally roasted coffee beans,9000,'
		const dryRun = await repository.importCatalogCsv(sessionId, randomUUID(), { templateVersion: 'v1', mode: 'dry_run', csv })
		expect(dryRun).toMatchObject({ state: 'dry_run', validRowCount: 1, rowErrors: [] })
		const key = randomUUID()
		const first = await repository.importCatalogCsv(sessionId, key, { templateVersion: 'v1', mode: 'commit', csv })
		const replay = await repository.importCatalogCsv(sessionId, key, { templateVersion: 'v1', mode: 'commit', csv })
		expect(first).toMatchObject({ state: 'committed', replayed: false })
		expect(replay).toEqual({ ...first, replayed: true })
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
		expect((await repository.recommendPublicListings(sessionId)).items).toContainEqual(
			expect.objectContaining({ id: listing.id, reason: 'From a Vendor you follow.' }),
		)
		await repository.setDiscoveryPreference(sessionId, { personalizationOptIn: false })
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
	it('applies a synthetic external effect once when the worker crashes before acknowledgement', async () => {
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
})
