/* eslint-disable @typescript-eslint/no-non-null-assertion -- integration requires a loopback DATABASE_URL */
import { randomUUID } from 'node:crypto'

import { type BookingHoldCommand } from 'contracts'

import { AccessDeniedError } from './access.js'
import { BookingHoldConflictError } from './booking-holds.js'
import { PostgresFoundation } from './postgres-foundation.js'

const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('Phase 03 attendance and contest PostgreSQL', () => {
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
		process.env['JUNCTION_BOOKING_ATTENDANCE_SECRET'] = 'disposable-local-booking-attendance-secret-123456'
		now = new Date('2026-10-11T00:00:00Z')
		repository = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, undefined, undefined, undefined, () => new Date(now))
		other = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, undefined, undefined, undefined, () => new Date(now))
	})
	afterEach(async () => {
		await Promise.all([repository.close(), other.close()])
	})

	async function paid(online = false) {
		const f = await fixture()
		const hold = await repository.createBookingHold(f.buyer.session.id, randomUUID(), {
			...f.command,
			...(online ? { mode: 'online', locationId: null } : {}),
		})
		const payment = await repository.startBookingPayment(f.buyer.session.id, randomUUID(), { holdId: hold.holdId })
		const result = await repository.recordLocalBookingPaymentResult(f.buyer.session.id, randomUUID(), payment.paymentId, { outcome: 'succeeded' })
		if (online) await repository.reconcileBookingMeetings()
		now = new Date(f.command.start)
		return { ...f, hold, payment, bookingId: result.bookingId! }
	}
	for (const method of ['code', 'qr'])
		it(`in-person ${method} plus assigned Staff completes once with 48-hour contest`, async () => {
			const f = await paid(),
				proof = await repository.readBookingAttendanceProof(f.buyer.session.id, f.bookingId),
				key = randomUUID()
			const command = { expectedVersion: 1, method, proof: method === 'qr' ? proof.qrPayload : proof.code, confirmed: true }
			const result = await repository.confirmBookingAttendance(f.owner.session.id, key, f.bookingId, command)
			expect(result.state).toBe('completed')
			expect(await other.confirmBookingAttendance(f.owner.session.id, key, f.bookingId, command)).toMatchObject({ replayed: true })
			const read = await repository.readBookingAttendance(f.buyer.session.id, f.bookingId)
			expect(read).toMatchObject({
				state: 'completed',
				contestUntil: new Date(now.getTime() + 48 * 3600000).toISOString(),
				earningAvailableAt: new Date(now.getTime() + 48 * 3600000).toISOString(),
				earningPosting: 'phase04_pending',
			})
			await expect(repository.confirmBookingAttendance(f.owner.session.id, randomUUID(), f.bookingId, command)).rejects.toBeInstanceOf(
				BookingHoldConflictError,
			)
		})
	it('incorrect code is persisted, never completes and Customer cannot act as Staff', async () => {
		const f = await paid(),
			proof = await repository.readBookingAttendanceProof(f.buyer.session.id, f.bookingId)
		const wrong = proof.code === '000000' ? '111111' : '000000'
		expect(
			await repository.confirmBookingAttendance(f.owner.session.id, randomUUID(), f.bookingId, {
				expectedVersion: 1,
				method: 'code',
				proof: wrong,
				confirmed: true,
			}),
		).toMatchObject({ state: 'proof_rejected', proofAttempts: 1 })
		await expect(
			repository.confirmBookingAttendance(f.buyer.session.id, randomUUID(), f.bookingId, {
				expectedVersion: 1,
				method: 'code',
				proof: proof.code,
				confirmed: true,
			}),
		).rejects.toBeInstanceOf(AccessDeniedError)
		expect((await repository.readBookingAttendance(f.buyer.session.id, f.bookingId)).completedAt).toBeNull()
	})
	it('online completion requires Junction join plus Staff and joined Customers cannot be reported absent', async () => {
		const f = await paid(true)
		await expect(
			repository.confirmBookingAttendance(f.owner.session.id, randomUUID(), f.bookingId, { expectedVersion: 1, method: 'online', confirmed: true }),
		).rejects.toBeInstanceOf(BookingHoldConflictError)
		expect(await repository.joinBooking(f.buyer.session.id, randomUUID(), f.bookingId, { expectedVersion: 1 })).toMatchObject({ bookingId: f.bookingId })
		now = new Date(new Date(f.command.start).getTime() + 30 * 60000)
		await expect(
			repository.reportBookingNoShow(f.owner.session.id, randomUUID(), f.bookingId, {
				expectedVersion: 1,
				reason: 'customer_absent',
				waitedUntil: now.toISOString(),
				contactAttempts: [f.command.start],
				note: 'Customer absent',
			}),
		).rejects.toBeInstanceOf(BookingHoldConflictError)
		expect(
			(
				await repository.confirmBookingAttendance(f.owner.session.id, randomUUID(), f.bookingId, {
					expectedVersion: 1,
					method: 'online',
					confirmed: true,
				})
			).state,
		).toBe('completed')
	})
	it('no-show stays contestable; contest freezes only this Booking earning seam', async () => {
		const f = await paid()
		now = new Date(new Date(f.command.start).getTime() + 30 * 60000)
		const report = await repository.reportBookingNoShow(f.owner.session.id, randomUUID(), f.bookingId, {
			expectedVersion: 1,
			reason: 'customer_absent',
			waitedUntil: now.toISOString(),
			contactAttempts: [f.command.start],
			note: 'Customer absent after contact',
		})
		expect(report).toMatchObject({ state: 'no_show_reported', earningAvailableAt: null })
		const contest = await repository.contestBookingAttendance(f.buyer.session.id, randomUUID(), f.bookingId, { expectedVersion: 2, reason: 'I attended' })
		expect(contest).toMatchObject({ state: 'contested', earningAvailableAt: null })
		now = new Date(now.getTime() + 49 * 3600000)
		await repository.finalizeBookingNoShows()
		expect((await repository.readBookingAttendance(f.buyer.session.id, f.bookingId)).state).toBe('contested')
	})
	it('exact no-show contest expiry finalizes once then delays earning another 48 hours', async () => {
		const f = await paid()
		now = new Date(new Date(f.command.start).getTime() + 30 * 60000)
		const report = await repository.reportBookingNoShow(f.owner.session.id, randomUUID(), f.bookingId, {
			expectedVersion: 1,
			reason: 'customer_absent',
			waitedUntil: now.toISOString(),
			contactAttempts: [f.command.start],
			note: 'Customer absent after contact',
		})
		now = new Date(report.contestUntil!)
		await expect(
			repository.contestBookingAttendance(f.buyer.session.id, randomUUID(), f.bookingId, { expectedVersion: 2, reason: 'Late' }),
		).rejects.toBeInstanceOf(BookingHoldConflictError)
		await repository.finalizeBookingNoShows()
		expect(await other.finalizeBookingNoShows()).toBe(0)
		expect(await repository.readBookingAttendance(f.buyer.session.id, f.bookingId)).toMatchObject({
			state: 'no_show_final',
			earningAvailableAt: new Date(now.getTime() + 48 * 3600000).toISOString(),
		})
	})
	it('five rejected attempts require Customer proof rotation and old codes remain invalid', async () => {
		const f = await paid(),
			proof = await repository.readBookingAttendanceProof(f.buyer.session.id, f.bookingId)
		const wrong = proof.code === '000000' ? '111111' : '000000'
		for (let n = 1; n <= 5; n++)
			expect(
				await repository.confirmBookingAttendance(f.owner.session.id, randomUUID(), f.bookingId, {
					expectedVersion: 1,
					method: 'code',
					proof: wrong,
					confirmed: true,
				}),
			).toMatchObject({ state: 'proof_rejected', proofAttempts: n })
		expect(
			(
				await repository.confirmBookingAttendance(f.owner.session.id, randomUUID(), f.bookingId, {
					expectedVersion: 1,
					method: 'code',
					proof: proof.code,
					confirmed: true,
				})
			).state,
		).toBe('proof_rejected')
		const rotated = await repository.readBookingAttendanceProof(f.buyer.session.id, f.bookingId)
		expect(
			(
				await repository.confirmBookingAttendance(f.owner.session.id, randomUUID(), f.bookingId, {
					expectedVersion: 1,
					method: 'qr',
					proof: rotated.qrPayload,
					confirmed: true,
				})
			).state,
		).toBe('completed')
	})
	it('future, stale and unscoped no-show evidence creates no report', async () => {
		const f = await paid(),
			stranger = await customer()
		const command = { expectedVersion: 1, reason: 'customer_absent', waitedUntil: now.toISOString(), contactAttempts: [f.command.start], note: 'Absent' }
		await expect(repository.reportBookingNoShow(f.owner.session.id, randomUUID(), f.bookingId, command)).rejects.toBeInstanceOf(BookingHoldConflictError)
		await expect(repository.reportBookingNoShow(stranger.session.id, randomUUID(), f.bookingId, command)).rejects.toBeInstanceOf(AccessDeniedError)
		now = new Date(new Date(f.command.start).getTime() + 30 * 60000)
		await expect(
			repository.reportBookingNoShow(f.owner.session.id, randomUUID(), f.bookingId, {
				...command,
				waitedUntil: new Date(now.getTime() + 1).toISOString(),
			}),
		).rejects.toBeInstanceOf(BookingHoldConflictError)
		expect((await repository.readBookingAttendance(f.buyer.session.id, f.bookingId)).noShowReportedAt).toBeNull()
	})
	it('completion contest removes earning eligibility and completion/no-show races commit one outcome', async () => {
		const f = await paid(),
			proof = await repository.readBookingAttendanceProof(f.buyer.session.id, f.bookingId)
		now = new Date(new Date(f.command.start).getTime() + 30 * 60000)
		const results = await Promise.allSettled([
			repository.confirmBookingAttendance(f.owner.session.id, randomUUID(), f.bookingId, {
				expectedVersion: 1,
				method: 'code',
				proof: proof.code,
				confirmed: true,
			}),
			other.reportBookingNoShow(f.owner.session.id, randomUUID(), f.bookingId, {
				expectedVersion: 1,
				reason: 'customer_absent',
				waitedUntil: now.toISOString(),
				contactAttempts: [f.command.start],
				note: 'Absent',
			}),
		])
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
		expect(
			await repository.contestBookingAttendance(f.buyer.session.id, randomUUID(), f.bookingId, { expectedVersion: 2, reason: 'Outcome disputed' }),
		).toMatchObject({ state: 'contested', earningAvailableAt: null })
	})
	it('expired proof and cross-Booking QR cannot complete another appointment', async () => {
		const f = await paid(),
			proof = await repository.readBookingAttendanceProof(f.buyer.session.id, f.bookingId)
		const wrongQr = JSON.stringify({ ...(JSON.parse(proof.qrPayload) as Record<string, unknown>), bookingId: randomUUID() })
		expect(
			(
				await repository.confirmBookingAttendance(f.owner.session.id, randomUUID(), f.bookingId, {
					expectedVersion: 1,
					method: 'qr',
					proof: wrongQr,
					confirmed: true,
				})
			).state,
		).toBe('proof_rejected')
		now = new Date(new Date(proof.expiresAt).getTime() + 1)
		expect(
			(
				await repository.confirmBookingAttendance(f.owner.session.id, randomUUID(), f.bookingId, {
					expectedVersion: 1,
					method: 'code',
					proof: proof.code,
					confirmed: true,
				})
			).state,
		).toBe('proof_rejected')
		expect((await repository.readBookingAttendance(f.buyer.session.id, f.bookingId)).completedAt).toBeNull()
	})
	it('late completion failure preserves proof and retries atomically', async () => {
		const f = await paid(),
			proof = await repository.readBookingAttendanceProof(f.buyer.session.id, f.bookingId),
			key = randomUUID(),
			command = { expectedVersion: 1, method: 'code', proof: proof.code, confirmed: true }
		await repository.db.$executeRawUnsafe(
			`CREATE FUNCTION fail_attendance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='BookingCompleted' THEN RAISE EXCEPTION 'Controlled attendance failure'; END IF; RETURN NEW; END; $$`,
		)
		await repository.db.$executeRawUnsafe(`CREATE TRIGGER fail_attendance BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION fail_attendance()`)
		try {
			await expect(repository.confirmBookingAttendance(f.owner.session.id, key, f.bookingId, command)).rejects.toThrow('Controlled attendance failure')
			expect((await repository.readBookingAttendance(f.buyer.session.id, f.bookingId)).completedAt).toBeNull()
		} finally {
			await repository.db.$executeRawUnsafe('DROP TRIGGER fail_attendance ON outbox_events')
			await repository.db.$executeRawUnsafe('DROP FUNCTION fail_attendance()')
		}
		expect(await repository.confirmBookingAttendance(f.owner.session.id, key, f.bookingId, command)).toMatchObject({ state: 'completed', replayed: false })
	})
	it('read-only iCal uses current terms and denies strangers without leaking attendee or Staff', async () => {
		const f = await paid(),
			stranger = await customer()
		const exported = await repository.exportBookingCalendar(f.buyer.session.id, f.bookingId)
		expect(exported).toContain(`UID:${f.bookingId}@junction\r\n`)
		expect(exported).toContain('CLASS:PRIVATE\r\n')
		expect(exported).not.toContain(f.linked.id)
		expect(exported).not.toContain('ATTENDEE:')
		await expect(repository.exportBookingCalendar(stranger.session.id, f.bookingId)).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.cancelBooking(f.owner.session.id, randomUUID(), f.bookingId, { expectedVersion: 1, reason: 'Cancel' }, true)
		expect(await repository.exportBookingCalendar(f.buyer.session.id, f.bookingId)).toContain('STATUS:CANCELLED\r\n')
	})
})
