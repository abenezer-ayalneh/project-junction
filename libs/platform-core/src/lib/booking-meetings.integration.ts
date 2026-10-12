/* eslint-disable @typescript-eslint/no-non-null-assertion -- integration requires a loopback DATABASE_URL */
import { randomUUID } from 'node:crypto'

import { type BookingHoldCommand } from 'contracts'

import { AccessDeniedError } from './access.js'
import { BookingHoldConflictError } from './booking-holds.js'
import { LocalMeetingProvider, type MeetingProviderRequest, type MeetingProviderResult } from './meeting-provider.js'
import { PostgresFoundation } from './postgres-foundation.js'

const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('Phase 03 meeting provisioning PostgreSQL', () => {
	let repository: PostgresFoundation
	let other: PostgresFoundation
	let now: Date
	let behavior: (request: MeetingProviderRequest) => Promise<MeetingProviderResult>
	let requests: MeetingProviderRequest[]
	const local = new LocalMeetingProvider()
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
		requests = []
		behavior = (request) => local.provision(request)
		const adapter = {
			provision: (request: MeetingProviderRequest) => {
				requests.push(request)
				return behavior(request)
			},
		}
		repository = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, undefined, undefined, undefined, () => new Date(now), undefined, adapter)
		other = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, undefined, undefined, undefined, () => new Date(now), undefined, adapter)
	})
	afterEach(async () => {
		await Promise.all([repository.close(), other.close()])
	})

	async function online(controlled = false) {
		const f = await fixture()
		if (controlled) await repository.configureLocalMeetConnection(f.owner.session.id, randomUUID(), f.linked.id, { expectedVersion: 0, connected: true })
		const hold = await repository.createBookingHold(f.buyer.session.id, randomUUID(), { ...f.command, mode: 'online', locationId: null })
		const payment = await repository.startBookingPayment(f.buyer.session.id, randomUUID(), { holdId: hold.holdId })
		const result = await repository.recordLocalBookingPaymentResult(f.buyer.session.id, randomUUID(), payment.paymentId, { outcome: 'succeeded' })
		return { ...f, hold, payment, bookingId: result.bookingId! }
	}
	it('unpaid holds never provision; paid DemoMeet is asynchronous, scoped and idempotent', async () => {
		const f = await fixture()
		await repository.createBookingHold(f.buyer.session.id, randomUUID(), { ...f.command, mode: 'online', locationId: null })
		await repository.reconcileBookingMeetings()
		expect(requests.filter((r) => r.staffId === f.linked.id)).toHaveLength(0)
		expect(await repository.db.bookingMeeting.count({ where: { booking: { hold: { vendorId: f.vendor.id } } } })).toBe(0)
		const paid = await online()
		expect(await repository.readBookingMeeting(paid.buyer.session.id, paid.bookingId)).toMatchObject({ state: 'pending', uri: null })
		await Promise.all([repository.reconcileBookingMeetings(), other.reconcileBookingMeetings()])
		const meeting = await repository.readBookingMeeting(paid.buyer.session.id, paid.bookingId)
		expect(meeting).toMatchObject({ state: 'ready', provider: 'demo_meet', attempts: 1 })
		expect(meeting.uri).toContain(`/demo-meet/bookings/${paid.bookingId}`)
		expect(requests.filter((r) => r.bookingId === paid.bookingId)).toHaveLength(1)
		const stranger = await customer()
		await expect(repository.readBookingMeeting(stranger.session.id, paid.bookingId)).rejects.toBeInstanceOf(AccessDeniedError)
		expect(JSON.stringify(meeting)).not.toContain(paid.linked.id)
	})
	it('controlled assigned-Staff provider binds the exact connection and never exposes it', async () => {
		const f = await online(true)
		await repository.reconcileBookingMeetings()
		const connection = await repository.db.staffMeetConnection.findUniqueOrThrow({ where: { staffId: f.linked.id } })
		const request = requests.find((r) => r.bookingId === f.bookingId)
		expect(request?.staffId).toBe(f.linked.id)
		expect(request?.connectionReference).toBe(connection.privateReference)
		const read = await repository.readBookingMeeting(f.buyer.session.id, f.bookingId)
		expect(read).toMatchObject({ state: 'ready', provider: 'controlled_google_meet' })
		expect(read.uri).toMatch(/^https:\/\/meet.google.com\//)
		expect(JSON.stringify(read)).not.toContain(connection.privateReference)
		await expect(
			repository.configureLocalMeetConnection(f.buyer.session.id, randomUUID(), f.linked.id, { expectedVersion: 1, connected: false }),
		).rejects.toBeInstanceOf(AccessDeniedError)
	})
	it('timeout retries the same semantic operation and recovers without duplicate references', async () => {
		const f = await online(true)
		behavior = (request) => (request.bookingId === f.bookingId ? new Promise<MeetingProviderResult>(() => undefined) : local.provision(request))
		await repository.reconcileBookingMeetings()
		expect(await repository.readBookingMeeting(f.buyer.session.id, f.bookingId)).toMatchObject({
			state: 'retry_scheduled',
			lastError: 'timeout',
			uri: null,
		})
		now = new Date(now.getTime() + 60000)
		behavior = (request) => local.provision(request)
		await repository.reconcileBookingMeetings()
		expect(await repository.readBookingMeeting(f.buyer.session.id, f.bookingId)).toMatchObject({ state: 'ready', attempts: 2 })
		expect(new Set(requests.filter((r) => r.bookingId === f.bookingId).map((r) => r.operationKey)).size).toBe(1)
	})
	it('malformed or wrong-Staff provider responses are scrubbed and cannot become usable links', async () => {
		const f = await online(true)
		behavior = async (request) => ({ ...(await local.provision(request)), staffId: request.bookingId === f.bookingId ? randomUUID() : request.staffId })
		await repository.reconcileBookingMeetings()
		expect(await repository.readBookingMeeting(f.buyer.session.id, f.bookingId)).toMatchObject({
			state: 'retry_scheduled',
			lastError: 'invalid_response',
			uri: null,
		})
	})
	it('bounded provider failure permits protected Owner replacement before the cutoff', async () => {
		const f = await online(true)
		behavior = (request) => (request.bookingId === f.bookingId ? Promise.reject(new Error('private-provider-secret')) : local.provision(request))
		for (let count = 0; count < 3; count++) {
			await repository.reconcileBookingMeetings()
			now = new Date(now.getTime() + 60000)
		}
		const failed = await repository.readBookingMeeting(f.buyer.session.id, f.bookingId)
		expect(failed).toMatchObject({ state: 'replacement_required', attempts: 3, lastError: 'provider_failure', uri: null })
		expect(JSON.stringify(failed)).not.toContain('private-provider-secret')
		const key = randomUUID(),
			command = { expectedVersion: 1, kind: 'demo_meet', reason: 'Protected local replacement' }
		const replacement = await repository.replaceBookingMeeting(f.owner.session.id, key, f.bookingId, command)
		expect(replacement).toMatchObject({ state: 'ready', manualReplacement: true, provider: 'demo_meet' })
		expect(await repository.replaceBookingMeeting(f.owner.session.id, key, f.bookingId, command)).toMatchObject({ replayed: true })
		now = new Date(new Date(f.command.start).getTime() - 15 * 60000)
		await repository.reconcileBookingMeetings()
		expect((await repository.readBooking(f.buyer.session.id, f.bookingId)).state).toBe('confirmed')
	})
	it('exact safety cutoff auto-cancels and fully refunds with Platform audit authority', async () => {
		const f = await online(true)
		behavior = (request) => (request.bookingId === f.bookingId ? Promise.reject(new Error('failure')) : local.provision(request))
		await repository.reconcileBookingMeetings()
		now = new Date(new Date(f.command.start).getTime() - 15 * 60000)
		await repository.reconcileBookingMeetings()
		expect(await repository.readBookingMeeting(f.buyer.session.id, f.bookingId)).toMatchObject({ state: 'booking_cancelled', uri: null })
		await repository.reconcileBookingRefunds()
		expect(await repository.readBookingPayment(f.buyer.session.id, f.payment.paymentId)).toMatchObject({ state: 'refunded', refundedCents: 1000 })
		expect(await repository.db.bookingCancellation.findUniqueOrThrow({ where: { bookingId: f.bookingId } })).toMatchObject({
			actorKind: 'platform',
			actorId: null,
		})
		await expect(
			repository.replaceBookingMeeting(f.owner.session.id, randomUUID(), f.bookingId, { expectedVersion: 1, kind: 'demo_meet', reason: 'Late' }),
		).rejects.toBeInstanceOf(BookingHoldConflictError)
	})
	it('connection withdrawal hides a ready URI immediately and requires recovery or refund', async () => {
		const f = await online(true)
		await repository.reconcileBookingMeetings()
		await repository.configureLocalMeetConnection(f.owner.session.id, randomUUID(), f.linked.id, { expectedVersion: 1, connected: false })
		expect(await repository.readBookingMeeting(f.buyer.session.id, f.bookingId)).toMatchObject({ state: 'pending', uri: null })
		await repository.reconcileBookingMeetings()
		expect(await repository.readBookingMeeting(f.buyer.session.id, f.bookingId)).toMatchObject({
			state: 'retry_scheduled',
			lastError: 'connection_unavailable',
			uri: null,
		})
	})
	it('late provider completion after cancellation never publishes a usable meeting', async () => {
		const f = await online(true)
		let entered: () => void = () => undefined,
			finish: (value: MeetingProviderResult) => void = () => undefined
		const started = new Promise<void>((resolve) => {
			entered = resolve
		})
		const blocked = new Promise<MeetingProviderResult>((resolve) => {
			finish = resolve
		})
		behavior = (request) => {
			if (request.bookingId !== f.bookingId) return local.provision(request)
			entered()
			return blocked
		}
		const working = repository.reconcileBookingMeetings()
		await started
		await other.cancelBooking(f.buyer.session.id, randomUUID(), f.bookingId, { expectedVersion: 1, reason: 'Cancel' })
		const request = requests.find((r) => r.bookingId === f.bookingId)!
		finish(await local.provision(request))
		await working
		expect(await repository.readBookingMeeting(f.buyer.session.id, f.bookingId)).toMatchObject({ state: 'booking_cancelled', uri: null })
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: f.buyer.workspace.id, type: 'BookingMeetingReady' } })).toBe(0)
	})
	it('expired worker lease recovers the same operation at its exact deadline', async () => {
		const f = await online(true),
			connection = await repository.db.staffMeetConnection.findUniqueOrThrow({ where: { staffId: f.linked.id } })
		await repository.db.bookingMeeting.create({
			data: {
				bookingId: f.bookingId,
				staffId: f.linked.id,
				bookingVersion: 1,
				operationKey: `meeting:${f.bookingId}:1:1`,
				provider: 'controlled_google_meet',
				connectionReference: connection.privateReference,
				connectionVersion: 1,
				state: 'provisioning',
				attempts: 1,
				leaseUntil: new Date(now.getTime() + 30000),
				safetyCutoffAt: new Date(new Date(f.command.start).getTime() - 15 * 60000),
			},
		})
		await repository.reconcileBookingMeetings()
		expect(requests.filter((r) => r.bookingId === f.bookingId)).toHaveLength(0)
		now = new Date(now.getTime() + 30000)
		await repository.reconcileBookingMeetings()
		expect(await repository.readBookingMeeting(f.buyer.session.id, f.bookingId)).toMatchObject({ state: 'ready', attempts: 2 })
		expect(requests.find((r) => r.bookingId === f.bookingId)?.operationKey).toBe(`meeting:${f.bookingId}:1:1`)
	})
	it('late response after amendment is discarded and a fresh Booking version provisions once', async () => {
		const f = await online(true)
		let entered: () => void = () => undefined,
			finish: (value: MeetingProviderResult) => void = () => undefined
		const started = new Promise<void>((resolve) => {
				entered = resolve
			}),
			blocked = new Promise<MeetingProviderResult>((resolve) => {
				finish = resolve
			})
		behavior = (request) => {
			if (request.bookingId !== f.bookingId) return local.provision(request)
			entered()
			return blocked
		}
		const working = repository.reconcileBookingMeetings()
		await started
		await other.amendBooking(f.buyer.session.id, randomUUID(), f.bookingId, {
			expectedVersion: 1,
			selection: { ...f.command, mode: 'online', locationId: null, start: '2026-10-12T11:00:00Z' },
			extraPaymentOutcome: 'succeeded',
		})
		const request = requests.find((r) => r.bookingId === f.bookingId)!,
			old = await local.provision(request)
		behavior = (request) => local.provision(request)
		finish(old)
		await working
		const read = await repository.readBookingMeeting(f.buyer.session.id, f.bookingId)
		expect(read).toMatchObject({ state: 'ready', bookingVersion: 2 })
		expect(read.uri).not.toBe(old.uri)
		expect(new Set(requests.filter((r) => r.bookingId === f.bookingId).map((r) => r.operationKey)).size).toBe(2)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: f.buyer.workspace.id, type: 'BookingMeetingReady' } })).toBe(1)
	})
	it('replacement requires scoped Owner authority and cannot accept a browser provider URI or token', async () => {
		const f = await online(true),
			stranger = await customer()
		await repository.reconcileBookingMeetings()
		const command = { expectedVersion: 1, kind: 'demo_meet', reason: 'Replace' }
		await expect(repository.replaceBookingMeeting(stranger.session.id, randomUUID(), f.bookingId, command)).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(
			repository.replaceBookingMeeting(f.owner.session.id, randomUUID(), f.bookingId, { ...command, uri: 'javascript:alert(1)' }),
		).rejects.toThrow()
		await repository.db.vendorMembership.updateMany({ where: { vendorId: f.vendor.id, userId: f.owner.user.id }, data: { role: 'vendor_staff' } })
		await repository.db.session.update({ where: { id: f.owner.session.id }, data: { activeRole: 'vendor_staff' } })
		await expect(repository.replaceBookingMeeting(f.owner.session.id, randomUUID(), f.bookingId, command)).rejects.toBeInstanceOf(AccessDeniedError)
	})
	it('withdrawn Staff membership hides provider links and requires safe recovery', async () => {
		const f = await online(true)
		await repository.reconcileBookingMeetings()
		await repository.db.vendorMembership.updateMany({ where: { vendorId: f.vendor.id, userId: f.owner.user.id }, data: { revokedAt: new Date() } })
		expect(await repository.readBookingMeeting(f.buyer.session.id, f.bookingId)).toMatchObject({ state: 'pending', uri: null })
		await repository.reconcileBookingMeetings()
		expect(await repository.readBookingMeeting(f.buyer.session.id, f.bookingId)).toMatchObject({
			state: 'retry_scheduled',
			lastError: 'connection_unavailable',
			uri: null,
		})
	})
})
