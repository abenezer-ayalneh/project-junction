/* eslint-disable @typescript-eslint/no-non-null-assertion -- integration requires a loopback DATABASE_URL */
import { randomBytes, randomUUID } from 'node:crypto'

import { GoodsCustomerDeliveryReadSchema, GoodsCustomerPickupReadSchema, type MixedCartSelection } from 'contracts'

import { AccessDeniedError } from './access.js'
import { LocalMixedPaymentAdapter, type MixedProviderEvent } from './local-mixed-payment.js'
import { PostgresFoundation } from './postgres-foundation.js'
const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('Phase 04 component earnings PostgreSQL', () => {
	let repository: PostgresFoundation
	let other: PostgresFoundation
	let adapter: LocalMixedPaymentAdapter
	const secret = randomBytes(32).toString('hex')
	let now: Date
	const clock = () => new Date(now)
	async function customer() {
		const workspace = await repository.db.workspace.create({ data: { kind: 'real' } })
		const user = await repository.db.user.create({
			data: { email: `${randomUUID()}@example.invalid`, adultVerificationState: 'verified', verifiedAt: new Date() },
		})
		const session = await repository.db.session.create({ data: { userId: user.id, workspaceId: workspace.id, expiresAt: new Date(Date.now() + 3600000) } })
		return { workspace, user, session }
	}
	async function vendor(twoStaff = false) {
		const owner = await customer()
		const vendor = await repository.db.vendor.create({
			data: {
				workspaceId: owner.workspace.id,
				applicationState: 'approved',
				publishedAt: new Date(),
				publicSlug: randomUUID(),
				displayName: 'Mixed quote Vendor',
			},
		})
		const location = await repository.db.location.create({ data: { vendorId: vendor.id, label: 'Shop', city: 'Test city' } })
		const membership = await repository.db.vendorMembership.create({
			data: { vendorId: vendor.id, userId: owner.user.id, role: 'vendor_owner', locationIds: [location.id] },
		})
		await repository.db.session.update({ where: { id: owner.session.id }, data: { activeVendorId: vendor.id, activeRole: 'vendor_owner' } })
		const product = await repository.createListing(owner.session.id, randomUUID(), {
			kind: 'product',
			category: 'goods',
			title: 'Mixed Product',
			description: 'Disposable quote Product.',
			priceCents: 1000,
		})
		await repository.db.listing.update({ where: { id: product.id }, data: { state: 'published' } })
		await repository.createInventoryMovement(owner.session.id, randomUUID(), {
			listingId: product.id,
			locationId: location.id,
			reason: 'received',
			quantityDelta: 20,
		})
		const zone = {
			id: randomUUID(),
			label: 'Local delivery',
			polygon: [
				[41, 9],
				[42, 9],
				[42, 10],
				[41, 10],
				[41, 9],
			],
			feeCents: 200,
			minimumCents: 1000,
			freeDeliveryThresholdCents: 3000,
			etaMinutes: 60,
		}
		await repository.configureGoodsLocation(owner.session.id, randomUUID(), location.id, {
			expectedVersion: 0,
			configuration: { pickupEnabled: true, returnTemplate: 'standard', deliveryZones: [zone] },
		})
		const linked = await repository.createStaffProfile(owner.session.id, randomUUID(), { displayName: 'Named Staff', memberUserId: owner.user.id })
		await repository.setStaffPublicConsent(owner.session.id, randomUUID(), linked.id, { expectedVersion: 1, publicDisplay: true })
		const hidden = twoStaff ? await repository.createStaffProfile(owner.session.id, randomUUID(), { displayName: 'Hidden Staff' }) : null
		const calendar = { timezone: 'UTC', weekly: [{ weekday: 1, hours: [{ startMinute: 540, endMinute: 1020 }], breaks: [] }], exceptions: [] }
		for (const staff of [linked, ...(hidden ? [hidden] : [])])
			await repository.configureStaffSchedule(owner.session.id, randomUUID(), staff.id, {
				expectedVersion: 0,
				schedule: {
					scopes: [
						{ mode: 'in_person', locationId: location.id, calendar },
						{ mode: 'online', locationId: null, calendar },
					],
				},
			})
		await repository.configureLocationSchedule(owner.session.id, randomUUID(), location.id, { expectedVersion: 0, calendar })
		const service = await repository.createListing(owner.session.id, randomUUID(), {
			kind: 'service',
			category: 'appointment',
			title: 'Mixed Service',
			description: 'Disposable quote Service.',
			priceCents: 1500,
			durationMinutes: 30,
		})
		const option = {
			id: randomUUID(),
			label: 'Fixed service',
			priceCents: 1500,
			durationMinutes: 30,
			bufferBeforeMinutes: 5,
			bufferAfterMinutes: 10,
			locationIds: [location.id],
			online: true,
			addons: [{ id: randomUUID(), label: 'Extra service', priceCents: 500, durationMinutes: 15 }],
			qualifications: [linked, ...(hidden ? [hidden] : [])].map((s) => ({ staffId: s.id, locationIds: [location.id], online: true })),
		}
		const configuration = { capacity: 'staff_only', options: [option] }
		await repository.configureService(owner.session.id, randomUUID(), service.id, { expectedVersion: 0, configuration, bookingPolicy: 'flexible' })
		await repository.configureServiceSchedulingRules(owner.session.id, randomUUID(), service.id, {
			expectedVersion: 0,
			rules: { timezone: 'UTC', leadTimeMinutes: 0, horizonDays: 30, slotIntervalMinutes: 15 },
		})
		await repository.db.listing.update({ where: { id: service.id }, data: { state: 'published' } })
		const selection: MixedCartSelection = {
			goodsGroups: [
				{
					vendorId: vendor.id,
					locationId: location.id,
					fulfillment: { method: 'pickup' },
					lines: [{ listingId: product.id, quantity: 1, expectedUnitPriceCents: 1000 }],
				},
			],
			bookings: [
				{
					intentId: randomUUID(),
					quantity: 1,
					expectedPriceCents: 1500,
					selection: {
						listingId: service.id,
						optionId: option.id,
						addonIds: [],
						mode: 'in_person',
						locationId: location.id,
						staffId: null,
						start: '2026-10-12T09:15:00Z',
						expectedConfigurationVersion: 1,
						expectedRulesVersion: 1,
					},
				},
			],
		}
		return { owner, vendor, location, membership, product, service, linked, hidden, option, configuration, zone, selection }
	}
	beforeEach(async () => {
		now = new Date('2026-10-12T08:00:00Z')
		adapter = new LocalMixedPaymentAdapter(secret)
		repository = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, undefined, undefined, undefined, clock, undefined, undefined, adapter)
		other = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, undefined, undefined, undefined, clock, undefined, undefined, adapter)
		// Mixed hold fixtures explicitly configure their controlled zero-rate
		// policy; production does not infer a commission when none was published.
		if (!(await repository.db.commissionRate.findFirst({ where: { vendorId: null, effectiveFrom: { lte: now } } }))) {
			const control = await customer()
			await repository.db.platformFinanceGrant.create({
				data: {
					userId: control.user.id,
					workspaceId: control.workspace.id,
					expiresAt: new Date(Date.now() + 3600000),
					grantedBy: 'C02 control fixture',
					reason: 'Controlled quote regression policy',
				},
			})
			await repository.publishCommissionRate(control.session.id, randomUUID(), {
				vendorId: null,
				basisPoints: 0,
				effectiveFrom: '2026-10-12T00:00:00Z',
				effectiveUntil: null,
				reason: 'Explicit zero-rate regression fixture',
			})
		}
	})
	afterEach(async () => {
		await Promise.all([repository.close(), other.close()])
	})
	async function save(sessionId: string, selection: MixedCartSelection, expectedVersion = 0, key = randomUUID()) {
		return repository.writeMixedCart(sessionId, key, { expectedVersion, selection })
	}
	async function quote(sessionId: string, cart: { cartId: string | null; version: number }, key = randomUUID()) {
		return repository.createMixedQuote(sessionId, key, { cartId: cart.cartId!, expectedVersion: cart.version })
	}
	async function campaign(amount = 1000) {
		const f = await customer()
		await repository.db.platformFinanceGrant.create({
			data: {
				userId: f.user.id,
				workspaceId: f.workspace.id,
				expiresAt: new Date(Date.now() + 3600000),
				grantedBy: 'C04 fixture',
				reason: 'Controlled configuration',
			},
		})
		return repository.publishPlatformCampaign(f.session.id, randomUUID(), {
			definition: {
				code: `C_${randomUUID().slice(0, 12)}`,
				validFrom: '2026-10-12T00:00:00Z',
				validUntil: '2026-10-13T00:00:00Z',
				scope: { kinds: ['goods', 'booking'], listingIds: [] },
				rule: { kind: 'fixed', minorUnits: 100 },
				minimumMinorUnits: 0,
				usageLimit: null,
				perCustomerLimit: null,
				refundFundingRule: 'proportional_original_allocations',
			},
			vendorIds: [],
			budget: { minorUnits: amount, currency: 'ETB' },
			reason: 'C04 controlled campaign',
		})
	}
	async function prepared(c: Awaited<ReturnType<typeof customer>>, selection: MixedCartSelection) {
		const old = await repository.readMixedCart(c.session.id)
		const cart = await save(c.session.id, selection, old.version)
		return quote(c.session.id, cart)
	}
	const hold = (sessionId: string, quoteId: string, key = randomUUID(), repo = repository) => repo.createMixedHold(sessionId, key, { quoteId })
	async function event(id: string, outcome: MixedProviderEvent['outcome'] = 'succeeded', changes: Partial<MixedProviderEvent> = {}) {
		const p = await repository.db.mixedPaymentAttempt.findUniqueOrThrow({ where: { id } })
		return {
			...{
				eventId: randomUUID(),
				paymentId: p.id,
				workspaceId: p.workspaceId,
				reference: p.providerReference,
				merchant: 'junction' as const,
				environment: 'local-controlled' as const,
				amount: { minorUnits: Number(p.amountMinorUnits), currency: 'ETB' as const },
				outcome,
				occurredAt: now.toISOString(),
			},
			...changes,
		}
	}
	async function receive(e: unknown, repo = repository) {
		const raw = Buffer.from(JSON.stringify(e))
		return repo.receiveMixedPaymentWebhook(raw, adapter.sign(raw, now))
	}
	async function paid(quantity = 1, days = 7, promoted = false, future = false, delivery = false) {
		process.env['JUNCTION_GOODS_HANDOFF_SECRET'] = secret
		process.env['JUNCTION_BOOKING_ATTENDANCE_SECRET'] = secret
		const c = await customer(),
			v = await vendor()
		if (days === 14)
			await repository.configureGoodsLocation(v.owner.session.id, randomUUID(), v.location.id, {
				expectedVersion: 1,
				configuration: { pickupEnabled: true, returnTemplate: 'flexible', deliveryZones: [] },
			})
		const promotion = promoted ? await campaign() : null
		const q = await prepared(c, {
			...v.selection,
			bookings: future ? v.selection.bookings.map((b) => ({ ...b, selection: { ...b.selection, start: '2026-10-19T09:15:00Z' } })) : v.selection.bookings,
			promotions: { vendorCouponId: null, platformCampaignId: promotion?.promotionId ?? null },
			goodsGroups: [
				{
					...v.selection.goodsGroups[0],
					fulfillment: delivery
						? {
								method: 'delivery',
								zoneId: v.zone.id,
								address: { contactName: 'Customer', phone: '0911000000', locality: 'Test city', address: 'Original gate', point: [41.5, 9.5] },
							}
						: { method: 'pickup' },
					lines: [{ ...v.selection.goodsGroups[0].lines[0], quantity }],
				},
			],
		})
		const h = await hold(c.session.id, q.quoteId),
			payment = await repository.startMixedPayment(c.session.id, randomUUID(), { holdId: h.holdId })
		await receive(await event(payment.paymentId))
		const result = await repository.readMixedPayment(c.session.id, payment.paymentId)
		const purchase = await repository.readMixedPurchase(c.session.id, result.purchaseId!)
		return { c, v, purchase, order: purchase.orders[0], booking: purchase.bookings[0] }
	}
	async function goodsHandoff(f: Awaited<ReturnType<typeof paid>>) {
		const fulfillment = await repository.readGoodsFulfillment(f.v.owner.session.id, f.order.orderId)
		await repository.prepareGoodsFulfillment(f.v.owner.session.id, randomUUID(), fulfillment.fulfillmentId)
		await repository.readyGoodsPickup(f.v.owner.session.id, randomUUID(), fulfillment.fulfillmentId)
		const ready = GoodsCustomerPickupReadSchema.parse(await repository.readGoodsFulfillment(f.c.session.id, f.order.orderId, true))
		await repository.collectGoodsPickup(f.v.owner.session.id, randomUUID(), fulfillment.fulfillmentId, {
			proof: { method: 'code', code: ready.collectionProof!.code },
		})
	}
	async function bookingComplete(f: Awaited<ReturnType<typeof paid>>) {
		now = new Date(f.booking.snapshot.start)
		const proof = await repository.readBookingAttendanceProof(f.c.session.id, f.booking.bookingId)
		now = new Date(f.booking.snapshot.end)
		await repository.confirmBookingAttendance(f.v.owner.session.id, randomUUID(), f.booking.bookingId, {
			expectedVersion: 1,
			method: 'code',
			proof: proof.code,
			confirmed: true,
		})
	}
	async function amounts(f: Awaited<ReturnType<typeof paid>>, kind: 'goods' | 'booking' = 'goods') {
		const read = await repository.readVendorEarnings(f.v.owner.session.id)
		return read.lots.find((a) => a.kind === kind)!.amounts
	}
	async function claim(f: Awaited<ReturnType<typeof paid>>, quantity = 1) {
		return repository.submitGoodsReturn(f.c.session.id, randomUUID(), f.order.orderId, {
			lineId: f.order.lines[0].lineId,
			quantity,
			reason: 'material_misdescription',
			unused: false,
			evidence: 'The received goods differ materially from their committed description.',
		})
	}
	test.each([7, 14])('goods release at the exact %i-day snapshotted handoff boundary', async (days) => {
		const f = await paid(1, days)
		expect((await amounts(f)).eligibleAt).toBeNull()
		await goodsHandoff(f)
		const deadline = new Date(now.getTime() + days * 86400000)
		now = new Date(deadline.getTime() - 1)
		expect(await amounts(f)).toMatchObject({ pending: 1000, available: 0, eligibleAt: deadline.toISOString() })
		now = deadline
		const ledgerBefore = await repository.db.ledgerTransaction.count()
		expect(await amounts(f)).toMatchObject({ pending: 0, available: 1000 })
		expect(await repository.db.ledgerTransaction.count()).toBe(ledgerBefore)
		const versions = await repository.db.earningRevision.count()
		await Promise.all([repository.releaseEarnings(), other.releaseEarnings(), repository.readVendorEarnings(f.v.owner.session.id)])
		expect(await repository.db.earningRevision.count()).toBe(versions)
	})
	test('payment date alone never releases goods or uncompleted Booking earnings', async () => {
		const f = await paid()
		now = new Date(now.getTime() + 31 * 86400000)
		expect(await amounts(f)).toMatchObject({ pending: 1000, available: 0 })
		expect(await amounts(f, 'booking')).toMatchObject({ pending: 1500, available: 0 })
	})
	test('Booking releases at exact 48 hours after completion, goods remain pending', async () => {
		const f = await paid()
		await bookingComplete(f)
		const deadline = new Date(now.getTime() + 48 * 3600000)
		now = new Date(deadline.getTime() - 1)
		expect((await amounts(f, 'booking')).available).toBe(0)
		now = deadline
		expect(await amounts(f, 'booking')).toMatchObject({ pending: 0, available: 1500 })
		expect((await amounts(f)).pending).toBe(1000)
	})
	test('Customer contest atomically freezes only that Booking and survives worker/read races', async () => {
		const f = await paid()
		await goodsHandoff(f)
		await bookingComplete(f)
		await repository.contestBookingAttendance(f.c.session.id, randomUUID(), f.booking.bookingId, {
			expectedVersion: 2,
			reason: 'The committed service was not delivered as described.',
		})
		expect(await amounts(f, 'booking')).toMatchObject({ frozen: 1500, available: 0, pending: 0 })
		now = new Date(now.getTime() + 8 * 86400000)
		await Promise.all([repository.releaseEarnings(), other.releaseEarnings()])
		expect((await amounts(f, 'booking')).frozen).toBe(1500)
		expect((await amounts(f)).available).toBe(1000)
	})
	test('no-show report alone cannot release and final no-show retains its authoritative delay', async () => {
		const f = await paid()
		now = new Date(f.booking.snapshot.end)
		await repository.reportBookingNoShow(f.v.owner.session.id, randomUUID(), f.booking.bookingId, {
			expectedVersion: 1,
			waitedUntil: now.toISOString(),
			contactAttempts: [now.toISOString()],
			reason: 'customer_absent',
			note: 'Staff waited until the end and attempted to contact the absent Customer.',
		})
		expect((await amounts(f, 'booking')).eligibleAt).toBeNull()
		now = new Date(now.getTime() + 48 * 3600000)
		await repository.finalizeBookingNoShows()
		const deadline = new Date(now.getTime() + 48 * 3600000)
		expect(await amounts(f, 'booking')).toMatchObject({ pending: 1500, eligibleAt: deadline.toISOString() })
		now = deadline
		expect((await amounts(f, 'booking')).available).toBe(1500)
	})
	test('one pending Return freezes one original unit and decline restores only that amount', async () => {
		const f = await paid(3)
		await goodsHandoff(f)
		const returned = await claim(f)
		expect(await amounts(f)).toMatchObject({ gross: 3000, pending: 2000, frozen: 1000 })
		now = new Date(now.getTime() + 7 * 86400000)
		expect(await amounts(f)).toMatchObject({ available: 2000, frozen: 1000 })
		await repository.actOnGoodsReturn(
			f.v.owner.session.id,
			randomUUID(),
			returned.returnId,
			{ action: 'decline', evidence: 'Evidence does not describe a fault in the received goods.' },
			'vendor',
		)
		expect(await amounts(f)).toMatchObject({ available: 3000, frozen: 0 })
	})
	test('late fault claim freezes available goods but leaves Booking available', async () => {
		const f = await paid(2)
		await goodsHandoff(f)
		await bookingComplete(f)
		now = new Date(now.getTime() + 8 * 86400000)
		expect((await amounts(f)).available).toBe(2000)
		await claim(f)
		expect(await amounts(f)).toMatchObject({ available: 1000, frozen: 1000 })
		expect((await amounts(f, 'booking')).available).toBe(1500)
	})
	test('pending refund immediately withholds selected original units and completion does not double deduct', async () => {
		const f = await paid(3)
		await repository.cancelGoodsOrder(f.v.owner.session.id, randomUUID(), f.order.orderId, {
			note: 'One unavailable unit is returned to stock.',
			lines: [{ lineId: f.order.lines[0].lineId, quantity: 1, stockDisposition: 'restock' }],
		})
		expect(await amounts(f)).toMatchObject({ gross: 3000, pending: 2000, refundPending: 1000, refunded: 0 })
		await Promise.all([repository.releaseEarnings(), repository.reconcileMixedComponentRefunds()])
		expect(await amounts(f)).toMatchObject({ pending: 2000, refundPending: 0, refunded: 1000 })
		expect((await amounts(f, 'booking')).pending).toBe(1500)
	})
	test('promotion-funded original unit rounding is retained in freezes and refunds', async () => {
		const f = await paid(3, 7, true)
		await goodsHandoff(f)
		await claim(f)
		const original = f.order.lines[0].funding
		expect((await amounts(f)).gross).toBe(original.vendorEarningMinorUnits)
		expect((await amounts(f)).frozen).toBe(original.unitSegments[0].vendorEarningUnitMinorUnits)
	})
	test('multiple cases freeze disjoint original units without changing independent Vendor scope', async () => {
		const f = await paid(3)
		await goodsHandoff(f)
		await claim(f)
		await claim(f)
		expect(await amounts(f)).toMatchObject({ pending: 1000, frozen: 2000 })
		expect((await amounts(f)).freezes).toHaveLength(2)
		const stranger = await vendor()
		expect((await repository.readVendorEarnings(stranger.owner.session.id)).lots).toEqual([])
	})
	test('availability read denies Customer, anonymous and revoked Owner; Location scope is preserved', async () => {
		const f = await paid()
		await expect(repository.readVendorEarnings(f.c.session.id)).rejects.toThrow(AccessDeniedError)
		await expect(repository.readVendorEarnings(undefined)).rejects.toThrow(AccessDeniedError)
		await repository.db.vendorMembership.update({ where: { id: f.v.membership.id }, data: { locationIds: [] } })
		expect((await repository.readVendorEarnings(f.v.owner.session.id)).lots).toEqual([])
		await repository.db.vendorMembership.update({ where: { id: f.v.membership.id }, data: { revokedAt: new Date() } })
		await expect(repository.readVendorEarnings(f.v.owner.session.id)).rejects.toThrow(AccessDeniedError)
	})
	test('raw forged availability, duplicate revisions, update, delete and truncate are rejected', async () => {
		const f = await paid(),
			lot = (await repository.readVendorEarnings(f.v.owner.session.id)).lots[0]
		const prior = await repository.db.earningRevision.findFirstOrThrow({ where: { allocationId: lot.allocationId }, orderBy: { version: 'desc' } })
		await expect(
			repository.db.earningRevision.create({
				data: {
					allocationId: lot.allocationId,
					version: prior.version + 1,
					observedAt: now,
					snapshot: { ...(prior.snapshot as object), pending: 0, available: lot.amounts.gross },
				},
			}),
		).rejects.toThrow('Earning revision')
		await expect(repository.db.earningRevision.update({ where: { id: prior.id }, data: { version: 99 } })).rejects.toThrow('immutable')
		await expect(repository.db.earningRevision.delete({ where: { id: prior.id } })).rejects.toThrow('immutable')
		await expect(repository.db.$executeRawUnsafe('TRUNCATE earning_revisions')).rejects.toThrow('immutable')
	})
	test('deadline release racing a timely contest cannot make the contested Booking available', async () => {
		const f = await paid()
		await bookingComplete(f)
		now = new Date(now.getTime() + 48 * 3600000 - 1)
		await Promise.all([
			other.releaseEarnings(),
			repository.contestBookingAttendance(f.c.session.id, randomUUID(), f.booking.bookingId, {
				expectedVersion: 2,
				reason: 'The service was materially incomplete; review is required.',
			}),
		])
		now = new Date(now.getTime() + 1)
		expect(await amounts(f, 'booking')).toMatchObject({ available: 0, frozen: 1500 })
	})
	test('at exact contest deadline a new contest is rejected while the earning releases', async () => {
		const f = await paid()
		await bookingComplete(f)
		now = new Date(now.getTime() + 48 * 3600000)
		await expect(
			repository.contestBookingAttendance(f.c.session.id, randomUUID(), f.booking.bookingId, {
				expectedVersion: 2,
				reason: 'This late report is outside the original contest window.',
			}),
		).rejects.toThrow('contest window')
		expect((await amounts(f, 'booking')).available).toBe(1500)
	})
	test('earning history failure rolls back the authoritative contest and its audit/outbox', async () => {
		const f = await paid()
		await bookingComplete(f)
		await repository.db.$executeRawUnsafe(
			`CREATE FUNCTION fail_c08_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF (NEW.snapshot->>'frozen')::bigint>0 THEN RAISE EXCEPTION 'Controlled earning failure'; END IF; RETURN NEW; END; $$`,
		)
		await repository.db.$executeRawUnsafe(
			'CREATE TRIGGER fail_c08_revision BEFORE INSERT ON earning_revisions FOR EACH ROW EXECUTE FUNCTION fail_c08_revision()',
		)
		try {
			await expect(
				repository.contestBookingAttendance(f.c.session.id, randomUUID(), f.booking.bookingId, {
					expectedVersion: 2,
					reason: 'The service requires review.',
				}),
			).rejects.toThrow('Controlled earning failure')
			expect((await repository.db.booking.findUniqueOrThrow({ where: { id: f.booking.bookingId } })).state).toBe('completed')
			expect((await repository.db.bookingAttendance.findUniqueOrThrow({ where: { bookingId: f.booking.bookingId } })).contestedAt).toBeNull()
		} finally {
			await repository.db.$executeRawUnsafe('DROP TRIGGER fail_c08_revision ON earning_revisions')
			await repository.db.$executeRawUnsafe('DROP FUNCTION fail_c08_revision()')
		}
	})
	test('a paid additive amendment joins the Booking lot and a full cancellation exhausts both sources', async () => {
		const f = await paid(1, 7, false, true)
		await repository.amendBooking(f.c.session.id, randomUUID(), f.booking.bookingId, {
			expectedVersion: 1,
			selection: { ...f.v.selection.bookings[0].selection, start: '2026-10-19T10:15:00Z', addonIds: [f.v.option.addons[0].id] },
			extraPaymentOutcome: 'succeeded',
		})
		expect(await amounts(f, 'booking')).toMatchObject({ gross: 2000, pending: 2000 })
		await repository.cancelBooking(f.c.session.id, randomUUID(), f.booking.bookingId, {
			expectedVersion: 2,
			reason: 'Cancel this independent appointment.',
		})
		expect(await amounts(f, 'booking')).toMatchObject({ pending: 0, available: 0, refundPending: 2000 })
		await repository.reconcileMixedComponentRefunds()
		expect(await amounts(f, 'booking')).toMatchObject({ gross: 2000, refunded: 2000, refundPending: 0 })
		expect((await amounts(f)).pending).toBe(1000)
	})

	test('delivery goods and fee release only after verified delivery and original line window', async () => {
		const f = await paid(2, 7, false, false, true)
		const read = await repository.readVendorEarnings(f.v.owner.session.id)
		expect(read.lots.find((l) => l.kind === 'delivery')!.amounts).toMatchObject({ pending: 200, available: 0 })
		const fulfillment = await repository.readGoodsFulfillment(f.v.owner.session.id, f.order.orderId)
		await repository.prepareGoodsFulfillment(f.v.owner.session.id, randomUUID(), fulfillment.fulfillmentId)
		await repository.deliveryMilestone(f.v.owner.session.id, randomUUID(), fulfillment.fulfillmentId, { action: 'dispatch' })
		const ready = GoodsCustomerDeliveryReadSchema.parse(await repository.readDelivery(f.c.session.id, fulfillment.fulfillmentId, true))
		await repository.deliveryHandoff(f.v.owner.session.id, randomUUID(), fulfillment.fulfillmentId, {
			proof: { method: 'code', code: ready.collectionProof!.code },
		})
		now = new Date(now.getTime() + 7 * 86400000)
		const released = await repository.readVendorEarnings(f.v.owner.session.id)
		expect(released.lots.find((l) => l.kind === 'delivery')!.amounts).toMatchObject({ available: 200, pending: 0 })
		expect(released.lots.find((l) => l.kind === 'goods')!.amounts.available).toBe(2000)
	})

	test('inspected Return converts its freeze to one pending refund atomically, then refunded', async () => {
		const f = await paid(2)
		await goodsHandoff(f)
		const returned = await claim(f)
		for (const command of [
			{ action: 'approve', instructions: 'Return the received item to the original Location.' },
			{ action: 'ship', evidence: 'The Customer handed the received item to the carrier.' },
			{ action: 'receive', evidence: 'The approved original item was received at the Location.' },
			{ action: 'inspect', evidence: 'The exact received unit was inspected.', stockDisposition: 'restock' },
			{ action: 'refund', evidence: 'Refund its original funding after verified inspection.' },
		])
			await repository.actOnGoodsReturn(
				command.action === 'ship' ? f.c.session.id : f.v.owner.session.id,
				randomUUID(),
				returned.returnId,
				command,
				command.action === 'ship' ? 'customer' : 'vendor',
			)
		expect(await amounts(f)).toMatchObject({ pending: 1000, frozen: 0, refundPending: 1000 })
		await repository.reconcileMixedComponentRefunds()
		expect(await amounts(f)).toMatchObject({ pending: 1000, frozen: 0, refundPending: 0, refunded: 1000 })
		expect((await amounts(f, 'booking')).pending).toBe(1500)
	})
})
