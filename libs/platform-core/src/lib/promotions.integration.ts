/* eslint-disable @typescript-eslint/no-non-null-assertion -- integration requires a loopback DATABASE_URL */
import { randomUUID } from 'node:crypto'

import { type MixedCartSelection, type PromotionDefinition, PromotionDefinitionSchema } from 'contracts'

import { AccessDeniedError } from './access.js'
import { CheckoutPricing } from './checkout-pricing.js'
import { GoodsCheckoutConflictError } from './goods-checkout.js'
import { IdempotencyConflictError } from './idempotency.js'
import { PostgresFoundation } from './postgres-foundation.js'
import { PromotionBudget } from './promotion-budget.js'
const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('Phase 04 promotions and commission PostgreSQL', () => {
	let repository: PostgresFoundation, other: PostgresFoundation, now: Date
	const clock = () => new Date(now)
	const budget = new PromotionBudget(clock, new CheckoutPricing())
	async function customer() {
		const workspace = await repository.db.workspace.create({ data: { kind: 'real' } })
		const user = await repository.db.user.create({
			data: { email: `${randomUUID()}@example.invalid`, adultVerificationState: 'verified', verifiedAt: new Date() },
		})
		const session = await repository.db.session.create({ data: { userId: user.id, workspaceId: workspace.id, expiresAt: new Date(Date.now() + 3600000) } })
		return { workspace, user, session }
	}
	async function finance() {
		const person = await customer()
		const grant = await repository.db.platformFinanceGrant.create({
			data: {
				userId: person.user.id,
				workspaceId: person.workspace.id,
				expiresAt: new Date(Date.now() + 3600000),
				grantedBy: 'C03 fixture',
				reason: 'Disposable configuration authority',
			},
		})
		return { ...person, grant }
	}
	async function vendor(control: Awaited<ReturnType<typeof finance>>, rate: number | null = 500) {
		const owner = await customer()
		const vendor = await repository.db.vendor.create({
			data: {
				workspaceId: owner.workspace.id,
				applicationState: 'approved',
				publishedAt: new Date(),
				publicSlug: randomUUID(),
				displayName: 'Promotion fixture Vendor',
			},
		})
		const calendar = { timezone: 'UTC', weekly: [{ weekday: 1, hours: [{ startMinute: 540, endMinute: 1020 }], breaks: [] }], exceptions: [] }
		const zone = {
			id: randomUUID(),
			label: 'Delivery zone',
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
		const location = await repository.db.location.create({
			data: {
				vendorId: vendor.id,
				label: 'Shop',
				city: 'Test city',
				goodsConfiguration: { pickupEnabled: true, returnTemplate: 'standard', deliveryZones: [zone] },
				goodsConfigurationVersion: 1,
				scheduleCalendar: calendar,
				scheduleVersion: 1,
			},
		})
		const membership = await repository.db.vendorMembership.create({
			data: { vendorId: vendor.id, userId: owner.user.id, role: 'vendor_owner', locationIds: [location.id] },
		})
		await repository.db.session.update({ where: { id: owner.session.id }, data: { activeVendorId: vendor.id, activeRole: 'vendor_owner' } })
		const product = await repository.db.listing.create({
			data: {
				vendorId: vendor.id,
				kind: 'product',
				category: 'goods',
				title: 'Promotion Product',
				description: 'Disposable promotion Product.',
				state: 'published',
				priceCents: 1000,
			},
		})
		await repository.createInventoryMovement(owner.session.id, randomUUID(), {
			listingId: product.id,
			locationId: location.id,
			reason: 'received',
			quantityDelta: 100,
		})
		const staff = await repository.db.staff.create({
			data: {
				vendorId: vendor.id,
				displayName: 'Private Staff',
				scheduleVersion: 1,
				schedule: { scopes: [{ mode: 'online', locationId: null, calendar }] },
			},
		})
		const option = {
			id: randomUUID(),
			label: 'Fixed Service',
			priceCents: 1500,
			durationMinutes: 30,
			bufferBeforeMinutes: 5,
			bufferAfterMinutes: 10,
			locationIds: [],
			online: true,
			addons: [],
			qualifications: [{ staffId: staff.id, locationIds: [], online: true }],
		}
		const service = await repository.db.listing.create({
			data: {
				vendorId: vendor.id,
				kind: 'service',
				category: 'appointment',
				title: 'Promotion Service',
				description: 'Disposable promotion Service.',
				state: 'published',
				priceCents: 1500,
				durationMinutes: 30,
				serviceConfiguration: { capacity: 'staff_only', options: [option] },
				serviceConfigurationVersion: 1,
				schedulingRules: { timezone: 'UTC', leadTimeMinutes: 0, horizonDays: 30, slotIntervalMinutes: 15 },
				schedulingRulesVersion: 1,
			},
		})
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
						mode: 'online',
						locationId: null,
						staffId: null,
						start: '2026-10-12T09:15:00Z',
						expectedConfigurationVersion: 1,
						expectedRulesVersion: 1,
					},
				},
			],
		}
		const rateRecord =
			rate === null
				? null
				: await repository.publishCommissionRate(control.session.id, randomUUID(), {
						vendorId: vendor.id,
						basisPoints: rate,
						effectiveFrom: '2026-10-12T00:00:00Z',
						effectiveUntil: null,
						reason: 'Controlled Vendor rate',
					})
		return { owner, vendor, location, zone, membership, product, service, staff, selection, rateRecord }
	}
	function definition(overrides: Partial<PromotionDefinition> = {}): PromotionDefinition {
		return PromotionDefinitionSchema.parse({
			code: `P_${randomUUID().slice(0, 12)}`,
			validFrom: '2026-10-12T00:00:00Z',
			validUntil: '2026-10-13T00:00:00Z',
			scope: { kinds: ['goods', 'booking'], listingIds: [] },
			rule: { kind: 'fixed', minorUnits: 100 },
			minimumMinorUnits: 0,
			usageLimit: null,
			perCustomerLimit: null,
			refundFundingRule: 'proportional_original_allocations',
			...overrides,
		})
	}
	async function coupon(v: Awaited<ReturnType<typeof vendor>>, overrides: Partial<PromotionDefinition> = {}, key = randomUUID()) {
		return repository.publishVendorCoupon(v.owner.session.id, key, { definition: definition(overrides), reason: 'Controlled Vendor coupon' })
	}
	async function campaign(f: Awaited<ReturnType<typeof finance>>, amount = 1000, overrides: Partial<PromotionDefinition> = {}, vendorIds: string[] = []) {
		return repository.publishPlatformCampaign(f.session.id, randomUUID(), {
			definition: definition(overrides),
			vendorIds,
			budget: { minorUnits: amount, currency: 'ETB' },
			reason: 'Controlled Platform campaign',
		})
	}
	async function quote(c: Awaited<ReturnType<typeof customer>>, selection: MixedCartSelection) {
		const old = await repository.readMixedCart(c.session.id)
		const cart = await repository.writeMixedCart(c.session.id, randomUUID(), { expectedVersion: old.version, selection })
		return repository.createMixedQuote(c.session.id, randomUUID(), { cartId: cart.cartId, expectedVersion: cart.version })
	}
	const reserve = (quoteId: string, holdRef = randomUUID(), repo = repository, expiry = new Date(now.getTime() + 15 * 60000)) =>
		repo.db.$transaction((tx) => budget.reserve(tx, quoteId, holdRef, expiry))
	const complete = (quoteId: string, holdRef: string, state: 'released' | 'consumed', repo = repository) =>
		repo.db.$transaction((tx) => budget.complete(tx, quoteId, holdRef, state))
	beforeEach(() => {
		now = new Date('2026-10-12T08:00:00Z')
		repository = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, undefined, undefined, undefined, clock)
		other = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, undefined, undefined, undefined, clock)
	})
	afterEach(async () => {
		await Promise.all([repository.close(), other.close()])
	})
	test('absence of configured commission blocks a new quote without guessing a rate', async () => {
		// Evaluate before every controlled fixture rate, independent of suite order.
		now = new Date('2026-10-05T08:00:00Z')
		const f = await finance(),
			v = await vendor(f, null),
			c = await customer()
		const q = await quote(c, v.selection)
		expect(q.state).toBe('conflicts')
		expect(q.snapshot.total).toBeNull()
		expect(q.snapshot.conflicts[0].code).toBe('commission_unavailable')
		expect(q.snapshot.commission).toBeNull()
		await expect(reserve(q.quoteId)).rejects.toBeInstanceOf(GoodsCheckoutConflictError)
	})
	test('Vendor coupon precedes Platform campaign while commission excludes delivery and Platform subsidy', async () => {
		const f = await finance(),
			a = await vendor(f, 500),
			b = await vendor(f, 700),
			c = await customer()
		const vendorCoupon = await coupon(a, { rule: { kind: 'fixed', minorUnits: 300 } })
		const platform = await campaign(f, 10000, { rule: { kind: 'percentage', basisPoints: 1000, maximumMinorUnits: null } })
		const selection: MixedCartSelection = {
			goodsGroups: [
				{
					...a.selection.goodsGroups[0],
					lines: [{ ...a.selection.goodsGroups[0].lines[0], quantity: 2 }],
					fulfillment: {
						method: 'delivery',
						zoneId: a.zone.id,
						address: { contactName: 'Buyer', phone: '+251900000000', locality: 'Test city', address: 'Office', point: [41.5, 9.5] },
					},
				},
			],
			bookings: b.selection.bookings,
			promotions: { vendorCouponId: vendorCoupon.promotionId, platformCampaignId: platform.promotionId },
		}
		const movements = await repository.db.inventoryMovement.count(),
			allocations = await repository.db.staffAllocation.count()
		const q = await quote(c, selection),
			p = q.snapshot.promotion!
		expect(q.state).toBe('ready')
		expect(q.snapshot.total).toEqual({ minorUnits: 3080, currency: 'ETB' })
		expect(p).toMatchObject({
			grossSaleMinorUnits: 3500,
			deliveryMinorUnits: 200,
			vendorDiscountMinorUnits: 300,
			platformSubsidyMinorUnits: 320,
			customerPayableMinorUnits: 3080,
		})
		expect(
			p.allocations.map((x) => [x.vendorDiscountMinorUnits, x.platformSubsidyMinorUnits, x.commissionBasisMinorUnits, x.commissionMinorUnits]),
		).toEqual([
			[300, 170, 1700, 85],
			[0, 150, 1500, 105],
		])
		expect(q.snapshot.commission?.totalMinorUnits).toBe(190)
		expect(p.receiptContext).toMatchObject({
			kind: 'non_tax_platform_receipt',
			taxCalculated: false,
			paymentMerchant: 'junction',
			refundFundingRule: 'proportional_original_allocations',
		})
		expect(JSON.stringify(q)).not.toContain(a.staff.id)
		expect(await repository.db.inventoryMovement.count()).toBe(movements)
		expect(await repository.db.staffAllocation.count()).toBe(allocations)
		expect(await repository.db.promotionReservation.count({ where: { quoteId: q.quoteId } })).toBe(0)
	})
	test('stacking cardinality and funding kind cannot be supplied or changed by the Customer', async () => {
		const f = await finance(),
			v = await vendor(f),
			c = await customer(),
			cp = await coupon(v),
			pc = await campaign(f)
		await expect(
			repository.writeMixedCart(c.session.id, randomUUID(), {
				expectedVersion: 0,
				selection: { ...v.selection, promotions: { vendorCouponId: [cp.promotionId, cp.promotionId], platformCampaignId: pc.promotionId } },
			}),
		).rejects.toThrow()
		const q = await quote(c, { ...v.selection, promotions: { vendorCouponId: pc.promotionId, platformCampaignId: cp.promotionId } })
		expect(q.state).toBe('conflicts')
		expect(q.snapshot.conflicts.filter((x) => x.code === 'promotion_unavailable')).toHaveLength(2)
	})
	test('eligibility respects Vendor, listing/kind scope and minimum after the Vendor coupon', async () => {
		const f = await finance(),
			a = await vendor(f),
			b = await vendor(f),
			c = await customer(),
			cp = await coupon(a)
		expect((await quote(c, { ...b.selection, promotions: { vendorCouponId: cp.promotionId, platformCampaignId: null } })).state).toBe('conflicts')
		const restricted = await campaign(f, 1000, { scope: { kinds: ['goods'], listingIds: [a.product.id] }, minimumMinorUnits: 1100 })
		const blocked = await quote(c, { ...a.selection, promotions: { vendorCouponId: cp.promotionId, platformCampaignId: restricted.promotionId } })
		expect(blocked.snapshot.conflicts[0].code).toBe('promotion_unavailable')
		const good = await campaign(f, 1000, { scope: { kinds: ['booking'], listingIds: [a.service.id] } }, [a.vendor.id])
		const ready = await quote(c, { ...a.selection, promotions: { vendorCouponId: null, platformCampaignId: good.promotionId } })
		expect(ready.snapshot.promotion?.allocations.map((x) => x.platformSubsidyMinorUnits)).toEqual([0, 100])
	})
	test('exact definition window is rechecked at reservation while a valid held allocation honors its snapshot', async () => {
		const f = await finance(),
			v = await vendor(f),
			c = await customer(),
			pc = await campaign(f, 1000, { validFrom: '2026-10-12T08:00:00Z', validUntil: '2026-10-12T08:01:00Z' })
		const q = await quote(c, { ...v.selection, promotions: { vendorCouponId: null, platformCampaignId: pc.promotionId } }),
			hold = randomUUID()
		await reserve(q.quoteId, hold)
		now = new Date('2026-10-12T08:02:00Z')
		expect((await complete(q.quoteId, hold, 'consumed'))[0].state).toBe('consumed')
		expect((await quote(c, { ...v.selection, promotions: { vendorCouponId: null, platformCampaignId: pc.promotionId } })).state).toBe('conflicts')
	})
	test('effective global rate, temporary Vendor override and latest effective rate freeze history', async () => {
		const f = await finance(),
			v = await vendor(f, null),
			c = await customer()
		const global = await repository.publishCommissionRate(f.session.id, randomUUID(), {
			vendorId: null,
			basisPoints: 1000,
			effectiveFrom: '2026-10-12T00:00:00Z',
			effectiveUntil: null,
			reason: 'Controlled global default',
		})
		const override = await repository.publishCommissionRate(f.session.id, randomUUID(), {
			vendorId: v.vendor.id,
			basisPoints: 2000,
			effectiveFrom: '2026-10-12T07:00:00Z',
			effectiveUntil: '2026-10-12T08:20:00Z',
			reason: 'Temporary Vendor override',
		})
		const old = await quote(c, v.selection)
		expect(old.snapshot.commission?.rates[0]).toMatchObject({
			rateId: override.rateId,
			source: 'vendor_override',
			basisPoints: 2000,
			commissionMinorUnits: 500,
		})
		now = new Date('2026-10-12T08:20:00Z')
		expect((await quote(c, v.selection)).snapshot.commission?.rates[0]).toMatchObject({
			rateId: global.rateId,
			source: 'global',
			commissionMinorUnits: 250,
		})
		const future = await repository.publishCommissionRate(f.session.id, randomUUID(), {
			vendorId: null,
			basisPoints: 1500,
			effectiveFrom: '2026-10-12T08:30:00Z',
			effectiveUntil: null,
			reason: 'Scheduled global change',
		})
		expect((await quote(c, v.selection)).snapshot.commission?.rates[0].rateId).toBe(global.rateId)
		now = new Date('2026-10-12T08:30:00Z')
		expect((await quote(c, v.selection)).snapshot.commission?.rates[0]).toMatchObject({ rateId: future.rateId, commissionMinorUnits: 375 })
		expect((await repository.readMixedQuote(c.session.id, old.quoteId)).snapshot).toEqual(old.snapshot)
	})
	test('configuration is Owner/Finance scoped, audited and replay-safe; immutable definitions require a new publication', async () => {
		const f = await finance(),
			v = await vendor(f),
			stranger = await customer(),
			otherFinance = await finance()
		const command = { definition: definition(), reason: 'Audited controlled coupon' },
			key = randomUUID()
		const cp = await repository.publishVendorCoupon(v.owner.session.id, key, command)
		expect((await repository.publishVendorCoupon(v.owner.session.id, key, command)).replayed).toBe(true)
		await expect(repository.publishVendorCoupon(v.owner.session.id, key, { ...command, reason: 'Changed' })).rejects.toBeInstanceOf(
			IdempotencyConflictError,
		)
		await expect(repository.publishVendorCoupon(v.owner.session.id, randomUUID(), command)).rejects.toBeInstanceOf(GoodsCheckoutConflictError)
		await expect(repository.publishVendorCoupon(stranger.session.id, randomUUID(), command)).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(
			repository.publishPlatformCampaign(v.owner.session.id, randomUUID(), { ...command, vendorIds: [], budget: { minorUnits: 1000, currency: 'ETB' } }),
		).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(
			repository.publishPlatformCampaign(stranger.session.id, randomUUID(), { ...command, vendorIds: [], budget: { minorUnits: 1000, currency: 'ETB' } }),
		).rejects.toBeInstanceOf(AccessDeniedError)
		const pc = await campaign(f)
		await expect(repository.readPromotionDefinition(otherFinance.session.id, pc.promotionId, 'platform_campaign')).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(repository.readPromotionDefinition(v.owner.session.id, cp.promotionId, 'platform_campaign')).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(repository.db.promotionDefinition.update({ where: { id: cp.promotionId }, data: { definition: {} } })).rejects.toThrow('immutable')
		await expect(repository.db.commissionRate.update({ where: { id: v.rateRecord!.rateId }, data: { basisPoints: 0 } })).rejects.toThrow('immutable')
		expect(await repository.db.auditLog.count({ where: { workspaceId: v.owner.workspace.id, action: 'checkout.promotion-published' } })).toBe(1)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: v.owner.workspace.id, type: 'PromotionDefinitionPublished' } })).toBe(1)
	})
	test('explicit Finance grants expire/revoke and Vendor or reviewer roles do not imply Finance configuration', async () => {
		const f = await finance(),
			v = await vendor(f),
			reviewer = await customer()
		await repository.db.platformReviewerGrant.create({ data: { userId: reviewer.user.id, grantedBy: 'C03 reviewer fixture' } })
		await expect(
			repository.publishCommissionRate(reviewer.session.id, randomUUID(), {
				vendorId: null,
				basisPoints: 500,
				effectiveFrom: '2026-10-12T08:40:00Z',
				effectiveUntil: null,
				reason: 'Forbidden reviewer rate',
			}),
		).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.db.platformFinanceGrant.create({
			data: {
				userId: v.owner.user.id,
				workspaceId: v.owner.workspace.id,
				expiresAt: new Date(Date.now() + 3600000),
				grantedBy: 'Intentional invalid fixture',
				reason: 'Vendor role isolation',
			},
		})
		await expect(campaign({ ...f, session: v.owner.session })).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.db.session.update({ where: { id: v.owner.session.id }, data: { activeVendorId: null, activeRole: null } })
		await expect(campaign({ ...f, session: v.owner.session })).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.db.platformFinanceGrant.update({ where: { id: f.grant.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
		await expect(campaign(f)).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.db.platformFinanceGrant.update({
			where: { id: f.grant.id },
			data: { expiresAt: new Date(Date.now() + 3600000), revokedAt: new Date() },
		})
		await expect(campaign(f)).rejects.toBeInstanceOf(AccessDeniedError)
	})
	test('currency, value/window controls, foreign Listing scope and category commission are rejected', async () => {
		const f = await finance(),
			a = await vendor(f),
			b = await vendor(f)
		await expect(
			repository.publishVendorCoupon(a.owner.session.id, randomUUID(), {
				definition: definition({ scope: { kinds: ['goods'], listingIds: [b.product.id] } }),
				reason: 'Wrong Listing scope',
			}),
		).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(
			repository.publishPlatformCampaign(f.session.id, randomUUID(), {
				definition: definition(),
				vendorIds: [],
				budget: { minorUnits: 100, currency: 'USD' },
				reason: 'Wrong currency',
			}),
		).rejects.toThrow()
		await expect(
			repository.publishCommissionRate(f.session.id, randomUUID(), {
				vendorId: null,
				basisPoints: 500,
				category: 'goods',
				effectiveFrom: '2026-10-12T08:40:00Z',
				effectiveUntil: null,
				reason: 'Unsupported category rate',
			}),
		).rejects.toThrow()
		await expect(
			repository.publishVendorCoupon(a.owner.session.id, randomUUID(), {
				definition: { ...definition(), rule: { kind: 'percentage', basisPoints: 10001, maximumMinorUnits: null } },
				reason: 'Invalid percentage',
			}),
		).rejects.toThrow()
	})
	test('two advisory quotes contend for the last campaign budget and release permits a safe retry', async () => {
		const f = await finance(),
			v = await vendor(f),
			a = await customer(),
			b = await customer(),
			pc = await campaign(f, 100)
		const selection = { ...v.selection, promotions: { vendorCouponId: null, platformCampaignId: pc.promotionId } }
		const qa = await quote(a, selection),
			qb = await quote(b, selection),
			ha = randomUUID(),
			hb = randomUUID()
		const outcomes = await Promise.allSettled([reserve(qa.quoteId, ha), reserve(qb.quoteId, hb, other)])
		expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
		const won = outcomes[0].status === 'fulfilled' ? { q: qa, h: ha } : { q: qb, h: hb },
			lost = outcomes[0].status === 'fulfilled' ? { q: qb, h: hb } : { q: qa, h: ha }
		expect(await repository.db.promotionReservation.count({ where: { promotionId: pc.promotionId } })).toBe(1)
		expect(await repository.db.campaignBudgetBalance.findUniqueOrThrow({ where: { promotionId: pc.promotionId } })).toMatchObject({
			reserved: 100n,
			consumed: 0n,
		})
		await complete(won.q.quoteId, won.h, 'released')
		await complete(won.q.quoteId, won.h, 'released')
		await reserve(lost.q.quoteId, lost.h)
		expect(await repository.db.campaignBudgetMovement.count({ where: { promotionId: pc.promotionId, kind: 'released' } })).toBe(1)
		expect((await repository.db.campaignBudgetBalance.findUniqueOrThrow({ where: { promotionId: pc.promotionId } })).reserved).toBe(100n)
	})
	test('coupon usage and per-Customer controls count live/consumed attempts but release restores eligibility', async () => {
		const f = await finance(),
			v = await vendor(f),
			c = await customer(),
			cp = await coupon(v, { usageLimit: 1, perCustomerLimit: 1 })
		const selection = { ...v.selection, promotions: { vendorCouponId: cp.promotionId, platformCampaignId: null } }
		const q = await quote(c, selection),
			hold = randomUUID()
		await reserve(q.quoteId, hold)
		expect((await quote(await customer(), selection)).state).toBe('conflicts')
		await complete(q.quoteId, hold, 'released')
		const fresh = await quote(c, selection),
			next = randomUUID()
		expect(fresh.state).toBe('ready')
		await reserve(fresh.quoteId, next)
		await complete(fresh.quoteId, next, 'consumed')
		expect((await quote(c, selection)).state).toBe('conflicts')
		expect(await repository.db.campaignBudgetMovement.count({ where: { promotionId: cp.promotionId } })).toBe(0)
	})
	test('reservation/consumption replay is once-only, never extends expiry and consumed budget cannot be released', async () => {
		const f = await finance(),
			v = await vendor(f),
			c = await customer(),
			pc = await campaign(f, 100),
			q = await quote(c, { ...v.selection, promotions: { vendorCouponId: null, platformCampaignId: pc.promotionId } }),
			hold = randomUUID(),
			expiry = new Date(now.getTime() + 15 * 60000)
		const first = await reserve(q.quoteId, hold, repository, expiry),
			replay = await reserve(q.quoteId, hold, other, expiry)
		expect(replay.replayed).toBe(true)
		expect(replay.reservations[0].id).toBe(first.reservations[0].id)
		await expect(reserve(q.quoteId, hold, repository, new Date(expiry.getTime() + 1000))).rejects.toBeInstanceOf(GoodsCheckoutConflictError)
		await complete(q.quoteId, hold, 'consumed')
		await complete(q.quoteId, hold, 'consumed', other)
		await expect(complete(q.quoteId, hold, 'released')).rejects.toBeInstanceOf(GoodsCheckoutConflictError)
		expect(await repository.db.campaignBudgetMovement.count({ where: { promotionId: pc.promotionId } })).toBe(2)
		expect(await repository.db.campaignBudgetBalance.findUniqueOrThrow({ where: { promotionId: pc.promotionId } })).toMatchObject({
			reserved: 0n,
			consumed: 100n,
		})
		expect((await quote(c, { ...v.selection, promotions: { vendorCouponId: null, platformCampaignId: pc.promotionId } })).state).toBe('conflicts')
	})
	test('exact expiry release is idempotent and expired replay reports released without renewed funding', async () => {
		const f = await finance(),
			v = await vendor(f),
			c = await customer(),
			pc = await campaign(f, 100),
			selection = { ...v.selection, promotions: { vendorCouponId: null, platformCampaignId: pc.promotionId } },
			q = await quote(c, selection),
			hold = randomUUID(),
			expiry = new Date(now.getTime() + 15 * 60000)
		await reserve(q.quoteId, hold, repository, expiry)
		now = expiry
		await expect(complete(q.quoteId, hold, 'consumed')).rejects.toBeInstanceOf(GoodsCheckoutConflictError)
		const replay = await reserve(q.quoteId, hold, repository, expiry)
		expect(replay.replayed).toBe(true)
		expect(replay.reservations[0].state).toBe('released')
		await repository.db.$transaction((tx) => budget.expire(tx))
		await other.db.$transaction((tx) => budget.expire(tx))
		expect(await repository.db.campaignBudgetMovement.count({ where: { promotionId: pc.promotionId, kind: 'released' } })).toBe(1)
		expect((await quote(c, selection)).state).toBe('ready')
	})
	test('coupon plus campaign contention rolls back every partial reservation and an outer failure removes audit/outbox/projection', async () => {
		const f = await finance(),
			v = await vendor(f),
			a = await customer(),
			b = await customer(),
			cp = await coupon(v),
			pc = await campaign(f, 100)
		const selection = { ...v.selection, promotions: { vendorCouponId: cp.promotionId, platformCampaignId: pc.promotionId } }
		const qa = await quote(a, selection),
			qb = await quote(b, selection)
		await reserve(qa.quoteId)
		await expect(reserve(qb.quoteId)).rejects.toBeInstanceOf(GoodsCheckoutConflictError)
		expect(await repository.db.promotionReservation.count({ where: { quoteId: qb.quoteId } })).toBe(0)
		const freshCampaign = await campaign(f, 100),
			qc = await quote(b, { ...v.selection, promotions: { vendorCouponId: null, platformCampaignId: freshCampaign.promotionId } })
		await expect(
			repository.db.$transaction(async (tx) => {
				await budget.reserve(tx, qc.quoteId, randomUUID(), new Date(now.getTime() + 15 * 60000))
				throw new Error('Source hold failed')
			}),
		).rejects.toThrow('Source hold failed')
		expect(await repository.db.promotionReservation.count({ where: { quoteId: qc.quoteId } })).toBe(0)
		expect(await repository.db.campaignBudgetMovement.count({ where: { promotionId: freshCampaign.promotionId } })).toBe(0)
		expect((await repository.db.campaignBudgetBalance.findUniqueOrThrow({ where: { promotionId: freshCampaign.promotionId } })).reserved).toBe(0n)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: b.workspace.id, type: 'PromotionBudgetReserved' } })).toBe(0)
	})
	test('budget/usage state changes cannot rewrite receipt totals and arbitrary reservation mutation is rejected', async () => {
		const f = await finance(),
			v = await vendor(f),
			c = await customer(),
			pc = await campaign(f, 1000),
			q = await quote(c, { ...v.selection, promotions: { vendorCouponId: null, platformCampaignId: pc.promotionId } }),
			hold = randomUUID()
		const reserved = await reserve(q.quoteId, hold)
		await expect(repository.db.promotionReservation.update({ where: { id: reserved.reservations[0].id }, data: { amountMinorUnits: 1n } })).rejects.toThrow(
			'terminal transition',
		)
		await expect(repository.db.campaignBudgetBalance.update({ where: { promotionId: pc.promotionId }, data: { reserved: 1n } })).rejects.toThrow(
			'projection',
		)
		await expect(
			repository.db.campaignBudgetMovement.update({
				where: { id: (await repository.db.campaignBudgetMovement.findFirstOrThrow({ where: { promotionId: pc.promotionId } })).id },
				data: { reservedDelta: 1n },
			}),
		).rejects.toThrow('immutable')
		await complete(q.quoteId, hold, 'consumed')
		expect((await repository.readMixedQuote(c.session.id, q.quoteId)).snapshot).toEqual(q.snapshot)
		await expect(repository.db.$executeRaw`TRUNCATE campaign_budget_movements`).rejects.toThrow()
	})
	test('raw DB writers cannot exceed a campaign cap, forge an allocation or mix quote ownership', async () => {
		const f = await finance(),
			v = await vendor(f),
			c = await customer(),
			pc = await campaign(f, 100),
			q = await quote(c, { ...v.selection, promotions: { vendorCouponId: null, platformCampaignId: pc.promotionId } })
		const data = {
			promotionId: pc.promotionId,
			quoteId: q.quoteId,
			holdRef: randomUUID(),
			workspaceId: c.workspace.id,
			customerId: c.user.id,
			amountMinorUnits: 100n,
			createdAt: now,
			expiresAt: new Date(now.getTime() + 15 * 60000),
		}
		await expect(repository.db.promotionReservation.create({ data: { ...data, customerId: randomUUID() } })).rejects.toThrow('owned ready')
		await expect(repository.db.promotionReservation.create({ data: { ...data, amountMinorUnits: 99n } })).rejects.toThrow('frozen promotion allocation')
		await expect(
			repository.db.$transaction(async (tx) => {
				const row = await tx.promotionReservation.create({ data })
				await tx.campaignBudgetMovement.create({
					data: { promotionId: pc.promotionId, reservationId: row.id, kind: 'reserved', reservedDelta: 101n, consumedDelta: 0n, createdAt: now },
				})
			}),
		).rejects.toThrow('budget exceeded')
		expect(await repository.db.promotionReservation.count({ where: { quoteId: q.quoteId } })).toBe(0)
		expect((await repository.db.campaignBudgetBalance.findUniqueOrThrow({ where: { promotionId: pc.promotionId } })).reserved).toBe(0n)
	})
	test('code resolution checks current Customer usage and merge preview does not silently choose conflicting promotions', async () => {
		const f = await finance(),
			v = await vendor(f),
			c = await customer(),
			cp = await coupon(v),
			pc = await campaign(f)
		expect((await repository.resolveVendorCoupon(c.session.id, { vendorId: v.vendor.id, code: cp.definition.code.toLowerCase() })).promotionId).toBe(
			cp.promotionId,
		)
		await quote(c, { ...v.selection, promotions: { vendorCouponId: cp.promotionId, platformCampaignId: null } })
		const current = await repository.readMixedCart(c.session.id)
		const result = await repository.previewMixedCartMerge(c.session.id, {
			expectedVersion: current.version,
			incoming: { goodsGroups: [], bookings: [], promotions: { vendorCouponId: null, platformCampaignId: pc.promotionId } },
		})
		expect(result.proposed).toBeNull()
		expect(result.conflicts[0].code).toBe('selection_conflict')
		expect(result.persisted).toBe(false)
		expect((await repository.readMixedCart(c.session.id)).selection.promotions?.vendorCouponId).toBe(cp.promotionId)
	})
	test('compact original unit economics reconcile a fully funded zero-payable line without negative unit value', async () => {
		const f = await finance(),
			v = await vendor(f, 10000),
			c = await customer()
		await repository.db.listing.update({ where: { id: v.product.id }, data: { priceCents: 1 } })
		const cp = await coupon(v, { rule: { kind: 'fixed', minorUnits: 1 } }),
			pc = await campaign(f, 100, { rule: { kind: 'fixed', minorUnits: 1 } })
		const selection: MixedCartSelection = {
			goodsGroups: [{ ...v.selection.goodsGroups[0], lines: [{ listingId: v.product.id, quantity: 2, expectedUnitPriceCents: 1 }] }],
			bookings: [],
			promotions: { vendorCouponId: cp.promotionId, platformCampaignId: pc.promotionId },
		}
		const q = await quote(c, selection),
			allocation = q.snapshot.promotion!.allocations[0]
		expect(q.state).toBe('ready')
		expect(q.snapshot.total?.minorUnits).toBe(0)
		expect(allocation).toMatchObject({
			listMinorUnits: 2,
			vendorDiscountMinorUnits: 1,
			platformSubsidyMinorUnits: 1,
			commissionBasisMinorUnits: 1,
			commissionMinorUnits: 1,
			customerMinorUnits: 0,
			vendorEarningMinorUnits: 0,
		})
		expect(allocation.unitSegments.every((u) => u.customerUnitMinorUnits >= 0 && u.vendorEarningUnitMinorUnits >= 0)).toBe(true)
	})
	test('the retired demo workspace cannot be created and raw financial definitions require a real owned scope', async () => {
		const f = await finance(),
			v = await vendor(f),
			c = await customer()
		await expect(repository.db.workspace.create({ data: { kind: 'demo' } })).rejects.toThrow('workspaces_kind_real_check')
		await expect(
			repository.db.commissionRate.create({
				data: {
					workspaceId: randomUUID(),
					actorId: c.user.id,
					scopeKey: v.vendor.id,
					vendorId: v.vendor.id,
					basisPoints: 500,
					effectiveFrom: now,
					reason: 'Unknown financial scope',
				},
			}),
		).rejects.toThrow('real workspace and actor')
	})
	test('Finance configuration requires recent MFA under strict policy while tests remain on loopback', async () => {
		const f = await finance(),
			v = await vendor(f)
		await repository.db
			.$executeRaw`INSERT INTO junction_auth."user" (id,name,email,"emailVerified") VALUES (${f.user.id},${'Strict Finance fixture'},${f.user.email},true)`
		await repository.db
			.$executeRaw`INSERT INTO junction_auth.session (id,"expiresAt",token,"updatedAt","userId") VALUES (${f.session.id},${f.session.expiresAt},${randomUUID()},now(),${f.user.id})`
		const prior = process.env['JUNCTION_RUNTIME_MODE']
		const command = {
			vendorId: v.vendor.id,
			basisPoints: 600,
			effectiveFrom: '2026-10-12T07:00:00Z',
			effectiveUntil: null,
			reason: 'Strict policy configuration',
		}
		try {
			process.env['JUNCTION_RUNTIME_MODE'] = 'staging'
			await expect(repository.publishCommissionRate(f.session.id, randomUUID(), command)).rejects.toThrow('Recent multi-factor')
			await repository.db.session.update({ where: { id: f.session.id }, data: { mfaVerifiedAt: new Date(), recentAuthAt: new Date() } })
			expect((await repository.publishCommissionRate(f.session.id, randomUUID(), command)).basisPoints).toBe(600)
		} finally {
			if (prior === undefined) delete process.env['JUNCTION_RUNTIME_MODE']
			else process.env['JUNCTION_RUNTIME_MODE'] = prior
		}
	})
	test('raw repeatable-read writers serialize the last campaign budget through its guarded projection', async () => {
		const f = await finance(),
			v = await vendor(f),
			a = await customer(),
			b = await customer(),
			pc = await campaign(f, 100)
		const selection = { ...v.selection, promotions: { vendorCouponId: null, platformCampaignId: pc.promotionId } }
		const qa = await quote(a, selection),
			qb = await quote(b, selection)
		let arrived = 0
		let release: () => void = () => {
			throw new Error('Barrier not initialized')
		}
		const barrier = new Promise<void>((resolve) => {
			release = resolve
		})
		const attempt = (repo: PostgresFoundation, c: Awaited<ReturnType<typeof customer>>, quoteId: string) =>
			repo.db.$transaction(
				async (tx) => {
					await tx.campaignBudgetBalance.findUniqueOrThrow({ where: { promotionId: pc.promotionId } })
					if (++arrived === 2) release()
					await barrier
					const row = await tx.promotionReservation.create({
						data: {
							promotionId: pc.promotionId,
							quoteId,
							holdRef: randomUUID(),
							workspaceId: c.workspace.id,
							customerId: c.user.id,
							amountMinorUnits: 100n,
							createdAt: now,
							expiresAt: new Date(now.getTime() + 15 * 60000),
						},
					})
					await tx.campaignBudgetMovement.create({
						data: { promotionId: pc.promotionId, reservationId: row.id, kind: 'reserved', reservedDelta: 100n, consumedDelta: 0n, createdAt: now },
					})
				},
				{ isolationLevel: 'RepeatableRead', timeout: 30000 },
			)
		const results = await Promise.allSettled([attempt(repository, a, qa.quoteId), attempt(other, b, qb.quoteId)])
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
		expect(await repository.db.promotionReservation.count({ where: { promotionId: pc.promotionId } })).toBe(1)
		expect((await repository.db.campaignBudgetBalance.findUniqueOrThrow({ where: { promotionId: pc.promotionId } })).reserved).toBe(100n)
	})
})
