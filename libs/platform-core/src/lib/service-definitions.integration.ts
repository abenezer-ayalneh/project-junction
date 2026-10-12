/* eslint-disable @typescript-eslint/no-non-null-assertion -- integration requires a loopback DATABASE_URL */
import { randomUUID } from 'node:crypto'

import { type ServiceConfiguration, ServiceConfigurationCommandSchema } from 'contracts'

import { AccessDeniedError } from './access.js'
import { IdempotencyConflictError } from './idempotency.js'
import { PostgresFoundation } from './postgres-foundation.js'
import { ServiceDefinitionConflictError } from './service-definitions.js'

const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('Phase 03 Service definitions PostgreSQL', () => {
	let repository: PostgresFoundation
	let other: PostgresFoundation
	async function fixture() {
		const workspace = await repository.db.workspace.create({ data: { kind: 'real' } })
		const user = await repository.db.user.create({
			data: { email: `${randomUUID()}@example.invalid`, adultVerificationState: 'verified', verifiedAt: new Date() },
		})
		const vendor = await repository.db.vendor.create({
			data: {
				workspaceId: workspace.id,
				applicationState: 'approved',
				publicSlug: randomUUID(),
				publishedAt: new Date(),
				displayName: 'Service test Vendor',
			},
		})
		const location = await repository.db.location.create({ data: { vendorId: vendor.id, label: 'Office', city: 'Test city' } })
		const membership = await repository.db.vendorMembership.create({
			data: { vendorId: vendor.id, userId: user.id, role: 'vendor_owner', locationIds: [location.id] },
		})
		const session = await repository.db.session.create({
			data: {
				userId: user.id,
				workspaceId: workspace.id,
				activeVendorId: vendor.id,
				activeRole: 'vendor_owner',
				expiresAt: new Date(Date.now() + 3600000),
			},
		})
		const listing = await repository.createListing(session.id, randomUUID(), {
			kind: 'service',
			category: 'appointment',
			title: 'Fixed Service test',
			description: 'Disposable Service definition fixture.',
			priceCents: 1000,
			durationMinutes: 30,
		})
		const privateStaff = await repository.createStaffProfile(session.id, randomUUID(), { displayName: 'Private Staff' })
		const linkedStaff = await repository.createStaffProfile(session.id, randomUUID(), { displayName: 'Linked Staff', memberUserId: user.id })
		const configuration: ServiceConfiguration = {
			capacity: 'staff_only',
			options: [
				{
					id: randomUUID(),
					label: 'Standard appointment',
					priceCents: 1000,
					durationMinutes: 30,
					bufferBeforeMinutes: 5,
					bufferAfterMinutes: 10,
					locationIds: [location.id],
					online: true,
					addons: [{ id: randomUUID(), label: 'Extra work', priceCents: 500, durationMinutes: 15 }],
					qualifications: [
						{ staffId: privateStaff.id, locationIds: [location.id], online: false },
						{ staffId: linkedStaff.id, locationIds: [], online: true },
					],
				},
			],
		}
		return { workspace, user, vendor, location, membership, session, listing, privateStaff, linkedStaff, configuration }
	}
	beforeEach(() => {
		repository = new PostgresFoundation(process.env['DATABASE_URL']!)
		other = new PostgresFoundation(process.env['DATABASE_URL']!)
	})
	afterEach(async () => {
		await Promise.all([repository.close(), other.close()])
	})
	async function configured() {
		const f = await fixture()
		await repository.configureService(f.session.id, randomUUID(), f.listing.id, { expectedVersion: 0, configuration: f.configuration })
		await repository.db.listing.update({ where: { id: f.listing.id }, data: { state: 'published' } })
		return f
	}
	it('persists fixed terms, qualified Locations/modes and hidden any-Staff without allocations', async () => {
		const f = await configured()
		expect((await other.readServiceConfiguration(f.session.id, f.listing.id)).configuration).toEqual(f.configuration)
		const result = await other.readPublicServiceDefinition(f.listing.id)
		expect(result.options[0].addons[0]).toEqual(f.configuration.options[0].addons[0])
		expect(result.options[0].eligibleModes).toEqual([
			{ mode: 'in_person', locationId: f.location.id, anyStaffEligible: true, namedStaff: [] },
			{ mode: 'online', locationId: null, anyStaffEligible: true, namedStaff: [] },
		])
		expect(JSON.stringify(result)).not.toContain(f.privateStaff.id)
		expect(JSON.stringify(result)).not.toContain(f.linkedStaff.id)
		expect(JSON.stringify(result)).not.toContain('qualifications')
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: f.workspace.id, type: 'ServiceConfigured' } })).toBe(1)
		expect(await repository.db.auditLog.count({ where: { workspaceId: f.workspace.id, action: 'service.configured' } })).toBe(1)
	})
	it('replays once and rejects key reuse with different terms', async () => {
		const f = await fixture()
		const key = randomUUID()
		const command = { expectedVersion: 0, configuration: f.configuration }
		const result = await repository.configureService(f.session.id, key, f.listing.id, command)
		expect(await other.configureService(f.session.id, key, f.listing.id, command)).toEqual({ ...result, replayed: true })
		await expect(repository.configureService(f.session.id, key, f.listing.id, { ...command, expectedVersion: 1 })).rejects.toBeInstanceOf(
			IdempotencyConflictError,
		)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: f.workspace.id, type: 'ServiceConfigured' } })).toBe(1)
	})
	it('serializes competing configuration updates and rejects stale versions', async () => {
		const f = await fixture()
		const command = { expectedVersion: 0, configuration: f.configuration }
		const results = await Promise.allSettled([
			repository.configureService(f.session.id, randomUUID(), f.listing.id, command),
			other.configureService(f.session.id, randomUUID(), f.listing.id, command),
		])
		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
		const failed = results.find((result) => result.status === 'rejected')
		expect(failed?.status === 'rejected' && failed.reason).toBeInstanceOf(ServiceDefinitionConflictError)
		expect((await repository.readServiceConfiguration(f.session.id, f.listing.id)).version).toBe(1)
	})
	it('rejects cross-Vendor Staff, Locations and listing reads with atomic rollback', async () => {
		const f = await fixture()
		const stranger = await fixture()
		const option = f.configuration.options[0]
		for (const badOption of [
			{ ...option, qualifications: [{ staffId: stranger.privateStaff.id, locationIds: [], online: true }] },
			{ ...option, locationIds: [stranger.location.id], qualifications: [] },
		])
			await expect(
				repository.configureService(f.session.id, randomUUID(), f.listing.id, {
					expectedVersion: 0,
					configuration: { capacity: 'staff_only', options: [badOption] },
				}),
			).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(repository.readServiceConfiguration(stranger.session.id, f.listing.id)).rejects.toBeInstanceOf(AccessDeniedError)
		expect((await repository.readServiceConfiguration(f.session.id, f.listing.id)).version).toBe(0)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: f.workspace.id, type: 'ServiceConfigured' } })).toBe(0)
	})
	it('rejects a partial Owner grant that removes an existing eligible Location', async () => {
		const f = await configured()
		await repository.db.vendorMembership.update({ where: { id: f.membership.id }, data: { locationIds: [] } })
		await expect(
			repository.configureService(f.session.id, randomUUID(), f.listing.id, {
				expectedVersion: 1,
				configuration: { capacity: 'staff_only', options: [{ ...f.configuration.options[0], locationIds: [], qualifications: [] }] },
			}),
		).rejects.toBeInstanceOf(AccessDeniedError)
	})
	it('permits only linked Staff consent and immediately hides withdrawal and renamed profiles', async () => {
		const f = await configured()
		await expect(
			repository.setStaffPublicConsent(f.session.id, randomUUID(), f.privateStaff.id, { expectedVersion: 1, publicDisplay: true }),
		).rejects.toBeInstanceOf(AccessDeniedError)
		const consentKey = randomUUID()
		const consent = { expectedVersion: 1, publicDisplay: true }
		await repository.setStaffPublicConsent(f.session.id, consentKey, f.linkedStaff.id, consent)
		expect((await other.setStaffPublicConsent(f.session.id, consentKey, f.linkedStaff.id, consent)).replayed).toBe(true)
		expect((await other.readPublicServiceDefinition(f.listing.id)).options[0].eligibleModes[1].namedStaff).toEqual([
			{ id: f.linkedStaff.id, displayName: 'Linked Staff' },
		])
		await repository.setStaffPublicConsent(f.session.id, randomUUID(), f.linkedStaff.id, { expectedVersion: 2, publicDisplay: false })
		expect((await other.readPublicServiceDefinition(f.listing.id)).options[0].eligibleModes[1].namedStaff).toEqual([])
		await repository.setStaffPublicConsent(f.session.id, randomUUID(), f.linkedStaff.id, { expectedVersion: 3, publicDisplay: true })
		await repository.updateStaffProfile(f.session.id, randomUUID(), f.linkedStaff.id, { expectedVersion: 4, displayName: 'Renamed Staff' })
		expect((await other.readPublicServiceDefinition(f.listing.id)).options[0].eligibleModes[1].namedStaff).toEqual([])
		expect((await repository.readStaffProfiles(f.session.id)).items).toContainEqual({
			id: f.linkedStaff.id,
			displayName: 'Renamed Staff',
			version: 5,
			publicDisplay: false,
			replayed: false,
		})
	})
	it('rejects Owner consent on another linked member and allows the linked Staff session', async () => {
		const f = await configured()
		const user = await repository.db.user.create({
			data: { email: `${randomUUID()}@example.invalid`, adultVerificationState: 'verified', verifiedAt: new Date() },
		})
		await repository.db.vendorMembership.create({ data: { userId: user.id, vendorId: f.vendor.id, role: 'vendor_staff', locationIds: [f.location.id] } })
		const staff = await repository.createStaffProfile(f.session.id, randomUUID(), { displayName: 'Member Staff', memberUserId: user.id })
		const session = await repository.db.session.create({
			data: {
				userId: user.id,
				workspaceId: f.workspace.id,
				activeVendorId: f.vendor.id,
				activeRole: 'vendor_staff',
				expiresAt: new Date(Date.now() + 3600000),
			},
		})
		await expect(
			repository.setStaffPublicConsent(f.session.id, randomUUID(), staff.id, { expectedVersion: 1, publicDisplay: true }),
		).rejects.toBeInstanceOf(AccessDeniedError)
		expect((await repository.readStaffProfile(session.id, staff.id)).version).toBe(1)
		await expect(repository.readStaffProfile(session.id, f.linkedStaff.id)).rejects.toBeInstanceOf(AccessDeniedError)
		expect((await repository.setStaffPublicConsent(session.id, randomUUID(), staff.id, { expectedVersion: 1, publicDisplay: true })).publicDisplay).toBe(
			true,
		)
		await expect(
			repository.configureService(session.id, randomUUID(), f.listing.id, { expectedVersion: 1, configuration: f.configuration }),
		).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.db.vendorMembership.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } })
		await expect(repository.setStaffPublicConsent(session.id, randomUUID(), staff.id, { expectedVersion: 2, publicDisplay: false })).rejects.toBeInstanceOf(
			AccessDeniedError,
		)
	})
	it('denies unauthorized Staff links, replays private creation and preserves membership authority', async () => {
		const f = await fixture()
		const stranger = await fixture()
		await expect(
			repository.createStaffProfile(f.session.id, randomUUID(), { displayName: 'Invalid link', memberUserId: stranger.user.id }),
		).rejects.toBeInstanceOf(AccessDeniedError)
		const key = randomUUID()
		const command = { displayName: 'Private scheduling profile' }
		const first = await repository.createStaffProfile(f.session.id, key, command)
		expect(await other.createStaffProfile(f.session.id, key, command)).toEqual({ ...first, replayed: true })
		expect(await repository.db.staff.findUnique({ where: { id: first.id } })).toMatchObject({ userId: null, publicConsentAt: null })
		expect(await repository.db.vendorMembership.findUnique({ where: { id: f.membership.id } })).toMatchObject({
			role: 'vendor_owner',
			staffId: f.linkedStaff.id,
		})
	})
	it('hides unconfigured, unpublished and restricted Services; denies Product configuration', async () => {
		const f = await fixture()
		await expect(repository.readPublicServiceDefinition(f.listing.id)).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.configureService(f.session.id, randomUUID(), f.listing.id, { expectedVersion: 0, configuration: f.configuration })
		await expect(repository.readPublicServiceDefinition(f.listing.id)).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.db.listing.update({ where: { id: f.listing.id }, data: { state: 'published' } })
		await repository.db.vendor.update({ where: { id: f.vendor.id }, data: { applicationState: 'restricted' } })
		await expect(repository.readPublicServiceDefinition(f.listing.id)).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(
			repository.configureService(f.session.id, randomUUID(), f.listing.id, { expectedVersion: 1, configuration: f.configuration }),
		).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.db.vendor.update({ where: { id: f.vendor.id }, data: { applicationState: 'approved' } })
		const product = await repository.createListing(f.session.id, randomUUID(), {
			kind: 'product',
			category: 'goods',
			title: 'Product fixture',
			description: 'Service configuration must reject Products.',
			priceCents: 1000,
		})
		await expect(
			repository.configureService(f.session.id, randomUUID(), product.id, { expectedVersion: 0, configuration: f.configuration }),
		).rejects.toBeInstanceOf(AccessDeniedError)
	})
	it('rejects excluded and invalid Option qualification models at the command boundary', async () => {
		const f = await fixture()
		const option = f.configuration.options[0]
		for (const bad of [
			{ ...f.configuration, capacity: 'shared_resource' },
			{ ...f.configuration, groupSeats: 2 },
			{ ...f.configuration, recurringSeries: true },
			{ ...f.configuration, options: [{ ...option, homeVisit: true }] },
			{ ...f.configuration, options: [{ ...option, qualifications: [{ ...option.qualifications[0], priceCents: 12 }] }] },
			{ ...f.configuration, options: [{ ...option, qualifications: [{ ...option.qualifications[0], locationIds: [randomUUID()] }] }] },
			{ ...f.configuration, options: [{ ...option, durationMinutes: 0 }] },
			{ ...f.configuration, options: [{ ...option, priceCents: 0 }] },
			{ ...f.configuration, options: [{ ...option, durationMinutes: 480 }] },
		]) {
			expect(ServiceConfigurationCommandSchema.safeParse({ expectedVersion: 0, configuration: bad }).success).toBe(false)
			await expect(
				repository.configureService(f.session.id, randomUUID(), f.listing.id, { expectedVersion: 0, configuration: bad }),
			).rejects.toMatchObject({ name: 'ZodError' })
		}
		expect((await repository.readServiceConfiguration(f.session.id, f.listing.id)).version).toBe(0)
	})
	it('retains Service identity when catalog revision attempts conversion to a Product', async () => {
		const f = await fixture()
		await repository.configureService(f.session.id, randomUUID(), f.listing.id, { expectedVersion: 0, configuration: f.configuration })
		await expect(
			repository.reviseListing(f.session.id, randomUUID(), f.listing.id, {
				expectedVersion: 1,
				kind: 'product',
				category: 'goods',
				title: 'Invalid conversion',
				description: 'Configured Service cannot become Product.',
				priceCents: 1000,
			}),
		).rejects.toBeInstanceOf(AccessDeniedError)
	})
})
