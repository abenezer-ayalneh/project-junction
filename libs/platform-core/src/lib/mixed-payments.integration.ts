/* eslint-disable @typescript-eslint/no-non-null-assertion -- integration requires a loopback DATABASE_URL */
import { randomBytes, randomUUID } from 'node:crypto'

import { type MixedCartSelection } from 'contracts'

import { AccessDeniedError } from './access.js'
import { GoodsCheckoutConflictError } from './goods-checkout.js'
import { IdempotencyConflictError } from './idempotency.js'
import { LocalMixedPaymentAdapter, type MixedProviderEvent } from './local-mixed-payment.js'
import { PostgresFoundation } from './postgres-foundation.js'
const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('Phase 04 mixed payment inbox PostgreSQL', () => {
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
		// C05 cash participant is verified in isolation. Production wiring commits through C06.
		for (const repo of [repository, other])
			jest.spyOn((repo as unknown as { mixedPurchases: { commit: () => Promise<unknown> } }).mixedPurchases, 'commit').mockResolvedValue(undefined)

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
	test('one replayable scoped attempt preserves original 15-minute deadline and accepts no browser amounts', async () => {
		const f = await checkout()
		expect(f.payment).toMatchObject({
			sandbox: true,
			provider: 'local-controlled',
			state: 'pending_provider',
			commitmentReady: false,
			expiresAt: f.h.expiresAt,
		})
		const p = await repository.db.mixedPaymentAttempt.findUniqueOrThrow({ where: { id: f.payment.paymentId } })
		expect(Number(p.amountMinorUnits)).toBe(f.q.snapshot.total!.minorUnits)
		await expect(repository.startMixedPayment(f.c.session.id, randomUUID(), { holdId: f.h.holdId, amount: 1 })).rejects.toThrow()
		await expect(other.startMixedPayment(f.c.session.id, randomUUID(), { holdId: f.h.holdId })).rejects.toThrow(GoodsCheckoutConflictError)
		const foreign = await customer()
		await expect(repository.readMixedPayment(foreign.session.id, p.id)).rejects.toThrow(AccessDeniedError)
		await expect(repository.readMixedPayment(undefined, p.id)).rejects.toThrow(AccessDeniedError)
		expect(await cash(p.id)).toHaveLength(0)
	})
	test('concurrent start replay is once-only and never resets expiry', async () => {
		const c = await customer(),
			v = await vendor(),
			q = await prepared(c, v.selection),
			h = await hold(c.session.id, q.quoteId),
			key = randomUUID()
		const replies = await Promise.all([
			repository.startMixedPayment(c.session.id, key, { holdId: h.holdId }),
			other.startMixedPayment(c.session.id, key, { holdId: h.holdId }),
		])
		expect(new Set(replies.map((p) => p.paymentId)).size).toBe(1)
		expect(replies.filter((p) => p.replayed)).toHaveLength(1)
		now = new Date(now.getTime() + 60000)
		expect((await repository.startMixedPayment(c.session.id, key, { holdId: h.holdId })).expiresAt).toBe(h.expiresAt)
		await expect(repository.startMixedPayment(c.session.id, key, { holdId: randomUUID() })).rejects.toThrow()
	})
	test('verified receipt is durable before reconciliation and posts capture once without a Purchase', async () => {
		const f = await checkout(true),
			e = await event(f.payment.paymentId)
		expect(await receive(e)).toEqual({ accepted: true, duplicate: false })
		expect(await cash(f.payment.paymentId)).toHaveLength(0)
		expect((await repository.db.mixedPaymentAttempt.findUniqueOrThrow({ where: { id: f.payment.paymentId } })).state).toBe('pending_provider')
		const read = await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)
		expect(read).toMatchObject({ state: 'succeeded', commitmentReady: true })
		const ledger = await cash(read.paymentId)
		expect(ledger).toHaveLength(1)
		expect(ledger[0].postings.reduce((s, p) => s + p.minorUnits, 0n)).toBe(0n)
		expect(ledger[0].postings.map((p) => p.account).sort()).toEqual(['customer_refund_liability', 'processor_clearing'])
		expect(await repository.db.goodsPurchase.count({ where: { customerId: f.c.user.id } })).toBe(0)
		expect((await remaining(f.v.product.id, f.v.location.id)).reserved).toBe(1)
		expect((await repository.db.promotionReservation.findFirstOrThrow({ where: { holdRef: f.h.holdId } })).state).toBe('reserved')
	})
	test('concurrent duplicate receipt and repeated success events do not duplicate capture', async () => {
		const f = await checkout(),
			e = await event(f.payment.paymentId)
		const replies = await Promise.all([receive(e), receive(e, other)])
		expect(replies.filter((r) => r.duplicate)).toHaveLength(1)
		await Promise.all([repository.reconcileMixedPayments(), other.reconcileMixedPayments()])
		await receive({ ...e, eventId: randomUUID() })
		await repository.reconcileMixedPayments()
		expect(await cash(f.payment.paymentId)).toHaveLength(1)
		expect(await repository.db.providerInboxEvent.count({ where: { provider: 'local-mixed-payment', providerReference: e.reference } })).toBe(2)
	})
	test('same event ID with different terms is retained as conflict and does not rewrite accepted receipt', async () => {
		const f = await checkout(),
			e = await event(f.payment.paymentId)
		await receive(e)
		expect(await receive({ ...e, outcome: 'failed' })).toMatchObject({ duplicate: true })
		await repository.reconcileMixedPayments()
		expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).state).toBe('succeeded')
		expect(
			await repository.db.providerInboxEvent.count({
				where: { provider: 'local-mixed-payment', reconciliationState: 'exception', payload: { path: ['conflictingEventId'], equals: e.eventId } },
			}),
		).toBe(1)
	})
	test('unsigned, tampered, stale and oversized bodies write no inbox or financial fact', async () => {
		const f = await checkout(),
			raw = Buffer.from(JSON.stringify(await event(f.payment.paymentId))),
			before = await repository.db.providerInboxEvent.count()
		await expect(repository.receiveMixedPaymentWebhook(raw, undefined)).rejects.toThrow(AccessDeniedError)
		await expect(repository.receiveMixedPaymentWebhook(Buffer.from(raw.toString().replace('succeeded', 'failed')), adapter.sign(raw, now))).rejects.toThrow(
			AccessDeniedError,
		)
		await expect(repository.receiveMixedPaymentWebhook(raw, adapter.sign(raw, new Date(now.getTime() - 301000)))).rejects.toThrow(AccessDeniedError)
		const large = Buffer.alloc(65537)
		await expect(repository.receiveMixedPaymentWebhook(large, adapter.sign(large, now))).rejects.toThrow(AccessDeniedError)
		expect(await repository.db.providerInboxEvent.count()).toBe(before)
		expect(await cash(f.payment.paymentId)).toHaveLength(0)
	})
	test('authenticated malformed and wrong scope/reference/environment/merchant/Money/future receipts are retained exceptions', async () => {
		const f = await checkout(),
			e = await event(f.payment.paymentId),
			foreign = await customer()
		for (const changes of [
			{ workspaceId: foreign.workspace.id },
			{ reference: 'wrong' },
			{ merchant: 'other' },
			{ environment: 'live' },
			{ amount: { minorUnits: 1, currency: 'ETB' } },
			{ amount: { minorUnits: e.amount.minorUnits, currency: 'USD' } },
			{ occurredAt: new Date(now.getTime() + 1).toISOString() },
			{ paymentId: randomUUID() },
			{ unexpected: true },
		])
			await receive({ ...e, eventId: randomUUID(), ...changes })
		const raw = Buffer.from('{bad')
		await repository.receiveMixedPaymentWebhook(raw, adapter.sign(raw, now))
		await repository.reconcileMixedPayments()
		expect(await cash(f.payment.paymentId)).toHaveLength(0)
		expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).state).toBe('pending_provider')
		expect(
			await repository.db.providerInboxEvent.count({
				where: { provider: 'local-mixed-payment', reconciliationState: 'exception', workspaceId: f.c.workspace.id },
			}),
		).toBeGreaterThanOrEqual(4)
	})
	test('timeout is unknown with one original attempt and later signed success recovers', async () => {
		const f = await checkout()
		now = new Date(now.getTime() + 30000)
		await repository.reconcileMixedPayments()
		expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).state).toBe('unknown')
		await expect(repository.startMixedPayment(f.c.session.id, randomUUID(), { holdId: f.h.holdId })).rejects.toThrow()
		await receive(await event(f.payment.paymentId))
		expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).state).toBe('succeeded')
		expect(await repository.db.mixedPaymentAttempt.count({ where: { holdId: f.h.holdId } })).toBe(1)
	})
	test('failure releases stock Staff and promotion; later success compensates without resurrecting the hold', async () => {
		const f = await checkout(true)
		await receive(await event(f.payment.paymentId, 'failed'))
		await repository.reconcileMixedPayments()
		expect((await repository.readMixedHold(f.c.session.id, f.h.holdId)).state).toBe('released')
		expect((await remaining(f.v.product.id, f.v.location.id)).reserved).toBe(0)
		expect(await repository.db.staffAllocation.count({ where: { mixedIntent: { holdId: f.h.holdId }, state: 'held' } })).toBe(0)
		await receive(await event(f.payment.paymentId))
		await repository.reconcileMixedPayments()
		expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).state).toBe('refund_pending')
		await repository.reconcileMixedRefunds()
		expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).state).toBe('refunded')
		expect(await cash(f.payment.paymentId)).toHaveLength(2)
		expect((await repository.db.promotionReservation.findFirstOrThrow({ where: { holdRef: f.h.holdId } })).state).toBe('released')
	})
	test('unknown and failure after capture cannot downgrade its monetary truth', async () => {
		const f = await checkout()
		await receive(await event(f.payment.paymentId))
		await repository.reconcileMixedPayments()
		await receive(await event(f.payment.paymentId, 'unknown'))
		await receive(await event(f.payment.paymentId, 'failed'))
		await repository.reconcileMixedPayments()
		expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).state).toBe('succeeded')
		expect(await cash(f.payment.paymentId)).toHaveLength(1)
		expect((await repository.readMixedHold(f.c.session.id, f.h.holdId)).state).toBe('holding')
	})
	test('success at exact expiry releases all participants and creates one full refund', async () => {
		const f = await checkout(true)
		now = new Date(f.h.expiresAt)
		await receive(await event(f.payment.paymentId))
		await Promise.all([repository.reconcileMixedPayments(), other.expireMixedHolds()])
		expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).state).toBe('refund_pending')
		expect((await remaining(f.v.product.id, f.v.location.id)).reserved).toBe(0)
		const r = await repository.db.mixedPaymentRefund.findUniqueOrThrow({ where: { paymentId: f.payment.paymentId } })
		expect(Number(r.amountMinorUnits)).toBe(f.payment.amount.minorUnits)
		await repository.reconcileMixedRefunds()
		expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).commitmentReady).toBe(false)
	})
	test('captured uncommitted payment is refunded when Customer releases or original hold expires', async () => {
		for (const expiry of [false, true]) {
			const f = await checkout(true)
			await receive(await event(f.payment.paymentId))
			await repository.reconcileMixedPayments()
			if (expiry) {
				now = new Date(f.h.expiresAt)
				await repository.expireMixedHolds()
			} else await repository.releaseMixedHold(f.c.session.id, randomUUID(), f.h.holdId)
			expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).state).toBe('refund_pending')
			await repository.reconcileMixedRefunds()
			expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).state).toBe('refunded')
			expect((await remaining(f.v.product.id, f.v.location.id)).onHand).toBe(20)
		}
	})
	test('release and provider success race cannot produce an unrefunded abandoned capture', async () => {
		const f = await checkout(),
			e = await event(f.payment.paymentId)
		await receive(e)
		await Promise.all([repository.releaseMixedHold(f.c.session.id, randomUUID(), f.h.holdId), other.reconcileMixedPayments()])
		await repository.reconcileMixedRefunds()
		expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).state).toBe('refunded')
		const entries = await cash(f.payment.paymentId)
		expect(entries).toHaveLength(2)
		expect(entries.flatMap((e) => e.postings).reduce((s, p) => s + p.minorUnits, 0n)).toBe(0n)
	})
	test('competing refund workers and duplicate success reverse one capture once', async () => {
		const f = await checkout()
		await repository.releaseMixedHold(f.c.session.id, randomUUID(), f.h.holdId)
		const e = await event(f.payment.paymentId)
		await receive(e)
		await repository.reconcileMixedPayments()
		await Promise.all([repository.reconcileMixedRefunds(), other.reconcileMixedRefunds()])
		await receive({ ...e, eventId: randomUUID() })
		await repository.reconcileMixedPayments()
		await repository.reconcileMixedRefunds()
		const entries = await cash(f.payment.paymentId)
		expect(entries).toHaveLength(2)
		expect(entries.filter((e) => e.reversalOf !== null)).toHaveLength(1)
		for (const account of ['processor_clearing', 'customer_refund_liability'])
			expect(
				entries
					.flatMap((e) => e.postings)
					.filter((p) => p.account === account)
					.reduce((sum, p) => sum + p.minorUnits, 0n),
			).toBe(0n)
		expect(await repository.db.mixedPaymentRefund.count({ where: { paymentId: f.payment.paymentId } })).toBe(1)
	})
	test('refund timeout retains operation identity and retries without extra economic entries', async () => {
		const calls: string[] = []
		class Uncertain extends LocalMixedPaymentAdapter {
			override async refund(r: {
				operationId: string
				paymentId: string
				amountMinorUnits: number
			}): Promise<{ state: 'completed' | 'unknown'; reference: string }> {
				calls.push(r.operationId)
				if (calls.length === 1) throw Error('Lost provider reply')
				if (calls.length === 2) return { state: 'unknown', reference: '' }
				return super.refund(r)
			}
		}
		await other.close()
		other = new PostgresFoundation(
			process.env['DATABASE_URL']!,
			undefined,
			undefined,
			undefined,
			undefined,
			clock,
			undefined,
			undefined,
			new Uncertain(secret),
		)
		jest.spyOn((other as unknown as { mixedPurchases: { commit: () => Promise<unknown> } }).mixedPurchases, 'commit').mockResolvedValue(undefined)
		const f = await checkout()
		await repository.releaseMixedHold(f.c.session.id, randomUUID(), f.h.holdId)
		await receive(await event(f.payment.paymentId))
		await repository.reconcileMixedPayments()
		await other.reconcileMixedRefunds()
		expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).refundState).toBe('unknown')
		expect(await cash(f.payment.paymentId)).toHaveLength(1)
		await other.reconcileMixedRefunds()
		await other.reconcileMixedRefunds()
		expect(new Set(calls).size).toBe(1)
		expect(await cash(f.payment.paymentId)).toHaveLength(2)
	})
	test('inbox survives failed capture transaction and replay recovers exactly once', async () => {
		const f = await checkout(),
			e = await event(f.payment.paymentId)
		await receive(e)
		await repository.db.$executeRawUnsafe(
			`CREATE FUNCTION fail_c05_capture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected capture failure'; END $$`,
		)
		await repository.db.$executeRawUnsafe(
			`CREATE TRIGGER fail_c05_capture BEFORE INSERT ON ledger_transactions FOR EACH ROW EXECUTE FUNCTION fail_c05_capture()`,
		)
		try {
			await expect(repository.reconcileMixedPayments()).rejects.toThrow('Injected capture failure')
			expect(await cash(f.payment.paymentId)).toHaveLength(0)
			expect(
				(
					await repository.db.providerInboxEvent.findUniqueOrThrow({
						where: { provider_providerEventId: { provider: 'local-mixed-payment', providerEventId: e.eventId } },
					})
				).reconciliationState,
			).toBe('pending')
		} finally {
			await repository.db.$executeRawUnsafe('DROP TRIGGER fail_c05_capture ON ledger_transactions')
			await repository.db.$executeRawUnsafe('DROP FUNCTION fail_c05_capture()')
		}
		await repository.reconcileMixedPayments()
		expect(await cash(f.payment.paymentId)).toHaveLength(1)
	})
	test('failed refund intent rolls back hold release, stock Staff budget and payment atomically', async () => {
		const f = await checkout(true)
		await receive(await event(f.payment.paymentId))
		await repository.reconcileMixedPayments()
		await repository.db.$executeRawUnsafe(
			`CREATE FUNCTION fail_c05_refund() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected refund intent failure'; END $$`,
		)
		await repository.db.$executeRawUnsafe(
			`CREATE TRIGGER fail_c05_refund BEFORE INSERT ON mixed_payment_refunds FOR EACH ROW EXECUTE FUNCTION fail_c05_refund()`,
		)
		try {
			await expect(repository.releaseMixedHold(f.c.session.id, randomUUID(), f.h.holdId)).rejects.toThrow('Injected refund intent failure')
			expect((await remaining(f.v.product.id, f.v.location.id)).reserved).toBe(1)
			expect((await repository.db.mixedCheckoutHold.findUniqueOrThrow({ where: { id: f.h.holdId } })).state).toBe('holding')
			expect((await repository.db.promotionReservation.findFirstOrThrow({ where: { holdRef: f.h.holdId } })).state).toBe('reserved')
		} finally {
			await repository.db.$executeRawUnsafe('DROP TRIGGER fail_c05_refund ON mixed_payment_refunds')
			await repository.db.$executeRawUnsafe('DROP FUNCTION fail_c05_refund()')
		}
		await repository.releaseMixedHold(f.c.session.id, randomUUID(), f.h.holdId)
		expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).state).toBe('refund_pending')
	})
	test('raw writes cannot alter original terms, infer capture or release captured resources without compensation', async () => {
		const f = await checkout()
		await expect(
			repository.db.mixedPaymentAttempt.update({ where: { id: f.payment.paymentId }, data: { amountMinorUnits: 1n, state: 'unknown' } }),
		).rejects.toThrow('immutable')
		await expect(repository.db.mixedPaymentAttempt.update({ where: { id: f.payment.paymentId }, data: { state: 'succeeded' } })).rejects.toThrow(
			'ledger evidence',
		)
		await receive(await event(f.payment.paymentId))
		await repository.reconcileMixedPayments()
		await expect(repository.db.mixedPaymentAttempt.delete({ where: { id: f.payment.paymentId } })).rejects.toThrow('immutable')
		await expect(repository.db.$executeRaw`TRUNCATE mixed_payment_attempts CASCADE`).rejects.toThrow()
		await expect(
			repository.db.mixedPaymentRefund.create({ data: { paymentId: f.payment.paymentId, amountMinorUnits: 1n, reason: 'Wrong amount', createdAt: now } }),
		).rejects.toThrow()
		expect(await cash(f.payment.paymentId)).toHaveLength(1)
	})
	test('verified inbox history cannot be edited or deleted', async () => {
		const f = await checkout(),
			e = await event(f.payment.paymentId)
		await receive(e)
		const receipt = await repository.db.providerInboxEvent.findUniqueOrThrow({
			where: { provider_providerEventId: { provider: 'local-mixed-payment', providerEventId: e.eventId } },
		})
		await expect(repository.db.providerInboxEvent.update({ where: { id: receipt.id }, data: { payloadHash: 'other' } })).rejects.toThrow('immutable')
		await expect(repository.db.providerInboxEvent.delete({ where: { id: receipt.id } })).rejects.toThrow('immutable')
		await repository.reconcileMixedPayments()
		await expect(
			repository.db.providerInboxEvent.update({ where: { id: receipt.id }, data: { reconciliationState: 'pending', processedAt: null } }),
		).rejects.toThrow('immutable outcome')
	})
	test('local simulator emits a server-derived signed durable receipt and exact retry keeps capture time', async () => {
		const f = await checkout(),
			key = randomUUID()
		const first = await repository.simulateMixedPayment(f.c.session.id, key, f.payment.paymentId, { outcome: 'succeeded' })
		expect(first.state).toBe('pending_provider')
		now = new Date(now.getTime() + 1000)
		expect((await repository.simulateMixedPayment(f.c.session.id, key, f.payment.paymentId, { outcome: 'succeeded' })).replayed).toBe(true)
		await expect(repository.simulateMixedPayment(f.c.session.id, key, f.payment.paymentId, { outcome: 'failed' })).rejects.toThrow(IdempotencyConflictError)
		expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).state).toBe('succeeded')
		await expect(repository.simulateMixedPayment(f.c.session.id, randomUUID(), f.payment.paymentId, { outcome: 'succeeded', amount: 1 })).rejects.toThrow()
	})
	test('system expiry/refund works after Customer verification/session and Vendor publication withdrawal', async () => {
		const f = await checkout()
		await receive(await event(f.payment.paymentId))
		await repository.reconcileMixedPayments()
		await repository.db.session.update({ where: { id: f.c.session.id }, data: { revokedAt: now } })
		await repository.db.user.update({ where: { id: f.c.user.id }, data: { adultVerificationState: 'unverified', verifiedAt: null } })
		await repository.db.vendor.update({ where: { id: f.v.vendor.id }, data: { publishedAt: null } })
		now = new Date(f.h.expiresAt)
		await repository.expireMixedHolds()
		await repository.reconcileMixedRefunds()
		expect((await repository.db.mixedPaymentAttempt.findUniqueOrThrow({ where: { id: f.payment.paymentId } })).state).toBe('refunded')
	})
	test('zero-payable checkout needs no provider capture and expires without cash/refund entries', async () => {
		const c = await customer(),
			v = await vendor()
		const f = await customer()
		await repository.db.platformFinanceGrant.create({
			data: {
				userId: f.user.id,
				workspaceId: f.workspace.id,
				expiresAt: new Date(Date.now() + 3600000),
				grantedBy: 'C05 zero fixture',
				reason: 'Zero-payable controlled policy',
			},
		})
		const discount = await repository.publishPlatformCampaign(f.session.id, randomUUID(), {
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
			reason: 'Full controlled subsidy',
		})
		const q = await prepared(c, { ...v.selection, promotions: { vendorCouponId: null, platformCampaignId: discount.promotionId } })
		expect(q.snapshot.total!.minorUnits).toBe(0)
		const h = await hold(c.session.id, q.quoteId),
			p = await repository.startMixedPayment(c.session.id, randomUUID(), { holdId: h.holdId })
		expect(p).toMatchObject({ state: 'no_payment_required', commitmentReady: true, amount: { minorUnits: 0, currency: 'ETB' } })
		await expect(repository.simulateMixedPayment(c.session.id, randomUUID(), p.paymentId, { outcome: 'succeeded' })).rejects.toThrow('No provider charge')
		now = new Date(h.expiresAt)
		await repository.expireMixedHolds()
		expect((await repository.readMixedPayment(c.session.id, p.paymentId)).commitmentReady).toBe(false)
		expect(await cash(p.paymentId)).toHaveLength(0)
		expect(await repository.db.mixedPaymentRefund.count({ where: { paymentId: p.paymentId } })).toBe(0)
	})
	test('provider refund acknowledgment plus failed DB completion safely retries the same operation', async () => {
		const f = await checkout()
		await repository.releaseMixedHold(f.c.session.id, randomUUID(), f.h.holdId)
		await receive(await event(f.payment.paymentId))
		await repository.reconcileMixedPayments()
		await repository.db.$executeRawUnsafe(
			`CREATE FUNCTION fail_c05_refund_finish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state='refunded' THEN RAISE EXCEPTION 'Injected refund completion failure'; END IF; RETURN NEW; END $$`,
		)
		await repository.db.$executeRawUnsafe(
			`CREATE TRIGGER fail_c05_refund_finish BEFORE UPDATE ON mixed_payment_attempts FOR EACH ROW EXECUTE FUNCTION fail_c05_refund_finish()`,
		)
		try {
			await expect(repository.reconcileMixedRefunds()).rejects.toThrow('Injected refund completion failure')
			expect(await cash(f.payment.paymentId)).toHaveLength(1)
			expect((await repository.db.mixedPaymentRefund.findUniqueOrThrow({ where: { paymentId: f.payment.paymentId } })).state).toBe('pending')
		} finally {
			await repository.db.$executeRawUnsafe('DROP TRIGGER fail_c05_refund_finish ON mixed_payment_attempts')
			await repository.db.$executeRawUnsafe('DROP FUNCTION fail_c05_refund_finish()')
		}
		await repository.reconcileMixedRefunds()
		expect((await repository.readMixedPayment(f.c.session.id, f.payment.paymentId)).state).toBe('refunded')
		expect(await cash(f.payment.paymentId)).toHaveLength(2)
	})
	test('current recovery is nullable, private, authoritative and resets after Cart revision changes', async () => {
		const empty = await customer()
		expect(await repository.readCurrentMixedPayment(empty.session.id)).toEqual({ payment: null })
		const f = await checkout()
		expect((await repository.readCurrentMixedPayment(f.c.session.id)).payment!.paymentId).toBe(f.payment.paymentId)
		expect(await repository.readCurrentMixedPayment(empty.session.id)).toEqual({ payment: null })
		await receive(await event(f.payment.paymentId))
		expect((await repository.readCurrentMixedPayment(f.c.session.id)).payment!.state).toBe('succeeded')
		await repository.releaseMixedHold(f.c.session.id, randomUUID(), f.h.holdId)
		expect((await repository.readCurrentMixedPayment(f.c.session.id)).payment!.state).toBe('refund_pending')
		await save(f.c.session.id, f.v.selection, 1)
		expect(await repository.readCurrentMixedPayment(f.c.session.id)).toEqual({ payment: null })
		await expect(repository.readCurrentMixedPayment(undefined)).rejects.toThrow(AccessDeniedError)
	})
	test('payment initiation rechecks adult identity and publication after holding without reserving or charging again', async () => {
		for (const withdraw of ['identity', 'listing', 'vendor']) {
			const c = await customer(),
				v = await vendor(),
				q = await prepared(c, v.selection),
				h = await hold(c.session.id, q.quoteId)
			if (withdraw === 'identity')
				await repository.db.user.update({ where: { id: c.user.id }, data: { adultVerificationState: 'unverified', verifiedAt: null } })
			else if (withdraw === 'listing') await repository.db.listing.update({ where: { id: v.service.id }, data: { state: 'draft' } })
			else await repository.db.vendor.update({ where: { id: v.vendor.id }, data: { publishedAt: null } })
			await expect(repository.startMixedPayment(c.session.id, randomUUID(), { holdId: h.holdId })).rejects.toThrow()
			expect(await repository.db.mixedPaymentAttempt.count({ where: { holdId: h.holdId } })).toBe(0)
			expect((await remaining(v.product.id, v.location.id)).reserved).toBe(1)
		}
	})
	test('a valid held price and financial snapshot remain frozen for payment after later price changes', async () => {
		const c = await customer(),
			v = await vendor(),
			q = await prepared(c, v.selection),
			h = await hold(c.session.id, q.quoteId)
		await repository.db.listing.update({ where: { id: v.product.id }, data: { priceCents: 2000 } })
		const p = await repository.startMixedPayment(c.session.id, randomUUID(), { holdId: h.holdId })
		expect(p.amount).toEqual(q.snapshot.total)
		await receive(await event(p.paymentId))
		expect((await repository.readMixedPayment(c.session.id, p.paymentId)).state).toBe('succeeded')
	})
})
