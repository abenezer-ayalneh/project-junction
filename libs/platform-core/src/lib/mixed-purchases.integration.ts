/* eslint-disable @typescript-eslint/no-non-null-assertion -- integration requires a loopback DATABASE_URL */
import { randomBytes, randomUUID } from 'node:crypto'

import { GoodsCustomerPickupReadSchema, type MixedCartSelection } from 'contracts'

import { AccessDeniedError } from './access.js'
import { GoodsCheckoutConflictError } from './goods-checkout.js'
import { IdempotencyConflictError } from './idempotency.js'
import { LocalMixedPaymentAdapter, type MixedProviderEvent } from './local-mixed-payment.js'
import { PostgresFoundation } from './postgres-foundation.js'
const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('Phase 04 mixed Purchase split PostgreSQL', () => {
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
	async function remaining(listingId: string, locationId: string) {
		const b = await repository.db.inventoryMovement.aggregate({ where: { listingId, locationId }, _sum: { onHandDelta: true, reservedDelta: true } })
		return { onHand: b._sum.onHandDelta ?? 0, reserved: b._sum.reservedDelta ?? 0 }
	}
	async function checkout(promoted = false) {
		const c = await customer(),
			v = await vendor(),
			p = promoted ? await campaign() : null
		const q = await prepared(c, { ...v.selection, promotions: { vendorCouponId: null, platformCampaignId: p?.promotionId ?? null } }),
			h = await hold(c.session.id, q.quoteId)
		const payment = await repository.startMixedPayment(c.session.id, randomUUID(), { holdId: h.holdId })
		return { c, v, p, q, h, payment }
	}
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
	async function cash(id: string) {
		return repository.db.ledgerTransaction.findMany({ where: { sourceId: id }, include: { postings: true }, orderBy: { createdAt: 'asc' } })
	}
	test('verified payment creates one mixed Purchase, independent Orders/Bookings and balanced scoped postings', async () => {
		const c = await customer(),
			a = await vendor(),
			b = await vendor(),
			promotion = await campaign()
		const q = await prepared(c, {
				goodsGroups: [...a.selection.goodsGroups, ...b.selection.goodsGroups],
				bookings: [...a.selection.bookings, ...b.selection.bookings],
				promotions: { vendorCouponId: null, platformCampaignId: promotion.promotionId },
			}),
			h = await hold(c.session.id, q.quoteId),
			p = await repository.startMixedPayment(c.session.id, randomUUID(), { holdId: h.holdId })
		await receive(await event(p.paymentId))
		const result = await repository.readMixedPayment(c.session.id, p.paymentId)
		expect(result.purchaseId).not.toBeNull()
		const purchase = await repository.readMixedPurchase(c.session.id, result.purchaseId!)
		expect(purchase.orders).toHaveLength(2)
		expect(purchase.bookings).toHaveLength(2)
		expect(purchase.receipt).toMatchObject({ kind: 'non_tax_platform_receipt', taxCalculated: false, snapshot: q.snapshot })
		expect(await repository.db.goodsPaymentAttempt.count()).toBe(0)
		expect(await repository.db.bookingPayment.count()).toBe(0)
		expect((await remaining(a.product.id, a.location.id)).reserved).toBe(0)
		expect((await remaining(a.product.id, a.location.id)).onHand).toBe(19)
		expect(await repository.db.staffAllocation.count({ where: { mixedIntent: { holdId: h.holdId }, state: 'booked' } })).toBe(2)
		expect((await repository.db.promotionReservation.findFirstOrThrow({ where: { holdRef: h.holdId } })).state).toBe('consumed')
		for (const t of await repository.db.ledgerTransaction.findMany({ include: { postings: true } }))
			expect(t.postings.reduce((s, p) => s + p.minorUnits, 0n)).toBe(0n)
		expect(JSON.stringify(purchase)).not.toContain(a.linked.id)
	})
	test('duplicate delivery and worker/read races create one Purchase and no double sale', async () => {
		const f = await checkout(),
			e = await event(f.payment.paymentId)
		await receive(e)
		await Promise.all([repository.reconcileMixedPayments(), other.readMixedPayment(f.c.session.id, f.payment.paymentId)])
		await receive({ ...e, eventId: randomUUID() })
		await repository.reconcileMixedPayments()
		expect(await repository.db.mixedPurchase.count({ where: { paymentId: f.payment.paymentId } })).toBe(1)
		expect((await remaining(f.v.product.id, f.v.location.id)).onHand).toBe(19)
	})
	test('Vendor partial goods cancellation refunds original funding and preserves independent Booking', async () => {
		const f = await checkout(true)
		await receive(await event(f.payment.paymentId))
		const paid = await repository.readMixedPayment(f.c.session.id, f.payment.paymentId),
			purchase = await repository.readMixedPurchase(f.c.session.id, paid.purchaseId!)
		const order = purchase.orders[0]
		const cancellation = await repository.cancelGoodsOrder(
			f.v.owner.session.id,
			randomUUID(),
			order.orderId,
			{ note: 'Controlled unavailable item', lines: [{ lineId: order.lines[0].lineId, quantity: 1, stockDisposition: 'restock' }] },
			'vendor',
		)
		expect(cancellation.itemRefundCents).toBe(order.lines[0].funding.customerMinorUnits)
		await repository.reconcileMixedComponentRefunds()
		const refreshed = await repository.readMixedPurchase(f.c.session.id, purchase.purchaseId)
		expect(refreshed.orders[0].state).toBe('cancelled')
		expect(refreshed.bookings[0].state).toBe('confirmed')
		expect((await remaining(f.v.product.id, f.v.location.id)).onHand).toBe(20)
		expect((await repository.db.goodsRefundOperation.findUniqueOrThrow({ where: { id: cancellation.refund.refundId } })).state).toBe('succeeded')
	})
	test('one Booking cancellation frees only its Staff and leaves paid goods intact', async () => {
		const f = await checkout(true)
		await receive(await event(f.payment.paymentId))
		const p = await repository.readMixedPayment(f.c.session.id, f.payment.paymentId),
			purchase = await repository.readMixedPurchase(f.c.session.id, p.purchaseId!)
		const booking = purchase.bookings[0]
		await repository.cancelBooking(
			f.v.owner.session.id,
			randomUUID(),
			booking.bookingId,
			{ expectedVersion: 1, reason: 'Controlled provider cancellation' },
			true,
		)
		await repository.reconcileMixedComponentRefunds()
		const read = await repository.readMixedPurchase(f.c.session.id, purchase.purchaseId)
		expect(read.bookings[0].state).toBe('cancelled')
		expect(read.orders[0].state).toBe('confirmed')
		expect((await remaining(f.v.product.id, f.v.location.id)).onHand).toBe(19)
		expect(await repository.db.staffAllocation.count({ where: { mixedIntent: { holdId: f.h.holdId }, state: 'booked' } })).toBe(0)
	})
	test('unknown and unverified browser outcomes cannot create a Purchase', async () => {
		const f = await checkout()
		expect(await repository.db.mixedPurchase.count({ where: { paymentId: f.payment.paymentId } })).toBe(0)
		await repository.simulateMixedPayment(f.c.session.id, randomUUID(), f.payment.paymentId, { outcome: 'unknown' })
		await repository.reconcileMixedPayments()
		expect(await repository.db.mixedPurchase.count({ where: { paymentId: f.payment.paymentId } })).toBe(0)
	})
	test('success at expiry compensates without any downstream commercial rows', async () => {
		const f = await checkout()
		now = new Date(f.h.expiresAt)
		await receive(await event(f.payment.paymentId))
		await repository.reconcileMixedPayments()
		expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).state).toBe('refund_pending')
		expect(await repository.db.mixedPurchase.count({ where: { paymentId: f.payment.paymentId } })).toBe(0)
		await repository.reconcileMixedRefunds()
		expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).state).toBe('refunded')
	})
	test('timely durable receipt delayed beyond wall-clock expiry commits while resources remain held', async () => {
		const f = await checkout(true)
		now = new Date(new Date(f.h.expiresAt).getTime() - 1000)
		await receive(await event(f.payment.paymentId))
		now = new Date(new Date(f.h.expiresAt).getTime() + 1000)
		await repository.expireMixedHolds()
		const read = await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)
		expect(read.purchaseId).not.toBeNull()
		expect(read.holdState).toBe('committed')
		expect(await repository.db.mixedPaymentRefund.count({ where: { paymentId: f.payment.paymentId } })).toBe(0)
	})
	test('a failure after one Order rolls back capture, all children, stock and funding; inbox retry succeeds', async () => {
		const f = await checkout(true),
			e = await event(f.payment.paymentId)
		await receive(e)
		await repository.db.$executeRawUnsafe(
			`CREATE FUNCTION fail_c06_booking() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected Booking commitment failure'; END $$`,
		)
		await repository.db.$executeRawUnsafe(`CREATE TRIGGER fail_c06_booking BEFORE INSERT ON bookings FOR EACH ROW EXECUTE FUNCTION fail_c06_booking()`)
		try {
			await expect(repository.reconcileMixedPayments()).rejects.toThrow('Injected Booking commitment failure')
			expect(await repository.db.mixedPurchase.count({ where: { paymentId: f.payment.paymentId } })).toBe(0)
			expect(await cash(f.payment.paymentId)).toHaveLength(0)
			expect((await remaining(f.v.product.id, f.v.location.id)).onHand).toBe(20)
			expect((await remaining(f.v.product.id, f.v.location.id)).reserved).toBe(1)
			expect((await repository.db.promotionReservation.findFirstOrThrow({ where: { holdRef: f.h.holdId } })).state).toBe('reserved')
		} finally {
			await repository.db.$executeRawUnsafe('DROP TRIGGER fail_c06_booking ON bookings')
			await repository.db.$executeRawUnsafe('DROP FUNCTION fail_c06_booking()')
		}
		await repository.reconcileMixedPayments()
		expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).purchaseId).not.toBeNull()
	})
	test('Purchase and external invoice access are scoped, replayable and immutable', async () => {
		const f = await checkout()
		await receive(await event(f.payment.paymentId))
		const p = await repository.readMixedPayment(f.c.session.id, f.payment.paymentId),
			stranger = await customer()
		await expect(repository.readMixedPurchase(stranger.session.id, p.purchaseId!)).rejects.toThrow(AccessDeniedError)
		await expect(repository.readMixedPurchase(undefined, p.purchaseId!)).rejects.toThrow(AccessDeniedError)
		const key = randomUUID(),
			body = { invoiceNumber: 'VENDOR-001', documentUrl: 'https://example.invalid/invoice.pdf' }
		const invoice = await repository.attachMixedInvoice(f.v.owner.session.id, key, p.purchaseId!, body)
		expect((await repository.attachMixedInvoice(f.v.owner.session.id, key, p.purchaseId!, body)).replayed).toBe(true)
		await expect(repository.attachMixedInvoice(f.v.owner.session.id, key, p.purchaseId!, { ...body, invoiceNumber: 'changed' })).rejects.toThrow(
			IdempotencyConflictError,
		)
		await expect(repository.attachMixedInvoice(f.c.session.id, randomUUID(), p.purchaseId!, body)).rejects.toThrow(AccessDeniedError)
		await expect(
			repository.attachMixedInvoice(f.v.owner.session.id, randomUUID(), p.purchaseId!, { ...body, documentUrl: 'http://example.invalid/doc' }),
		).rejects.toThrow()
		await expect(repository.db.mixedExternalInvoice.update({ where: { id: invoice.invoiceId }, data: { invoiceNumber: 'edited' } })).rejects.toThrow(
			'immutable',
		)
		expect((await repository.readMixedPurchase(f.c.session.id, p.purchaseId!)).invoices).toHaveLength(1)
	})
	test('committed hold cannot be abandoned, resurrected or given another component payment', async () => {
		const f = await checkout()
		await receive(await event(f.payment.paymentId))
		const p = await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)
		await expect(repository.releaseMixedHold(f.c.session.id, randomUUID(), f.h.holdId)).rejects.toThrow(GoodsCheckoutConflictError)
		const purchase = await repository.db.mixedPurchase.findUniqueOrThrow({ where: { id: p.purchaseId! }, include: { goods: true, bookings: true } })
		await expect(repository.db.mixedPurchase.update({ where: { id: purchase.id }, data: { snapshot: {} } })).rejects.toThrow('immutable')
		await expect(repository.db.goodsPaymentAttempt.create({ data: { holdId: purchase.goods!.holdId, amountCents: 1, createdAt: now } })).rejects.toThrow(
			'one payment',
		)
		await expect(repository.db.$executeRaw`TRUNCATE mixed_purchases CASCADE`).rejects.toThrow()
	})
	test('success after release refunds the charge and never reclaims sold/Staff resources', async () => {
		const f = await checkout()
		await repository.releaseMixedHold(f.c.session.id, randomUUID(), f.h.holdId)
		await receive(await event(f.payment.paymentId))
		await repository.reconcileMixedPayments()
		expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).purchaseId).toBeNull()
		await repository.reconcileMixedRefunds()
		expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).state).toBe('refunded')
		expect((await remaining(f.v.product.id, f.v.location.id)).onHand).toBe(20)
	})
	test('zero-payable full subsidy commits without another charge or cash ledger', async () => {
		const c = await customer(),
			v = await vendor(),
			f = await customer()
		await repository.db.platformFinanceGrant.create({
			data: {
				userId: f.user.id,
				workspaceId: f.workspace.id,
				expiresAt: new Date(Date.now() + 3600000),
				grantedBy: 'C06 fixture',
				reason: 'Full controlled funding',
			},
		})
		const promo = await repository.publishPlatformCampaign(f.session.id, randomUUID(), {
			definition: {
				code: `ZERO_${randomUUID().slice(0, 12)}`,
				validFrom: '2026-10-12T00:00:00Z',
				validUntil: '2026-10-13T00:00:00Z',
				scope: { kinds: ['goods', 'booking'], listingIds: [] },
				rule: { kind: 'percentage', basisPoints: 10000, maximumMinorUnits: null },
				minimumMinorUnits: 0,
				usageLimit: null,
				perCustomerLimit: null,
				refundFundingRule: 'proportional_original_allocations',
			},
			vendorIds: [],
			budget: { minorUnits: 10000, currency: 'ETB' },
			reason: 'Controlled zero charge',
		})
		const q = await prepared(c, { ...v.selection, promotions: { vendorCouponId: null, platformCampaignId: promo.promotionId } }),
			h = await hold(c.session.id, q.quoteId),
			p = await repository.startMixedPayment(c.session.id, randomUUID(), { holdId: h.holdId })
		expect(p.state).toBe('no_payment_required')
		expect(p.purchaseId).not.toBeNull()
		expect(await repository.db.providerInboxEvent.count({ where: { provider: 'local-mixed-payment', workspaceId: c.workspace.id } })).toBe(0)
		expect(await cash(p.paymentId)).toHaveLength(0)
		expect((await repository.readMixedPurchase(c.session.id, p.purchaseId!)).bookings).toHaveLength(1)
	})
	test('existing Booking rescheduling and price amendments keep one Purchase with balanced addendum funding', async () => {
		const c = await customer(),
			v = await vendor()
		const selection = {
			...v.selection,
			bookings: v.selection.bookings.map((b) => ({ ...b, selection: { ...b.selection, start: '2026-10-19T09:15:00Z' } })),
		}
		const q = await prepared(c, selection),
			h = await hold(c.session.id, q.quoteId),
			p = await repository.startMixedPayment(c.session.id, randomUUID(), { holdId: h.holdId })
		await receive(await event(p.paymentId))
		const paid = await repository.readMixedPayment(c.session.id, p.paymentId),
			purchase = await repository.readMixedPurchase(c.session.id, paid.purchaseId!)
		const b = purchase.bookings[0]
		const base = {
			listingId: v.service.id,
			optionId: v.option.id,
			addonIds: [v.option.addons[0].id],
			mode: 'in_person',
			locationId: v.location.id,
			staffId: null,
			start: '2026-10-19T10:15:00Z',
			expectedConfigurationVersion: 1,
			expectedRulesVersion: 1,
		}
		const added = await repository.amendBooking(c.session.id, randomUUID(), b.bookingId, {
			expectedVersion: 1,
			selection: base,
			extraPaymentOutcome: 'succeeded',
		})
		expect(added.deltaCents).toBe(500)
		expect(await repository.db.mixedAdditionalCapture.count({ where: { sourceId: added.amendmentId } })).toBe(1)
		const reduced = await repository.amendBooking(c.session.id, randomUUID(), b.bookingId, {
			expectedVersion: 2,
			selection: { ...base, addonIds: [], start: '2026-10-19T11:15:00Z' },
			extraPaymentOutcome: 'succeeded',
		})
		expect(reduced.deltaCents).toBe(-500)
		await repository.reconcileMixedComponentRefunds()
		await repository.cancelBooking(c.session.id, randomUUID(), b.bookingId, { expectedVersion: 3, reason: 'Controlled independent cancellation' })
		await repository.reconcileMixedComponentRefunds()
		const read = await repository.readMixedPurchase(c.session.id, purchase.purchaseId)
		expect(read.bookings[0].state).toBe('cancelled')
		expect(read.orders[0].state).toBe('confirmed')
		expect(read.receipt.snapshot).toEqual(q.snapshot)
		for (const t of await repository.db.ledgerTransaction.findMany({ include: { postings: true } }))
			expect(t.postings.reduce((sum, p) => sum + p.minorUnits, 0n)).toBe(0n)
	})
	test('disjoint partial goods refunds exhaust original rounded units once and preserve another Vendor', async () => {
		const c = await customer(),
			a = await vendor(),
			b = await vendor(),
			promo = await campaign()
		const goods = [
			{ ...a.selection.goodsGroups[0], lines: a.selection.goodsGroups[0].lines.map((l) => ({ ...l, quantity: 3 })) },
			...b.selection.goodsGroups,
		]
		const q = await prepared(c, { goodsGroups: goods, bookings: [], promotions: { vendorCouponId: null, platformCampaignId: promo.promotionId } }),
			h = await hold(c.session.id, q.quoteId),
			p = await repository.startMixedPayment(c.session.id, randomUUID(), { holdId: h.holdId })
		await receive(await event(p.paymentId))
		const paid = await repository.readMixedPayment(c.session.id, p.paymentId),
			purchase = await repository.readMixedPurchase(c.session.id, paid.purchaseId!)
		const order = purchase.orders.find((o) => o.vendorId === a.vendor.id)!,
			line = order.lines[0]
		let returned = 0
		for (const quantity of [1, 2]) {
			const result = await repository.cancelGoodsOrder(a.owner.session.id, randomUUID(), order.orderId, {
				note: 'Controlled partial quantity failure',
				lines: [{ lineId: line.lineId, quantity, stockDisposition: 'restock' }],
			})
			returned += result.itemRefundCents
			await repository.reconcileMixedComponentRefunds()
		}
		expect(returned).toBe(line.funding.customerMinorUnits)
		const read = await repository.readMixedPurchase(c.session.id, purchase.purchaseId)
		expect(read.orders.find((o) => o.vendorId === b.vendor.id)!.state).toBe('confirmed')
		expect((await remaining(a.product.id, a.location.id)).onHand).toBe(20)
		await expect(
			repository.cancelGoodsOrder(a.owner.session.id, randomUUID(), order.orderId, {
				note: 'Cannot refund again',
				lines: [{ lineId: line.lineId, quantity: 1, stockDisposition: 'restock' }],
			}),
		).rejects.toThrow()
	})
	test('current publication withdrawal compensates capture without partial commitment', async () => {
		const f = await checkout()
		await repository.db.listing.update({ where: { id: f.v.product.id }, data: { state: 'draft' } })
		await receive(await event(f.payment.paymentId))
		const paid = await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)
		expect(paid.purchaseId).toBeNull()
		expect(paid.state).toBe('refund_pending')
		await repository.reconcileMixedRefunds()
		expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).state).toBe('refunded')
		expect((await remaining(f.v.product.id, f.v.location.id)).reserved).toBe(0)
	})
	test('raw refund identity, acknowledgement without exact postings and history truncation are denied', async () => {
		const f = await checkout(true)
		await receive(await event(f.payment.paymentId))
		const paid = await repository.readMixedPayment(f.c.session.id, f.payment.paymentId),
			purchase = await repository.readMixedPurchase(f.c.session.id, paid.purchaseId!),
			order = purchase.orders[0]
		await repository.cancelGoodsOrder(f.v.owner.session.id, randomUUID(), order.orderId, {
			note: 'Controlled original-funded cancellation',
			lines: [{ lineId: order.lines[0].lineId, quantity: 1, stockDisposition: 'restock' }],
		})
		const allocation = await repository.db.mixedCommerceAllocation.findUniqueOrThrow({ where: { goodsOrderLineId: order.lines[0].lineId } })
		const funding = await repository.db.mixedRefundFunding.findFirstOrThrow({ where: { allocationId: allocation.id } })
		await expect(repository.db.mixedRefundFunding.update({ where: { id: funding.id }, data: { id: randomUUID() } })).rejects.toThrow('immutable')
		await expect(repository.db.mixedRefundFunding.update({ where: { id: funding.id }, data: { providerReference: 'unbacked-refund' } })).rejects.toThrow(
			'postings',
		)
		await expect(repository.db.$executeRaw`TRUNCATE mixed_refund_funding CASCADE`).rejects.toThrow()
		await repository.reconcileMixedComponentRefunds()
		const completed = await repository.db.mixedRefundFunding.findUniqueOrThrow({ where: { id: funding.id } })
		expect(completed.providerReference).not.toBeNull()
		expect(completed.ledgerId).not.toBeNull()
	})
	test('mixed goods pickup and inspected return preserve independent Booking attendance and original receipt', async () => {
		process.env['JUNCTION_GOODS_HANDOFF_SECRET'] = secret
		process.env['JUNCTION_BOOKING_ATTENDANCE_SECRET'] = secret
		const f = await checkout(true)
		await receive(await event(f.payment.paymentId))
		const paid = await repository.readMixedPayment(f.c.session.id, f.payment.paymentId),
			purchase = await repository.readMixedPurchase(f.c.session.id, paid.purchaseId!),
			order = purchase.orders[0],
			booking = purchase.bookings[0]
		const fulfillment = await repository.readGoodsFulfillment(f.v.owner.session.id, order.orderId)
		await repository.prepareGoodsFulfillment(f.v.owner.session.id, randomUUID(), fulfillment.fulfillmentId)
		await repository.readyGoodsPickup(f.v.owner.session.id, randomUUID(), fulfillment.fulfillmentId)
		const ready = GoodsCustomerPickupReadSchema.parse(await repository.readGoodsFulfillment(f.c.session.id, order.orderId, true))
		await repository.collectGoodsPickup(f.v.owner.session.id, randomUUID(), fulfillment.fulfillmentId, {
			proof: { method: 'code', code: ready.collectionProof!.code },
		})
		const submitted = await repository.submitGoodsReturn(f.c.session.id, randomUUID(), order.orderId, {
			lineId: order.lines[0].lineId,
			quantity: 1,
			reason: 'material_misdescription',
			unused: false,
			evidence: 'The handed-over item differs materially from its original description.',
		})
		for (const command of [
			{ action: 'approve', instructions: 'Return the goods to the original Location.' },
			{ action: 'ship', evidence: 'The Customer handed these goods to the carrier.' },
			{ action: 'receive', evidence: 'The exact approved goods were received.' },
			{ action: 'inspect', evidence: 'Every received unit was inspected.', stockDisposition: 'restock' },
			{ action: 'refund', evidence: 'The original funding is refunded after inspection.' },
		])
			await repository.actOnGoodsReturn(
				command.action === 'ship' ? f.c.session.id : f.v.owner.session.id,
				randomUUID(),
				submitted.returnId,
				command,
				command.action === 'ship' ? 'customer' : 'vendor',
			)
		await repository.reconcileMixedComponentRefunds()
		expect((await repository.readGoodsReturn(f.c.session.id, submitted.returnId, 'customer')).state).toBe('refunded')
		now = new Date(booking.snapshot.start)
		const proof = await repository.readBookingAttendanceProof(f.c.session.id, booking.bookingId)
		const completed = await repository.confirmBookingAttendance(f.v.owner.session.id, randomUUID(), booking.bookingId, {
			expectedVersion: 1,
			method: 'code',
			proof: proof.code,
			confirmed: true,
		})
		expect(completed.state).toBe('completed')
		const read = await repository.readMixedPurchase(f.c.session.id, purchase.purchaseId)
		expect(read.bookings[0].state).toBe('completed')
		expect(read.receipt.snapshot).toEqual(f.q.snapshot)
		expect(read.refundedMinorUnits).toBe(order.lines[0].funding.customerMinorUnits)
	})
	test('five online appointments commit independently and one Join plus Staff confirmation preserves the other four', async () => {
		process.env['JUNCTION_BOOKING_ATTENDANCE_SECRET'] = secret
		const c = await customer(),
			v = await vendor()
		const bookings = Array.from({ length: 5 }, (_, index) => ({
			...v.selection.bookings[0],
			intentId: randomUUID(),
			selection: {
				...v.selection.bookings[0].selection,
				mode: 'online' as const,
				locationId: null,
				start: new Date(Date.parse('2026-10-12T09:15:00Z') + index * 45 * 60000).toISOString(),
			},
		}))
		const q = await prepared(c, { goodsGroups: [], bookings }),
			h = await hold(c.session.id, q.quoteId),
			p = await repository.startMixedPayment(c.session.id, randomUUID(), { holdId: h.holdId })
		await receive(await event(p.paymentId))
		const paid = await repository.readMixedPayment(c.session.id, p.paymentId),
			purchase = await repository.readMixedPurchase(c.session.id, paid.purchaseId!)
		expect(purchase.orders).toHaveLength(0)
		expect(purchase.bookings).toHaveLength(5)
		await repository.reconcileBookingMeetings()
		const b = purchase.bookings.find((b) => b.snapshot.start === bookings[0].selection.start)!
		now = new Date(b.snapshot.start)
		await repository.joinBooking(c.session.id, randomUUID(), b.bookingId, { expectedVersion: 1 })
		await repository.confirmBookingAttendance(v.owner.session.id, randomUUID(), b.bookingId, { expectedVersion: 1, method: 'online', confirmed: true })
		const read = await repository.readMixedPurchase(c.session.id, purchase.purchaseId)
		expect(read.bookings.filter((b) => b.state === 'completed')).toHaveLength(1)
		expect(read.bookings.filter((b) => b.state === 'confirmed')).toHaveLength(4)
		expect(await repository.db.bookingPayment.count({ where: { hold: { vendorId: v.vendor.id } } })).toBe(0)
	})
	test('full goods-group cancellation refunds the original delivery fee without affecting Booking funding', async () => {
		const c = await customer(),
			v = await vendor(),
			promo = await campaign()
		const q = await prepared(c, {
				...v.selection,
				promotions: { vendorCouponId: null, platformCampaignId: promo.promotionId },
				goodsGroups: [
					{
						...v.selection.goodsGroups[0],
						fulfillment: {
							method: 'delivery',
							zoneId: v.zone.id,
							address: { contactName: 'Customer', phone: '0911000000', locality: 'City', address: 'Original gate', point: [41.5, 9.5] },
						},
					},
				],
			}),
			h = await hold(c.session.id, q.quoteId),
			p = await repository.startMixedPayment(c.session.id, randomUUID(), { holdId: h.holdId })
		await receive(await event(p.paymentId))
		const paid = await repository.readMixedPayment(c.session.id, p.paymentId),
			purchase = await repository.readMixedPurchase(c.session.id, paid.purchaseId!),
			order = purchase.orders[0]
		const refund = await repository.cancelGoodsOrder(v.owner.session.id, randomUUID(), order.orderId, {
			note: 'Controlled full delivery-group cancellation',
			lines: [{ lineId: order.lines[0].lineId, quantity: 1, stockDisposition: 'restock' }],
		})
		expect(refund.deliveryRefundCents).toBe(200)
		await repository.reconcileMixedComponentRefunds()
		const read = await repository.readMixedPurchase(c.session.id, purchase.purchaseId)
		expect(read.refundedMinorUnits).toBe(order.lines[0].funding.customerMinorUnits + 200)
		expect(read.bookings[0].state).toBe('confirmed')
		expect(read.pendingRefundMinorUnits).toBe(0)
	})
	test('unknown component refund and competing workers retry one source without changing another component', async () => {
		const f = await checkout(true)
		await receive(await event(f.payment.paymentId))
		const paid = await repository.readMixedPayment(f.c.session.id, f.payment.paymentId),
			purchase = await repository.readMixedPurchase(f.c.session.id, paid.purchaseId!),
			order = purchase.orders[0]
		await repository.cancelGoodsOrder(f.v.owner.session.id, randomUUID(), order.orderId, {
			note: 'Controlled scoped refund retry',
			lines: [{ lineId: order.lines[0].lineId, quantity: 1, stockDisposition: 'restock' }],
		})
		const retry = jest.spyOn(adapter, 'refund').mockResolvedValue({ state: 'unknown', reference: '' })
		await repository.reconcileMixedComponentRefunds()
		const pending = await repository.readMixedPurchase(f.c.session.id, purchase.purchaseId)
		expect(pending.refundedMinorUnits).toBe(0)
		expect(pending.pendingRefundMinorUnits).toBe(order.lines[0].funding.customerMinorUnits)
		retry.mockRestore()
		await Promise.all([repository.reconcileMixedComponentRefunds(), other.reconcileMixedComponentRefunds()])
		const funding = await repository.db.mixedRefundFunding.findMany({ where: { allocation: { purchaseId: purchase.purchaseId } } })
		expect(funding).toHaveLength(1)
		expect(await repository.db.ledgerTransaction.count({ where: { economicEventId: `mixed-component-refund:${funding[0].id}` } })).toBe(1)
		const read = await repository.readMixedPurchase(f.c.session.id, purchase.purchaseId)
		expect(read.refundedMinorUnits).toBe(order.lines[0].funding.customerMinorUnits)
		expect(read.bookings[0].state).toBe('confirmed')
	})
})
