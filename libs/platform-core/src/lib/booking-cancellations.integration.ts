/* eslint-disable @typescript-eslint/no-non-null-assertion -- integration requires a loopback DATABASE_URL */
import { randomUUID } from 'node:crypto'

import { type BookingHoldCommand } from 'contracts'

import { AccessDeniedError } from './access.js'
import { BookingHoldConflictError } from './booking-holds.js'
import { PostgresFoundation } from './postgres-foundation.js'

const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('Phase 03 Booking cancellation PostgreSQL', () => {
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
	for (const template of ['standard', 'flexible']) {
		const full = template === 'flexible' ? 24 : 48,
			partial = template === 'flexible' ? 2 : 12
		for (const [hours, offset, refund] of [
			[full, 0, 1000],
			[full, 1, 500],
			[partial, 0, 500],
			[partial, 1, 0],
		]) {
			it(`${template} exact boundary ${hours}h +${offset}ms preserves original policy and refunds ${refund}`, async () => {
				const f = await confirmed(template)
				await repository.db.listing.update({ where: { id: f.listing.id }, data: { bookingPolicy: template === 'flexible' ? 'standard' : 'flexible' } })
				now = new Date(new Date(f.command.start).getTime() - hours * 3600000 + offset)
				const key = randomUUID(),
					command = { reason: 'Plans changed', expectedVersion: 1 }
				const cancelled = await repository.cancelBooking(f.buyer.session.id, key, f.bookingId, command)
				expect(cancelled).toMatchObject({ state: 'cancelled', refundCents: refund, replayed: false })
				expect(await other.cancelBooking(f.buyer.session.id, key, f.bookingId, command)).toMatchObject({
					cancellationId: cancelled.cancellationId,
					replayed: true,
				})
				await repository.reconcileBookingRefunds()
				expect((await repository.readBookingPayment(f.buyer.session.id, f.payment.paymentId)).refundedCents).toBe(refund)
				expect((await repository.db.staffAllocation.findUniqueOrThrow({ where: { holdId: f.hold.holdId } })).state).toBe('cancelled')
				expect(await repository.db.bookingRefund.count({ where: { paymentId: f.payment.paymentId } })).toBe(refund ? 1 : 0)
				await expect(repository.cancelBooking(f.buyer.session.id, randomUUID(), f.bookingId, command)).rejects.toBeInstanceOf(BookingHoldConflictError)
			})
		}
	}
	it('provider cancellation is full even under the cutoff and leaves a private reason record', async () => {
		const f = await confirmed()
		now = new Date(f.command.start)
		const result = await repository.cancelBooking(f.owner.session.id, randomUUID(), f.bookingId, { reason: 'Staff unavailable', expectedVersion: 1 }, true)
		expect(result.refundCents).toBe(1000)
		await repository.reconcileBookingRefunds()
		expect(await repository.readBookingPayment(f.buyer.session.id, f.payment.paymentId)).toMatchObject({ state: 'refunded', refundedCents: 1000 })
		expect(await repository.db.bookingCancellation.findUniqueOrThrow({ where: { bookingId: f.bookingId } })).toMatchObject({
			actorKind: 'vendor',
			reason: 'Staff unavailable',
		})
	})
	it('strangers, unenabled Staff and stale versions cannot cancel or request a refund', async () => {
		const f = await confirmed(),
			stranger = await customer()
		await expect(repository.cancelBooking(stranger.session.id, randomUUID(), f.bookingId, { reason: 'Cancel', expectedVersion: 1 })).rejects.toBeInstanceOf(
			AccessDeniedError,
		)
		await expect(
			repository.cancelBooking(stranger.session.id, randomUUID(), f.bookingId, { reason: 'Cancel', expectedVersion: 1 }, true),
		).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(repository.cancelBooking(f.buyer.session.id, randomUUID(), f.bookingId, { reason: 'Cancel', expectedVersion: 2 })).rejects.toBeInstanceOf(
			BookingHoldConflictError,
		)
		expect((await repository.readBooking(f.buyer.session.id, f.bookingId)).state).toBe('confirmed')
		expect(await repository.db.bookingCancellation.count({ where: { bookingId: f.bookingId } })).toBe(0)
	})
	it('concurrent Customer and Vendor cancellation commit one outcome and one refund', async () => {
		const f = await confirmed()
		const result = await Promise.allSettled([
			repository.cancelBooking(f.buyer.session.id, randomUUID(), f.bookingId, { reason: 'Cancel', expectedVersion: 1 }),
			other.cancelBooking(f.owner.session.id, randomUUID(), f.bookingId, { reason: 'Cancel', expectedVersion: 1 }, true),
		])
		expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
		expect(await repository.db.bookingCancellation.count({ where: { bookingId: f.bookingId } })).toBe(1)
		expect(await repository.db.bookingRefund.count({ where: { paymentId: f.payment.paymentId } })).toBe(1)
	})
	it('unenabled Staff and partial Location scope cannot exercise Vendor cancellation', async () => {
		const f = await confirmed(),
			staff = await customer()
		await repository.db.vendorMembership.create({
			data: { vendorId: f.vendor.id, userId: staff.user.id, role: 'vendor_staff', locationIds: [f.location.id] },
		})
		await repository.db.session.update({ where: { id: staff.session.id }, data: { activeVendorId: f.vendor.id, activeRole: 'vendor_staff' } })
		await expect(
			repository.cancelBooking(staff.session.id, randomUUID(), f.bookingId, { reason: 'Cancel', expectedVersion: 1 }, true),
		).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.db.vendorMembership.updateMany({ where: { vendorId: f.vendor.id, userId: f.owner.user.id }, data: { locationIds: [] } })
		await expect(
			repository.cancelBooking(f.owner.session.id, randomUUID(), f.bookingId, { reason: 'Cancel', expectedVersion: 1 }, true),
		).rejects.toBeInstanceOf(AccessDeniedError)
	})
	it('late cancellation failure rolls back capacity, refund and idempotency effects together', async () => {
		const f = await confirmed(),
			key = randomUUID(),
			command = { reason: 'Cancel', expectedVersion: 1 }
		await repository.db.$executeRawUnsafe(
			`CREATE FUNCTION fail_booking_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='BookingCancelled' THEN RAISE EXCEPTION 'Controlled cancellation failure'; END IF; RETURN NEW; END; $$`,
		)
		await repository.db.$executeRawUnsafe(
			`CREATE TRIGGER fail_booking_cancel BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION fail_booking_cancel()`,
		)
		try {
			await expect(repository.cancelBooking(f.buyer.session.id, key, f.bookingId, command)).rejects.toThrow('Controlled cancellation failure')
			expect((await repository.readBooking(f.buyer.session.id, f.bookingId)).state).toBe('confirmed')
			expect((await repository.db.staffAllocation.findUniqueOrThrow({ where: { holdId: f.hold.holdId } })).state).toBe('booked')
			expect(await repository.db.bookingRefund.count({ where: { paymentId: f.payment.paymentId } })).toBe(0)
		} finally {
			await repository.db.$executeRawUnsafe('DROP TRIGGER fail_booking_cancel ON outbox_events')
			await repository.db.$executeRawUnsafe('DROP FUNCTION fail_booking_cancel()')
		}
		expect(await repository.cancelBooking(f.buyer.session.id, key, f.bookingId, command)).toMatchObject({ replayed: false, state: 'cancelled' })
	})
})
