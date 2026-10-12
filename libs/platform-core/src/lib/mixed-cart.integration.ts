/* eslint-disable @typescript-eslint/no-non-null-assertion -- integration requires a loopback DATABASE_URL */
import { randomUUID } from 'node:crypto'

import { type MixedCartSelection, MixedCartSelectionSchema } from 'contracts'

import { AccessDeniedError } from './access.js'
import { GoodsCheckoutConflictError } from './goods-checkout.js'
import { IdempotencyConflictError } from './idempotency.js'
import { PostgresFoundation } from './postgres-foundation.js'
const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('Phase 04 mixed Cart and quote PostgreSQL', () => {
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
		// Existing C02 journeys now explicitly configure their controlled zero-rate
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
	test('private empty Cart requires a session and does not create a record', async () => {
		const c = await customer()
		expect(await repository.readMixedCart(c.session.id)).toEqual({ cartId: null, version: 0, selection: { goodsGroups: [], bookings: [] } })
		await expect(repository.readMixedCart(undefined)).rejects.toBeInstanceOf(AccessDeniedError)
		expect(await repository.db.mixedCart.count({ where: { customerId: c.user.id } })).toBe(0)
	})
	test('one advisory quote snapshots two Vendor goods groups and five independent appointments without allocations', async () => {
		const c = await customer(),
			a = await vendor(),
			b = await vendor()
		const selection = {
			goodsGroups: [...a.selection.goodsGroups, ...b.selection.goodsGroups],
			bookings: Array.from({ length: 5 }, (_, i) => ({
				...a.selection.bookings[0],
				intentId: randomUUID(),
				selection: { ...a.selection.bookings[0].selection, start: `2026-10-12T${String(9 + i).padStart(2, '0')}:15:00Z` },
			})),
		}
		const before = [
			await repository.db.inventoryMovement.count(),
			await repository.db.staffAllocation.count(),
			await repository.db.goodsHold.count(),
			await repository.db.bookingHold.count(),
		]
		const cart = await save(c.session.id, selection),
			q = await quote(c.session.id, cart)
		expect(q.state).toBe('ready')
		expect(q.snapshot.total).toEqual({ minorUnits: 9500, currency: 'ETB' })
		expect(q.snapshot.bookings).toHaveLength(5)
		expect(new Set(q.snapshot.bookings.map((x) => x.componentId)).size).toBe(5)
		expect(q.snapshot.bookings[0].policy).toMatchObject({ template: 'flexible', fullRefundHours: 24, partialRefundHours: 2, contestHours: 48 })
		expect(q.snapshot.goods[0].group.lines[0].policy.changeOfMindDays).toBe(7)
		expect(q.snapshot.reserved).toBe(false)
		expect(JSON.stringify(q)).not.toContain(a.linked.id)
		expect([
			await repository.db.inventoryMovement.count(),
			await repository.db.staffAllocation.count(),
			await repository.db.goodsHold.count(),
			await repository.db.bookingHold.count(),
		]).toEqual(before)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId: c.workspace.id, type: 'MixedCheckoutQuoteCreated' } })).toBe(1)
	})
	test('sixth intent, quantity two and duplicate intent IDs are rejected before any write', async () => {
		const c = await customer(),
			a = await vendor()
		const booking = a.selection.bookings[0]
		for (const bookings of [Array.from({ length: 6 }, () => ({ ...booking, intentId: randomUUID() })), [{ ...booking, quantity: 2 }], [booking, booking]]) {
			await expect(
				repository.writeMixedCart(c.session.id, randomUUID(), { expectedVersion: 0, selection: { goodsGroups: [], bookings } }),
			).rejects.toThrow()
		}
		expect(await repository.db.mixedCart.count({ where: { customerId: c.user.id } })).toBe(0)
	})
	test('Cart revision conflicts, concurrent replace, replay and changed-key payload are safe', async () => {
		const c = await customer(),
			a = await vendor()
		const key = randomUUID()
		const initial = await save(c.session.id, a.selection, 0, key)
		const results = await Promise.allSettled([
			save(c.session.id, a.selection, 1),
			other.writeMixedCart(c.session.id, randomUUID(), { expectedVersion: 1, selection: { goodsGroups: [], bookings: [] } }),
		])
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
		expect((await repository.readMixedCart(c.session.id)).version).toBe(2)
		expect((await save(c.session.id, a.selection, 0, key)).replayed).toBe(true)
		await expect(save(c.session.id, { goodsGroups: [], bookings: [] }, 0, key)).rejects.toBeInstanceOf(IdempotencyConflictError)
		expect(initial.version).toBe(1)
	})
	test('anonymous merge preview reports matching quantities and retains quantity-one intent without saving', async () => {
		const c = await customer(),
			a = await vendor()
		const cart = await save(c.session.id, a.selection)
		const result = await repository.previewMixedCartMerge(c.session.id, { expectedVersion: 1, incoming: a.selection })
		expect(result.persisted).toBe(false)
		expect(result.conflicts).toHaveLength(0)
		expect(result.matches.map((m) => m.proposedQuantity)).toEqual([2, 1])
		expect(result.proposed?.bookings).toHaveLength(1)
		expect(result.proposed?.goodsGroups[0].lines[0].quantity).toBe(2)
		expect(result.reviews[0].total?.minorUnits).toBe(3500)
		expect(await repository.readMixedCart(c.session.id)).toEqual({ cartId: cart.cartId, version: 1, selection: a.selection })
		expect(await repository.db.mixedCheckoutQuote.count({ where: { workspaceId: c.workspace.id } })).toBe(0)
	})
	test('merge never silently chooses fulfillment, price or conflicting appointment selections', async () => {
		const c = await customer(),
			a = await vendor()
		await save(c.session.id, a.selection)
		const incoming = structuredClone(a.selection)
		incoming.goodsGroups[0].fulfillment = {
			method: 'delivery',
			zoneId: a.zone.id,
			address: { contactName: 'Buyer', phone: '+251900000000', address: 'Office', locality: 'Test city', point: [41.5, 9.5] },
		}
		incoming.bookings[0].selection.start = '2026-10-12T10:15:00Z'
		const result = await repository.previewMixedCartMerge(c.session.id, { expectedVersion: 1, incoming })
		expect(result.proposed).toBeNull()
		expect(result.conflicts.map((c) => c.kind)).toEqual(['goods', 'booking'])
		expect(result.reviews).toHaveLength(2)
		expect((await repository.readMixedCart(c.session.id)).selection).toEqual(a.selection)
		const price = structuredClone(a.selection)
		price.goodsGroups[0].lines[0].expectedUnitPriceCents = 900
		expect((await repository.previewMixedCartMerge(c.session.id, { expectedVersion: 1, incoming: price })).conflicts[0].listingId).toBe(a.product.id)
	})
	test('merge preview exposes combined sixth appointment and quantity overflow', async () => {
		const c = await customer(),
			a = await vendor()
		const selection = { goodsGroups: [], bookings: Array.from({ length: 5 }, () => ({ ...a.selection.bookings[0], intentId: randomUUID() })) }
		await save(c.session.id, selection)
		const result = await repository.previewMixedCartMerge(c.session.id, {
			expectedVersion: 1,
			incoming: { goodsGroups: [], bookings: [{ ...a.selection.bookings[0], intentId: randomUUID() }] },
		})
		expect(result.proposed).toBeNull()
		expect(result.conflicts[0].code).toBe('limit_exceeded')
	})
	test('goods and Booking repricing/version changes return current terms and block readiness until explicit acceptance', async () => {
		const c = await customer(),
			a = await vendor()
		const cart = await save(c.session.id, a.selection)
		await repository.db.listing.update({ where: { id: a.product.id }, data: { priceCents: 1200, version: { increment: 1 } } })
		await repository.configureService(a.owner.session.id, randomUUID(), a.service.id, {
			expectedVersion: 1,
			configuration: { ...a.configuration, options: [{ ...a.option, priceCents: 1700 }] },
		})
		const q = await quote(c.session.id, cart)
		expect(q.state).toBe('conflicts')
		expect(q.snapshot.total?.minorUnits).toBe(2900)
		expect(q.snapshot.conflicts.map((c) => c.code)).toEqual(['price_changed', 'price_changed', 'terms_changed'])
		const accepted = structuredClone(a.selection)
		accepted.goodsGroups[0].lines[0].expectedUnitPriceCents = 1200
		accepted.bookings[0].expectedPriceCents = 1700
		accepted.bookings[0].selection.expectedConfigurationVersion = 2
		const updated = await save(c.session.id, accepted, 1)
		expect((await quote(c.session.id, updated)).state).toBe('ready')
		expect((await repository.readMixedQuote(c.session.id, q.quoteId)).state).toBe('stale')
	})
	test('stock exhaustion and occupied Staff surface scoped conflicts without a partial payable total', async () => {
		const c = await customer(),
			a = await vendor()
		const cart = await save(c.session.id, a.selection)
		await repository.createInventoryMovement(a.owner.session.id, randomUUID(), {
			listingId: a.product.id,
			locationId: a.location.id,
			reason: 'adjusted',
			quantityDelta: -20,
			note: 'Test stock exhaustion',
		})
		await repository.createBookingHold(c.session.id, randomUUID(), a.selection.bookings[0].selection)
		const q = await quote(c.session.id, cart)
		expect(q.state).toBe('conflicts')
		expect(q.snapshot.total).toBeNull()
		expect(q.snapshot.conflicts.map((c) => [c.kind, c.referenceId, c.code])).toEqual([
			['goods', a.vendor.id, 'unavailable'],
			['booking', a.selection.bookings[0].intentId, 'unavailable'],
		])
	})
	test('publication, wrong Location, option and named Staff consent are re-read', async () => {
		const c = await customer(),
			a = await vendor(),
			b = await vendor()
		const selection = structuredClone(a.selection)
		selection.goodsGroups[0].locationId = b.location.id
		selection.bookings[0].selection.staffId = a.linked.id
		await repository.setStaffPublicConsent(a.owner.session.id, randomUUID(), a.linked.id, { expectedVersion: 2, publicDisplay: false })
		const cart = await save(c.session.id, selection)
		expect((await quote(c.session.id, cart)).snapshot.conflicts.map((c) => c.kind)).toEqual(['goods', 'booking'])
		await repository.db.vendor.update({ where: { id: a.vendor.id }, data: { publishedAt: null } })
		const updated = await save(c.session.id, a.selection, 1)
		expect((await quote(c.session.id, updated)).snapshot.conflicts).toHaveLength(2)
	})
	test('joint appointment feasibility handles any/named choices without greedy false conflicts and preserves private Staff', async () => {
		const c = await customer(),
			a = await vendor(true)
		const booking = a.selection.bookings[0]
		const selection = {
			goodsGroups: [],
			bookings: [booking, { ...booking, intentId: randomUUID(), selection: { ...booking.selection, staffId: a.linked.id } }],
		}
		const cart = await save(c.session.id, selection)
		const q = await quote(c.session.id, cart)
		expect(q.state).toBe('ready')
		expect(JSON.stringify(q)).not.toContain(a.hidden!.id)
		expect(q.snapshot.bookings.map((b) => b.snapshot.selectedStaffId)).toEqual([null, a.linked.id])
		expect(await repository.db.staffAllocation.count({ where: { staffId: { in: [a.linked.id, a.hidden!.id] } } })).toBe(0)
	})
	test('buffers and cross-mode occupancy prevent impossible joint appointment quote readiness', async () => {
		const c = await customer(),
			a = await vendor()
		const booking = a.selection.bookings[0]
		const second = {
			...booking,
			intentId: randomUUID(),
			selection: { ...booking.selection, mode: 'online' as const, locationId: null, start: '2026-10-12T09:45:00Z' },
		}
		const unrelated = { ...booking, intentId: randomUUID(), selection: { ...booking.selection, start: '2026-10-12T12:15:00Z' } }
		const cart = await save(c.session.id, { goodsGroups: [], bookings: [booking, second, unrelated] })
		const q = await quote(c.session.id, cart)
		expect(q.state).toBe('conflicts')
		expect(q.snapshot.conflicts.map((c) => c.code)).toEqual(['capacity_conflict', 'capacity_conflict'])
	})
	test('quote history is immutable, private to Customer/workspace and expires exactly at five minutes', async () => {
		const c = await customer(),
			foreign = await customer(),
			a = await vendor()
		const cart = await save(c.session.id, a.selection)
		const key = randomUUID()
		const q = await quote(c.session.id, cart, key)
		await expect(repository.readMixedQuote(foreign.session.id, q.quoteId)).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(quote(foreign.session.id, cart)).rejects.toBeInstanceOf(AccessDeniedError)
		const alternate = await repository.db.session.create({
			data: { userId: c.user.id, workspaceId: foreign.workspace.id, expiresAt: new Date(Date.now() + 3600000) },
		})
		await expect(repository.readMixedQuote(alternate.id, q.quoteId)).rejects.toBeInstanceOf(AccessDeniedError)
		await expect(repository.db.mixedCheckoutQuote.update({ where: { id: q.quoteId }, data: { snapshot: {} } })).rejects.toThrow('immutable')
		await expect(repository.db.mixedCheckoutQuote.delete({ where: { id: q.quoteId } })).rejects.toThrow('immutable')
		now = new Date(q.expiresAt)
		expect((await repository.readMixedQuote(c.session.id, q.quoteId)).state).toBe('expired')
		const replay = await quote(c.session.id, cart, key)
		expect(replay.replayed).toBe(true)
		expect(replay.expiresAt).toBe(q.expiresAt)
		expect(replay.state).toBe('expired')
	})
	test('unverified or revoked Customers cannot quote and empty Cart never creates a quote', async () => {
		const c = await customer(),
			a = await vendor()
		const cart = await save(c.session.id, a.selection)
		await repository.db.user.update({ where: { id: c.user.id }, data: { adultVerificationState: 'unverified', verifiedAt: null } })
		await expect(quote(c.session.id, cart)).rejects.toBeInstanceOf(AccessDeniedError)
		await repository.db.user.update({ where: { id: c.user.id }, data: { adultVerificationState: 'verified', verifiedAt: new Date() } })
		const empty = await save(c.session.id, { goodsGroups: [], bookings: [] }, 1)
		await expect(quote(c.session.id, empty)).rejects.toBeInstanceOf(GoodsCheckoutConflictError)
		await repository.db.session.update({ where: { id: c.session.id }, data: { revokedAt: new Date() } })
		await expect(repository.readMixedCart(c.session.id)).rejects.toBeInstanceOf(AccessDeniedError)
		expect(await repository.db.mixedCheckoutQuote.count({ where: { workspaceId: c.workspace.id } })).toBe(0)
	})
	test('concurrent quote replay is one snapshot/outbox and changed revision requires a new key', async () => {
		const c = await customer(),
			a = await vendor()
		const cart = await save(c.session.id, a.selection)
		const key = randomUUID()
		const results = await Promise.all([
			quote(c.session.id, cart, key),
			other.createMixedQuote(c.session.id, key, { cartId: cart.cartId, expectedVersion: 1 }),
		])
		expect(results[0].quoteId).toBe(results[1].quoteId)
		expect(results.filter((x) => x.replayed)).toHaveLength(1)
		await expect(repository.createMixedQuote(c.session.id, key, { cartId: cart.cartId, expectedVersion: 2 })).rejects.toBeInstanceOf(
			IdempotencyConflictError,
		)
		expect(await repository.db.mixedCheckoutQuote.count({ where: { workspaceId: c.workspace.id } })).toBe(1)
	})
	test('combined goods/Booking amount is bounded and stale expected Cart revision is rejected', async () => {
		const c = await customer(),
			a = await vendor()
		await repository.db.listing.update({ where: { id: a.product.id }, data: { priceCents: 2147483000 } })
		const selection = structuredClone(a.selection)
		selection.goodsGroups[0].lines[0].expectedUnitPriceCents = 2147483000
		const cart = await save(c.session.id, selection)
		const q = await quote(c.session.id, cart)
		expect(q.state).toBe('conflicts')
		expect(q.snapshot.total).toBeNull()
		expect(q.snapshot.conflicts[0].code).toBe('limit_exceeded')
		await expect(repository.createMixedQuote(c.session.id, randomUUID(), { cartId: cart.cartId, expectedVersion: 0 })).rejects.toBeInstanceOf(
			GoodsCheckoutConflictError,
		)
		expect(MixedCartSelectionSchema.safeParse(selection).success).toBe(true)
	})
	test('SKU, add-on, delivery threshold and policy snapshots retain component choices and totals', async () => {
		const c = await customer(),
			a = await vendor()
		await repository.db.listingVariant.create({ data: { listingId: a.product.id, sku: 'large', label: 'Large', priceCents: 1250 } })
		await repository.createInventoryMovement(a.owner.session.id, randomUUID(), {
			listingId: a.product.id,
			locationId: a.location.id,
			sku: 'large',
			reason: 'received',
			quantityDelta: 10,
		})
		const selection = structuredClone(a.selection)
		selection.goodsGroups[0].lines[0] = { listingId: a.product.id, sku: 'large', quantity: 2, expectedUnitPriceCents: 1250 }
		selection.goodsGroups[0].fulfillment = {
			method: 'delivery',
			zoneId: a.zone.id,
			address: { contactName: 'Buyer', phone: '+251900000000', locality: 'Test city', address: 'Office', point: [41.5, 9.5] },
		}
		selection.bookings[0].selection.addonIds = [a.option.addons[0].id]
		selection.bookings[0].expectedPriceCents = 2000
		const cart = await save(c.session.id, selection),
			q = await quote(c.session.id, cart)
		expect(q.state).toBe('ready')
		expect(q.snapshot.total?.minorUnits).toBe(4700)
		expect(q.snapshot.goods[0].group.deliveryFeeCents).toBe(200)
		expect(q.snapshot.goods[0].group.deliveryZone?.id).toBe(a.zone.id)
		expect(q.snapshot.goods[0].group.lines[0]).toMatchObject({ sku: 'large', quantity: 2, unitPriceCents: 1250, subtotalCents: 2500 })
		expect(q.snapshot.bookings[0].snapshot).toMatchObject({ durationMinutes: 45, priceCents: 2000, timezone: 'UTC', end: '2026-10-12T10:00:00.000Z' })
		selection.goodsGroups[0].lines[0].quantity = 3
		const updated = await save(c.session.id, selection, 1),
			free = await quote(c.session.id, updated)
		expect(free.snapshot.goods[0].group.deliveryFeeCents).toBe(0)
		expect(free.snapshot.total?.minorUnits).toBe(5750)
	})
	test('expired goods and Staff holds do not suppress advisory availability or cause cleanup writes', async () => {
		const c = await customer(),
			a = await vendor()
		const cart = await save(c.session.id, a.selection)
		const goodsQuote = await repository.createGoodsQuote(c.session.id, randomUUID(), {
			groups: [{ ...a.selection.goodsGroups[0], lines: [{ listingId: a.product.id, quantity: 20 }] }],
		})
		const goodsHold = await repository.createGoodsHold(c.session.id, randomUUID(), { quoteId: goodsQuote.quoteId })
		const bookingHold = await repository.createBookingHold(c.session.id, randomUUID(), a.selection.bookings[0].selection)
		now = new Date(now.getTime() + 15 * 60000)
		const movements = await repository.db.inventoryMovement.count()
		const q = await quote(c.session.id, cart)
		expect(q.state).toBe('ready')
		expect(await repository.db.inventoryMovement.count()).toBe(movements)
		expect((await repository.db.goodsHold.findUniqueOrThrow({ where: { id: goodsHold.holdId } })).state).toBe('holding')
		expect((await repository.db.bookingHold.findUniqueOrThrow({ where: { id: bookingHold.holdId } })).state).toBe('holding')
	})
	test('DB preserves Cart identity and rejects owner changes, skipped revision and a sixth intent', async () => {
		const c = await customer(),
			a = await vendor(),
			foreign = await customer()
		const cart = await save(c.session.id, a.selection)
		await expect(
			repository.db.mixedCart.create({ data: { workspaceId: c.workspace.id, customerId: c.user.id, version: 2, selection: a.selection } }),
		).rejects.toThrow('Initial Cart revision')
		await expect(repository.db.mixedCart.update({ where: { id: cart.cartId! }, data: { version: 2, selection: {} } })).rejects.toThrow()
		await expect(
			repository.db.mixedCart.update({
				where: { id: cart.cartId! },
				data: { version: 2, selection: { goodsGroups: [], bookings: [{ ...a.selection.bookings[0], quantity: '1' }] } },
			}),
		).rejects.toThrow('quantity one')
		await expect(repository.db.$executeRaw`TRUNCATE mixed_checkout_quotes CASCADE`).rejects.toThrow('cannot be truncated')

		await expect(repository.db.mixedCart.update({ where: { id: cart.cartId! }, data: { customerId: foreign.user.id, version: 2 } })).rejects.toThrow(
			'stable owner',
		)
		await expect(repository.db.mixedCart.update({ where: { id: cart.cartId! }, data: { version: 3 } })).rejects.toThrow('next version')
		await expect(
			repository.db.mixedCart.update({
				where: { id: cart.cartId! },
				data: {
					version: 2,
					selection: { goodsGroups: [], bookings: Array.from({ length: 6 }, () => ({ ...a.selection.bookings[0], intentId: randomUUID() })) },
				},
			}),
		).rejects.toThrow()
		await expect(
			repository.db.mixedCheckoutQuote.create({
				data: {
					cartId: cart.cartId!,
					cartVersion: 1,
					workspaceId: foreign.workspace.id,
					customerId: foreign.user.id,
					selection: a.selection,
					snapshot: {},
					createdAt: now,
					expiresAt: new Date(now.getTime() + 300000),
				},
			}),
		).rejects.toThrow('scoped Cart revision')
	})
	test('unified quote supports goods-only and appointment-only Carts without forcing empty components', async () => {
		const c = await customer(),
			a = await vendor()
		const goodsOnly = await save(c.session.id, { goodsGroups: a.selection.goodsGroups, bookings: [] })
		const goodsQuote = await quote(c.session.id, goodsOnly)
		expect(goodsQuote.state).toBe('ready')
		expect(goodsQuote.snapshot.total?.minorUnits).toBe(1000)
		expect(goodsQuote.snapshot.bookings).toHaveLength(0)
		const bookingOnly = await save(c.session.id, { goodsGroups: [], bookings: a.selection.bookings }, 1)
		const bookingQuote = await quote(c.session.id, bookingOnly)
		expect(bookingQuote.state).toBe('ready')
		expect(bookingQuote.snapshot.total?.minorUnits).toBe(1500)
		expect(bookingQuote.snapshot.goods).toHaveLength(0)
	})
})
