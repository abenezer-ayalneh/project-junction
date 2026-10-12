/* eslint-disable @typescript-eslint/no-non-null-assertion -- integration requires a loopback DATABASE_URL */
import { randomUUID } from 'node:crypto'

import { type BookingHoldCommand } from 'contracts'

import { AccessDeniedError } from './access.js'
import { BookingHoldConflictError } from './booking-holds.js'
import { PostgresFoundation } from './postgres-foundation.js'

const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('Phase 03 atomic Booking amendments PostgreSQL', () => {
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

	async function confirmed(template = 'standard') {
		const f = await fixture()
		await repository.db.listing.update({ where: { id: f.listing.id }, data: { bookingPolicy: template } })
		const hold = await repository.createBookingHold(f.buyer.session.id, randomUUID(), f.command)
		const payment = await repository.startBookingPayment(f.buyer.session.id, randomUUID(), { holdId: hold.holdId })
		const result = await repository.recordLocalBookingPaymentResult(f.buyer.session.id, randomUUID(), payment.paymentId, { outcome: 'succeeded' })
		return { ...f, hold, payment, bookingId: result.bookingId! }
	}

	function amendment(f: Awaited<ReturnType<typeof confirmed>>, selection = {}) {
		return { expectedVersion: 1, selection: { ...f.command, start: '2026-10-12T11:00:00Z', ...selection }, extraPaymentOutcome: 'succeeded' }
	}
	it('unchanged Option keeps purchase price; new add-on current price settles once and retains immutable original', async () => {
		const f = await confirmed('flexible')
		const configuration = { ...f.configuration, options: [{ ...f.option, priceCents: 9000, addons: [{ ...f.option.addons[0], priceCents: 700 }] }] }
		await repository.configureService(f.owner.session.id, randomUUID(), f.listing.id, { expectedVersion: 1, configuration })
		const key = randomUUID(),
			command = amendment(f, { expectedConfigurationVersion: 2, addonIds: [f.option.addons[0].id] })
		const amended = await repository.amendBooking(f.buyer.session.id, key, f.bookingId, command)
		expect(amended).toMatchObject({ deltaCents: 700, version: 2, snapshot: { priceCents: 1700, optionPriceCents: 1000, durationMinutes: 45 } })
		expect(await other.amendBooking(f.buyer.session.id, key, f.bookingId, command)).toMatchObject({ amendmentId: amended.amendmentId, replayed: true })
		const booking = await repository.readBooking(f.buyer.session.id, f.bookingId)
		expect(booking.originalSnapshot?.priceCents).toBe(1000)
		expect(booking.snapshot.priceCents).toBe(1700)
		expect(booking.customerAmendments).toBe(1)
		expect(await repository.db.bookingAmendment.count({ where: { bookingId: f.bookingId } })).toBe(1)
		expect((await repository.db.staffAllocation.findUniqueOrThrow({ where: { holdId: f.hold.holdId } })).state).toBe('cancelled')
		const saved = await repository.db.booking.findUniqueOrThrow({ where: { id: f.bookingId } })
		expect((await repository.db.staffAllocation.findUniqueOrThrow({ where: { id: saved.allocationId } })).state).toBe('booked')
	})
	it('failed and unknown extra payment retain original interval, terms and allowance', async () => {
		const f = await confirmed('flexible')
		for (const extraPaymentOutcome of ['failed', 'unknown'])
			await expect(
				repository.amendBooking(f.buyer.session.id, randomUUID(), f.bookingId, {
					...amendment(f, { addonIds: [f.option.addons[0].id] }),
					extraPaymentOutcome,
				}),
			).rejects.toBeInstanceOf(BookingHoldConflictError)
		expect(await repository.readBooking(f.buyer.session.id, f.bookingId)).toMatchObject({
			version: 1,
			customerAmendments: 0,
			snapshot: { priceCents: 1000, start: new Date(f.command.start).toISOString() },
		})
		expect((await repository.db.staffAllocation.findUniqueOrThrow({ where: { holdId: f.hold.holdId } })).state).toBe('booked')
		expect(await repository.db.bookingAmendment.count({ where: { bookingId: f.bookingId } })).toBe(0)
	})
	it('occupied replacement and stale terms preserve the original', async () => {
		const f = await confirmed()
		const second = await customer()
		await repository.createBookingHold(second.session.id, randomUUID(), { ...f.command, start: '2026-10-12T11:00:00Z' })
		await expect(repository.amendBooking(f.buyer.session.id, randomUUID(), f.bookingId, amendment(f))).rejects.toBeInstanceOf(BookingHoldConflictError)
		await expect(
			repository.amendBooking(
				f.buyer.session.id,
				randomUUID(),
				f.bookingId,
				amendment(f, { expectedConfigurationVersion: 9, start: '2026-10-12T12:00:00Z' }),
			),
		).rejects.toBeInstanceOf(BookingHoldConflictError)
		expect((await repository.db.staffAllocation.findUniqueOrThrow({ where: { holdId: f.hold.holdId } })).state).toBe('booked')
	})
	for (const template of ['standard', 'flexible'])
		it(`${template} enforces allowance and exact final cutoff`, async () => {
			const f = await confirmed(template)
			const cutoff = template === 'flexible' ? 2 : 12
			now = new Date(new Date(f.command.start).getTime() - cutoff * 3600000)
			await expect(repository.amendBooking(f.buyer.session.id, randomUUID(), f.bookingId, amendment(f))).rejects.toBeInstanceOf(BookingHoldConflictError)
			now = new Date(now.getTime() - 1)
			const first = await repository.amendBooking(f.buyer.session.id, randomUUID(), f.bookingId, amendment(f))
			if (template === 'flexible')
				await repository.amendBooking(f.buyer.session.id, randomUUID(), f.bookingId, {
					...amendment(f, { start: '2026-10-12T12:00:00Z' }),
					expectedVersion: first.version,
				})
			const booking = await repository.readBooking(f.buyer.session.id, f.bookingId)
			await expect(
				repository.amendBooking(f.buyer.session.id, randomUUID(), f.bookingId, {
					...amendment(f, { start: '2026-10-12T13:00:00Z' }),
					expectedVersion: booking.version,
				}),
			).rejects.toBeInstanceOf(BookingHoldConflictError)
		})
	it('negative delta refunds once and later full cancellation refunds remaining amended value', async () => {
		const f = await confirmed('flexible')
		const first = await repository.amendBooking(f.buyer.session.id, randomUUID(), f.bookingId, amendment(f, { addonIds: [f.option.addons[0].id] }))
		const second = await repository.amendBooking(f.buyer.session.id, randomUUID(), f.bookingId, {
			...amendment(f, { start: '2026-10-12T12:00:00Z' }),
			expectedVersion: first.version,
		})
		expect(second.deltaCents).toBe(-500)
		await repository.reconcileBookingRefunds()
		expect((await repository.readBookingPayment(f.buyer.session.id, f.payment.paymentId)).refundedCents).toBe(500)
		const cancelled = await repository.cancelBooking(
			f.owner.session.id,
			randomUUID(),
			f.bookingId,
			{ reason: 'Provider unavailable', expectedVersion: second.version },
			true,
		)
		expect(cancelled.refundCents).toBe(1000)
		await repository.reconcileBookingRefunds()
		expect(await repository.readBookingPayment(f.buyer.session.id, f.payment.paymentId)).toMatchObject({ state: 'refunded', refundedCents: 1500 })
	})
	it('concurrent amendments commit one allocation and strangers cannot amend', async () => {
		const f = await confirmed(),
			stranger = await customer()
		await expect(repository.amendBooking(stranger.session.id, randomUUID(), f.bookingId, amendment(f))).rejects.toBeInstanceOf(AccessDeniedError)
		const results = await Promise.allSettled([
			repository.amendBooking(f.buyer.session.id, randomUUID(), f.bookingId, amendment(f)),
			other.amendBooking(f.buyer.session.id, randomUUID(), f.bookingId, amendment(f, { start: '2026-10-12T12:00:00Z' })),
		])
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
		expect(await repository.db.bookingAmendment.count({ where: { bookingId: f.bookingId } })).toBe(1)
	})
	it('unchanged add-on keeps its purchased price while changed Option uses current price', async () => {
		const f = await confirmed('flexible')
		const first = await repository.amendBooking(f.buyer.session.id, randomUUID(), f.bookingId, amendment(f, { addonIds: [f.option.addons[0].id] }))
		const changed = { ...f.option, id: randomUUID(), label: 'Different option', priceCents: 2000, addons: [{ ...f.option.addons[0], priceCents: 800 }] }
		await repository.configureService(f.owner.session.id, randomUUID(), f.listing.id, {
			expectedVersion: 1,
			configuration: {
				capacity: 'staff_only',
				options: [{ ...f.option, priceCents: 9000, addons: [{ ...f.option.addons[0], priceCents: 800 }] }, changed],
			},
		})
		const same = await repository.amendBooking(f.buyer.session.id, randomUUID(), f.bookingId, {
			...amendment(f, { addonIds: [f.option.addons[0].id], expectedConfigurationVersion: 2, start: '2026-10-12T12:00:00Z' }),
			expectedVersion: first.version,
		})
		expect(same.deltaCents).toBe(0)
		expect(same.snapshot.addons[0].priceCents).toBe(500)
		const g = await confirmed('flexible')
		await repository.configureService(g.owner.session.id, randomUUID(), g.listing.id, {
			expectedVersion: 1,
			configuration: { capacity: 'staff_only', options: [g.option, { ...g.option, id: changed.id, priceCents: 2000 }] },
		})
		const selected = await repository.amendBooking(
			g.buyer.session.id,
			randomUUID(),
			g.bookingId,
			amendment(g, { optionId: changed.id, expectedConfigurationVersion: 2 }),
		)
		expect(selected).toMatchObject({ deltaCents: 1000, snapshot: { optionPriceCents: 2000, priceCents: 2000 } })
	})
	it('same-slot amendment is atomic and rejected late event restores original on retry', async () => {
		const f = await confirmed('flexible'),
			key = randomUUID(),
			command = amendment(f, { start: f.command.start })
		await repository.db.$executeRawUnsafe(
			`CREATE FUNCTION fail_booking_amend() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='BookingAmended' THEN RAISE EXCEPTION 'Controlled amendment failure'; END IF; RETURN NEW; END; $$`,
		)
		await repository.db.$executeRawUnsafe(
			`CREATE TRIGGER fail_booking_amend BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION fail_booking_amend()`,
		)
		try {
			await expect(repository.amendBooking(f.buyer.session.id, key, f.bookingId, command)).rejects.toThrow('Controlled amendment failure')
			expect((await repository.db.staffAllocation.findUniqueOrThrow({ where: { holdId: f.hold.holdId } })).state).toBe('booked')
			expect((await repository.readBooking(f.buyer.session.id, f.bookingId)).customerAmendments).toBe(0)
			expect(await repository.db.bookingAmendment.count({ where: { bookingId: f.bookingId } })).toBe(0)
		} finally {
			await repository.db.$executeRawUnsafe('DROP TRIGGER fail_booking_amend ON outbox_events')
			await repository.db.$executeRawUnsafe('DROP FUNCTION fail_booking_amend()')
		}
		expect(await repository.amendBooking(f.buyer.session.id, key, f.bookingId, command)).toMatchObject({ deltaCents: 0, replayed: false })
	})
	it('amendments change online mode, Location and concrete Staff while retaining purchased Option price', async () => {
		const f = await confirmed('flexible')
		const nextLocation = await repository.db.location.create({ data: { vendorId: f.vendor.id, label: 'Second office', city: 'Test city' } })
		await repository.db.vendorMembership.updateMany({
			where: { vendorId: f.vendor.id, userId: f.owner.user.id },
			data: { locationIds: [f.location.id, nextLocation.id] },
		})
		await repository.configureLocationSchedule(f.owner.session.id, randomUUID(), nextLocation.id, { expectedVersion: 0, calendar: f.calendar })
		await repository.configureStaffSchedule(f.owner.session.id, randomUUID(), f.hidden.id, {
			expectedVersion: 1,
			schedule: { scopes: [...f.schedule.scopes, { mode: 'in_person', locationId: nextLocation.id, calendar: f.calendar }] },
		})
		const configuration = {
			capacity: 'staff_only',
			options: [
				{
					...f.option,
					priceCents: 9000,
					locationIds: [f.location.id, nextLocation.id],
					qualifications: [...f.option.qualifications, { staffId: f.hidden.id, locationIds: [nextLocation.id], online: true }],
				},
			],
		}
		await repository.configureService(f.owner.session.id, randomUUID(), f.listing.id, { expectedVersion: 1, configuration })
		const online = await repository.amendBooking(
			f.buyer.session.id,
			randomUUID(),
			f.bookingId,
			amendment(f, { expectedConfigurationVersion: 2, mode: 'online', locationId: null, staffId: f.linked.id }),
		)
		expect(online).toMatchObject({ deltaCents: 0, snapshot: { mode: 'online', locationId: null, selectedStaffId: f.linked.id, priceCents: 1000 } })
		const moved = await repository.amendBooking(f.buyer.session.id, randomUUID(), f.bookingId, {
			...amendment(f, { expectedConfigurationVersion: 2, locationId: nextLocation.id, staffId: null, start: '2026-10-12T12:00:00Z' }),
			expectedVersion: 2,
		})
		expect(moved).toMatchObject({ deltaCents: 0, snapshot: { mode: 'in_person', locationId: nextLocation.id, selectedStaffId: null, priceCents: 1000 } })
		const saved = await repository.db.booking.findUniqueOrThrow({ where: { id: f.bookingId }, include: { allocation: true } })
		expect(saved.allocation.staffId).toBe(f.hidden.id)
	})
})
