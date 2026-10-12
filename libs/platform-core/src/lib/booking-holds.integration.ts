/* eslint-disable @typescript-eslint/no-non-null-assertion -- integration requires a loopback DATABASE_URL */
import { randomUUID } from 'node:crypto'

import { type BookingHoldCommand, BookingHoldCommandSchema } from 'contracts'

import { Prisma } from '../../generated/prisma/index.js'
import { AccessDeniedError } from './access.js'
import { BookingHoldConflictError } from './booking-holds.js'
import { IdempotencyConflictError } from './idempotency.js'
import { PostgresFoundation } from './postgres-foundation.js'

const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('Phase 03 atomic Booking holds PostgreSQL', () => {
	let repository: PostgresFoundation
	let other: PostgresFoundation
	let now: Date
	async function customer() {
		const workspace = await repository.db.workspace.create({ data: { kind: 'real' } })
		const user = await repository.db.user.create({
			data: { email: `${randomUUID()}@example.invalid`, adultVerificationState: 'verified', verifiedAt: new Date() },
		})
		const session = await repository.db.session.create({ data: { userId: user.id, workspaceId: workspace.id, expiresAt: new Date(Date.now() + 3600000) } })
		return { workspace, user, session }
	}
	async function fixture(twoStaff = false) {
		const owner = await customer()
		const buyer = await customer()
		const vendor = await repository.db.vendor.create({
			data: {
				workspaceId: owner.workspace.id,
				applicationState: 'approved',
				publishedAt: new Date(),
				publicSlug: randomUUID(),
				displayName: 'Booking hold Vendor',
			},
		})
		const location = await repository.db.location.create({ data: { vendorId: vendor.id, label: 'Office', city: 'Test city' } })
		await repository.db.vendorMembership.create({ data: { vendorId: vendor.id, userId: owner.user.id, role: 'vendor_owner', locationIds: [location.id] } })
		await repository.db.session.update({ where: { id: owner.session.id }, data: { activeVendorId: vendor.id, activeRole: 'vendor_owner' } })
		const linked = await repository.createStaffProfile(owner.session.id, randomUUID(), { displayName: 'Named Staff', memberUserId: owner.user.id })
		await repository.setStaffPublicConsent(owner.session.id, randomUUID(), linked.id, { expectedVersion: 1, publicDisplay: true })
		const hidden = await repository.createStaffProfile(owner.session.id, randomUUID(), { displayName: 'Private Staff' })
		const calendar = { timezone: 'UTC', weekly: [{ weekday: 1, hours: [{ startMinute: 540, endMinute: 1020 }], breaks: [] }], exceptions: [] }
		const schedule = {
			scopes: [
				{ mode: 'in_person', locationId: location.id, calendar },
				{ mode: 'online', locationId: null, calendar },
			],
		}
		for (const staff of [linked, hidden])
			await repository.configureStaffSchedule(owner.session.id, randomUUID(), staff.id, { expectedVersion: 0, schedule })
		await repository.configureLocationSchedule(owner.session.id, randomUUID(), location.id, { expectedVersion: 0, calendar })
		const listing = await repository.createListing(owner.session.id, randomUUID(), {
			kind: 'service',
			category: 'appointment',
			title: 'Booking hold Service',
			description: 'Disposable atomic Staff allocation fixture.',
			priceCents: 1000,
			durationMinutes: 30,
		})
		const option = {
			id: randomUUID(),
			label: 'Fixed appointment',
			priceCents: 1000,
			durationMinutes: 30,
			bufferBeforeMinutes: 5,
			bufferAfterMinutes: 10,
			locationIds: [location.id],
			online: true,
			addons: [{ id: randomUUID(), label: 'Extra work', priceCents: 500, durationMinutes: 15 }],
			qualifications: [linked, ...(twoStaff ? [hidden] : [])].map((staff) => ({ staffId: staff.id, locationIds: [location.id], online: true })),
		}
		const configuration = { capacity: 'staff_only', options: [option] }
		await repository.configureService(owner.session.id, randomUUID(), listing.id, { expectedVersion: 0, configuration })
		await repository.configureServiceSchedulingRules(owner.session.id, randomUUID(), listing.id, {
			expectedVersion: 0,
			rules: { timezone: 'UTC', leadTimeMinutes: 0, horizonDays: 30, slotIntervalMinutes: 15 },
		})
		await repository.db.listing.update({ where: { id: listing.id }, data: { state: 'published' } })
		const command: BookingHoldCommand = {
			listingId: listing.id,
			optionId: option.id,
			addonIds: [],
			mode: 'in_person',
			locationId: location.id,
			staffId: null,
			start: '2026-10-12T09:15:00Z',
			expectedConfigurationVersion: 1,
			expectedRulesVersion: 1,
		}
		return { owner, buyer, vendor, location, linked, hidden, listing, option, calendar, schedule, configuration, command }
	}
	beforeEach(() => {
		now = new Date('2026-10-11T00:00:00Z')
		repository = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, undefined, undefined, undefined, () => new Date(now))
		other = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, undefined, undefined, undefined, () => new Date(now))
	})
	afterEach(async () => {
		await Promise.all([repository.close(), other.close()])
	})
	it('allocates exactly one Staff, full buffered interval and fifteen-minute expiry with immutable current terms', async () => {
		const f = await fixture()
		const hold = await repository.createBookingHold(f.buyer.session.id, randomUUID(), { ...f.command, addonIds: [f.option.addons[0].id] })
		expect(hold).toMatchObject({
			state: 'holding',
			expiresAt: '2026-10-11T00:15:00.000Z',
			snapshot: { priceCents: 1500, durationMinutes: 45, selectedStaffId: null, start: '2026-10-12T09:15:00.000Z', end: '2026-10-12T10:00:00.000Z' },
		})
		const allocation = await repository.db.staffAllocation.findUniqueOrThrow({ where: { holdId: hold.holdId } })
		expect(allocation).toMatchObject({
			staffId: f.linked.id,
			state: 'held',
			startAt: new Date('2026-10-12T09:10:00Z'),
			endAt: new Date('2026-10-12T10:10:00Z'),
			expiresAt: new Date(hold.expiresAt),
		})
		expect(await other.readBookingHold(f.buyer.session.id, hold.holdId)).toEqual({
			holdId: hold.holdId,
			state: hold.state,
			expiresAt: hold.expiresAt,
			snapshot: hold.snapshot,
		})
		await expect(repository.db.bookingHold.update({ where: { id: hold.holdId }, data: { snapshot: { changed: true } } })).rejects.toThrow(/immutable/)
	})
	it('concurrent named/any Customers compete for the last qualified Staff without double booking', async () => {
		const f = await fixture()
		const second = await customer()
		const results = await Promise.allSettled([
			repository.createBookingHold(f.buyer.session.id, randomUUID(), { ...f.command, staffId: f.linked.id }),
			other.createBookingHold(second.session.id, randomUUID(), f.command),
		])
		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
		const failed = results.find((result) => result.status === 'rejected')
		expect(failed?.status === 'rejected' && failed.reason).toBeInstanceOf(BookingHoldConflictError)
		expect(await repository.db.staffAllocation.count({ where: { staffId: f.linked.id, state: 'held' } })).toBe(1)
		expect(await repository.db.bookingHold.count({ where: { vendorId: f.vendor.id } })).toBe(1)
	})
	it('two any-Staff races resolve to distinct concrete allocations and a third Customer loses safely', async () => {
		const f = await fixture(true)
		const second = await customer()
		const third = await customer()
		const results = await Promise.allSettled([
			repository.createBookingHold(f.buyer.session.id, randomUUID(), f.command),
			other.createBookingHold(second.session.id, randomUUID(), f.command),
		])
		expect(results.every((result) => result.status === 'fulfilled')).toBe(true)
		const allocations = await repository.db.staffAllocation.findMany({ where: { staffId: { in: [f.linked.id, f.hidden.id] }, state: 'held' } })
		expect(new Set(allocations.map((allocation) => allocation.staffId)).size).toBe(2)
		for (const result of results)
			if (result.status === 'fulfilled') {
				expect(result.value.snapshot.selectedStaffId).toBeNull()
				expect(JSON.stringify(result.value)).not.toContain(f.hidden.id)
				expect(JSON.stringify(result.value)).not.toContain('Private Staff')
			}
		await expect(repository.createBookingHold(third.session.id, randomUUID(), f.command)).rejects.toBeInstanceOf(BookingHoldConflictError)
	})
	it('simultaneous retries create one hold/allocation/event pair and reject changed key payloads', async () => {
		const f = await fixture()
		const key = randomUUID()
		const results = await Promise.all([
			repository.createBookingHold(f.buyer.session.id, key, f.command),
			other.createBookingHold(f.buyer.session.id, key, f.command),
		])
		expect(results[0].holdId).toBe(results[1].holdId)
		expect(results.filter((result) => result.replayed)).toHaveLength(1)
		await expect(repository.createBookingHold(f.buyer.session.id, key, { ...f.command, start: '2026-10-12T10:00:00Z' })).rejects.toBeInstanceOf(
			IdempotencyConflictError,
		)
		expect(await repository.db.auditLog.count({ where: { workspaceId: f.buyer.workspace.id, action: 'booking.hold-created' } })).toBe(1)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: f.buyer.workspace.id, type: 'BookingHoldCreated' } })).toBe(1)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: f.owner.workspace.id, type: 'BookingHoldCreated' } })).toBe(1)
	})
	it('same Staff is occupied across Services/modes and buffers allow only exact adjacency', async () => {
		const f = await fixture()
		await repository.createBookingHold(f.buyer.session.id, randomUUID(), f.command)
		await expect(repository.createBookingHold(f.buyer.session.id, randomUUID(), { ...f.command, mode: 'online', locationId: null })).rejects.toBeInstanceOf(
			BookingHoldConflictError,
		)
		await expect(repository.createBookingHold(f.buyer.session.id, randomUUID(), { ...f.command, start: '2026-10-12T09:45:00Z' })).rejects.toBeInstanceOf(
			BookingHoldConflictError,
		)
		expect((await repository.createBookingHold(f.buyer.session.id, randomUUID(), { ...f.command, start: '2026-10-12T10:00:00Z' })).state).toBe('holding')
	})
	it('blocks the same Staff across different Services and Locations, not only within one listing', async () => {
		const f = await fixture()
		const secondLocation = await repository.db.location.create({ data: { vendorId: f.vendor.id, label: 'Second office', city: 'Test city' } })
		await repository.db.vendorMembership.updateMany({
			where: { userId: f.owner.user.id, vendorId: f.vendor.id },
			data: { locationIds: [f.location.id, secondLocation.id] },
		})
		await repository.configureLocationSchedule(f.owner.session.id, randomUUID(), secondLocation.id, { expectedVersion: 0, calendar: f.calendar })
		await repository.configureStaffSchedule(f.owner.session.id, randomUUID(), f.linked.id, {
			expectedVersion: 1,
			schedule: { scopes: [...f.schedule.scopes, { mode: 'in_person', locationId: secondLocation.id, calendar: f.calendar }] },
		})
		const secondListing = await repository.createListing(f.owner.session.id, randomUUID(), {
			kind: 'service',
			category: 'appointment',
			title: 'Second Service',
			description: 'Another Service sharing concrete Staff capacity.',
			priceCents: 2000,
			durationMinutes: 30,
		})
		const option = {
			...f.option,
			id: randomUUID(),
			locationIds: [secondLocation.id],
			qualifications: [{ staffId: f.linked.id, locationIds: [secondLocation.id], online: true }],
		}
		await repository.configureService(f.owner.session.id, randomUUID(), secondListing.id, {
			expectedVersion: 0,
			configuration: { capacity: 'staff_only', options: [option] },
		})
		await repository.configureServiceSchedulingRules(f.owner.session.id, randomUUID(), secondListing.id, {
			expectedVersion: 0,
			rules: { timezone: 'UTC', leadTimeMinutes: 0, horizonDays: 30, slotIntervalMinutes: 15 },
		})
		await repository.db.listing.update({ where: { id: secondListing.id }, data: { state: 'published' } })
		await repository.createBookingHold(f.buyer.session.id, randomUUID(), f.command)
		const command = { ...f.command, listingId: secondListing.id, optionId: option.id, locationId: secondLocation.id }
		await expect(other.createBookingHold(f.buyer.session.id, randomUUID(), command)).rejects.toBeInstanceOf(BookingHoldConflictError)
		expect((await other.createBookingHold(f.buyer.session.id, randomUUID(), { ...command, start: '2026-10-12T10:00:00Z' })).state).toBe('holding')
	})
	it('revalidates scheduling-rule versions and slot grid instead of accepting client-selected instants', async () => {
		const f = await fixture()
		await repository.configureServiceSchedulingRules(f.owner.session.id, randomUUID(), f.listing.id, {
			expectedVersion: 1,
			rules: { timezone: 'UTC', leadTimeMinutes: 0, horizonDays: 30, slotIntervalMinutes: 15 },
		})
		await expect(repository.createBookingHold(f.buyer.session.id, randomUUID(), f.command)).rejects.toBeInstanceOf(BookingHoldConflictError)
		await expect(
			repository.createBookingHold(f.buyer.session.id, randomUUID(), { ...f.command, expectedRulesVersion: 2, start: '2026-10-12T09:16:00Z' }),
		).rejects.toBeInstanceOf(BookingHoldConflictError)
		expect((await repository.createBookingHold(f.buyer.session.id, randomUUID(), { ...f.command, expectedRulesVersion: 2 })).state).toBe('holding')
	})
	it('database exclusion serializes competing bypass insertions, independently of application locks', async () => {
		const f = await fixture()
		const data = { staffId: f.hidden.id, state: 'booked', startAt: new Date('2026-10-12T09:00:00Z'), endAt: new Date('2026-10-12T10:00:00Z') }
		const results = await Promise.allSettled([repository.db.staffAllocation.create({ data }), other.db.staffAllocation.create({ data })])
		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
		expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
		expect(await repository.db.staffAllocation.count({ where: { staffId: f.hidden.id, state: 'booked' } })).toBe(1)
	})
	it('release/replay frees capacity once and create replay never resurrects a released hold', async () => {
		const f = await fixture()
		const key = randomUUID()
		const hold = await repository.createBookingHold(f.buyer.session.id, key, f.command)
		const releaseKey = randomUUID()
		expect(await repository.releaseBookingHold(f.buyer.session.id, releaseKey, hold.holdId)).toMatchObject({ state: 'released', replayed: false })
		expect(await other.releaseBookingHold(f.buyer.session.id, releaseKey, hold.holdId)).toMatchObject({ state: 'released', replayed: true })
		const replay = await other.createBookingHold(f.buyer.session.id, key, f.command)
		expect(replay).toMatchObject({ holdId: hold.holdId, state: 'holding', replayed: true, expiresAt: hold.expiresAt })
		expect((await repository.readBookingHold(f.buyer.session.id, hold.holdId)).state).toBe('released')
		expect((await repository.createBookingHold(f.buyer.session.id, randomUUID(), f.command)).state).toBe('holding')
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: f.buyer.workspace.id, type: 'BookingHoldReleased' } })).toBe(1)
	})
	it('exact expiry permits reallocation and does not extend expiry on retry', async () => {
		const f = await fixture()
		const key = randomUUID()
		const hold = await repository.createBookingHold(f.buyer.session.id, key, f.command)
		now = new Date(new Date(hold.expiresAt).getTime() - 1)
		await expect(other.createBookingHold(f.buyer.session.id, randomUUID(), f.command)).rejects.toBeInstanceOf(BookingHoldConflictError)
		now = new Date(hold.expiresAt)
		const replacement = await other.createBookingHold(f.buyer.session.id, randomUUID(), f.command)
		expect(replacement.holdId).not.toBe(hold.holdId)
		expect((await repository.readBookingHold(f.buyer.session.id, hold.holdId)).state).toBe('expired')
		expect((await repository.createBookingHold(f.buyer.session.id, key, f.command)).expiresAt).toBe(hold.expiresAt)
		expect(await repository.db.staffAllocation.count({ where: { staffId: f.linked.id, state: 'held' } })).toBe(1)
	})
	it('worker/read/release expiry races produce one terminal transition and cannot release another hold', async () => {
		const f = await fixture()
		const hold = await repository.createBookingHold(f.buyer.session.id, randomUUID(), f.command)
		now = new Date(hold.expiresAt)
		await Promise.all([repository.expireBookingHolds(), other.releaseBookingHold(f.buyer.session.id, randomUUID(), hold.holdId)])
		expect((await repository.readBookingHold(f.buyer.session.id, hold.holdId)).state).toBe('expired')
		expect(await other.expireBookingHolds()).toBe(0)
		expect(await repository.db.auditLog.count({ where: { workspaceId: f.buyer.workspace.id, action: 'booking.hold-expired' } })).toBe(1)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: f.buyer.workspace.id, type: 'BookingHoldExpired' } })).toBe(1)
	})
	it('expiry survives identity/session revocation and Vendor restriction', async () => {
		const f = await fixture()
		const hold = await repository.createBookingHold(f.buyer.session.id, randomUUID(), f.command)
		await repository.db.session.update({ where: { id: f.buyer.session.id }, data: { revokedAt: new Date() } })
		await repository.db.user.update({ where: { id: f.buyer.user.id }, data: { adultVerificationState: 'unverified' } })
		await repository.db.vendor.update({ where: { id: f.vendor.id }, data: { applicationState: 'restricted' } })
		now = new Date(hold.expiresAt)
		expect(await repository.expireBookingHolds()).toBeGreaterThan(0)
		expect((await repository.db.staffAllocation.findUniqueOrThrow({ where: { holdId: hold.holdId } })).state).toBe('expired')
		await expect(repository.readBookingHold(f.buyer.session.id, hold.holdId)).rejects.toBeInstanceOf(AccessDeniedError)
	})
	it('denies other Customers and unverified/anonymous creation; restrictions do not prevent own release', async () => {
		const f = await fixture()
		const stranger = await customer()
		const hold = await repository.createBookingHold(f.buyer.session.id, randomUUID(), f.command)
		await expect(repository.readBookingHold(stranger.session.id, hold.holdId)).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(repository.releaseBookingHold(stranger.session.id, randomUUID(), hold.holdId)).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.db.user.update({ where: { id: stranger.user.id }, data: { adultVerificationState: 'unverified' } })
		await expect(repository.createBookingHold(stranger.session.id, randomUUID(), { ...f.command, start: '2026-10-12T10:00:00Z' })).rejects.toBeInstanceOf(
			AccessDeniedError,
		)
		await expect(repository.createBookingHold(undefined, randomUUID(), f.command)).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.db.vendor.update({ where: { id: f.vendor.id }, data: { applicationState: 'restricted' } })
		expect((await repository.releaseBookingHold(f.buyer.session.id, randomUUID(), hold.holdId)).state).toBe('released')
	})
	it('revalidates changed schedules/qualification/public consent and stale commercial versions', async () => {
		const f = await fixture()
		await repository.configureService(f.owner.session.id, randomUUID(), f.listing.id, {
			expectedVersion: 1,
			configuration: { ...f.configuration, options: [{ ...f.option, priceCents: 2000 }] },
		})
		await expect(repository.createBookingHold(f.buyer.session.id, randomUUID(), f.command)).rejects.toBeInstanceOf(BookingHoldConflictError)
		const current = { ...f.command, expectedConfigurationVersion: 2 }
		await repository.configureLocationSchedule(f.owner.session.id, randomUUID(), f.location.id, {
			expectedVersion: 1,
			calendar: { ...f.calendar, weekly: [] },
		})
		await expect(repository.createBookingHold(f.buyer.session.id, randomUUID(), current)).rejects.toBeInstanceOf(BookingHoldConflictError)
		await repository.setStaffPublicConsent(f.owner.session.id, randomUUID(), f.linked.id, { expectedVersion: 2, publicDisplay: false })
		await expect(
			repository.createBookingHold(f.buyer.session.id, randomUUID(), { ...current, staffId: f.linked.id, mode: 'online', locationId: null }),
		).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.configureService(f.owner.session.id, randomUUID(), f.listing.id, {
			expectedVersion: 2,
			configuration: { ...f.configuration, options: [{ ...f.option, qualifications: [] }] },
		})
		await expect(repository.createBookingHold(f.buyer.session.id, randomUUID(), { ...current, expectedConfigurationVersion: 3 })).rejects.toBeInstanceOf(
			BookingHoldConflictError,
		)
		expect(await repository.db.bookingHold.count({ where: { vendorId: f.vendor.id } })).toBe(0)
	})
	it('database overlap guard rejects bypass writers, allows adjacent/inactive intervals and prevents terminal resurrection', async () => {
		const f = await fixture()
		const hold = await repository.createBookingHold(f.buyer.session.id, randomUUID(), f.command)
		await expect(
			other.db.staffAllocation.create({
				data: { staffId: f.linked.id, state: 'booked', startAt: new Date('2026-10-12T09:20:00Z'), endAt: new Date('2026-10-12T09:30:00Z') },
			}),
		).rejects.toThrow()
		await other.db.staffAllocation.create({
			data: { staffId: f.linked.id, state: 'booked', startAt: new Date('2026-10-12T09:55:00Z'), endAt: new Date('2026-10-12T10:05:00Z') },
		})
		await other.db.staffAllocation.create({
			data: { staffId: f.linked.id, state: 'cancelled', startAt: new Date('2026-10-12T09:20:00Z'), endAt: new Date('2026-10-12T09:30:00Z') },
		})
		await repository.releaseBookingHold(f.buyer.session.id, randomUUID(), hold.holdId)
		await expect(repository.db.bookingHold.update({ where: { id: hold.holdId }, data: { state: 'holding' } })).rejects.toThrow(/immutable/)
	})
	it('late failure rolls back allocation, hold, audit, outbox and retry outcome', async () => {
		const f = await fixture()
		const key = randomUUID()
		const failure = jest.spyOn(repository.db, '$transaction').mockImplementationOnce(async (callback: unknown) => {
			return other.db.$transaction(async (tx) => {
				await (callback as (transaction: Prisma.TransactionClient) => Promise<unknown>)(tx)
				throw new Error('Controlled failure after allocation and replay outcome')
			})
		})
		await expect(repository.createBookingHold(f.buyer.session.id, key, f.command)).rejects.toThrow('Controlled failure')
		failure.mockRestore()
		expect(await repository.db.bookingHold.count({ where: { vendorId: f.vendor.id } })).toBe(0)
		expect(await repository.db.staffAllocation.count({ where: { staffId: f.linked.id } })).toBe(0)
		expect(await repository.db.auditLog.count({ where: { workspaceId: f.buyer.workspace.id, action: 'booking.hold-created' } })).toBe(0)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: f.buyer.workspace.id, type: 'BookingHoldCreated' } })).toBe(0)
		expect((await repository.createBookingHold(f.buyer.session.id, key, f.command)).replayed).toBe(false)
	})
	it('rejects hidden named Staff, foreign modes/Options/add-ons and excluded request models', async () => {
		const f = await fixture(true)
		for (const command of [
			{ ...f.command, staffId: f.hidden.id },
			{ ...f.command, optionId: randomUUID() },
			{ ...f.command, addonIds: [randomUUID()] },
			{ ...f.command, locationId: randomUUID() },
		])
			await expect(repository.createBookingHold(f.buyer.session.id, randomUUID(), command)).rejects.toBeInstanceOf(AccessDeniedError)
		for (const command of [
			{ ...f.command, groupSeats: 2 },
			{ ...f.command, resources: [] },
			{ ...f.command, recurringSeries: true },
			{ ...f.command, start: '2026-10-12T09:15:00.001Z' },
			{ ...f.command, mode: 'online' },
		])
			expect(BookingHoldCommandSchema.safeParse(command).success).toBe(false)
	})
	it('retains accepted commercial snapshot after later edits and rolls back failed release', async () => {
		const f = await fixture()
		const hold = await repository.createBookingHold(f.buyer.session.id, randomUUID(), f.command)
		await repository.configureService(f.owner.session.id, randomUUID(), f.listing.id, {
			expectedVersion: 1,
			configuration: { ...f.configuration, options: [{ ...f.option, priceCents: 9000 }] },
		})
		expect((await other.readBookingHold(f.buyer.session.id, hold.holdId)).snapshot.priceCents).toBe(1000)
		const failure = jest.spyOn(repository.db, '$transaction').mockImplementationOnce(async (callback: unknown) => {
			return other.db.$transaction(async (tx) => {
				await (callback as (transaction: Prisma.TransactionClient) => Promise<unknown>)(tx)
				throw new Error('Controlled release failure')
			})
		})
		await expect(repository.releaseBookingHold(f.buyer.session.id, randomUUID(), hold.holdId)).rejects.toThrow('Controlled release failure')
		failure.mockRestore()
		expect((await other.readBookingHold(f.buyer.session.id, hold.holdId)).state).toBe('holding')
		expect((await repository.db.staffAllocation.findUniqueOrThrow({ where: { holdId: hold.holdId } })).state).toBe('held')
	})
})
