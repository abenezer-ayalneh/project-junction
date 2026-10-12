/* eslint-disable @typescript-eslint/no-non-null-assertion -- integration requires a loopback DATABASE_URL */
import { randomUUID } from 'node:crypto'

import { type MixedCartSelection, MixedCartSelectionSchema } from 'contracts'

import { AccessDeniedError } from './access.js'
import { GoodsCheckoutConflictError } from './goods-checkout.js'
import { IdempotencyConflictError } from './idempotency.js'
import { PostgresFoundation } from './postgres-foundation.js'
const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('Phase 04 atomic mixed hold PostgreSQL', () => {
	let repository: PostgresFoundation
	let other: PostgresFoundation
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
		repository = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, undefined, undefined, undefined, clock)
		other = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, undefined, undefined, undefined, clock)
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
	test('one common 15-minute hold atomically reserves multi-Vendor stock, a private Staff interval and campaign budget', async () => {
		const c = await customer(),
			a = await vendor(),
			b = await vendor(),
			p = await campaign()
		const q = await prepared(c, {
			goodsGroups: [...a.selection.goodsGroups, ...b.selection.goodsGroups],
			bookings: a.selection.bookings,
			promotions: { vendorCouponId: null, platformCampaignId: p.promotionId },
		})
		const h = await hold(c.session.id, q.quoteId)
		expect(h.state).toBe('holding')
		expect(h.reserved).toBe(true)
		expect(h.snapshot).toEqual(q.snapshot)
		expect(Date.parse(h.expiresAt) - Date.parse(h.createdAt)).toBe(15 * 60000)
		expect(await remaining(a.product.id, a.location.id)).toMatchObject({ onHand: 20, reserved: 1 })
		expect(await repository.db.mixedHoldStockLine.count({ where: { holdId: h.holdId } })).toBe(2)
		const allocations = await repository.db.staffAllocation.findMany({ where: { mixedIntent: { holdId: h.holdId } } })
		expect(allocations).toHaveLength(1)
		expect(allocations[0].expiresAt?.toISOString()).toBe(h.expiresAt)
		expect((await repository.db.promotionReservation.findFirstOrThrow({ where: { holdRef: h.holdId } })).expiresAt.toISOString()).toBe(h.expiresAt)
		expect((await repository.db.campaignBudgetBalance.findUniqueOrThrow({ where: { promotionId: p.promotionId } })).reserved).toBe(100n)
		expect(JSON.stringify(h)).not.toContain(a.hidden?.id ?? a.linked.id)
		expect((await repository.readCurrentMixedHold(c.session.id)).hold?.holdId).toBe(h.holdId)
	})
	test('joint concrete assignment gives a named intent its only Staff and allocates any-Staff without disclosure', async () => {
		const c = await customer(),
			a = await vendor(true),
			intent = a.selection.bookings[0]
		const q = await prepared(c, {
			goodsGroups: a.selection.goodsGroups,
			bookings: [intent, { ...intent, intentId: randomUUID(), selection: { ...intent.selection, staffId: a.linked.id } }],
		})
		const h = await hold(c.session.id, q.quoteId),
			rows = await repository.db.mixedHoldBookingIntent.findMany({ where: { holdId: h.holdId }, include: { allocation: true } })
		expect(rows).toHaveLength(2)
		expect(new Set(rows.map((r) => r.allocation?.staffId)).size).toBe(2)
		expect(h.snapshot.bookings.map((b) => b.snapshot.selectedStaffId)).toEqual([null, a.linked.id])
		expect(JSON.stringify(h)).not.toContain(a.hidden!.id)
	})
	test('creation replay is one hold/event and returns expired current state without extending its deadline', async () => {
		const c = await customer(),
			a = await vendor(),
			q = await prepared(c, a.selection),
			key = randomUUID()
		const outcomes = await Promise.all([hold(c.session.id, q.quoteId, key), hold(c.session.id, q.quoteId, key, other)])
		expect(outcomes[0].holdId).toBe(outcomes[1].holdId)
		const changed = await repository.createMixedQuote(c.session.id, randomUUID(), { cartId: outcomes[0].cartId, expectedVersion: 1 })
		await expect(hold(c.session.id, changed.quoteId, key)).rejects.toBeInstanceOf(IdempotencyConflictError)
		expect(outcomes.filter((o) => o.replayed)).toHaveLength(1)
		await expect(hold(c.session.id, q.quoteId)).rejects.toBeInstanceOf(GoodsCheckoutConflictError)
		now = new Date(outcomes[0].expiresAt)
		const replay = await hold(c.session.id, q.quoteId, key)
		expect(replay.state).toBe('expired')
		expect(replay.expiresAt).toBe(outcomes[0].expiresAt)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: c.workspace.id, type: 'MixedCheckoutHoldCreated' } })).toBe(1)
		expect(await remaining(a.product.id, a.location.id)).toMatchObject({ onHand: 20, reserved: 0 })
	})
	test('last stock unit races a mixed hold against a legacy goods hold without partial Staff or budget allocation', async () => {
		const a = await vendor(),
			first = await customer(),
			second = await customer(),
			p = await campaign()
		await repository.createInventoryMovement(a.owner.session.id, randomUUID(), {
			listingId: a.product.id,
			locationId: a.location.id,
			reason: 'adjusted',
			quantityDelta: -19,
			note: 'Last unit fixture',
		})
		const q = await prepared(first, { ...a.selection, promotions: { vendorCouponId: null, platformCampaignId: p.promotionId } })
		const g = await repository.createGoodsQuote(second.session.id, randomUUID(), {
			groups: a.selection.goodsGroups.map((group) => ({
				...group,
				lines: group.lines.map(({ listingId, quantity, sku }) => ({ listingId, quantity, sku })),
			})),
		})
		const outcomes = await Promise.allSettled([
			hold(first.session.id, q.quoteId),
			other.createGoodsHold(second.session.id, randomUUID(), { quoteId: g.quoteId }),
		])
		expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1)
		expect((await remaining(a.product.id, a.location.id)).reserved).toBe(1)
		if (outcomes[0].status === 'rejected') {
			expect(await repository.db.mixedCheckoutHold.count({ where: { quoteId: q.quoteId } })).toBe(0)
			expect(await repository.db.promotionReservation.count({ where: { quoteId: q.quoteId } })).toBe(0)
			expect(await repository.db.staffAllocation.count({ where: { mixedIntent: { listingId: a.service.id } } })).toBe(0)
		}
	})
	test('last Staff races a mixed hold against a legacy Booking hold and rejects the entire losing checkout', async () => {
		const a = await vendor(),
			first = await customer(),
			second = await customer(),
			q = await prepared(first, a.selection)
		const outcomes = await Promise.allSettled([
			hold(first.session.id, q.quoteId),
			other.createBookingHold(second.session.id, randomUUID(), a.selection.bookings[0].selection),
		])
		expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1)
		expect(await repository.db.staffAllocation.count({ where: { staffId: a.linked.id, state: 'held' } })).toBe(1)
		if (outcomes[0].status === 'rejected') expect((await remaining(a.product.id, a.location.id)).reserved).toBe(0)
	})
	test('last campaign budget accepts one full checkout and leaves no stock/Staff remnants in the loser', async () => {
		const a = await vendor(),
			b = await vendor(),
			first = await customer(),
			second = await customer(),
			p = await campaign(100)
		const qa = await prepared(first, { ...a.selection, promotions: { vendorCouponId: null, platformCampaignId: p.promotionId } }),
			qb = await prepared(second, { ...b.selection, promotions: { vendorCouponId: null, platformCampaignId: p.promotionId } })
		const outcomes = await Promise.allSettled([hold(first.session.id, qa.quoteId), hold(second.session.id, qb.quoteId, randomUUID(), other)])
		expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1)
		const loser = outcomes[0].status === 'rejected' ? a : b
		expect((await remaining(loser.product.id, loser.location.id)).reserved).toBe(0)
		expect(await repository.db.staffAllocation.count({ where: { staffId: loser.linked.id, state: 'held' } })).toBe(0)
		expect((await repository.db.campaignBudgetBalance.findUniqueOrThrow({ where: { promotionId: p.promotionId } })).reserved).toBe(100n)
	})
	test('repricing and expired quote cannot reserve anything', async () => {
		const c = await customer(),
			a = await vendor(),
			q = await prepared(c, a.selection)
		await repository.db.listing.update({ where: { id: a.product.id }, data: { priceCents: 1200, version: { increment: 1 } } })
		await expect(hold(c.session.id, q.quoteId)).rejects.toBeInstanceOf(GoodsCheckoutConflictError)
		expect(await repository.db.mixedCheckoutHold.count({ where: { quoteId: q.quoteId } })).toBe(0)
		const selection = structuredClone(a.selection)
		selection.goodsGroups[0].lines[0].expectedUnitPriceCents = 1200
		const fresh = await prepared(c, selection)
		now = new Date(fresh.expiresAt)
		await expect(hold(c.session.id, fresh.quoteId)).rejects.toBeInstanceOf(GoodsCheckoutConflictError)
		expect((await remaining(a.product.id, a.location.id)).reserved).toBe(0)
	})
	test('active Cart cannot be edited or obtain a second hold; release permits explicit replacement and new quote', async () => {
		const c = await customer(),
			a = await vendor(),
			q = await prepared(c, a.selection),
			h = await hold(c.session.id, q.quoteId)
		await expect(save(c.session.id, { goodsGroups: [], bookings: [] }, 1)).rejects.toBeInstanceOf(GoodsCheckoutConflictError)
		await expect(
			repository.db.mixedCart.update({ where: { id: h.cartId }, data: { version: 2, selection: { goodsGroups: [], bookings: [] } } }),
		).rejects.toThrow('active mixed hold')
		const release = await repository.releaseMixedHold(c.session.id, randomUUID(), h.holdId)
		expect(release.state).toBe('released')
		const next = await prepared(c, a.selection)
		expect(next.quoteId).not.toBe(q.quoteId)
		expect((await hold(c.session.id, next.quoteId)).state).toBe('holding')
	})
	test('release/expiry race is exactly once for stock, Staff, budget and terminal events', async () => {
		const c = await customer(),
			a = await vendor(),
			p = await campaign(),
			q = await prepared(c, { ...a.selection, promotions: { vendorCouponId: null, platformCampaignId: p.promotionId } }),
			h = await hold(c.session.id, q.quoteId),
			key = randomUUID()
		now = new Date(h.expiresAt)
		await Promise.all([repository.releaseMixedHold(c.session.id, key, h.holdId), other.expireMixedHolds()])
		expect((await repository.readMixedHold(c.session.id, h.holdId)).state).toBe('expired')
		expect((await repository.releaseMixedHold(c.session.id, key, h.holdId)).replayed).toBe(true)
		expect(await repository.db.inventoryMovement.count({ where: { mixedHoldId: h.holdId, reason: 'released' } })).toBe(1)
		expect(await repository.db.campaignBudgetMovement.count({ where: { reservation: { holdRef: h.holdId }, kind: 'released' } })).toBe(1)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: c.workspace.id, type: 'MixedCheckoutHoldExpired' } })).toBe(1)
		expect(await repository.db.staffAllocation.count({ where: { mixedIntent: { holdId: h.holdId }, state: 'expired' } })).toBe(1)
	})
	test('expiry requires no current Customer verification/session or Vendor authority and frees all value', async () => {
		const c = await customer(),
			a = await vendor(),
			p = await campaign(),
			q = await prepared(c, { ...a.selection, promotions: { vendorCouponId: null, platformCampaignId: p.promotionId } }),
			h = await hold(c.session.id, q.quoteId)
		await repository.db.session.update({ where: { id: c.session.id }, data: { revokedAt: new Date() } })
		await repository.db.user.update({ where: { id: c.user.id }, data: { adultVerificationState: 'unverified', verifiedAt: null } })
		await repository.db.vendor.update({ where: { id: a.vendor.id }, data: { applicationState: 'restricted', publishedAt: null } })
		now = new Date(h.expiresAt)
		await repository.expireMixedHolds()
		expect((await remaining(a.product.id, a.location.id)).reserved).toBe(0)
		expect((await repository.db.campaignBudgetBalance.findUniqueOrThrow({ where: { promotionId: p.promotionId } })).reserved).toBe(0n)
		expect((await repository.db.mixedCheckoutHold.findUniqueOrThrow({ where: { id: h.holdId } })).state).toBe('expired')
	})
	test('owned recovery/read/release deny other Customers and identities and never expose private any-Staff', async () => {
		const c = await customer(),
			foreign = await customer(),
			a = await vendor(true),
			q = await prepared(c, a.selection),
			h = await hold(c.session.id, q.quoteId)
		await expect(repository.readMixedHold(foreign.session.id, h.holdId)).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(repository.releaseMixedHold(foreign.session.id, randomUUID(), h.holdId)).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(hold(foreign.session.id, q.quoteId)).rejects.toBeInstanceOf(AccessDeniedError)
		expect((await repository.readCurrentMixedHold(foreign.session.id)).hold).toBeNull()
		await expect(repository.readMixedHold(undefined, h.holdId)).rejects.toBeInstanceOf(AccessDeniedError)
		expect(JSON.stringify(await repository.readMixedHold(c.session.id, h.holdId))).not.toContain(a.hidden!.id)
	})
	test('terminal inspection failure rolls back every release and retries safely', async () => {
		const c = await customer(),
			a = await vendor(),
			p = await campaign(),
			q = await prepared(c, { ...a.selection, promotions: { vendorCouponId: null, platformCampaignId: p.promotionId } }),
			h = await hold(c.session.id, q.quoteId)
		await repository.db.$executeRawUnsafe(
			"CREATE FUNCTION fail_mixed_terminal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state<>'holding' THEN RAISE EXCEPTION 'Injected mixed terminal failure'; END IF; RETURN NEW; END; $$",
		)
		await repository.db.$executeRawUnsafe(
			'CREATE TRIGGER fail_mixed_terminal BEFORE UPDATE ON mixed_checkout_holds FOR EACH ROW EXECUTE FUNCTION fail_mixed_terminal()',
		)
		try {
			await expect(repository.releaseMixedHold(c.session.id, randomUUID(), h.holdId)).rejects.toThrow('Injected mixed terminal failure')
		} finally {
			await repository.db.$executeRawUnsafe('DROP TRIGGER fail_mixed_terminal ON mixed_checkout_holds')
			await repository.db.$executeRawUnsafe('DROP FUNCTION fail_mixed_terminal()')
		}
		expect((await remaining(a.product.id, a.location.id)).reserved).toBe(1)
		expect((await repository.db.campaignBudgetBalance.findUniqueOrThrow({ where: { promotionId: p.promotionId } })).reserved).toBe(100n)
		expect(await repository.db.staffAllocation.count({ where: { mixedIntent: { holdId: h.holdId }, state: 'held' } })).toBe(1)
		await repository.releaseMixedHold(c.session.id, randomUUID(), h.holdId)
		expect((await remaining(a.product.id, a.location.id)).reserved).toBe(0)
	})
	test('DB rejects incomplete holds, mutable terms, changed allocations and independent participant release', async () => {
		const c = await customer(),
			a = await vendor(),
			p = await campaign(),
			q = await prepared(c, { ...a.selection, promotions: { vendorCouponId: null, platformCampaignId: p.promotionId } })
		const cart = await repository.readMixedCart(c.session.id)
		await expect(
			repository.db.mixedCheckoutHold.create({
				data: {
					quoteId: q.quoteId,
					cartId: cart.cartId!,
					customerId: c.user.id,
					workspaceId: c.workspace.id,
					snapshot: q.snapshot,
					createdAt: now,
					expiresAt: new Date(now.getTime() + 15 * 60000),
				},
			}),
		).rejects.toThrow('all quote components')
		const h = await hold(c.session.id, q.quoteId)
		await expect(
			repository.db.mixedCheckoutHold.update({ where: { id: h.holdId }, data: { expiresAt: new Date(now.getTime() + 20 * 60000) } }),
		).rejects.toThrow('immutable terminal')
		const allocation = await repository.db.staffAllocation.findFirstOrThrow({ where: { mixedIntent: { holdId: h.holdId } } })
		await expect(repository.db.staffAllocation.update({ where: { id: allocation.id }, data: { state: 'released' } })).rejects.toThrow('common deadline')
		const reservation = await repository.db.promotionReservation.findFirstOrThrow({ where: { holdRef: h.holdId } })
		await expect(
			repository.db.promotionReservation.update({ where: { id: reservation.id }, data: { state: 'released', completedAt: now } }),
		).rejects.toThrow()
		await expect(repository.db.mixedHoldStockLine.deleteMany({ where: { holdId: h.holdId } })).rejects.toThrow('immutable')
	})
	test('legacy allocators retire an expired mixed hold as a coordinated whole before reusing its resources', async () => {
		const c = await customer(),
			next = await customer(),
			a = await vendor(),
			p = await campaign(),
			q = await prepared(c, { ...a.selection, promotions: { vendorCouponId: null, platformCampaignId: p.promotionId } }),
			h = await hold(c.session.id, q.quoteId)
		now = new Date(h.expiresAt)
		const legacy = await repository.createBookingHold(next.session.id, randomUUID(), a.selection.bookings[0].selection)
		expect(legacy.state).toBe('holding')
		expect((await repository.db.mixedCheckoutHold.findUniqueOrThrow({ where: { id: h.holdId } })).state).toBe('expired')
		expect((await remaining(a.product.id, a.location.id)).reserved).toBe(0)
		expect((await repository.db.campaignBudgetBalance.findUniqueOrThrow({ where: { promotionId: p.promotionId } })).reserved).toBe(0n)
	})
	test('five independent intents are held separately; quantity and sixth-intent validation remain strict', async () => {
		const c = await customer(),
			a = await vendor()
		const bookings = Array.from({ length: 5 }, (_, index) => ({
			...a.selection.bookings[0],
			intentId: randomUUID(),
			selection: { ...a.selection.bookings[0].selection, start: `2026-10-12T${String(9 + index).padStart(2, '0')}:15:00Z` },
		}))
		const selection = { goodsGroups: a.selection.goodsGroups, bookings }
		expect(MixedCartSelectionSchema.safeParse(selection).success).toBe(true)
		expect(MixedCartSelectionSchema.safeParse({ ...selection, bookings: [...bookings, { ...bookings[0], intentId: randomUUID() }] }).success).toBe(false)
		const q = await prepared(c, selection),
			h = await hold(c.session.id, q.quoteId)
		expect(await repository.db.mixedHoldBookingIntent.count({ where: { holdId: h.holdId } })).toBe(5)
		expect(await repository.db.staffAllocation.count({ where: { mixedIntent: { holdId: h.holdId }, state: 'held' } })).toBe(5)
	})
	test('a changed effective rate invalidates quote funding before any resource is held', async () => {
		const c = await customer(),
			a = await vendor(),
			f = await customer(),
			q = await prepared(c, a.selection)
		await repository.db.platformFinanceGrant.create({
			data: {
				userId: f.user.id,
				workspaceId: f.workspace.id,
				expiresAt: new Date(Date.now() + 3600000),
				grantedBy: 'C04 fixture',
				reason: 'Controlled rate change',
			},
		})
		await repository.publishCommissionRate(f.session.id, randomUUID(), {
			vendorId: a.vendor.id,
			basisPoints: 500,
			effectiveFrom: '2026-10-12T07:00:00Z',
			effectiveUntil: null,
			reason: 'Changed effective quote policy',
		})
		await expect(hold(c.session.id, q.quoteId)).rejects.toBeInstanceOf(GoodsCheckoutConflictError)
		expect((await remaining(a.product.id, a.location.id)).reserved).toBe(0)
		expect(await repository.db.staffAllocation.count({ where: { mixedIntent: { listingId: a.service.id } } })).toBe(0)
	})
	test('publication/verification withdrawal and stale Cart revision deny allocation without leaks', async () => {
		const c = await customer(),
			a = await vendor(),
			q = await prepared(c, a.selection)
		await repository.db.vendor.update({ where: { id: a.vendor.id }, data: { publishedAt: null } })
		await expect(hold(c.session.id, q.quoteId)).rejects.toBeInstanceOf(GoodsCheckoutConflictError)
		await repository.db.vendor.update({ where: { id: a.vendor.id }, data: { publishedAt: new Date() } })
		const current = await prepared(c, a.selection)
		await repository.db.user.update({ where: { id: c.user.id }, data: { adultVerificationState: 'unverified', verifiedAt: null } })
		await expect(hold(c.session.id, current.quoteId)).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.db.user.update({ where: { id: c.user.id }, data: { adultVerificationState: 'verified', verifiedAt: new Date() } })
		await save(c.session.id, a.selection, 2)
		await expect(hold(c.session.id, current.quoteId)).rejects.toBeInstanceOf(GoodsCheckoutConflictError)
		expect((await remaining(a.product.id, a.location.id)).reserved).toBe(0)
	})
	test('expired Cart replacement releases all participants before advancing the revision', async () => {
		const c = await customer(),
			a = await vendor(),
			p = await campaign(),
			q = await prepared(c, { ...a.selection, promotions: { vendorCouponId: null, platformCampaignId: p.promotionId } }),
			h = await hold(c.session.id, q.quoteId)
		now = new Date(h.expiresAt)
		expect((await save(c.session.id, { goodsGroups: [], bookings: [] }, 1)).version).toBe(2)
		expect((await remaining(a.product.id, a.location.id)).reserved).toBe(0)
		expect((await repository.readCurrentMixedHold(c.session.id)).hold).toBeNull()
		expect((await repository.db.campaignBudgetBalance.findUniqueOrThrow({ where: { promotionId: p.promotionId } })).reserved).toBe(0n)
	})
})
