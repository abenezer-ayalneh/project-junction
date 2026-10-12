/* eslint-disable @typescript-eslint/no-non-null-assertion -- integration requires a loopback DATABASE_URL */
import { randomUUID } from 'node:crypto'

import { type BookingHoldCommand } from 'contracts'

import { AccessDeniedError } from './access.js'
import { BookingHoldConflictError } from './booking-holds.js'
import { PostgresFoundation } from './postgres-foundation.js'

const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('Phase 03 paid Booking confirmation PostgreSQL', () => {
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

	async function started() {
		const f = await fixture()
		const hold = await repository.createBookingHold(f.buyer.session.id, randomUUID(), f.command)
		const payment = await repository.startBookingPayment(f.buyer.session.id, randomUUID(), {
			holdId: hold.holdId,
			attendee: { name: 'Guest', notes: 'One Customer party' },
		})
		return { ...f, hold, payment }
	}
	it('confirms once, snapshots attendee/policy/terms, keeps booked capacity and hides any-Staff identity', async () => {
		const f = await started(),
			key = randomUUID()
		await repository.recordLocalBookingPaymentResult(f.buyer.session.id, key, f.payment.paymentId, { outcome: 'succeeded' })
		const results = await Promise.all([
			repository.readBookingPayment(f.buyer.session.id, f.payment.paymentId),
			other.readBookingPayment(f.buyer.session.id, f.payment.paymentId),
		])
		expect(results[0].state).toBe('succeeded')
		expect(typeof results[0].bookingId).toBe('string')
		expect(results[1].bookingId).toBe(results[0].bookingId)
		const booking = await repository.readBooking(f.buyer.session.id, results[0].bookingId!)
		expect(booking.snapshot).toMatchObject({
			selectedStaffId: null,
			priceCents: 1000,
			optionPriceCents: 1000,
			policy: { template: 'standard', fullRefundHours: 48, partialRefundHours: 12, amendmentLimit: 1 },
			attendee: { name: 'Guest' },
		})
		expect(JSON.stringify(booking)).not.toContain(f.linked.id)
		expect(await repository.db.booking.count({ where: { holdId: f.hold.holdId } })).toBe(1)
		expect(await repository.db.staffAllocation.findUniqueOrThrow({ where: { holdId: f.hold.holdId } })).toMatchObject({ state: 'booked', expiresAt: null })
		expect((await repository.readBookingHold(f.buyer.session.id, f.hold.holdId)).state).toBe('committed')
		await expect(repository.releaseBookingHold(f.buyer.session.id, randomUUID(), f.hold.holdId)).rejects.toBeInstanceOf(BookingHoldConflictError)
		await expect(other.createBookingHold(f.buyer.session.id, randomUUID(), f.command)).rejects.toBeInstanceOf(BookingHoldConflictError)
		expect(await repository.recordLocalBookingPaymentResult(f.buyer.session.id, key, f.payment.paymentId, { outcome: 'succeeded' })).toMatchObject({
			replayed: true,
		})
		expect(await repository.reconcileBookingPayments()).toBe(0)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: f.buyer.workspace.id, type: 'BookingConfirmed' } })).toBe(1)
		await expect(repository.db.booking.update({ where: { id: booking.bookingId }, data: { snapshot: { edited: true } } })).rejects.toThrow(/immutable/)
	})
	it('exact deadline success compensates once without a Booking or resurrected allocation', async () => {
		const f = await started()
		now = new Date(f.hold.expiresAt)
		await repository.recordLocalBookingPaymentResult(f.buyer.session.id, randomUUID(), f.payment.paymentId, { outcome: 'succeeded' })
		expect(await repository.readBookingPayment(f.buyer.session.id, f.payment.paymentId)).toMatchObject({ state: 'refund_pending', bookingId: null })
		await Promise.all([repository.reconcileBookingRefunds(), other.reconcileBookingRefunds()])
		expect(await repository.readBookingPayment(f.buyer.session.id, f.payment.paymentId)).toMatchObject({
			state: 'refunded',
			refundedCents: 1000,
			bookingId: null,
		})
		expect(await repository.db.bookingRefund.count({ where: { paymentId: f.payment.paymentId } })).toBe(1)
		expect((await repository.readBookingHold(f.buyer.session.id, f.hold.holdId)).state).toBe('expired')
	})
	it('release and expiry races with payment success never double-book or lose compensation', async () => {
		const f = await started()
		await repository.releaseBookingHold(f.buyer.session.id, randomUUID(), f.hold.holdId)
		await repository.recordLocalBookingPaymentResult(f.buyer.session.id, randomUUID(), f.payment.paymentId, { outcome: 'succeeded' })
		expect(await repository.readBookingPayment(f.buyer.session.id, f.payment.paymentId)).toMatchObject({ state: 'refund_pending', bookingId: null })
		expect(await repository.db.staffAllocation.findUniqueOrThrow({ where: { holdId: f.hold.holdId } })).toMatchObject({ state: 'released' })
	})
	it('unknown remains unconfirmed; failure releases; conflicting final result is rejected', async () => {
		const f = await started()
		await repository.recordLocalBookingPaymentResult(f.buyer.session.id, randomUUID(), f.payment.paymentId, { outcome: 'unknown' })
		expect(await repository.readBookingPayment(f.buyer.session.id, f.payment.paymentId)).toMatchObject({ state: 'unknown', bookingId: null })
		await repository.recordLocalBookingPaymentResult(f.buyer.session.id, randomUUID(), f.payment.paymentId, { outcome: 'failed' })
		expect(await repository.readBookingPayment(f.buyer.session.id, f.payment.paymentId)).toMatchObject({ state: 'failed', bookingId: null })
		await expect(
			repository.recordLocalBookingPaymentResult(f.buyer.session.id, randomUUID(), f.payment.paymentId, { outcome: 'succeeded' }),
		).rejects.toBeInstanceOf(BookingHoldConflictError)
		expect(await repository.db.bookingRefund.count({ where: { paymentId: f.payment.paymentId } })).toBe(0)
	})
	it('adult identity and Customer ownership are required; attendees create no User', async () => {
		const f = await started(),
			stranger = await customer()
		const users = await repository.db.user.count()
		await expect(repository.readBookingPayment(stranger.session.id, f.payment.paymentId)).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(
			repository.recordLocalBookingPaymentResult(stranger.session.id, randomUUID(), f.payment.paymentId, { outcome: 'succeeded' }),
		).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.db.user.update({ where: { id: stranger.user.id }, data: { adultVerificationState: 'unverified' } })
		await expect(repository.startBookingPayment(stranger.session.id, randomUUID(), { holdId: f.hold.holdId })).rejects.toBeInstanceOf(AccessDeniedError)
		expect(await repository.db.user.count()).toBe(users)
	})
	it('purchase terms survive catalog and policy edits after payment start', async () => {
		const f = await started()
		await repository.db.listing.update({ where: { id: f.listing.id }, data: { bookingPolicy: 'flexible', title: 'Changed Service' } })
		await repository.recordLocalBookingPaymentResult(f.buyer.session.id, randomUUID(), f.payment.paymentId, { outcome: 'succeeded' })
		const payment = await repository.readBookingPayment(f.buyer.session.id, f.payment.paymentId)
		const booking = await repository.readBooking(f.buyer.session.id, payment.bookingId!)
		expect(booking.snapshot).toMatchObject({ serviceTitle: 'Booking hold Service', policy: { template: 'standard' } })
	})
	it('payment start replays without extending expiry and rejects a second distinct attempt', async () => {
		const f = await fixture(),
			hold = await repository.createBookingHold(f.buyer.session.id, randomUUID(), f.command),
			key = randomUUID()
		const a = await repository.startBookingPayment(f.buyer.session.id, key, { holdId: hold.holdId })
		now = new Date(now.getTime() + 60000)
		expect(await other.startBookingPayment(f.buyer.session.id, key, { holdId: hold.holdId })).toMatchObject({
			paymentId: a.paymentId,
			replayed: true,
			expiresAt: hold.expiresAt,
		})
		await expect(repository.startBookingPayment(f.buyer.session.id, randomUUID(), { holdId: hold.holdId })).rejects.toBeInstanceOf(BookingHoldConflictError)
	})
	it('Vendor-selected Flexible policy is frozen before subsequent policy edits', async () => {
		const f = await fixture()
		await repository.configureService(f.owner.session.id, randomUUID(), f.listing.id, {
			expectedVersion: 1,
			configuration: f.configuration,
			bookingPolicy: 'flexible',
		})
		const hold = await repository.createBookingHold(f.buyer.session.id, randomUUID(), { ...f.command, expectedConfigurationVersion: 2 })
		const payment = await repository.startBookingPayment(f.buyer.session.id, randomUUID(), { holdId: hold.holdId })
		await repository.recordLocalBookingPaymentResult(f.buyer.session.id, randomUUID(), payment.paymentId, { outcome: 'succeeded' })
		const current = await repository.readBookingPayment(f.buyer.session.id, payment.paymentId)
		expect((await repository.readBooking(f.buyer.session.id, current.bookingId!)).snapshot.policy).toMatchObject({
			template: 'flexible',
			fullRefundHours: 24,
			partialRefundHours: 2,
			amendmentLimit: 2,
		})
	})
	it('durable success survives transaction failure and autonomous reconciliation after Customer revocation', async () => {
		const f = await started()
		await repository.db.$executeRawUnsafe(
			`CREATE FUNCTION fail_booking_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Controlled Booking failure'; END; $$`,
		)
		await repository.db.$executeRawUnsafe(
			`CREATE TRIGGER fail_booking_confirmation BEFORE INSERT ON bookings FOR EACH ROW EXECUTE FUNCTION fail_booking_confirmation()`,
		)
		try {
			await expect(
				repository.recordLocalBookingPaymentResult(f.buyer.session.id, randomUUID(), f.payment.paymentId, { outcome: 'succeeded' }),
			).rejects.toThrow('Controlled Booking failure')
			expect(await repository.db.booking.count({ where: { holdId: f.hold.holdId } })).toBe(0)
			expect((await repository.db.staffAllocation.findUniqueOrThrow({ where: { holdId: f.hold.holdId } })).state).toBe('held')
			expect(await repository.db.bookingPaymentReceipt.count({ where: { paymentId: f.payment.paymentId } })).toBe(1)
		} finally {
			await repository.db.$executeRawUnsafe('DROP TRIGGER fail_booking_confirmation ON bookings')
			await repository.db.$executeRawUnsafe('DROP FUNCTION fail_booking_confirmation()')
		}
		await repository.db.session.update({ where: { id: f.buyer.session.id }, data: { revokedAt: new Date() } })
		await repository.reconcileBookingPayments()
		expect((await repository.db.bookingPayment.findUniqueOrThrow({ where: { id: f.payment.paymentId } })).state).toBe('succeeded')
	})
})
