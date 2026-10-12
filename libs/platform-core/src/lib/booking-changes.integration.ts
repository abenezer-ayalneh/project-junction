/* eslint-disable @typescript-eslint/no-non-null-assertion -- integration requires a loopback DATABASE_URL */
import { randomUUID } from 'node:crypto'

import { type BookingHoldCommand } from 'contracts'

import { AccessDeniedError } from './access.js'
import { BookingHoldConflictError } from './booking-holds.js'
import { PostgresFoundation } from './postgres-foundation.js'

const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('Phase 03 substitution and waitlists PostgreSQL', () => {
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

	async function prepared(named = false) {
		const f = await fixture(true)
		if (named) {
			const staff = await customer()
			await repository.db.vendorMembership.create({
				data: { userId: staff.user.id, vendorId: f.vendor.id, role: 'vendor_staff', locationIds: [f.location.id], staffId: f.hidden.id },
			})
			await repository.db.staff.update({ where: { id: f.hidden.id }, data: { userId: staff.user.id } })
			await repository.db.session.update({
				where: { id: staff.session.id },
				data: { workspaceId: f.owner.workspace.id, activeVendorId: f.vendor.id, activeRole: 'vendor_staff' },
			})
			await repository.setStaffPublicConsent(staff.session.id, randomUUID(), f.hidden.id, { expectedVersion: 1, publicDisplay: true })
		}
		const hold = await repository.createBookingHold(f.buyer.session.id, randomUUID(), { ...f.command, staffId: named ? f.linked.id : null })
		const payment = await repository.startBookingPayment(f.buyer.session.id, randomUUID(), { holdId: hold.holdId })
		const result = await repository.recordLocalBookingPaymentResult(f.buyer.session.id, randomUUID(), payment.paymentId, { outcome: 'succeeded' })
		return { ...f, hold, payment, bookingId: result.bookingId! }
	}
	it('any-Staff replacement is atomic, private, noticed and consumes no Customer allowance', async () => {
		const f = await prepared(),
			key = randomUUID(),
			command = { expectedVersion: 1, replacementStaffId: f.hidden.id, reason: 'Staff unavailable' }
		const result = await repository.proposeBookingSubstitution(f.owner.session.id, key, f.bookingId, command)
		expect(result).toMatchObject({ state: 'accepted', replacementStaffId: null, replacementStaffName: null })
		expect(JSON.stringify(result)).not.toContain(f.hidden.id)
		expect(await other.proposeBookingSubstitution(f.owner.session.id, key, f.bookingId, command)).toMatchObject({
			proposalId: result.proposalId,
			replayed: true,
		})
		expect(await repository.readBooking(f.buyer.session.id, f.bookingId)).toMatchObject({
			customerAmendments: 0,
			version: 2,
			snapshot: { selectedStaffId: null, priceCents: 1000 },
		})
		const booking = await repository.db.booking.findUniqueOrThrow({ where: { id: f.bookingId }, include: { allocation: true } })
		expect(booking.allocation.staffId).toBe(f.hidden.id)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: f.buyer.workspace.id, type: 'BookingStaffSubstituted' } })).toBe(1)
		await expect(
			repository.decideBookingSubstitution(f.buyer.session.id, randomUUID(), result.proposalId, { decision: 'withdraw' }),
		).rejects.toBeInstanceOf(BookingHoldConflictError)
	})
	it('named replacement requires explicit Customer consent and retains original until accepted', async () => {
		const f = await prepared(true)
		const result = await repository.proposeBookingSubstitution(f.owner.session.id, randomUUID(), f.bookingId, {
			expectedVersion: 1,
			replacementStaffId: f.hidden.id,
			reason: 'Staff unavailable',
		})
		expect(result).toMatchObject({ state: 'pending', replacementStaffId: f.hidden.id })
		expect((await repository.db.staffAllocation.findUniqueOrThrow({ where: { holdId: f.hold.holdId } })).state).toBe('booked')
		expect((await repository.readBooking(f.buyer.session.id, f.bookingId)).version).toBe(1)
		expect(await repository.decideBookingSubstitution(f.buyer.session.id, randomUUID(), result.proposalId, { decision: 'accept' })).toMatchObject({
			state: 'accepted',
		})
		expect(await repository.readBooking(f.buyer.session.id, f.bookingId)).toMatchObject({
			customerAmendments: 0,
			version: 2,
			snapshot: { selectedStaffId: f.hidden.id },
		})
	})
	for (const decision of ['decline', 'withdraw'])
		it(`named ${decision} cancels with full refund even after Customer cutoff`, async () => {
			const f = await prepared(true)
			const result = await repository.proposeBookingSubstitution(f.owner.session.id, randomUUID(), f.bookingId, {
				expectedVersion: 1,
				replacementStaffId: f.hidden.id,
				reason: 'Staff unavailable',
			})
			if (decision === 'withdraw') await repository.decideBookingSubstitution(f.buyer.session.id, randomUUID(), result.proposalId, { decision: 'accept' })
			now = new Date(new Date(f.command.start).getTime() - 60000)
			const key = randomUUID()
			expect(await repository.decideBookingSubstitution(f.buyer.session.id, key, result.proposalId, { decision })).toMatchObject({
				state: decision === 'withdraw' ? 'withdrawn' : 'declined',
			})
			expect(await repository.decideBookingSubstitution(f.buyer.session.id, key, result.proposalId, { decision })).toMatchObject({ replayed: true })
			await repository.reconcileBookingRefunds()
			expect(await repository.readBookingPayment(f.buyer.session.id, f.payment.paymentId)).toMatchObject({ state: 'refunded', refundedCents: 1000 })
			expect((await repository.readBooking(f.buyer.session.id, f.bookingId)).customerAmendments).toBe(0)
		})
	it('stale consent and display withdrawal retain original and never silently substitute', async () => {
		const f = await prepared(true)
		const proposal = await repository.proposeBookingSubstitution(f.owner.session.id, randomUUID(), f.bookingId, {
			expectedVersion: 1,
			replacementStaffId: f.hidden.id,
			reason: 'Staff unavailable',
		})
		await repository.db.staff.update({ where: { id: f.hidden.id }, data: { publicConsentAt: null } })
		await expect(
			repository.decideBookingSubstitution(f.buyer.session.id, randomUUID(), proposal.proposalId, { decision: 'accept' }),
		).rejects.toBeInstanceOf(AccessDeniedError)
		expect((await repository.readBooking(f.buyer.session.id, f.bookingId)).version).toBe(1)
		await repository.cancelBooking(f.buyer.session.id, randomUUID(), f.bookingId, { reason: 'Cancel', expectedVersion: 1 })
		await expect(
			repository.decideBookingSubstitution(f.buyer.session.id, randomUUID(), proposal.proposalId, { decision: 'accept' }),
		).rejects.toBeInstanceOf(BookingHoldConflictError)
	})
	it('stranger decisions and cross-Vendor replacement are denied without effects', async () => {
		const f = await prepared(true),
			g = await fixture()
		await expect(
			repository.proposeBookingSubstitution(f.owner.session.id, randomUUID(), f.bookingId, {
				expectedVersion: 1,
				replacementStaffId: g.linked.id,
				reason: 'Replace',
			}),
		).rejects.toBeInstanceOf(AccessDeniedError)
		const proposal = await repository.proposeBookingSubstitution(f.owner.session.id, randomUUID(), f.bookingId, {
			expectedVersion: 1,
			replacementStaffId: f.hidden.id,
			reason: 'Replace',
		})
		await expect(
			repository.decideBookingSubstitution(g.buyer.session.id, randomUUID(), proposal.proposalId, { decision: 'accept' }),
		).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(repository.readBookingSubstitution(g.buyer.session.id, proposal.proposalId)).rejects.toBeInstanceOf(AccessDeniedError)
	})
	it('waitlist notifies once and never allocates, charges or confirms; remove and reads stay scoped', async () => {
		const f = await fixture()
		const selection = {
			optionId: f.option.id,
			addonIds: [],
			mode: 'in_person',
			locationId: f.location.id,
			staffId: null,
			from: '2026-10-12T09:15:00Z',
			to: '2026-10-12T09:16:00Z',
		}
		const hold = await repository.createBookingHold(f.buyer.session.id, randomUUID(), f.command),
			key = randomUUID()
		const entry = await repository.joinBookingWaitlist(f.buyer.session.id, key, { listingId: f.listing.id, selection })
		expect(entry).toMatchObject({ state: 'waiting', reserved: false })
		expect(await repository.joinBookingWaitlist(f.buyer.session.id, key, { listingId: f.listing.id, selection })).toMatchObject({ replayed: true })
		expect(await repository.notifyBookingWaitlists()).toBe(0)
		await repository.releaseBookingHold(f.buyer.session.id, randomUUID(), hold.holdId)
		expect(await repository.notifyBookingWaitlists()).toBe(1)
		expect(await other.notifyBookingWaitlists()).toBe(0)
		expect(await repository.db.bookingPayment.count({ where: { hold: { vendorId: f.vendor.id } } })).toBe(0)
		expect(await repository.db.staffAllocation.count({ where: { staff: { vendorId: f.vendor.id } } })).toBe(1)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: f.buyer.workspace.id, type: 'BookingWaitlistAvailable' } })).toBe(1)
		const stranger = await customer()
		await expect(repository.readBookingWaitlist(stranger.session.id, entry.waitlistId)).rejects.toBeInstanceOf(AccessDeniedError)
		expect(await repository.readBookingWaitlist(f.buyer.session.id, entry.waitlistId, randomUUID())).toMatchObject({ state: 'removed', reserved: false })
	})
	it('accept and consent withdrawal races end cancelled with one full refund and no active capacity', async () => {
		const f = await prepared(true)
		const proposal = await repository.proposeBookingSubstitution(f.owner.session.id, randomUUID(), f.bookingId, {
			expectedVersion: 1,
			replacementStaffId: f.hidden.id,
			reason: 'Replace',
		})
		await Promise.allSettled([
			repository.decideBookingSubstitution(f.buyer.session.id, randomUUID(), proposal.proposalId, { decision: 'accept' }),
			other.decideBookingSubstitution(f.buyer.session.id, randomUUID(), proposal.proposalId, { decision: 'withdraw' }),
		])
		expect((await repository.readBooking(f.buyer.session.id, f.bookingId)).state).toBe('cancelled')
		expect(await repository.db.bookingRefund.count({ where: { paymentId: f.payment.paymentId } })).toBe(1)
		expect(await repository.db.staffAllocation.count({ where: { staff: { vendorId: f.vendor.id }, state: 'booked' } })).toBe(0)
	})
	it('Customer amendment invalidates pending Vendor proposal without spending disruption allowance', async () => {
		const f = await prepared(true)
		const proposal = await repository.proposeBookingSubstitution(f.owner.session.id, randomUUID(), f.bookingId, {
			expectedVersion: 1,
			replacementStaffId: f.hidden.id,
			reason: 'Replace',
		})
		await repository.amendBooking(f.buyer.session.id, randomUUID(), f.bookingId, {
			expectedVersion: 1,
			selection: { ...f.command, staffId: f.linked.id, start: '2026-10-12T11:00:00Z' },
			extraPaymentOutcome: 'succeeded',
		})
		expect((await repository.readBookingSubstitution(f.buyer.session.id, proposal.proposalId)).state).toBe('withdrawn')
		await expect(
			repository.decideBookingSubstitution(f.buyer.session.id, randomUUID(), proposal.proposalId, { decision: 'accept' }),
		).rejects.toBeInstanceOf(BookingHoldConflictError)
		expect((await repository.readBooking(f.buyer.session.id, f.bookingId)).customerAmendments).toBe(1)
	})
	it('unanswered named proposal at appointment start cancels and refunds without assumed consent', async () => {
		const f = await prepared(true)
		const proposal = await repository.proposeBookingSubstitution(f.owner.session.id, randomUUID(), f.bookingId, {
			expectedVersion: 1,
			replacementStaffId: f.hidden.id,
			reason: 'Replace',
		})
		now = new Date(f.command.start)
		expect(await repository.expireBookingSubstitutions()).toBeGreaterThanOrEqual(1)
		expect(await other.expireBookingSubstitutions()).toBe(0)
		expect((await repository.readBookingSubstitution(f.buyer.session.id, proposal.proposalId)).state).toBe('withdrawn')
		await repository.reconcileBookingRefunds()
		expect(await repository.readBookingPayment(f.buyer.session.id, f.payment.paymentId)).toMatchObject({ state: 'refunded', refundedCents: 1000 })
	})
})
