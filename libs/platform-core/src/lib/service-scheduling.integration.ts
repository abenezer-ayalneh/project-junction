/* eslint-disable @typescript-eslint/no-non-null-assertion -- integration requires a loopback DATABASE_URL */
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

import { type ScheduleCalendar, type ServiceConfiguration, type ServiceSlotSelection } from 'contracts'

import { Prisma } from '../../generated/prisma/index.js'
import { AccessDeniedError } from './access.js'
import { IdempotencyConflictError } from './idempotency.js'
import { PostgresFoundation } from './postgres-foundation.js'
import { ServiceDefinitionConflictError } from './service-definitions.js'

const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('Phase 03 authoritative scheduling PostgreSQL', () => {
	let repository: PostgresFoundation
	let other: PostgresFoundation
	let now: Date
	const calendar = (timezone = 'UTC'): ScheduleCalendar => ({
		timezone,
		weekly: [{ weekday: 1, hours: [{ startMinute: 540, endMinute: 1020 }], breaks: [] }],
		exceptions: [],
	})
	async function fixture() {
		const workspace = await repository.db.workspace.create({ data: { kind: 'real' } })
		const user = await repository.db.user.create({
			data: { email: `${randomUUID()}@example.invalid`, adultVerificationState: 'verified', verifiedAt: new Date() },
		})
		const vendor = await repository.db.vendor.create({
			data: {
				workspaceId: workspace.id,
				applicationState: 'approved',
				publishedAt: new Date(),
				publicSlug: randomUUID(),
				displayName: 'Schedule test Vendor',
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
			title: 'Schedule test Service',
			description: 'Disposable authoritative scheduling fixture.',
			priceCents: 1000,
			durationMinutes: 30,
		})
		const linked = await repository.createStaffProfile(session.id, randomUUID(), { displayName: 'Linked Staff', memberUserId: user.id })
		const hidden = await repository.createStaffProfile(session.id, randomUUID(), { displayName: 'Hidden Staff' })
		const option = {
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
				{ staffId: linked.id, locationIds: [location.id], online: true },
				{ staffId: hidden.id, locationIds: [location.id], online: true },
			],
		}
		const configuration: ServiceConfiguration = { capacity: 'staff_only', options: [option] }
		await repository.configureService(session.id, randomUUID(), listing.id, { expectedVersion: 0, configuration })
		const rules = { timezone: 'UTC', leadTimeMinutes: 0, horizonDays: 30, slotIntervalMinutes: 15 }
		await repository.configureServiceSchedulingRules(session.id, randomUUID(), listing.id, { expectedVersion: 0, rules })
		await repository.configureLocationSchedule(session.id, randomUUID(), location.id, { expectedVersion: 0, calendar: calendar() })
		const schedule = {
			scopes: [
				{ mode: 'in_person', locationId: location.id, calendar: calendar() },
				{ mode: 'online', locationId: null, calendar: calendar() },
			],
		}
		for (const staff of [linked, hidden]) await repository.configureStaffSchedule(session.id, randomUUID(), staff.id, { expectedVersion: 0, schedule })
		await repository.db.listing.update({ where: { id: listing.id }, data: { state: 'published' } })
		const selection: ServiceSlotSelection = {
			optionId: option.id,
			addonIds: [],
			mode: 'in_person',
			locationId: location.id,
			staffId: null,
			from: '2026-10-12T00:00:00Z',
			to: '2026-10-13T00:00:00Z',
		}
		return { workspace, user, vendor, location, membership, session, listing, linked, hidden, option, configuration, rules, schedule, selection }
	}
	beforeEach(() => {
		now = new Date('2026-10-11T00:00:00Z')
		repository = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, undefined, undefined, undefined, () => new Date(now))
		other = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, undefined, undefined, undefined, () => new Date(now))
	})
	afterEach(async () => {
		await Promise.all([repository.close(), other.close()])
	})
	const starts = async (f: Awaited<ReturnType<typeof fixture>>, selection = f.selection) =>
		(await other.readPublicServiceSlots(f.listing.id, selection)).slots.map((slot) => slot.start)
	it('calculates current Option/add-on duration and price with buffers without creating holds', async () => {
		const f = await fixture()
		const initial = await other.readPublicServiceSlots(f.listing.id, f.selection)
		expect(initial).toMatchObject({
			reserved: false,
			timezone: 'UTC',
			evaluatedAt: now.toISOString(),
			durationMinutes: 30,
			priceCents: 1000,
			configurationVersion: 1,
			rulesVersion: 1,
		})
		expect(initial.slots[0]).toEqual({ start: '2026-10-12T09:15:00.000Z', end: '2026-10-12T09:45:00.000Z' })
		expect(initial.slots.at(-1)?.start).toBe('2026-10-12T16:15:00.000Z')
		const extra = await repository.readPublicServiceSlots(f.listing.id, { ...f.selection, addonIds: [f.option.addons[0].id] })
		expect(extra).toMatchObject({ priceCents: 1500, durationMinutes: 45 })
		expect(extra.slots.at(-1)?.start).toBe('2026-10-12T16:00:00.000Z')
		expect(await repository.db.staffAllocation.count({ where: { staffId: { in: [f.linked.id, f.hidden.id] } } })).toBe(0)
		expect(JSON.stringify(initial)).not.toContain(f.hidden.id)
	})
	it('requires public consent for named selection while keeping hidden qualified Staff eligible for any selection', async () => {
		const f = await fixture()
		await expect(repository.readPublicServiceSlots(f.listing.id, { ...f.selection, staffId: f.linked.id })).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.setStaffPublicConsent(f.session.id, randomUUID(), f.linked.id, { expectedVersion: 1, publicDisplay: true })
		expect((await starts(f, { ...f.selection, staffId: f.linked.id })).length).toBeGreaterThan(0)
		await repository.setStaffPublicConsent(f.session.id, randomUUID(), f.linked.id, { expectedVersion: 2, publicDisplay: false })
		await expect(repository.readPublicServiceSlots(f.listing.id, { ...f.selection, staffId: f.linked.id })).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(repository.readPublicServiceSlots(f.listing.id, { ...f.selection, staffId: f.hidden.id })).rejects.toBeInstanceOf(AccessDeniedError)
		expect((await starts(f)).length).toBeGreaterThan(0)
	})
	it('filters active holds and Bookings across the same Staff’s modes/Locations with exact expiry and adjacency', async () => {
		const f = await fixture()
		await repository.setStaffPublicConsent(f.session.id, randomUUID(), f.linked.id, { expectedVersion: 1, publicDisplay: true })
		await repository.db.staffAllocation.createMany({
			data: [
				{
					staffId: f.linked.id,
					state: 'held',
					startAt: new Date('2026-10-12T10:00:00Z'),
					endAt: new Date('2026-10-12T11:00:00Z'),
					expiresAt: new Date(now.getTime() + 60000),
				},
				{ staffId: f.linked.id, state: 'booked', startAt: new Date('2026-10-12T12:00:00Z'), endAt: new Date('2026-10-12T13:00:00Z') },
				...['released', 'expired', 'cancelled'].map((state) => ({
					staffId: f.linked.id,
					state,
					startAt: new Date('2026-10-12T14:00:00Z'),
					endAt: new Date('2026-10-12T15:00:00Z'),
				})),
			],
		})
		for (const selection of [
			{ ...f.selection, staffId: f.linked.id },
			{ ...f.selection, staffId: f.linked.id, mode: 'online' as const, locationId: null },
		]) {
			const result = await starts(f, selection)
			expect(result).not.toContain('2026-10-12T10:00:00.000Z')
			expect(result).not.toContain('2026-10-12T12:00:00.000Z')
			expect(result).toContain('2026-10-12T14:00:00.000Z')
			expect(result).toContain('2026-10-12T11:15:00.000Z')
		}
		expect(await starts(f)).toContain('2026-10-12T10:00:00.000Z')
		now = new Date(now.getTime() + 60000)
		expect(await starts(f, { ...f.selection, staffId: f.linked.id })).toContain('2026-10-12T10:00:00.000Z')
		expect(await starts(f, { ...f.selection, staffId: f.linked.id })).not.toContain('2026-10-12T12:00:00.000Z')
	})
	it('recomputes after calendar replacements, breaks, qualification and rule changes', async () => {
		const f = await fixture()
		const changed = calendar()
		changed.exceptions = [{ date: '2026-10-12', hours: [{ startMinute: 600, endMinute: 720 }], breaks: [{ startMinute: 660, endMinute: 690 }] }]
		await repository.configureLocationSchedule(f.session.id, randomUUID(), f.location.id, { expectedVersion: 1, calendar: changed })
		expect(await starts(f)).toEqual(['2026-10-12T10:15:00.000Z'])
		await repository.configureService(f.session.id, randomUUID(), f.listing.id, {
			expectedVersion: 1,
			configuration: { capacity: 'staff_only', options: [{ ...f.option, qualifications: [] }] },
		})
		expect(await starts(f)).toEqual([])
		await repository.configureService(f.session.id, randomUUID(), f.listing.id, { expectedVersion: 2, configuration: f.configuration })
		now = new Date('2026-10-12T10:15:00Z')
		await repository.configureServiceSchedulingRules(f.session.id, randomUUID(), f.listing.id, {
			expectedVersion: 1,
			rules: { ...f.rules, leadTimeMinutes: 1 },
		})
		expect(await starts(f)).toEqual([])
	})
	it('online slots use online qualification/calendar and remain independent of a closed Location', async () => {
		const f = await fixture()
		await repository.configureLocationSchedule(f.session.id, randomUUID(), f.location.id, { expectedVersion: 1, calendar: { ...calendar(), weekly: [] } })
		expect(await starts(f)).toEqual([])
		expect((await starts(f, { ...f.selection, mode: 'online', locationId: null })).length).toBeGreaterThan(0)
		await repository.configureStaffSchedule(f.session.id, randomUUID(), f.linked.id, { expectedVersion: 1, schedule: { scopes: [] } })
		await repository.configureStaffSchedule(f.session.id, randomUUID(), f.hidden.id, { expectedVersion: 1, schedule: { scopes: [] } })
		expect(await starts(f, { ...f.selection, mode: 'online', locationId: null })).toEqual([])
	})
	it('evaluates Location and Staff timezones separately and reports the Location timezone', async () => {
		const f = await fixture()
		await repository.configureLocationSchedule(f.session.id, randomUUID(), f.location.id, { expectedVersion: 1, calendar: calendar('Africa/Addis_Ababa') })
		const result = await repository.readPublicServiceSlots(f.listing.id, f.selection)
		expect(result.timezone).toBe('Africa/Addis_Ababa')
		expect(result.slots[0].start).toBe('2026-10-12T09:15:00.000Z')
		expect(result.slots.at(-1)?.start).toBe('2026-10-12T13:15:00.000Z')
	})
	it('durably replays each calendar/rules command once and rejects conflicting key reuse', async () => {
		const f = await fixture()
		for (const kind of ['location', 'staff', 'rules'] as const) {
			const key = randomUUID()
			const command =
				kind === 'location'
					? { expectedVersion: 1, calendar: calendar() }
					: kind === 'staff'
						? { expectedVersion: 1, schedule: f.schedule }
						: { expectedVersion: 1, rules: f.rules }
			const write = (repo: PostgresFoundation, body: unknown) =>
				kind === 'location'
					? repo.configureLocationSchedule(f.session.id, key, f.location.id, body)
					: kind === 'staff'
						? repo.configureStaffSchedule(f.session.id, key, f.linked.id, body)
						: repo.configureServiceSchedulingRules(f.session.id, key, f.listing.id, body)
			const first = await write(repository, command)
			expect(await write(other, command)).toEqual({ ...first, replayed: true })
			await expect(write(repository, { ...command, expectedVersion: 2 })).rejects.toBeInstanceOf(IdempotencyConflictError)
		}
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: f.workspace.id, type: 'LocationScheduleUpdated' } })).toBe(2)
		expect((await other.readLocationSchedule(f.session.id, f.location.id)).version).toBe(2)
		expect((await other.readStaffSchedule(f.session.id, f.linked.id)).version).toBe(2)
		expect((await other.readServiceSchedulingRules(f.session.id, f.listing.id)).version).toBe(2)
	})
	it('serializes competing schedule edits and guards expected versions for all configuration types', async () => {
		const f = await fixture()
		const command = { expectedVersion: 1, calendar: calendar() }
		const results = await Promise.allSettled([
			repository.configureLocationSchedule(f.session.id, randomUUID(), f.location.id, command),
			other.configureLocationSchedule(f.session.id, randomUUID(), f.location.id, command),
		])
		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
		const failure = results.find((result) => result.status === 'rejected')
		expect(failure?.status === 'rejected' && failure.reason).toBeInstanceOf(ServiceDefinitionConflictError)
		await expect(
			repository.configureStaffSchedule(f.session.id, randomUUID(), f.linked.id, { expectedVersion: 0, schedule: f.schedule }),
		).rejects.toBeInstanceOf(ServiceDefinitionConflictError)
		await expect(
			repository.configureServiceSchedulingRules(f.session.id, randomUUID(), f.listing.id, { expectedVersion: 0, rules: f.rules }),
		).rejects.toBeInstanceOf(ServiceDefinitionConflictError)
	})
	it('denies cross-Vendor calendar writes/reads, foreign selections and scope removal', async () => {
		const f = await fixture()
		const stranger = await fixture()
		await expect(repository.readStaffSchedule(stranger.session.id, f.linked.id)).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(
			repository.configureStaffSchedule(f.session.id, randomUUID(), stranger.linked.id, { expectedVersion: 1, schedule: f.schedule }),
		).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(
			repository.configureLocationSchedule(f.session.id, randomUUID(), stranger.location.id, { expectedVersion: 1, calendar: calendar() }),
		).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(repository.readPublicServiceSlots(f.listing.id, { ...f.selection, locationId: stranger.location.id })).rejects.toBeInstanceOf(
			AccessDeniedError,
		)
		await repository.db.vendorMembership.update({ where: { id: f.membership.id }, data: { locationIds: [] } })
		await expect(
			repository.configureStaffSchedule(f.session.id, randomUUID(), f.linked.id, { expectedVersion: 1, schedule: { scopes: [] } }),
		).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(
			repository.configureServiceSchedulingRules(f.session.id, randomUUID(), f.listing.id, { expectedVersion: 1, rules: f.rules }),
		).rejects.toBeInstanceOf(AccessDeniedError)
		expect((await repository.db.staff.findUniqueOrThrow({ where: { id: f.linked.id } })).scheduleVersion).toBe(1)
	})
	it('permits linked Staff own calendars and explicit Scheduler scope without catalog/pricing authority', async () => {
		const f = await fixture()
		const user = await repository.db.user.create({ data: { email: `${randomUUID()}@example.invalid` } })
		const membership = await repository.db.vendorMembership.create({
			data: { userId: user.id, vendorId: f.vendor.id, role: 'vendor_staff', locationIds: [f.location.id] },
		})
		const staff = await repository.createStaffProfile(f.session.id, randomUUID(), { displayName: 'Operational Staff', memberUserId: user.id })
		const session = await repository.db.session.create({
			data: {
				userId: user.id,
				workspaceId: f.workspace.id,
				activeVendorId: f.vendor.id,
				activeRole: 'vendor_staff',
				expiresAt: new Date(Date.now() + 3600000),
			},
		})
		expect((await repository.configureStaffSchedule(session.id, randomUUID(), staff.id, { expectedVersion: 0, schedule: f.schedule })).version).toBe(1)
		await expect(
			repository.configureStaffSchedule(session.id, randomUUID(), f.linked.id, { expectedVersion: 1, schedule: f.schedule }),
		).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(
			repository.configureLocationSchedule(session.id, randomUUID(), f.location.id, { expectedVersion: 1, calendar: calendar() }),
		).rejects.toBeInstanceOf(AccessDeniedError)
		const enable = spawnSync(process.execPath, ['tools/manage-local-scheduler.mjs', 'enable'], {
			env: {
				...process.env,
				JUNCTION_RUNTIME_MODE: 'local',
				LOCAL_SCHEDULING_MEMBERSHIP_ID: membership.id,
				LOCAL_OPERATOR_LABEL: 'C02 disposable integration operator',
				LOCAL_SCHEDULING_AUTHORITY_REASON: 'Verify scoped Scheduler authority without granting catalog access.',
			},
			encoding: 'utf8',
		})
		expect(enable.status).toBe(0)
		expect(await repository.db.auditLog.count({ where: { workspaceId: f.workspace.id, action: 'schedule.authority-enabled' } })).toBe(1)
		expect(
			(await repository.configureLocationSchedule(session.id, randomUUID(), f.location.id, { expectedVersion: 1, calendar: calendar() })).version,
		).toBe(2)
		expect((await repository.configureStaffSchedule(session.id, randomUUID(), f.linked.id, { expectedVersion: 1, schedule: f.schedule })).version).toBe(2)
		await expect(
			repository.configureServiceSchedulingRules(session.id, randomUUID(), f.listing.id, { expectedVersion: 1, rules: f.rules }),
		).rejects.toBeInstanceOf(AccessDeniedError)
		const disable = spawnSync(process.execPath, ['tools/manage-local-scheduler.mjs', 'disable'], {
			env: {
				...process.env,
				JUNCTION_RUNTIME_MODE: 'local',
				LOCAL_SCHEDULING_MEMBERSHIP_ID: membership.id,
				LOCAL_OPERATOR_LABEL: 'C02 disposable integration operator',
				LOCAL_SCHEDULING_AUTHORITY_REASON: 'Verify immediate Scheduler permission withdrawal.',
			},
			encoding: 'utf8',
		})
		expect(disable.status).toBe(0)
		await expect(
			repository.configureLocationSchedule(session.id, randomUUID(), f.location.id, { expectedVersion: 2, calendar: calendar() }),
		).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.db.vendorMembership.update({ where: { id: membership.id }, data: { revokedAt: new Date(), schedulingEnabled: true } })
		await expect(repository.readStaffSchedule(session.id, staff.id)).rejects.toBeInstanceOf(AccessDeniedError)
	})
	it('rejects unknown add-ons, Options, unqualified Staff/modes and unpublished or unconfigured Services', async () => {
		const f = await fixture()
		for (const selection of [
			{ ...f.selection, addonIds: [randomUUID()] },
			{ ...f.selection, optionId: randomUUID() },
			{ ...f.selection, staffId: randomUUID() },
		])
			await expect(repository.readPublicServiceSlots(f.listing.id, selection)).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.db.listing.update({ where: { id: f.listing.id }, data: { state: 'unpublished' } })
		await expect(repository.readPublicServiceSlots(f.listing.id, f.selection)).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.db.listing.update({ where: { id: f.listing.id }, data: { state: 'published' } })
		await repository.db.vendor.update({ where: { id: f.vendor.id }, data: { applicationState: 'restricted' } })
		await expect(repository.readPublicServiceSlots(f.listing.id, f.selection)).rejects.toBeInstanceOf(AccessDeniedError)
	})
	it('treats missing calendar/rules as unconfigured and validates requests without mutating schedules', async () => {
		const f = await fixture()
		await repository.db.listing.update({ where: { id: f.listing.id }, data: { schedulingRules: Prisma.DbNull } })
		await expect(repository.readPublicServiceSlots(f.listing.id, f.selection)).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.db.listing.update({ where: { id: f.listing.id }, data: { schedulingRules: f.rules } })
		await repository.db.location.update({ where: { id: f.location.id }, data: { scheduleCalendar: Prisma.DbNull } })
		await expect(repository.readPublicServiceSlots(f.listing.id, f.selection)).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(
			repository.configureStaffSchedule(f.session.id, randomUUID(), f.linked.id, {
				expectedVersion: 1,
				schedule: { ...f.schedule, sharedResources: [] },
			}),
		).rejects.toMatchObject({ name: 'ZodError' })
		await expect(repository.readPublicServiceSlots(f.listing.id, { ...f.selection, to: '2026-10-20T00:00:00Z' })).rejects.toMatchObject({
			name: 'ZodError',
		})
		await expect(repository.configureStaffSchedule(f.session.id, randomUUID(), f.linked.id, undefined)).rejects.toMatchObject({ name: 'ZodError' })
		await expect(repository.configureLocationSchedule(f.session.id, randomUUID(), f.location.id, undefined)).rejects.toMatchObject({ name: 'ZodError' })
		await expect(repository.configureServiceSchedulingRules(f.session.id, randomUUID(), f.listing.id, undefined)).rejects.toMatchObject({
			name: 'ZodError',
		})
		expect((await repository.db.staff.findUniqueOrThrow({ where: { id: f.linked.id } })).scheduleVersion).toBe(1)
	})
	it('uses current price and buffer changes rather than stale Listing summary terms', async () => {
		const f = await fixture()
		await repository.configureService(f.session.id, randomUUID(), f.listing.id, {
			expectedVersion: 1,
			configuration: {
				capacity: 'staff_only',
				options: [{ ...f.option, priceCents: 2000, durationMinutes: 60, bufferBeforeMinutes: 30, bufferAfterMinutes: 30 }],
			},
		})
		const result = await other.readPublicServiceSlots(f.listing.id, f.selection)
		expect(result).toMatchObject({ priceCents: 2000, durationMinutes: 60, bufferBeforeMinutes: 30, bufferAfterMinutes: 30, configurationVersion: 2 })
		expect(result.slots[0].start).toBe('2026-10-12T09:30:00.000Z')
		expect(result.slots.at(-1)?.start).toBe('2026-10-12T15:30:00.000Z')
	})
})
