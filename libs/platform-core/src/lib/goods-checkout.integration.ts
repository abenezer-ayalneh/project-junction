/* eslint-disable @typescript-eslint/no-non-null-assertion -- integration suite requires DATABASE_URL */
import { randomUUID } from 'node:crypto'

import { GoodsCustomerDeliveryReadSchema, GoodsCustomerPickupReadSchema, type GoodsQuoteCommand } from 'contracts'

import { AccessDeniedError } from './access.js'
import { GoodsCheckoutConflictError } from './goods-checkout.js'
import { IdempotencyConflictError } from './idempotency.js'
import { LocalGoodsPaymentAdapter } from './local-goods-payment.js'
import { PostgresFoundation } from './postgres-foundation.js'

const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('Phase 02 goods quotes and holds PostgreSQL', () => {
	let repository: PostgresFoundation
	let other: PostgresFoundation
	let now: Date
	let customer: { userId: string; sessionId: string; workspaceId: string }
	const clock = () => new Date(now)

	async function createCustomer() {
		const workspace = await repository.db.workspace.create({ data: { kind: 'real' } })
		const user = await repository.db.user.create({
			data: { email: `${randomUUID()}@example.invalid`, adultVerificationState: 'verified', verifiedAt: new Date() },
		})
		const session = await repository.db.session.create({ data: { userId: user.id, workspaceId: workspace.id, expiresAt: new Date(Date.now() + 3600000) } })
		return { userId: user.id, sessionId: session.id, workspaceId: workspace.id }
	}
	async function createVendor(stock = 3, variant = false) {
		const owner = await createCustomer()
		const vendor = await repository.db.vendor.create({
			data: {
				workspaceId: owner.workspaceId,
				applicationState: 'approved',
				publishedAt: new Date(),
				publicSlug: randomUUID(),
				displayName: 'Goods fixture Vendor',
			},
		})
		const location = await repository.db.location.create({ data: { vendorId: vendor.id, label: 'Shop', city: 'Test city' } })
		await repository.db.vendorMembership.create({ data: { vendorId: vendor.id, userId: owner.userId, role: 'vendor_owner', locationIds: [location.id] } })
		await repository.db.session.update({ where: { id: owner.sessionId }, data: { activeVendorId: vendor.id, activeRole: 'vendor_owner' } })
		const listing = await repository.createListing(owner.sessionId, randomUUID(), {
			kind: 'product',
			category: 'goods',
			title: 'Goods quote fixture',
			description: 'Disposable goods quote and hold test product.',
			...(variant
				? {
						variants: [
							{ sku: 'small', label: 'Small', priceCents: 1000 },
							{ sku: 'large', label: 'Large', priceCents: 2000 },
						],
					}
				: { priceCents: 1000 }),
		})
		await repository.db.listing.update({ where: { id: listing.id }, data: { state: 'published' } })
		if (stock)
			await repository.createInventoryMovement(owner.sessionId, randomUUID(), {
				listingId: listing.id,
				locationId: location.id,
				...(variant ? { sku: 'small' } : {}),
				reason: 'received',
				quantityDelta: stock,
			})
		const zone = {
			id: randomUUID(),
			label: 'Local zone',
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
		const configuration = { pickupEnabled: true, returnTemplate: 'standard', deliveryZones: [zone] }
		await repository.configureGoodsLocation(owner.sessionId, randomUUID(), location.id, { expectedVersion: 0, configuration })
		const selection: GoodsQuoteCommand = {
			groups: [
				{
					vendorId: vendor.id,
					locationId: location.id,
					fulfillment: { method: 'pickup' },
					lines: [{ listingId: listing.id, ...(variant ? { sku: 'small' } : {}), quantity: 1 }],
				},
			],
		}
		return { owner, vendor, location, listing, configuration, zone, selection }
	}
	beforeEach(async () => {
		now = new Date()
		repository = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, undefined, undefined, undefined, clock)
		other = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, undefined, undefined, undefined, clock)
		customer = await createCustomer()
	})
	afterEach(async () => {
		now = new Date(Date.now() + 3600000)
		await repository.expireGoodsHolds()
		await repository.reconcileGoodsRefunds()
		await Promise.all([repository.close(), other.close()])
	})

	it('goods quote snapshots prices, delivery, pickup and policies across Vendor workspaces without reserving stock', async () => {
		const first = await createVendor(4, true)
		const second = await createVendor(4)
		const selection: GoodsQuoteCommand = {
			groups: [
				first.selection.groups[0],
				{
					...second.selection.groups[0],
					fulfillment: {
						method: 'delivery',
						zoneId: second.zone.id,
						address: {
							contactName: 'Customer',
							phone: '+251900000000',
							locality: 'City',
							address: 'Street',
							instructions: 'Gate',
							point: [41.5, 9.5],
						},
					},
					lines: [{ listingId: second.listing.id, quantity: 2 }],
				},
			],
		}
		await repository.configureGoodsLocation(first.owner.sessionId, randomUUID(), first.location.id, {
			expectedVersion: 1,
			configuration: { ...first.configuration, returnTemplate: 'flexible' },
		})
		const key = randomUUID()
		const quote = await repository.createGoodsQuote(customer.sessionId, key, selection)
		expect(quote.snapshot).toMatchObject({ currency: 'ETB', totalCents: 3200 })
		expect(quote.snapshot.groups[0]).toMatchObject({
			pickupWindowHours: 72,
			pickupGraceHours: 48,
			lines: [{ sku: 'small', unitPriceCents: 1000, policy: { changeOfMindDays: 14, faultProtectionDays: 30, restockingFeeCents: 0 } }],
		})
		expect(quote.snapshot.groups[1]).toMatchObject({
			deliveryFeeCents: 200,
			etaMinutes: 60,
			failedDeliveryRetryHours: 48,
			deliveryZone: { id: second.zone.id },
			fulfillment: { address: { point: [41.5, 9.5] } },
		})
		expect(new Date(quote.expiresAt).getTime() - now.getTime()).toBe(5 * 60_000)
		await expect(repository.createGoodsQuote(customer.sessionId, key, selection)).resolves.toEqual({ ...quote, replayed: true })
		await expect(repository.createGoodsQuote(customer.sessionId, key, first.selection)).rejects.toThrow(IdempotencyConflictError)
		expect(await repository.db.inventoryMovement.count({ where: { reason: 'held', listingId: { in: [first.listing.id, second.listing.id] } } })).toBe(0)
		selection.groups[1].lines[0].quantity = 3
		const free = await repository.createGoodsQuote(customer.sessionId, randomUUID(), selection)
		expect(free.snapshot.groups[1].deliveryFeeCents).toBe(0)
		const hold = await repository.createGoodsHold(customer.sessionId, randomUUID(), { quoteId: quote.quoteId })
		await expect(repository.readGoodsHold(customer.sessionId, hold.holdId)).resolves.toMatchObject({ state: 'holding', snapshot: quote.snapshot })
		await expect(
			repository.readInventoryAvailability(first.owner.sessionId, first.listing.id, { locationId: first.location.id, sku: 'small' }),
		).resolves.toMatchObject({ reserved: 1, available: 3 })
		await expect(
			repository.readInventoryAvailability(second.owner.sessionId, second.listing.id, { locationId: second.location.id }),
		).resolves.toMatchObject({ reserved: 2, available: 2 })
	})

	it('goods quote validates zone boundaries, selections and current prices without changing stock', async () => {
		const fixture = await createVendor(3)
		const quote = (selection: GoodsQuoteCommand) => repository.createGoodsQuote(customer.sessionId, randomUUID(), selection)
		const delivery: GoodsQuoteCommand = structuredClone(fixture.selection)
		delivery.groups[0].fulfillment = {
			method: 'delivery',
			zoneId: fixture.zone.id,
			address: { contactName: 'Customer', phone: '+251900000000', locality: 'City', address: 'Street', point: [41, 9.5] },
		}
		const boundary = await quote(delivery)
		expect(boundary.snapshot.groups[0]).toMatchObject({ deliveryFeeCents: 200, etaMinutes: 60 })
		expect(boundary.snapshot.groups[0].lines[0].policy).toEqual({
			returnTemplate: 'standard',
			changeOfMindDays: 7,
			faultProtectionDays: 30,
			restockingFeeCents: 0,
			startsAt: 'verified_handoff',
		})
		delivery.groups[0].fulfillment.address.point = [40.999999, 9.5]
		await expect(quote(delivery)).rejects.toThrow(GoodsCheckoutConflictError)
		delivery.groups[0].fulfillment.address.point = [41, 9]
		await expect(quote(delivery)).resolves.toMatchObject({ snapshot: { totalCents: 1200 } })
		delivery.groups[0].fulfillment.zoneId = randomUUID()
		await expect(quote(delivery)).rejects.toThrow(GoodsCheckoutConflictError)
		const duplicateVendor = { groups: [fixture.selection.groups[0], { ...fixture.selection.groups[0], locationId: randomUUID() }] }
		await expect(quote(duplicateVendor)).rejects.toThrow()
		const duplicateLine = structuredClone(fixture.selection)
		duplicateLine.groups[0].lines.push({ ...duplicateLine.groups[0].lines[0] })
		await expect(quote(duplicateLine)).rejects.toThrow()
		const unavailable = structuredClone(fixture.selection)
		unavailable.groups[0].lines[0].quantity = 4
		await expect(quote(unavailable)).rejects.toThrow(GoodsCheckoutConflictError)
		unavailable.groups[0].lines[0].quantity = 1.5
		await expect(quote(unavailable)).rejects.toThrow()
		unavailable.groups[0].lines[0].quantity = 1
		unavailable.groups[0].locationId = randomUUID()
		await expect(quote(unavailable)).rejects.toThrow(AccessDeniedError)
		await repository.db.listing.update({ where: { id: fixture.listing.id }, data: { priceCents: 900, version: { increment: 1 } } })
		expect(boundary.snapshot.groups[0].lines[0].unitPriceCents).toBe(1000)
		await expect(quote(fixture.selection)).resolves.toMatchObject({ snapshot: { totalCents: 900, groups: [{ lines: [{ unitPriceCents: 900 }] }] } })
		delivery.groups[0].fulfillment.zoneId = fixture.zone.id
		await expect(quote(delivery)).rejects.toThrow(GoodsCheckoutConflictError)
		await repository.configureGoodsLocation(fixture.owner.sessionId, randomUUID(), fixture.location.id, {
			expectedVersion: 1,
			configuration: { ...fixture.configuration, pickupEnabled: false },
		})
		await expect(quote(fixture.selection)).rejects.toThrow(GoodsCheckoutConflictError)
		await expect(
			repository.readInventoryAvailability(fixture.owner.sessionId, fixture.listing.id, { locationId: fixture.location.id }),
		).resolves.toMatchObject({ onHand: 3, reserved: 0, available: 3 })
		expect(await repository.db.inventoryMovement.count({ where: { listingId: fixture.listing.id } })).toBe(1)
	})

	it('goods competing holds cannot oversell; concurrent duplicate hold and release retries affect the ledger once', async () => {
		const fixture = await createVendor(1)
		const rival = await createCustomer()
		const quotes = await Promise.all([
			repository.createGoodsQuote(customer.sessionId, randomUUID(), fixture.selection),
			other.createGoodsQuote(rival.sessionId, randomUUID(), fixture.selection),
		])
		const results = await Promise.allSettled([
			repository.createGoodsHold(customer.sessionId, randomUUID(), { quoteId: quotes[0].quoteId }),
			other.createGoodsHold(rival.sessionId, randomUUID(), { quoteId: quotes[1].quoteId }),
		])
		expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
		expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1)
		expect(await repository.db.inventoryMovement.count({ where: { listingId: fixture.listing.id, reason: 'held' } })).toBe(1)
		const winner = results[0].status === 'fulfilled' ? customer : rival
		const winningQuote = quotes[results[0].status === 'fulfilled' ? 0 : 1]
		const live = await repository.db.goodsHold.findUniqueOrThrow({ where: { quoteId: winningQuote.quoteId } })
		await expect(
			repository.createInventoryMovement(fixture.owner.sessionId, randomUUID(), {
				locationId: fixture.location.id,
				listingId: fixture.listing.id,
				reason: 'damaged',
				quantityDelta: -1,
				note: 'Held stock cannot be damaged away',
			}),
		).rejects.toThrow(AccessDeniedError)
		const releaseKey = randomUUID()
		await Promise.all([repository.releaseGoodsHold(winner.sessionId, releaseKey, live.id), other.releaseGoodsHold(winner.sessionId, releaseKey, live.id)])
		expect(await repository.db.inventoryMovement.count({ where: { holdId: live.id, reason: 'released' } })).toBe(1)
		const fresh = await repository.createGoodsQuote(customer.sessionId, randomUUID(), fixture.selection)
		const key = randomUUID()
		const duplicates = await Promise.all([
			repository.createGoodsHold(customer.sessionId, key, { quoteId: fresh.quoteId }),
			other.createGoodsHold(customer.sessionId, key, { quoteId: fresh.quoteId }),
		])
		expect(duplicates[0].holdId).toBe(duplicates[1].holdId)
		expect(duplicates.filter(({ replayed }) => replayed)).toHaveLength(1)
		await expect(repository.createGoodsHold(customer.sessionId, randomUUID(), { quoteId: fresh.quoteId })).rejects.toThrow(GoodsCheckoutConflictError)
		await expect(repository.createGoodsHold(customer.sessionId, key, { quoteId: quotes[0].quoteId })).rejects.toThrow(IdempotencyConflictError)
		const destination = await repository.db.location.create({ data: { vendorId: fixture.vendor.id } })
		await repository.db.vendorMembership.update({
			where: { userId_vendorId: { userId: fixture.owner.userId, vendorId: fixture.vendor.id } },
			data: { locationIds: [fixture.location.id, destination.id] },
		})
		await expect(
			repository.createInventoryTransfer(fixture.owner.sessionId, randomUUID(), {
				sourceLocationId: fixture.location.id,
				destinationLocationId: destination.id,
				listingId: fixture.listing.id,
				quantity: 1,
				note: 'Held stock cannot be transferred',
			}),
		).rejects.toThrow(AccessDeniedError)
	})

	it('goods hold rollback preserves all stock, audit, outbox and replay records when a later line write fails', async () => {
		const first = await createVendor()
		const second = await createVendor()
		const selection = { groups: [first.selection.groups[0], second.selection.groups[0]] }
		const quote = await repository.createGoodsQuote(customer.sessionId, randomUUID(), selection)
		const before = await Promise.all([
			repository.db.inventoryMovement.count(),
			repository.db.auditLog.count(),
			repository.db.outboxEvent.count(),
			repository.db.idempotencyRecord.count(),
		])
		await repository.db.$executeRawUnsafe(
			`CREATE FUNCTION reject_test_goods_line() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason = 'held' AND NEW.listing_id = '${second.listing.id}'::uuid THEN RAISE EXCEPTION 'Deliberate second line failure'; END IF; RETURN NEW; END; $$`,
		)
		await repository.db.$executeRawUnsafe(
			'CREATE TRIGGER reject_test_goods_line BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION reject_test_goods_line()',
		)
		const key = randomUUID()
		try {
			await expect(repository.createGoodsHold(customer.sessionId, key, { quoteId: quote.quoteId })).rejects.toThrow()
		} finally {
			await repository.db.$executeRawUnsafe('DROP TRIGGER reject_test_goods_line ON inventory_movements')
			await repository.db.$executeRawUnsafe('DROP FUNCTION reject_test_goods_line()')
		}
		expect(
			await Promise.all([
				repository.db.inventoryMovement.count(),
				repository.db.auditLog.count(),
				repository.db.outboxEvent.count(),
				repository.db.idempotencyRecord.count(),
			]),
		).toEqual(before)
		expect(await repository.db.goodsHold.count({ where: { quoteId: quote.quoteId } })).toBe(0)
		const hold = await repository.createGoodsHold(customer.sessionId, key, { quoteId: quote.quoteId })
		expect(await repository.db.goodsHoldLine.count({ where: { holdId: hold.holdId } })).toBe(2)
	})

	it('goods hold expiry releases all lines once at the fifteen-minute boundary and requires a fresh quote', async () => {
		const fixture = await createVendor(2)
		const quote = await repository.createGoodsQuote(customer.sessionId, randomUUID(), fixture.selection)
		const key = randomUUID()
		const hold = await repository.createGoodsHold(customer.sessionId, key, { quoteId: quote.quoteId })
		expect(new Date(hold.expiresAt).getTime() - now.getTime()).toBe(15 * 60_000)
		now = new Date(new Date(hold.expiresAt).getTime() - 1)
		expect(await repository.expireGoodsHolds()).toBe(0)
		now = new Date(hold.expiresAt)
		expect((await Promise.all([repository.expireGoodsHolds(), other.expireGoodsHolds()])).sort()).toEqual([0, 1])
		await expect(repository.readGoodsHold(customer.sessionId, hold.holdId)).resolves.toMatchObject({ state: 'expired', snapshot: quote.snapshot })
		expect(await repository.db.inventoryMovement.count({ where: { holdId: hold.holdId, reason: 'released' } })).toBe(1)
		await expect(repository.createGoodsHold(customer.sessionId, key, { quoteId: quote.quoteId })).resolves.toEqual({ ...hold, replayed: true })
		await expect(repository.createGoodsHold(customer.sessionId, randomUUID(), { quoteId: quote.quoteId })).rejects.toThrow(GoodsCheckoutConflictError)
		await expect(repository.releaseGoodsHold(customer.sessionId, randomUUID(), hold.holdId)).resolves.toMatchObject({ state: 'expired' })
		const fresh = await repository.createGoodsQuote(customer.sessionId, randomUUID(), fixture.selection)
		const freshHold = await repository.createGoodsHold(customer.sessionId, randomUUID(), { quoteId: fresh.quoteId })
		now = new Date(freshHold.expiresAt)
		await expect(repository.readGoodsHold(customer.sessionId, freshHold.holdId)).resolves.toMatchObject({ state: 'expired' })
		expect(await repository.expireGoodsHolds()).toBe(0)
	})

	it('goods hold and concurrent damage serialize without negative availability', async () => {
		const fixture = await createVendor(1)
		const quote = await repository.createGoodsQuote(customer.sessionId, randomUUID(), fixture.selection)
		const results = await Promise.allSettled([
			repository.createGoodsHold(customer.sessionId, randomUUID(), { quoteId: quote.quoteId }),
			other.createInventoryMovement(fixture.owner.sessionId, randomUUID(), {
				listingId: fixture.listing.id,
				locationId: fixture.location.id,
				reason: 'damaged',
				quantityDelta: -1,
				note: 'Concurrent damage',
			}),
		])
		expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
		expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1)
		const balance = await repository.readInventoryAvailability(fixture.owner.sessionId, fixture.listing.id, { locationId: fixture.location.id })
		expect(balance.available).toBe(0)
		expect(balance.onHand).toBe(balance.reserved)
		expect(balance.reserved).toBe(results[0].status === 'fulfilled' ? 1 : 0)
	})

	it('goods multi-Vendor release rolls back on later-line failure and races expiry exactly once', async () => {
		const first = await createVendor(1)
		const second = await createVendor(1, true)
		const quote = await repository.createGoodsQuote(customer.sessionId, randomUUID(), { groups: [first.selection.groups[0], second.selection.groups[0]] })
		const hold = await repository.createGoodsHold(customer.sessionId, randomUUID(), { quoteId: quote.quoteId })
		const before = await Promise.all([
			repository.db.inventoryMovement.count(),
			repository.db.auditLog.count(),
			repository.db.outboxEvent.count(),
			repository.db.idempotencyRecord.count(),
		])
		await repository.db.$executeRawUnsafe(
			`CREATE FUNCTION reject_test_release() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason = 'released' AND NEW.listing_id = '${second.listing.id}'::uuid THEN RAISE EXCEPTION 'Deliberate second release failure'; END IF; RETURN NEW; END; $$`,
		)
		await repository.db.$executeRawUnsafe(
			'CREATE TRIGGER reject_test_release BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION reject_test_release()',
		)
		const key = randomUUID()
		try {
			await expect(repository.releaseGoodsHold(customer.sessionId, key, hold.holdId)).rejects.toThrow()
		} finally {
			await repository.db.$executeRawUnsafe('DROP TRIGGER reject_test_release ON inventory_movements')
			await repository.db.$executeRawUnsafe('DROP FUNCTION reject_test_release()')
		}
		expect(
			await Promise.all([
				repository.db.inventoryMovement.count(),
				repository.db.auditLog.count(),
				repository.db.outboxEvent.count(),
				repository.db.idempotencyRecord.count(),
			]),
		).toEqual(before)
		await expect(repository.readGoodsHold(customer.sessionId, hold.holdId)).resolves.toMatchObject({ state: 'holding' })
		now = new Date(hold.expiresAt)
		await Promise.all([repository.releaseGoodsHold(customer.sessionId, key, hold.holdId), other.expireGoodsHolds()])
		await expect(repository.releaseGoodsHold(customer.sessionId, key, hold.holdId)).resolves.toMatchObject({ state: 'expired', replayed: true })
		expect(await repository.db.inventoryMovement.count({ where: { holdId: hold.holdId, reason: 'released' } })).toBe(2)
		expect(await repository.db.auditLog.count({ where: { action: 'goods.hold-expired', metadata: { path: ['holdId'], equals: hold.holdId } } })).toBe(1)
		await expect(repository.readInventoryAvailability(first.owner.sessionId, first.listing.id, { locationId: first.location.id })).resolves.toMatchObject({
			reserved: 0,
			available: 1,
		})
		await expect(
			repository.readInventoryAvailability(second.owner.sessionId, second.listing.id, { locationId: second.location.id, sku: 'small' }),
		).resolves.toMatchObject({ reserved: 0, available: 1 })
	})

	it('goods worker expiry restores stock after Customer revocation and Vendor unpublication', async () => {
		const fixture = await createVendor(1)
		const quote = await repository.createGoodsQuote(customer.sessionId, randomUUID(), fixture.selection)
		const hold = await repository.createGoodsHold(customer.sessionId, randomUUID(), { quoteId: quote.quoteId })
		await repository.db.user.update({ where: { id: customer.userId }, data: { adultVerificationState: 'unverified', verifiedAt: null } })
		await repository.db.listing.update({ where: { id: fixture.listing.id }, data: { state: 'unpublished' } })
		await expect(repository.releaseGoodsHold(customer.sessionId, randomUUID(), hold.holdId)).rejects.toThrow(AccessDeniedError)
		now = new Date(hold.expiresAt)
		expect(await repository.expireGoodsHolds()).toBe(1)
		expect(await repository.expireGoodsHolds()).toBe(0)
		await expect(
			repository.readInventoryAvailability(fixture.owner.sessionId, fixture.listing.id, { locationId: fixture.location.id }),
		).resolves.toMatchObject({ onHand: 1, reserved: 0, available: 1 })
		expect(await repository.db.inventoryMovement.count({ where: { holdId: hold.holdId, reason: 'released' } })).toBe(1)
	})

	it('goods hold rejects expired, stale-price, policy, fulfillment and publication quotes without reservation', async () => {
		const fixture = await createVendor()
		const quote = await repository.createGoodsQuote(customer.sessionId, randomUUID(), fixture.selection)
		await repository.db.listing.update({ where: { id: fixture.listing.id }, data: { priceCents: 1200 } })
		await expect(repository.createGoodsHold(customer.sessionId, randomUUID(), { quoteId: quote.quoteId })).rejects.toThrow(GoodsCheckoutConflictError)
		expect((await repository.db.goodsQuote.findUniqueOrThrow({ where: { id: quote.quoteId } })).snapshot).toEqual(quote.snapshot)
		const current = await repository.createGoodsQuote(customer.sessionId, randomUUID(), fixture.selection)
		await repository.configureGoodsLocation(fixture.owner.sessionId, randomUUID(), fixture.location.id, {
			expectedVersion: 1,
			configuration: { ...fixture.configuration, returnTemplate: 'flexible' },
		})
		await expect(repository.createGoodsHold(customer.sessionId, randomUUID(), { quoteId: current.quoteId })).rejects.toThrow(GoodsCheckoutConflictError)
		const latest = await repository.createGoodsQuote(customer.sessionId, randomUUID(), fixture.selection)
		await repository.db.listing.update({ where: { id: fixture.listing.id }, data: { state: 'unpublished' } })
		await expect(repository.createGoodsHold(customer.sessionId, randomUUID(), { quoteId: latest.quoteId })).rejects.toThrow(AccessDeniedError)
		await repository.db.listing.update({ where: { id: fixture.listing.id }, data: { state: 'published' } })
		now = new Date(latest.expiresAt)
		await expect(repository.createGoodsHold(customer.sessionId, randomUUID(), { quoteId: latest.quoteId })).rejects.toThrow(GoodsCheckoutConflictError)
		expect(await repository.db.inventoryMovement.count({ where: { listingId: fixture.listing.id, reason: 'held' } })).toBe(0)
	})

	it('goods checkout denies foreign identity, unavailable selections and invalid zone configuration', async () => {
		const fixture = await createVendor(3, true)
		const rival = await createCustomer()
		const key = randomUUID()
		const configured = await repository.readGoodsLocationConfiguration(fixture.owner.sessionId, fixture.location.id)
		const command = { expectedVersion: configured.version, configuration: fixture.configuration }
		const update = await repository.configureGoodsLocation(fixture.owner.sessionId, key, fixture.location.id, command)
		await expect(repository.configureGoodsLocation(fixture.owner.sessionId, key, fixture.location.id, command)).resolves.toEqual({
			...update,
			replayed: true,
		})
		await expect(repository.configureGoodsLocation(fixture.owner.sessionId, randomUUID(), fixture.location.id, command)).rejects.toThrow(
			GoodsCheckoutConflictError,
		)
		await expect(repository.configureGoodsLocation(customer.sessionId, randomUUID(), fixture.location.id, command)).rejects.toThrow(AccessDeniedError)
		const quote = await repository.createGoodsQuote(customer.sessionId, randomUUID(), fixture.selection)
		await expect(repository.createGoodsHold(rival.sessionId, randomUUID(), { quoteId: quote.quoteId })).rejects.toThrow(AccessDeniedError)
		const hold = await repository.createGoodsHold(customer.sessionId, randomUUID(), { quoteId: quote.quoteId })
		await expect(repository.readGoodsHold(rival.sessionId, hold.holdId)).rejects.toThrow(AccessDeniedError)
		await expect(repository.releaseGoodsHold(rival.sessionId, randomUUID(), hold.holdId)).rejects.toThrow(AccessDeniedError)
		await expect(repository.createGoodsQuote(undefined, randomUUID(), fixture.selection)).rejects.toThrow(AccessDeniedError)
		await repository.db.user.update({ where: { id: rival.userId }, data: { adultVerificationState: 'unverified', verifiedAt: null } })
		await expect(repository.createGoodsQuote(rival.sessionId, randomUUID(), fixture.selection)).rejects.toThrow(AccessDeniedError)
		const invalid = structuredClone(fixture.selection)
		delete invalid.groups[0].lines[0].sku
		await expect(repository.createGoodsQuote(customer.sessionId, randomUUID(), invalid)).rejects.toThrow(AccessDeniedError)
		invalid.groups[0].lines[0].sku = 'large'
		await expect(repository.createGoodsQuote(customer.sessionId, randomUUID(), invalid)).rejects.toThrow(GoodsCheckoutConflictError)
		invalid.groups[0].lines[0].quantity = 0
		await expect(repository.createGoodsQuote(customer.sessionId, randomUUID(), invalid)).rejects.toThrow()
		const delivery: GoodsQuoteCommand = structuredClone(fixture.selection)
		delivery.groups[0].fulfillment = {
			method: 'delivery',
			zoneId: fixture.zone.id,
			address: { contactName: 'Customer', phone: '+251900000000', locality: 'City', address: 'Street', point: [43, 9.5] },
		}
		await expect(repository.createGoodsQuote(customer.sessionId, randomUUID(), delivery)).rejects.toThrow(GoodsCheckoutConflictError)
		const invalidConfiguration = {
			...fixture.configuration,
			deliveryZones: [
				{
					...fixture.zone,
					polygon: [
						[41, 9],
						[42, 10],
						[42, 9],
						[41, 10],
						[41, 9],
					],
				},
			],
		}
		await expect(
			repository.configureGoodsLocation(fixture.owner.sessionId, randomUUID(), fixture.location.id, {
				expectedVersion: update.version,
				configuration: invalidConfiguration,
			}),
		).rejects.toThrow(GoodsCheckoutConflictError)
	})

	it('goods database guards reject orphan reservations, partial releases and mutable snapshots', async () => {
		const fixture = await createVendor()
		const quote = await repository.createGoodsQuote(customer.sessionId, randomUUID(), fixture.selection)
		const hold = await repository.createGoodsHold(customer.sessionId, randomUUID(), { quoteId: quote.quoteId })
		await expect(repository.db.goodsQuote.update({ where: { id: quote.quoteId }, data: { snapshot: {} } })).rejects.toThrow()
		const line = await repository.db.goodsHoldLine.findFirstOrThrow({ where: { holdId: hold.holdId } })
		await expect(repository.db.goodsHoldLine.update({ where: { id: line.id }, data: { quantity: 2 } })).rejects.toThrow()
		await expect(repository.db.goodsHold.update({ where: { id: hold.holdId }, data: { state: 'released', releasedAt: new Date() } })).rejects.toThrow()
		await expect(
			repository.db.inventoryMovement.create({
				data: {
					listingId: fixture.listing.id,
					locationId: fixture.location.id,
					holdId: hold.holdId,
					sku: 'other',
					reason: 'held',
					onHandDelta: 0,
					reservedDelta: 1,
					actorKind: 'user',
					actorId: customer.userId,
				},
			}),
		).rejects.toThrow()
		await repository.releaseGoodsHold(customer.sessionId, randomUUID(), hold.holdId)
		await expect(repository.db.goodsHold.update({ where: { id: hold.holdId }, data: { state: 'holding', releasedAt: null } })).rejects.toThrow()
	})

	async function beginPayment(selection: GoodsQuoteCommand, sessionId = customer.sessionId) {
		const quote = await repository.createGoodsQuote(sessionId, randomUUID(), selection)
		const hold = await repository.createGoodsHold(sessionId, randomUUID(), { quoteId: quote.quoteId })
		const payment = await repository.startGoodsPayment(sessionId, randomUUID(), { holdId: hold.holdId })
		return { quote, hold, payment }
	}

	it('goods payment starts its fifteen-minute window once, scopes replay and denies non-local simulation', async () => {
		const fixture = await createVendor()
		const quote = await repository.createGoodsQuote(customer.sessionId, randomUUID(), fixture.selection)
		const hold = await repository.createGoodsHold(customer.sessionId, randomUUID(), { quoteId: quote.quoteId })
		now = new Date(now.getTime() + 5 * 60_000)
		const key = randomUUID()
		const payment = await repository.startGoodsPayment(customer.sessionId, key, { holdId: hold.holdId })
		expect(Date.parse(payment.expiresAt) - now.getTime()).toBe(15 * 60_000)
		expect(payment.expiresAt).not.toBe(hold.expiresAt)
		now = new Date(now.getTime() + 60_000)
		await expect(repository.startGoodsPayment(customer.sessionId, key, { holdId: hold.holdId })).resolves.toEqual({ ...payment, replayed: true })
		await expect(repository.startGoodsPayment(customer.sessionId, randomUUID(), { holdId: hold.holdId })).rejects.toThrow(GoodsCheckoutConflictError)
		const stranger = await createCustomer()
		await expect(repository.readGoodsPayment(stranger.sessionId, payment.paymentId)).rejects.toThrow(AccessDeniedError)
		await expect(repository.recordLocalGoodsPaymentResult(stranger.sessionId, randomUUID(), payment.paymentId, { outcome: 'succeeded' })).rejects.toThrow(
			AccessDeniedError,
		)
		await expect(
			repository.recordLocalGoodsPaymentResult(customer.sessionId, randomUUID(), payment.paymentId, {
				outcome: 'succeeded',
				succeededAt: now.toISOString(),
			}),
		).rejects.toThrow()
		const runtime = process.env['JUNCTION_RUNTIME_MODE']
		process.env['JUNCTION_RUNTIME_MODE'] = 'staging'
		try {
			await expect(repository.startGoodsPayment(customer.sessionId, randomUUID(), { holdId: hold.holdId })).rejects.toThrow(AccessDeniedError)
		} finally {
			process.env['JUNCTION_RUNTIME_MODE'] = runtime
		}
	})

	it('goods payment commits multi-Vendor simple and variant Orders once with immutable paid snapshots', async () => {
		const first = await createVendor(3, true)
		const second = await createVendor(3)
		const { payment, quote } = await beginPayment({ groups: [first.selection.groups[0], second.selection.groups[0]] })
		const key = randomUUID()
		await repository.recordLocalGoodsPaymentResult(customer.sessionId, key, payment.paymentId, { outcome: 'succeeded' })
		await expect(repository.recordLocalGoodsPaymentResult(customer.sessionId, key, payment.paymentId, { outcome: 'succeeded' })).resolves.toMatchObject({
			replayed: true,
		})
		await Promise.all([
			repository.reconcileGoodsPayments(),
			other.reconcileGoodsPayments(),
			repository.readGoodsPayment(customer.sessionId, payment.paymentId),
		])
		const paid = await repository.readGoodsPayment(customer.sessionId, payment.paymentId)
		expect(paid).toMatchObject({ state: 'succeeded', holdState: 'committed' })
		if (!paid.purchaseId) throw new Error('Purchase missing')
		const purchase = await repository.readGoodsPurchase(customer.sessionId, paid.purchaseId)
		expect(purchase.snapshot).toEqual(quote.snapshot)
		expect(purchase.orders).toHaveLength(2)
		expect(await repository.db.goodsPurchase.count({ where: { paymentId: payment.paymentId } })).toBe(1)
		for (const order of purchase.orders) {
			expect(order.state).toBe('confirmed')
			expect(order.lines).toHaveLength(1)
			const fixture = order.vendorId === first.vendor.id ? first : second
			await expect(repository.readGoodsVendorOrder(fixture.owner.sessionId, order.orderId)).resolves.toEqual(order)
			await expect(repository.readGoodsVendorOrder((fixture === first ? second : first).owner.sessionId, order.orderId)).rejects.toThrow(
				AccessDeniedError,
			)
		}
		expect(await repository.db.inventoryMovement.count({ where: { holdId: payment.holdId, reason: 'sold' } })).toBe(2)
		await expect(repository.readPublicProductAvailability(first.listing.id, { locationId: first.location.id, sku: 'small' })).resolves.toMatchObject({
			available: 2,
		})
		await expect(repository.releaseGoodsHold(customer.sessionId, randomUUID(), payment.holdId)).rejects.toThrow(GoodsCheckoutConflictError)
		await expect(
			repository.db.goodsVendorOrder.create({
				data: {
					purchaseId: paid.purchaseId,
					vendorId: first.vendor.id,
					vendorWorkspaceId: first.owner.workspaceId,
					locationId: first.location.id,
					snapshot: quote.snapshot.groups[0] as never,
				},
			}),
		).rejects.toThrow()
		await expect(repository.db.goodsPurchase.update({ where: { id: paid.purchaseId }, data: { snapshot: {} } })).rejects.toThrow()
		await expect(repository.db.goodsOrderLine.update({ where: { id: purchase.orders[0].lines[0].lineId }, data: { snapshot: {} } })).rejects.toThrow()
		await expect(repository.db.goodsPaymentAttempt.update({ where: { id: payment.paymentId }, data: { amountCents: 1 } })).rejects.toThrow()
		await expect(repository.recordLocalGoodsPaymentResult(customer.sessionId, randomUUID(), payment.paymentId, { outcome: 'failed' })).rejects.toThrow(
			GoodsCheckoutConflictError,
		)
		const stranger = await createCustomer()
		await expect(repository.readGoodsPurchase(stranger.sessionId, paid.purchaseId)).rejects.toThrow(AccessDeniedError)
		await repository.db.vendorMembership.updateMany({ where: { vendorId: first.vendor.id, userId: first.owner.userId }, data: { revokedAt: new Date() } })
		const firstOrder = purchase.orders.find((order) => order.vendorId === first.vendor.id)!
		await expect(repository.readGoodsVendorOrder(first.owner.sessionId, firstOrder.orderId)).rejects.toThrow(AccessDeniedError)
	})

	it('goods payment unknown stays reconcilable and authoritative failure releases stock once', async () => {
		const fixture = await createVendor(1)
		const { payment } = await beginPayment(fixture.selection)
		await repository.recordLocalGoodsPaymentResult(customer.sessionId, randomUUID(), payment.paymentId, { outcome: 'unknown' })
		await expect(repository.readGoodsPayment(customer.sessionId, payment.paymentId)).resolves.toMatchObject({
			state: 'unknown',
			purchaseId: null,
			holdState: 'awaiting_payment',
		})
		await expect(repository.readPublicProductAvailability(fixture.listing.id, { locationId: fixture.location.id })).resolves.toMatchObject({ available: 0 })
		await repository.recordLocalGoodsPaymentResult(customer.sessionId, randomUUID(), payment.paymentId, { outcome: 'failed' })
		await Promise.all([repository.reconcileGoodsPayments(), other.reconcileGoodsPayments()])
		await expect(repository.readGoodsPayment(customer.sessionId, payment.paymentId)).resolves.toMatchObject({
			state: 'failed',
			holdState: 'released',
			purchaseId: null,
		})
		await expect(repository.readPublicProductAvailability(fixture.listing.id, { locationId: fixture.location.id })).resolves.toMatchObject({ available: 1 })
		expect(await repository.db.inventoryMovement.count({ where: { holdId: payment.holdId, reason: 'released' } })).toBe(1)
	})

	it('goods payment uses recorded provider success time across delayed reconciliation and expiry races', async () => {
		const fixture = await createVendor(1)
		const { payment } = await beginPayment(fixture.selection)
		now = new Date(Date.parse(payment.expiresAt) - 1)
		await repository.recordLocalGoodsPaymentResult(customer.sessionId, randomUUID(), payment.paymentId, { outcome: 'succeeded' })
		const successTime = now.toISOString()
		now = new Date(Date.parse(payment.expiresAt) + 1000)
		await repository.db.user.update({ where: { id: customer.userId }, data: { adultVerificationState: 'unverified', verifiedAt: null } })
		await Promise.all([repository.expireGoodsHolds(), other.reconcileGoodsPayments()])
		const paid = await repository.readGoodsPayment(customer.sessionId, payment.paymentId)
		expect(paid).toMatchObject({ state: 'succeeded', holdState: 'committed' })
		const purchase = await repository.readGoodsPurchase(customer.sessionId, paid.purchaseId!)
		expect(purchase.paidAt).toBe(successTime)
		expect(await repository.db.inventoryMovement.count({ where: { holdId: payment.holdId, reason: 'released' } })).toBe(0)
	})

	it('goods payment success at exact expiry compensates without claiming another Customer stock and retries refund failure', async () => {
		const fixture = await createVendor(1)
		const { payment } = await beginPayment(fixture.selection)
		await repository.recordLocalGoodsPaymentResult(customer.sessionId, randomUUID(), payment.paymentId, { outcome: 'unknown' })
		now = new Date(Date.parse(payment.expiresAt))
		await repository.expireGoodsHolds()
		const nextCustomer = await createCustomer()
		const next = await beginPayment(fixture.selection, nextCustomer.sessionId)
		await repository.recordLocalGoodsPaymentResult(customer.sessionId, randomUUID(), payment.paymentId, { outcome: 'succeeded' })
		await repository.reconcileGoodsPayments()
		await expect(repository.readGoodsPayment(customer.sessionId, payment.paymentId)).resolves.toMatchObject({
			state: 'refund_pending',
			holdState: 'compensating',
			purchaseId: null,
		})
		await expect(repository.readGoodsHold(nextCustomer.sessionId, next.hold.holdId)).resolves.toMatchObject({ state: 'awaiting_payment' })
		const adapter = new LocalGoodsPaymentAdapter()
		jest.spyOn(adapter, 'refund').mockRejectedValueOnce(new Error('Local adapter unavailable'))
		const retry = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, undefined, undefined, undefined, clock, adapter)
		try {
			await retry.reconcileGoodsRefunds()
			await expect(repository.readGoodsPayment(customer.sessionId, payment.paymentId)).resolves.toMatchObject({ state: 'refund_pending' })
			await retry.reconcileGoodsRefunds()
			await retry.reconcileGoodsRefunds()
		} finally {
			await retry.close()
		}
		await expect(repository.readGoodsPayment(customer.sessionId, payment.paymentId)).resolves.toMatchObject({
			state: 'refunded',
			refunds: [{ amountCents: payment.amountCents, state: 'succeeded' }],
		})
		expect(await repository.db.goodsRefundOperation.count({ where: { paymentId: payment.paymentId } })).toBe(1)
		expect(await repository.db.inventoryMovement.count({ where: { holdId: payment.holdId, reason: 'sold' } })).toBe(0)
	})

	it('goods payment later-line commitment failure rolls back every Order, sale and event while preserving the provider receipt', async () => {
		const first = await createVendor(1)
		const second = await createVendor(1)
		const { payment } = await beginPayment({ groups: [first.selection.groups[0], second.selection.groups[0]] })
		await repository.recordLocalGoodsPaymentResult(customer.sessionId, randomUUID(), payment.paymentId, { outcome: 'succeeded' })
		const before = { audit: await repository.db.auditLog.count(), outbox: await repository.db.outboxEvent.count() }
		await repository.db.$executeRawUnsafe(
			`CREATE FUNCTION reject_test_sale() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason = 'sold' AND NEW.listing_id = '${second.listing.id}'::uuid THEN RAISE EXCEPTION 'Deliberate second sale failure'; END IF; RETURN NEW; END; $$`,
		)
		await repository.db.$executeRawUnsafe(
			'CREATE TRIGGER reject_test_sale_trigger BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION reject_test_sale()',
		)
		try {
			await expect(repository.reconcileGoodsPayments()).rejects.toThrow()
			expect(await repository.db.goodsPurchase.count({ where: { paymentId: payment.paymentId } })).toBe(0)
			expect(await repository.db.inventoryMovement.count({ where: { holdId: payment.holdId, reason: 'sold' } })).toBe(0)
			expect(await repository.db.auditLog.count()).toBe(before.audit)
			expect(await repository.db.outboxEvent.count()).toBe(before.outbox)
			expect(await repository.db.goodsLocalPaymentResult.count({ where: { paymentId: payment.paymentId } })).toBe(1)
		} finally {
			await repository.db.$executeRawUnsafe('DROP TRIGGER reject_test_sale_trigger ON inventory_movements')
			await repository.db.$executeRawUnsafe('DROP FUNCTION reject_test_sale()')
		}
		await repository.reconcileGoodsPayments()
		await expect(repository.readGoodsPayment(customer.sessionId, payment.paymentId)).resolves.toMatchObject({ state: 'succeeded' })
	})

	it('goods payment racing competing last-unit holds cannot oversell', async () => {
		const fixture = await createVendor(1)
		const { payment } = await beginPayment(fixture.selection)
		const otherCustomer = await createCustomer()
		const result = await Promise.allSettled([
			repository
				.recordLocalGoodsPaymentResult(customer.sessionId, randomUUID(), payment.paymentId, { outcome: 'succeeded' })
				.then(() => repository.reconcileGoodsPayments()),
			other.createGoodsQuote(otherCustomer.sessionId, randomUUID(), fixture.selection),
		])
		expect(result[0].status).toBe('fulfilled')
		expect(result[1].status).toBe('rejected')
		await expect(repository.readPublicProductAvailability(fixture.listing.id, { locationId: fixture.location.id })).resolves.toMatchObject({ available: 0 })
		expect(await repository.db.inventoryMovement.count({ where: { holdId: payment.holdId, reason: 'sold' } })).toBe(1)
	})

	it('goods payment Customer release racing a final success either commits or compensates once', async () => {
		const fixture = await createVendor(1)
		const { payment } = await beginPayment(fixture.selection)
		await Promise.allSettled([
			repository.recordLocalGoodsPaymentResult(customer.sessionId, randomUUID(), payment.paymentId, { outcome: 'succeeded' }),
			other.releaseGoodsHold(customer.sessionId, randomUUID(), payment.holdId),
		])
		await repository.reconcileGoodsPayments()
		const current = await repository.readGoodsPayment(customer.sessionId, payment.paymentId)
		if (current.state === 'succeeded') {
			expect(current.purchaseId).not.toBeNull()
			expect(current.refunds).toHaveLength(0)
			expect(await repository.db.inventoryMovement.count({ where: { holdId: payment.holdId, reason: 'sold' } })).toBe(1)
		} else {
			expect(current.state).toBe('refund_pending')
			expect(current.purchaseId).toBeNull()
			expect(current.refunds).toHaveLength(1)
			expect(await repository.db.inventoryMovement.count({ where: { holdId: payment.holdId, reason: 'released' } })).toBe(1)
			await repository.reconcileGoodsRefunds()
		}
	})

	it('goods payment backlog preserves recorded timely successes beyond the bounded worker batch', async () => {
		const fixture = await createVendor(101)
		const attempts = []
		for (let index = 0; index < 101; index++) attempts.push((await beginPayment(fixture.selection)).payment)
		for (const payment of attempts)
			await repository.recordLocalGoodsPaymentResult(customer.sessionId, randomUUID(), payment.paymentId, { outcome: 'succeeded' })
		now = new Date(Date.parse(attempts[0].expiresAt) + 1000)
		await repository.expireGoodsHolds()
		const remaining = await repository.db.goodsPaymentAttempt.findFirstOrThrow({
			where: { holdId: { in: attempts.map((payment) => payment.holdId) }, state: 'processing' },
		})
		expect(await repository.db.inventoryMovement.count({ where: { holdId: { in: attempts.map((payment) => payment.holdId) }, reason: 'released' } })).toBe(
			0,
		)
		await expect(repository.readGoodsHold(customer.sessionId, remaining.holdId)).resolves.toMatchObject({ state: 'committed' })
		expect(await repository.db.goodsPurchase.count({ where: { paymentId: { in: attempts.map((payment) => payment.paymentId) } } })).toBe(101)
		await expect(repository.readPublicProductAvailability(fixture.listing.id, { locationId: fixture.location.id })).resolves.toMatchObject({ available: 0 })
	}, 60_000)
	async function cancellationPurchase(selection: GoodsQuoteCommand) {
		const { payment } = await beginPayment(selection)
		await repository.recordLocalGoodsPaymentResult(customer.sessionId, randomUUID(), payment.paymentId, { outcome: 'succeeded' })
		const paid = await repository.readGoodsPayment(customer.sessionId, payment.paymentId)
		return { payment: paid, purchase: await repository.readGoodsPurchase(customer.sessionId, paid.purchaseId!) }
	}
	const cancelCommand = (lineId: string, quantity = 1, stockDisposition = 'restock') => ({
		note: 'Exceptional pre-fulfillment cancellation evidence',
		lines: [{ lineId, quantity, stockDisposition }],
	})

	it('goods cancellation scopes quantities, SKU disposition and paid prices across Vendor Orders', async () => {
		const first = await createVendor(5, true)
		const second = await createVendor(5)
		await repository.createInventoryMovement(first.owner.sessionId, randomUUID(), {
			listingId: first.listing.id,
			locationId: first.location.id,
			sku: 'large',
			reason: 'received',
			quantityDelta: 2,
		})
		const { payment, purchase } = await cancellationPurchase({
			groups: [
				{
					...first.selection.groups[0],
					lines: [
						{ listingId: first.listing.id, sku: 'small', quantity: 3 },
						{ listingId: first.listing.id, sku: 'large', quantity: 1 },
					],
				},
				second.selection.groups[0],
			],
		})
		const order = purchase.orders.find((item) => item.vendorId === first.vendor.id)!
		const unaffected = purchase.orders.find((item) => item.vendorId === second.vendor.id)!
		const small = order.lines.find((line) => line.snapshot.sku === 'small')!
		const large = order.lines.find((line) => line.snapshot.sku === 'large')!
		await repository.db.listingVariant.updateMany({ where: { listingId: first.listing.id, sku: 'small' }, data: { priceCents: 9000 } })
		const key = randomUUID()
		const command = {
			note: 'Vendor fault; large unit damaged',
			lines: [
				{ lineId: small.lineId, quantity: 1, stockDisposition: 'restock' },
				{ lineId: large.lineId, quantity: 1, stockDisposition: 'damaged' },
			],
		}
		const result = await repository.cancelGoodsOrder(first.owner.sessionId, key, order.orderId, command)
		expect(result).toMatchObject({
			state: 'partially_cancelled',
			itemRefundCents: 3000,
			deliveryRefundCents: 0,
			reviewRequired: true,
			refund: { amountCents: 3000, state: 'pending' },
		})
		await expect(repository.cancelGoodsOrder(first.owner.sessionId, key, order.orderId, command)).resolves.toEqual({ ...result, replayed: true })
		await expect(
			repository.cancelGoodsOrder(first.owner.sessionId, key, order.orderId, { ...command, note: 'Different reason conflicts' }),
		).rejects.toThrow(IdempotencyConflictError)
		await expect(repository.readPublicProductAvailability(first.listing.id, { locationId: first.location.id, sku: 'small' })).resolves.toMatchObject({
			available: 3,
		})
		await expect(repository.readPublicProductAvailability(first.listing.id, { locationId: first.location.id, sku: 'large' })).resolves.toMatchObject({
			available: 1,
		})
		await expect(repository.readGoodsVendorOrder(second.owner.sessionId, unaffected.orderId)).resolves.toEqual(unaffected)
		const updated = await repository.readGoodsPurchase(customer.sessionId, purchase.purchaseId)
		expect(updated.snapshot).toEqual(purchase.snapshot)
		expect(updated.orders.find((item) => item.orderId === order.orderId)?.lines).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ lineId: small.lineId, cancelledQuantity: 1, remainingQuantity: 2 }),
				expect.objectContaining({ lineId: large.lineId, cancelledQuantity: 1, remainingQuantity: 0 }),
			]),
		)
		await repository.reconcileGoodsRefunds()
		await expect(repository.readGoodsPayment(customer.sessionId, payment.paymentId)).resolves.toMatchObject({
			state: 'partially_refunded',
			refundedCents: 3000,
			pendingRefundCents: 0,
		})
		await expect(repository.readGoodsCancellation(customer.sessionId, result.cancellationId)).resolves.toMatchObject({ refund: { state: 'succeeded' } })
		await expect(repository.db.goodsOrderCancellation.update({ where: { id: result.cancellationId }, data: { itemRefundCents: 1 } })).rejects.toThrow()
		const effect = await repository.db.goodsCancellationLine.findFirstOrThrow({
			where: { cancellationId: result.cancellationId, orderLineId: small.lineId },
		})
		await expect(
			repository.db.inventoryMovement.create({
				data: {
					cancellationLineId: effect.id,
					orderLineId: small.lineId,
					listingId: first.listing.id,
					locationId: first.location.id,
					sku: 'foreign-sku',
					reason: 'damaged',
					onHandDelta: -1,
					reservedDelta: 0,
					actorKind: 'user',
					actorId: first.owner.userId,
					note: command.note,
				},
			}),
		).rejects.toThrow()
	})

	it('goods cancellation concurrent replay and competing quantities cannot exceed purchased quantity', async () => {
		const fixture = await createVendor(3)
		const { purchase } = await cancellationPurchase({
			groups: [{ ...fixture.selection.groups[0], lines: [{ listingId: fixture.listing.id, quantity: 3 }] }],
		})
		const order = purchase.orders[0]
		const key = randomUUID()
		const command = cancelCommand(order.lines[0].lineId, 2)
		const results = await Promise.all([
			repository.cancelGoodsOrder(fixture.owner.sessionId, key, order.orderId, command),
			other.cancelGoodsOrder(fixture.owner.sessionId, key, order.orderId, command),
		])
		expect(results.map((result) => result.replayed).sort()).toEqual([false, true])
		await expect(repository.cancelGoodsOrder(fixture.owner.sessionId, randomUUID(), order.orderId, command)).rejects.toThrow(GoodsCheckoutConflictError)
		expect(await repository.db.goodsOrderCancellation.count({ where: { orderId: order.orderId } })).toBe(1)
		const last = cancelCommand(order.lines[0].lineId)
		const competing = await Promise.allSettled([
			repository.cancelGoodsOrder(fixture.owner.sessionId, randomUUID(), order.orderId, last),
			other.cancelGoodsOrder(fixture.owner.sessionId, randomUUID(), order.orderId, last),
		])
		expect(competing.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
		expect(await repository.db.goodsCancellationLine.aggregate({ where: { orderLineId: order.lines[0].lineId }, _sum: { quantity: true } })).toMatchObject({
			_sum: { quantity: 3 },
		})
	})

	it('goods cancellation refunds delivery once for full cancellation and never penalizes Vendor-caused threshold breaks', async () => {
		const fixture = await createVendor(8)
		const address = {
			contactName: 'Customer',
			phone: '+251900000000',
			locality: 'Test city',
			address: 'Test street',
			point: [41.5, 9.5] as [number, number],
		}
		const selection: GoodsQuoteCommand = {
			groups: [
				{
					...fixture.selection.groups[0],
					fulfillment: { method: 'delivery', zoneId: fixture.zone.id, address },
					lines: [{ listingId: fixture.listing.id, quantity: 2 }],
				},
			],
		}
		const { payment, purchase } = await cancellationPurchase(selection)
		const order = purchase.orders[0]
		expect(order.snapshot.deliveryFeeCents).toBe(200)
		const first = await repository.cancelGoodsOrder(fixture.owner.sessionId, randomUUID(), order.orderId, cancelCommand(order.lines[0].lineId))
		expect(first.deliveryRefundCents).toBe(0)
		const lastKey = randomUUID()
		const last = await repository.cancelGoodsOrder(fixture.owner.sessionId, lastKey, order.orderId, cancelCommand(order.lines[0].lineId))
		expect(last).toMatchObject({ deliveryRefundCents: 200, refund: { amountCents: 1200 } })
		await expect(repository.cancelGoodsOrder(fixture.owner.sessionId, lastKey, order.orderId, cancelCommand(order.lines[0].lineId))).resolves.toMatchObject(
			{ replayed: true },
		)
		await repository.reconcileGoodsRefunds()
		await expect(repository.readGoodsPayment(customer.sessionId, payment.paymentId)).resolves.toMatchObject({ state: 'refunded', refundedCents: 2200 })
		await expect(
			repository.db.goodsRefundOperation.create({ data: { paymentId: payment.paymentId, semanticKey: randomUUID(), amountCents: 1 } }),
		).rejects.toThrow()
		await repository.configureGoodsLocation(fixture.owner.sessionId, randomUUID(), fixture.location.id, {
			expectedVersion: 1,
			configuration: { ...fixture.configuration, deliveryZones: [{ ...fixture.zone, minimumCents: 3000 }] },
		})
		const free = await cancellationPurchase({ groups: [{ ...selection.groups[0], lines: [{ listingId: fixture.listing.id, quantity: 4 }] }] })
		const freeOrder = free.purchase.orders[0]
		expect(freeOrder.snapshot.deliveryFeeCents).toBe(0)
		await repository.cancelGoodsOrder(fixture.owner.sessionId, randomUUID(), freeOrder.orderId, cancelCommand(freeOrder.lines[0].lineId, 3))
		const remaining = await repository.readGoodsVendorOrder(fixture.owner.sessionId, freeOrder.orderId)
		expect(remaining.snapshot).toEqual(freeOrder.snapshot)
		expect(remaining.lines[0].remainingQuantity).toBe(1)
		await repository.reconcileGoodsRefunds()
		await expect(repository.readGoodsPayment(customer.sessionId, free.payment.paymentId)).resolves.toMatchObject({
			amountCents: 4000,
			state: 'partially_refunded',
			refundedCents: 3000,
		})
	})

	it('goods cancellation enforces live Owner scopes and Order-specific Finance grants without reviewer escalation', async () => {
		const fixture = await createVendor()
		const second = await createVendor()
		const { purchase } = await cancellationPurchase({ groups: [fixture.selection.groups[0], second.selection.groups[0]] })
		const order = purchase.orders.find((item) => item.vendorId === fixture.vendor.id)!
		const foreign = purchase.orders.find((item) => item.vendorId === second.vendor.id)!
		const command = cancelCommand(order.lines[0].lineId)
		await expect(repository.cancelGoodsOrder(customer.sessionId, randomUUID(), order.orderId, command)).rejects.toThrow(AccessDeniedError)
		await expect(repository.cancelGoodsOrder(second.owner.sessionId, randomUUID(), order.orderId, command)).rejects.toThrow(AccessDeniedError)
		await repository.db.vendorMembership.updateMany({ where: { userId: fixture.owner.userId, vendorId: fixture.vendor.id }, data: { locationIds: [] } })
		await expect(repository.cancelGoodsOrder(fixture.owner.sessionId, randomUUID(), order.orderId, command)).rejects.toThrow(AccessDeniedError)
		const finance = await createCustomer()
		await repository.db.platformReviewerGrant.create({ data: { userId: finance.userId, grantedBy: 'Local reviewer fixture' } })
		await expect(repository.cancelGoodsOrder(finance.sessionId, randomUUID(), order.orderId, command, 'platform')).rejects.toThrow(AccessDeniedError)
		const data = {
			userId: finance.userId,
			workspaceId: finance.workspaceId,
			orderId: order.orderId,
			reason: 'Local Finance case scope',
			grantedBy: 'Fixture operator',
			expiresAt: new Date(Date.now() + 60_000),
		}
		const grant = await repository.db.goodsCancellationGrant.create({ data })
		await expect(repository.readPlatformGoodsOrder(finance.sessionId, order.orderId)).resolves.toMatchObject({ orderId: order.orderId })
		await expect(repository.readPlatformGoodsOrder(finance.sessionId, foreign.orderId)).rejects.toThrow(AccessDeniedError)
		await repository.db.goodsCancellationGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date() } })
		await expect(repository.cancelGoodsOrder(finance.sessionId, randomUUID(), order.orderId, command, 'platform')).rejects.toThrow(AccessDeniedError)
		await repository.db.goodsCancellationGrant.update({
			where: { id: grant.id },
			data: { revokedAt: null, grantedAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() - 1000) },
		})
		await expect(repository.cancelGoodsOrder(finance.sessionId, randomUUID(), order.orderId, command, 'platform')).rejects.toThrow(AccessDeniedError)
		await repository.db.goodsCancellationGrant.update({
			where: { id: grant.id },
			data: { grantedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) },
		})
		const result = await repository.cancelGoodsOrder(finance.sessionId, randomUUID(), order.orderId, command, 'platform')
		await expect(repository.readGoodsCancellation(finance.sessionId, result.cancellationId)).resolves.toMatchObject({ refund: { state: 'pending' } })
		await expect(
			repository.db.goodsCancellationGrant.create({ data: { ...data, userId: customer.userId, workspaceId: customer.workspaceId } }),
		).rejects.toThrow()
		await expect(
			repository.db.goodsCancellationGrant.create({ data: { ...data, userId: fixture.owner.userId, workspaceId: fixture.owner.workspaceId } }),
		).rejects.toThrow()
		const otherGrant = await repository.db.goodsCancellationGrant.create({ data: { ...data, orderId: foreign.orderId } })
		await repository.db.vendorMembership.create({
			data: { userId: finance.userId, vendorId: second.vendor.id, role: 'vendor_owner', locationIds: [second.location.id] },
		})
		await expect(repository.readPlatformGoodsOrder(finance.sessionId, foreign.orderId)).rejects.toThrow(AccessDeniedError)
		await expect(
			repository.cancelGoodsOrder(finance.sessionId, randomUUID(), foreign.orderId, cancelCommand(foreign.lines[0].lineId), 'platform'),
		).rejects.toThrow(AccessDeniedError)
		await repository.db.goodsCancellationGrant.update({ where: { id: otherGrant.id }, data: { revokedAt: new Date() } })
		expect(otherGrant.orderId).toBe(foreign.orderId)
	})

	it('goods cancellation refund failures remain pending and recover without repeating stock effects', async () => {
		const fixture = await createVendor(3)
		const { payment, purchase } = await cancellationPurchase({
			groups: [{ ...fixture.selection.groups[0], lines: [{ listingId: fixture.listing.id, quantity: 2 }] }],
		})
		const order = purchase.orders[0]
		const result = await repository.cancelGoodsOrder(fixture.owner.sessionId, randomUUID(), order.orderId, cancelCommand(order.lines[0].lineId))
		const adapter = new LocalGoodsPaymentAdapter()
		jest.spyOn(adapter, 'refund').mockRejectedValueOnce(new Error('Controlled refund timeout'))
		const retry = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, undefined, undefined, undefined, clock, adapter)
		try {
			await retry.reconcileGoodsRefunds()
			await expect(repository.readGoodsCancellation(customer.sessionId, result.cancellationId)).resolves.toMatchObject({ refund: { state: 'pending' } })
			await retry.reconcileGoodsRefunds()
			await retry.reconcileGoodsRefunds()
		} finally {
			await retry.close()
		}
		await expect(repository.readGoodsPayment(customer.sessionId, payment.paymentId)).resolves.toMatchObject({
			state: 'partially_refunded',
			refundedCents: 1000,
			pendingRefundCents: 0,
		})
		expect(
			await repository.db.inventoryMovement.count({ where: { cancellationLine: { cancellationId: result.cancellationId }, reason: 'returned' } }),
		).toBe(1)
	})

	it('goods cancellation later-line failure rolls back stock, refund, quantity, audit, outbox and replay state', async () => {
		const fixture = await createVendor(3, true)
		await repository.createInventoryMovement(fixture.owner.sessionId, randomUUID(), {
			listingId: fixture.listing.id,
			locationId: fixture.location.id,
			sku: 'large',
			reason: 'received',
			quantityDelta: 2,
		})
		const { payment, purchase } = await cancellationPurchase({
			groups: [
				{
					...fixture.selection.groups[0],
					lines: [
						{ listingId: fixture.listing.id, sku: 'small', quantity: 2 },
						{ listingId: fixture.listing.id, sku: 'large', quantity: 1 },
					],
				},
			],
		})
		const order = purchase.orders[0]
		const key = randomUUID()
		const command = {
			note: 'Local two-line cancellation failure proof',
			lines: order.lines.map((line) => ({ lineId: line.lineId, quantity: 1, stockDisposition: 'restock' })),
		}
		const before = {
			audit: await repository.db.auditLog.count(),
			outbox: await repository.db.outboxEvent.count(),
			replay: await repository.db.idempotencyRecord.count(),
		}
		await repository.db.$executeRawUnsafe(
			`CREATE FUNCTION reject_test_cancel_stock() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.cancellation_line_id IS NOT NULL AND NEW.sku = 'large' THEN RAISE EXCEPTION 'Deliberate cancellation stock failure'; END IF; RETURN NEW; END; $$`,
		)
		await repository.db.$executeRawUnsafe(
			'CREATE TRIGGER reject_test_cancel_stock_trigger BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION reject_test_cancel_stock()',
		)
		try {
			await expect(repository.cancelGoodsOrder(fixture.owner.sessionId, key, order.orderId, command)).rejects.toThrow()
			expect(await repository.db.goodsOrderCancellation.count({ where: { orderId: order.orderId } })).toBe(0)
			expect(await repository.db.goodsRefundOperation.count({ where: { paymentId: payment.paymentId } })).toBe(0)
			expect(await repository.db.auditLog.count()).toBe(before.audit)
			expect(await repository.db.outboxEvent.count()).toBe(before.outbox)
			expect(await repository.db.idempotencyRecord.count()).toBe(before.replay)
			await expect(repository.readGoodsVendorOrder(fixture.owner.sessionId, order.orderId)).resolves.toEqual(order)
		} finally {
			await repository.db.$executeRawUnsafe('DROP TRIGGER reject_test_cancel_stock_trigger ON inventory_movements')
			await repository.db.$executeRawUnsafe('DROP FUNCTION reject_test_cancel_stock()')
		}
		await expect(repository.cancelGoodsOrder(fixture.owner.sessionId, key, order.orderId, command)).resolves.toMatchObject({
			replayed: false,
			state: 'partially_cancelled',
		})
	})

	it('goods cancellation rejects invalid inputs, foreign lines and incomplete direct database allocation', async () => {
		const fixture = await createVendor()
		const foreign = await createVendor()
		const { purchase, payment } = await cancellationPurchase({ groups: [fixture.selection.groups[0], foreign.selection.groups[0]] })
		const order = purchase.orders.find((item) => item.vendorId === fixture.vendor.id)!
		const otherOrder = purchase.orders.find((item) => item.vendorId === foreign.vendor.id)!
		for (const quantity of [0, -1, 1.5, 2])
			await expect(
				repository.cancelGoodsOrder(fixture.owner.sessionId, randomUUID(), order.orderId, cancelCommand(order.lines[0].lineId, quantity)),
			).rejects.toThrow()
		await expect(
			repository.cancelGoodsOrder(fixture.owner.sessionId, randomUUID(), order.orderId, cancelCommand(otherOrder.lines[0].lineId)),
		).rejects.toThrow(AccessDeniedError)
		await expect(repository.cancelGoodsOrder(fixture.owner.sessionId, undefined, order.orderId, cancelCommand(order.lines[0].lineId))).rejects.toThrow()
		await expect(
			repository.cancelGoodsOrder(fixture.owner.sessionId, randomUUID(), order.orderId, { ...cancelCommand(order.lines[0].lineId), amountCents: 1 }),
		).rejects.toThrow()
		await expect(repository.db.goodsVendorOrder.update({ where: { id: order.orderId }, data: { state: 'cancelled' } })).rejects.toThrow()
		await expect(
			repository.db.$transaction(async (tx) => {
				const id = randomUUID()
				const refund = await tx.goodsRefundOperation.create({
					data: { paymentId: payment.paymentId, semanticKey: `cancellation:${id}`, amountCents: 1 },
				})
				await tx.goodsOrderCancellation.create({
					data: {
						id,
						orderId: order.orderId,
						refundId: refund.id,
						actorId: fixture.owner.userId,
						actorKind: 'vendor',
						note: 'Incomplete cancellation fixture',
						itemRefundCents: 1,
						deliveryRefundCents: 0,
					},
				})
				await tx.goodsPaymentAttempt.update({ where: { id: payment.paymentId }, data: { state: 'refund_pending' } })
			}),
		).rejects.toThrow()
	})

	it('goods cancellation resolves restricted Vendor commitments while ordinary writes stay denied', async () => {
		const fixture = await createVendor()
		const { purchase } = await cancellationPurchase(fixture.selection)
		const order = purchase.orders[0]
		await repository.db.vendor.update({ where: { id: fixture.vendor.id }, data: { applicationState: 'restricted' } })
		await expect(repository.readGoodsVendorOrder(fixture.owner.sessionId, order.orderId)).resolves.toMatchObject({ state: 'confirmed' })
		await expect(
			repository.createInventoryMovement(fixture.owner.sessionId, randomUUID(), {
				listingId: fixture.listing.id,
				locationId: fixture.location.id,
				reason: 'received',
				quantityDelta: 1,
			}),
		).rejects.toThrow(AccessDeniedError)
		await expect(
			repository.cancelGoodsOrder(fixture.owner.sessionId, randomUUID(), order.orderId, cancelCommand(order.lines[0].lineId)),
		).resolves.toMatchObject({ state: 'cancelled' })
		await repository.selectActiveVendor(fixture.owner.sessionId, { vendorId: null })
		await repository.selectActiveVendor(fixture.owner.sessionId, { vendorId: fixture.vendor.id })
		await expect(repository.readGoodsVendorOrder(fixture.owner.sessionId, order.orderId)).resolves.toMatchObject({ state: 'cancelled' })
		await repository.db.vendorMembership.updateMany({
			where: { userId: fixture.owner.userId, vendorId: fixture.vendor.id },
			data: { revokedAt: new Date() },
		})
		await expect(repository.readGoodsVendorOrder(fixture.owner.sessionId, order.orderId)).rejects.toThrow(AccessDeniedError)
	})

	it('goods cancellation stock recovery racing checkout cannot oversell the last unit', async () => {
		const fixture = await createVendor(1)
		const { purchase } = await cancellationPurchase(fixture.selection)
		const order = purchase.orders[0]
		const next = await createCustomer()
		const [cancelled, pendingQuote] = await Promise.allSettled([
			repository.cancelGoodsOrder(fixture.owner.sessionId, randomUUID(), order.orderId, cancelCommand(order.lines[0].lineId)),
			other.createGoodsQuote(next.sessionId, randomUUID(), fixture.selection),
		])
		expect(cancelled.status).toBe('fulfilled')
		const quote =
			pendingQuote.status === 'fulfilled' ? pendingQuote.value : await repository.createGoodsQuote(next.sessionId, randomUUID(), fixture.selection)
		await repository.createGoodsHold(next.sessionId, randomUUID(), { quoteId: quote.quoteId })
		await expect(repository.createGoodsQuote(customer.sessionId, randomUUID(), fixture.selection)).rejects.toThrow(GoodsCheckoutConflictError)
		await expect(repository.readPublicProductAvailability(fixture.listing.id, { locationId: fixture.location.id })).resolves.toMatchObject({ available: 0 })
	})
	async function readyPickup() {
		const fixture = await createVendor(3)
		const { purchase, payment } = await cancellationPurchase(fixture.selection)
		const order = purchase.orders[0]
		const fulfillment = await repository.readGoodsFulfillment(fixture.owner.sessionId, order.orderId)
		await repository.prepareGoodsFulfillment(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId)
		const ready = await repository.readyGoodsPickup(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId)
		const customerRead = GoodsCustomerPickupReadSchema.parse(await repository.readGoodsFulfillment(customer.sessionId, order.orderId, true))
		if (!('collectionProof' in customerRead) || !customerRead.collectionProof) throw new Error('Pickup proof missing')
		return { fixture, order, ready, proof: customerRead.collectionProof, payment }
	}

	it('goods pickup readies once and collects with private Customer code without moving stock twice', async () => {
		const { fixture, order, ready, proof } = await readyPickup()
		expect(Date.parse(ready.pickupWindowEndsAt!) - Date.parse(ready.readyAt!)).toBe(72 * 3600000)
		expect(Date.parse(ready.pickupGraceEndsAt!) - Date.parse(ready.readyAt!)).toBe(120 * 3600000)
		expect(proof.qrSvgDataUri).toContain('data:image/svg+xml')
		expect(JSON.stringify(await repository.readGoodsFulfillment(fixture.owner.sessionId, order.orderId))).not.toContain(proof.code)
		const key = randomUUID(),
			command = { proof: { method: 'code', code: proof.code } }
		const before = await repository.db.inventoryMovement.count({ where: { orderLineId: order.lines[0].lineId } })
		const result = await repository.collectGoodsPickup(fixture.owner.sessionId, key, ready.fulfillmentId, command)
		expect(result).toMatchObject({ state: 'collected', handoff: { method: 'code' } })
		await expect(repository.collectGoodsPickup(fixture.owner.sessionId, key, ready.fulfillmentId, command)).resolves.toEqual({ ...result, replayed: true })
		await expect(repository.collectGoodsPickup(fixture.owner.sessionId, randomUUID(), ready.fulfillmentId, command)).rejects.toThrow(
			GoodsCheckoutConflictError,
		)
		expect(await repository.db.inventoryMovement.count({ where: { orderLineId: order.lines[0].lineId } })).toBe(before)
		await expect(repository.readGoodsFulfillment(customer.sessionId, order.orderId, true)).resolves.toMatchObject({ collectionProof: null })
		await expect(repository.cancelGoodsOrder(fixture.owner.sessionId, randomUUID(), order.orderId, cancelCommand(order.lines[0].lineId))).rejects.toThrow(
			GoodsCheckoutConflictError,
		)
	})

	it('goods pickup QR binds one fulfillment and five rejected attempts require controlled fallback', async () => {
		const { fixture, order, ready, proof } = await readyPickup()
		for (let i = 0; i < 5; i++)
			await expect(
				repository.collectGoodsPickup(fixture.owner.sessionId, randomUUID(), ready.fulfillmentId, {
					proof: { method: 'qr', payload: 'junction-pickup-v1:wrong:code' },
				}),
			).rejects.toThrow(GoodsCheckoutConflictError)
		await expect(repository.readGoodsFulfillment(customer.sessionId, order.orderId, true)).resolves.toMatchObject({
			codeLocked: true,
			collectionProof: null,
		})
		await expect(
			repository.collectGoodsPickup(fixture.owner.sessionId, randomUUID(), ready.fulfillmentId, { proof: { method: 'qr', payload: proof.qrPayload } }),
		).rejects.toThrow(GoodsCheckoutConflictError)
		const ack = await repository.acknowledgeGoodsPickup(customer.sessionId, randomUUID(), ready.fulfillmentId, {
			reason: 'code_unavailable',
			statement: 'I acknowledge receipt of these pickup goods in person.',
		})
		const result = await repository.collectGoodsPickup(fixture.owner.sessionId, randomUUID(), ready.fulfillmentId, {
			proof: {
				method: 'fallback',
				acknowledgementId: ack.acknowledgementId,
				reason: 'code_unavailable',
				witnessStatement: 'I witnessed the authenticated Customer collect all goods.',
			},
		})
		expect(result).toMatchObject({ state: 'collected', handoff: { method: 'fallback' } })
		const evidence = await repository.db.goodsPickupHandoff.findUniqueOrThrow({ where: { fulfillmentId: ready.fulfillmentId } })
		expect(evidence.acknowledgementId).toBe(ack.acknowledgementId)
		await expect(repository.db.goodsPickupHandoff.update({ where: { id: evidence.id }, data: { evidence: {} } })).rejects.toThrow()
	})

	it('goods pickup window enters grace at 72 hours then expires at 120 hours without restocking before inspection', async () => {
		const { fixture, order, ready, payment } = await readyPickup()
		now = new Date(Date.parse(ready.pickupWindowEndsAt!))
		await expect(repository.readGoodsFulfillment(customer.sessionId, order.orderId, true)).resolves.toMatchObject({
			state: 'ready_for_pickup',
			pickupPhase: 'grace',
		})
		now = new Date(Date.parse(ready.pickupGraceEndsAt!))
		await Promise.all([repository.expireGoodsPickups(), other.expireGoodsPickups()])
		await expect(repository.readGoodsFulfillment(customer.sessionId, order.orderId, true)).resolves.toMatchObject({
			state: 'inspection_pending',
			collectionProof: null,
		})
		await expect(repository.readPublicProductAvailability(fixture.listing.id, { locationId: fixture.location.id })).resolves.toMatchObject({ available: 2 })
		const key = randomUUID(),
			command = {
				evidence: 'Expired pickup inspected with all units present and resaleable.',
				lines: [{ lineId: order.lines[0].lineId, quantity: 1, stockDisposition: 'restock' }],
			}
		const result = await repository.inspectGoodsPickup(fixture.owner.sessionId, key, ready.fulfillmentId, command)
		expect(result).toMatchObject({ state: 'inspection_completed', inspection: { refundState: 'pending' } })
		await expect(repository.inspectGoodsPickup(fixture.owner.sessionId, key, ready.fulfillmentId, command)).resolves.toEqual({ ...result, replayed: true })
		await repository.reconcileGoodsRefunds()
		await expect(repository.readGoodsPayment(customer.sessionId, payment.paymentId)).resolves.toMatchObject({ state: 'refunded' })
		await expect(repository.readPublicProductAvailability(fixture.listing.id, { locationId: fixture.location.id })).resolves.toMatchObject({ available: 3 })
	})

	it('goods pickup valid QR collection races expiry and records only one terminal outcome', async () => {
		const { fixture, ready, proof } = await readyPickup()
		now = new Date(Date.parse(ready.pickupGraceEndsAt!) - 1)
		const results = await Promise.allSettled([
			repository.collectGoodsPickup(fixture.owner.sessionId, randomUUID(), ready.fulfillmentId, { proof: { method: 'qr', payload: proof.qrPayload } }),
			other.expireGoodsPickups(),
		])
		expect(results[0].status).toBe('fulfilled')
		now = new Date(Date.parse(ready.pickupGraceEndsAt!))
		await repository.expireGoodsPickups()
		expect((await repository.db.goodsFulfillment.findUniqueOrThrow({ where: { id: ready.fulfillmentId } })).state).toBe('collected')
		expect(await repository.db.goodsPickupHandoff.count({ where: { fulfillmentId: ready.fulfillmentId } })).toBe(1)
	})
	it('goods pickup staff requires explicit fulfillment permission and live assigned scope', async () => {
		const { fixture, order, ready, proof } = await readyPickup()
		const staff = await createCustomer()
		const membership = await repository.db.vendorMembership.create({
			data: { userId: staff.userId, vendorId: fixture.vendor.id, role: 'vendor_staff', locationIds: [fixture.location.id] },
		})
		await repository.db.session.update({
			where: { id: staff.sessionId },
			data: { workspaceId: fixture.owner.workspaceId, activeVendorId: fixture.vendor.id, activeRole: 'vendor_staff' },
		})
		await expect(repository.readGoodsFulfillment(staff.sessionId, order.orderId)).rejects.toThrow(AccessDeniedError)
		await repository.db.vendorMembership.update({ where: { id: membership.id }, data: { goodsFulfillmentEnabled: true } })
		await expect(repository.readGoodsFulfillment(staff.sessionId, order.orderId)).resolves.toMatchObject({ state: 'ready_for_pickup' })
		await expect(repository.cancelGoodsOrder(staff.sessionId, randomUUID(), order.orderId, cancelCommand(order.lines[0].lineId))).rejects.toThrow(
			AccessDeniedError,
		)
		await repository.db.vendorMembership.update({ where: { id: membership.id }, data: { locationIds: [] } })
		await expect(
			repository.collectGoodsPickup(staff.sessionId, randomUUID(), ready.fulfillmentId, { proof: { method: 'code', code: proof.code } }),
		).rejects.toThrow(AccessDeniedError)
		await repository.db.vendorMembership.update({ where: { id: membership.id }, data: { locationIds: [fixture.location.id], revokedAt: new Date() } })
		await expect(repository.readGoodsFulfillment(staff.sessionId, order.orderId)).rejects.toThrow(AccessDeniedError)
		const stranger = await createCustomer()
		await expect(repository.readGoodsFulfillment(stranger.sessionId, order.orderId, true)).rejects.toThrow(AccessDeniedError)
	})

	it('goods pickup rejects stale or foreign fallback acknowledgement and preserves evidence on failure', async () => {
		const first = await readyPickup()
		const second = await readyPickup()
		const ack = await repository.acknowledgeGoodsPickup(customer.sessionId, randomUUID(), first.ready.fulfillmentId, {
			reason: 'accessibility',
			statement: 'I acknowledge receiving the selected goods in person.',
		})
		const proof = {
			method: 'fallback',
			acknowledgementId: ack.acknowledgementId,
			reason: 'accessibility',
			witnessStatement: 'Assigned witness saw the Customer receive the goods.',
		}
		await expect(repository.collectGoodsPickup(second.fixture.owner.sessionId, randomUUID(), second.ready.fulfillmentId, { proof })).rejects.toThrow(
			AccessDeniedError,
		)
		now = new Date(now.getTime() + 15 * 60_000 + 1)
		await expect(repository.collectGoodsPickup(first.fixture.owner.sessionId, randomUUID(), first.ready.fulfillmentId, { proof })).rejects.toThrow(
			AccessDeniedError,
		)
		expect(await repository.db.goodsPickupHandoff.count({ where: { fulfillmentId: first.ready.fulfillmentId } })).toBe(0)
	})

	it('goods pickup inspection failure rolls back refund and stock and retries quarantine without resale', async () => {
		const { fixture, order, ready, payment } = await readyPickup()
		now = new Date(Date.parse(ready.pickupGraceEndsAt!))
		await repository.expireGoodsPickups()
		const command = {
			evidence: 'Expired pickup inspection quarantines the unit pending disposal.',
			lines: [{ lineId: order.lines[0].lineId, quantity: 1, stockDisposition: 'quarantine' }],
		}
		const key = randomUUID()
		await repository.db.$executeRawUnsafe(
			`CREATE FUNCTION reject_test_pickup_inspection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Deliberate inspection failure'; END; $$`,
		)
		await repository.db.$executeRawUnsafe(
			'CREATE TRIGGER reject_test_pickup_inspection_trigger BEFORE INSERT ON goods_pickup_inspections FOR EACH ROW EXECUTE FUNCTION reject_test_pickup_inspection()',
		)
		try {
			await expect(repository.inspectGoodsPickup(fixture.owner.sessionId, key, ready.fulfillmentId, command)).rejects.toThrow()
			expect(await repository.db.goodsOrderCancellation.count({ where: { orderId: order.orderId } })).toBe(0)
			expect(await repository.db.goodsRefundOperation.count({ where: { paymentId: payment.paymentId } })).toBe(0)
		} finally {
			await repository.db.$executeRawUnsafe('DROP TRIGGER reject_test_pickup_inspection_trigger ON goods_pickup_inspections')
			await repository.db.$executeRawUnsafe('DROP FUNCTION reject_test_pickup_inspection()')
		}
		await repository.inspectGoodsPickup(fixture.owner.sessionId, key, ready.fulfillmentId, command)
		await expect(repository.readPublicProductAvailability(fixture.listing.id, { locationId: fixture.location.id })).resolves.toMatchObject({ available: 2 })
		expect(await repository.db.inventoryMovement.count({ where: { orderLineId: order.lines[0].lineId, reason: 'quarantined' } })).toBe(1)
	})

	it('goods pickup readiness freezes remaining quantities and policies while replay never extends collection time', async () => {
		const fixture = await createVendor(4)
		const { purchase } = await cancellationPurchase({
			groups: [{ ...fixture.selection.groups[0], lines: [{ listingId: fixture.listing.id, quantity: 3 }] }],
		})
		const order = purchase.orders[0]
		await repository.cancelGoodsOrder(fixture.owner.sessionId, randomUUID(), order.orderId, cancelCommand(order.lines[0].lineId, 1))
		const fulfillment = await repository.readGoodsFulfillment(fixture.owner.sessionId, order.orderId)
		await expect(repository.readyGoodsPickup(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId)).rejects.toThrow(GoodsCheckoutConflictError)
		await repository.prepareGoodsFulfillment(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId)
		const key = randomUUID()
		const ready = await repository.readyGoodsPickup(fixture.owner.sessionId, key, fulfillment.fulfillmentId)
		expect(ready.quantitySnapshot).toEqual([{ lineId: order.lines[0].lineId, quantity: 2 }])
		now = new Date(now.getTime() + 3600000)
		await expect(repository.readyGoodsPickup(fixture.owner.sessionId, key, fulfillment.fulfillmentId)).resolves.toEqual({ ...ready, replayed: true })
		await expect(
			repository.db.goodsFulfillment.update({
				where: { id: fulfillment.fulfillmentId },
				data: { state: 'collected', handoffAt: now, endedAt: now, codeCiphertext: null, version: { increment: 1 } },
			}),
		).rejects.toThrow()
		await expect(
			repository.cancelGoodsOrder(fixture.owner.sessionId, randomUUID(), order.orderId, cancelCommand(order.lines[0].lineId, 1)),
		).rejects.toThrow(GoodsCheckoutConflictError)
		const proof = GoodsCustomerPickupReadSchema.parse(await repository.readGoodsFulfillment(customer.sessionId, order.orderId, true)).collectionProof!
		now = new Date(Date.parse(ready.pickupGraceEndsAt!))
		await expect(
			repository.collectGoodsPickup(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId, { proof: { method: 'code', code: proof.code } }),
		).rejects.toThrow(GoodsCheckoutConflictError)
		expect((await repository.db.goodsFulfillment.findUniqueOrThrow({ where: { id: fulfillment.fulfillmentId } })).state).toBe('inspection_pending')
		await expect(
			repository.inspectGoodsPickup(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId, {
				evidence: 'Inspection must include every allocated remaining unit.',
				lines: [{ lineId: order.lines[0].lineId, quantity: 1, stockDisposition: 'restock' }],
			}),
		).rejects.toThrow(GoodsCheckoutConflictError)
	})

	it('goods delivery durable milestones preserve paid terms and permit one in-zone correction', async () => {
		const fixture = await createVendor(3)
		const address = { contactName: 'Customer', phone: '0911000000', locality: 'City', address: 'Original gate', point: [41.5, 9.5] as [number, number] }
		const { purchase } = await cancellationPurchase({
			groups: [{ ...fixture.selection.groups[0], fulfillment: { method: 'delivery', zoneId: fixture.zone.id, address } }],
		})
		const order = purchase.orders[0]
		const fulfillment = await repository.readGoodsFulfillment(fixture.owner.sessionId, order.orderId)
		await repository.prepareGoodsFulfillment(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId)
		const key = randomUUID()
		const dispatch = await repository.deliveryMilestone(fixture.owner.sessionId, key, fulfillment.fulfillmentId, { action: 'dispatch' })
		await expect(repository.deliveryMilestone(fixture.owner.sessionId, key, fulfillment.fulfillmentId, { action: 'dispatch' })).resolves.toEqual({
			...dispatch,
			replayed: true,
		})
		await expect(repository.deliveryMilestone(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId, { action: 'dispatch' })).rejects.toThrow(
			GoodsCheckoutConflictError,
		)
		await repository.deliveryMilestone(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId, {
			action: 'failed',
			reason: 'address_inaccessible',
			evidence: 'The documented gate was inaccessible during the delivery attempt.',
		})
		const outsideAck = await repository.acknowledgeDelivery(customer.sessionId, randomUUID(), fulfillment.fulfillmentId, {
			purpose: 'correction',
			address: { ...address, point: [43, 9.5] },
			statement: 'I confirm this corrected destination.',
		})
		await expect(
			repository.deliveryMilestone(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId, {
				action: 'retry',
				acknowledgementId: outsideAck.acknowledgementId,
				address: { ...address, point: [43, 9.5] },
				correction: 'Customer supplied a corrected destination outside the paid zone.',
			}),
		).rejects.toThrow(GoodsCheckoutConflictError)
		const correctedAck = await repository.acknowledgeDelivery(customer.sessionId, randomUUID(), fulfillment.fulfillmentId, {
			purpose: 'correction',
			address: { ...address, address: 'Corrected accessible gate' },
			statement: 'I confirm the accessible corrected gate.',
		})
		const retry = await repository.deliveryMilestone(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId, {
			action: 'retry',
			acknowledgementId: correctedAck.acknowledgementId,
			address: { ...address, address: 'Corrected accessible gate' },
			correction: 'Customer confirmed the accessible gate within the original paid zone.',
		})
		expect(retry).toMatchObject({ state: 'out_for_delivery', attempt: 2, version: 3 })
		await expect(repository.readDelivery(customer.sessionId, fulfillment.fulfillmentId, true)).resolves.toMatchObject({
			attempt: 2,
			milestones: [{ action: 'dispatch' }, { action: 'failed' }, { action: 'retry' }],
		})
		await expect(repository.cancelGoodsOrder(fixture.owner.sessionId, randomUUID(), order.orderId, cancelCommand(order.lines[0].lineId))).rejects.toThrow(
			GoodsCheckoutConflictError,
		)
		expect((await repository.readGoodsPurchase(customer.sessionId, purchase.purchaseId)).snapshot).toEqual(purchase.snapshot)
		await expect(
			repository.db.goodsDeliveryEvent.updateMany({ where: { progress: { fulfillmentId: fulfillment.fulfillmentId } }, data: { evidence: {} } }),
		).rejects.toThrow()
	})

	it('goods delivery denies late correction and foreign authority without creating milestone effects', async () => {
		const fixture = await createVendor()
		const address = { contactName: 'Customer', phone: '0911000000', locality: 'City', address: 'Original gate', point: [41.5, 9.5] as [number, number] }
		const { purchase } = await cancellationPurchase({
			groups: [{ ...fixture.selection.groups[0], fulfillment: { method: 'delivery', zoneId: fixture.zone.id, address } }],
		})
		const fulfillment = await repository.readGoodsFulfillment(fixture.owner.sessionId, purchase.orders[0].orderId)
		await repository.prepareGoodsFulfillment(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId)
		await expect(repository.deliveryMilestone(customer.sessionId, randomUUID(), fulfillment.fulfillmentId, { action: 'dispatch' })).rejects.toThrow(
			AccessDeniedError,
		)
		await repository.deliveryMilestone(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId, { action: 'dispatch' })
		const failed = await repository.deliveryMilestone(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId, {
			action: 'failed',
			reason: 'customer_unavailable',
			evidence: 'Customer was unavailable when the Vendor reached the destination.',
		})
		const lateAck = await repository.acknowledgeDelivery(customer.sessionId, randomUUID(), fulfillment.fulfillmentId, {
			purpose: 'correction',
			address,
			statement: 'I confirm the original delivery address.',
		})
		now = new Date(failed.retryDeadline!)
		await expect(
			repository.deliveryMilestone(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId, {
				action: 'retry',
				acknowledgementId: lateAck.acknowledgementId,
				address,
				correction: 'Customer is available at the original delivery address now.',
			}),
		).rejects.toThrow(GoodsCheckoutConflictError)
		expect((await repository.readDelivery(fixture.owner.sessionId, fulfillment.fulfillmentId)).milestones).toHaveLength(2)
		await Promise.all([repository.expireGoodsDeliveries(), other.expireGoodsDeliveries()])
		await expect(repository.readDelivery(fixture.owner.sessionId, fulfillment.fulfillmentId)).resolves.toMatchObject({
			state: 'inspection_pending',
			version: 3,
		})
		expect(await repository.db.inventoryMovement.count({ where: { orderLineId: purchase.orders[0].lines[0].lineId, reason: 'returned' } })).toBe(0)
		const inspection = {
			evidence: 'All undelivered units recovered intact after the retry deadline.',
			lines: [{ lineId: purchase.orders[0].lines[0].lineId, quantity: 1, stockDisposition: 'restock' }],
		}
		const inspectionKey = randomUUID()
		const inspected = await repository.inspectDelivery(fixture.owner.sessionId, inspectionKey, fulfillment.fulfillmentId, inspection)
		expect(inspected.state).toBe('inspection_completed')
		await expect(repository.inspectDelivery(fixture.owner.sessionId, inspectionKey, fulfillment.fulfillmentId, inspection)).resolves.toMatchObject({
			replayed: true,
		})
		expect(await repository.db.inventoryMovement.count({ where: { orderLineId: purchase.orders[0].lines[0].lineId, reason: 'returned' } })).toBe(1)
		await expect(repository.readGoodsFulfillment(fixture.owner.sessionId, purchase.orders[0].orderId)).resolves.toMatchObject({
			state: 'inspection_completed',
			inspection: { refundState: 'pending' },
		})
	})

	it('goods delivery second failure enters inspection and rolls back incomplete recovery', async () => {
		const fixture = await createVendor(3)
		const address = { contactName: 'Customer', phone: '0911000000', locality: 'City', address: 'Gate', point: [41.5, 9.5] as [number, number] }
		const { purchase, payment } = await cancellationPurchase({
			groups: [{ ...fixture.selection.groups[0], fulfillment: { method: 'delivery', zoneId: fixture.zone.id, address } }],
		})
		const order = purchase.orders[0],
			fulfillment = await repository.readGoodsFulfillment(fixture.owner.sessionId, order.orderId)
		await repository.prepareGoodsFulfillment(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId)
		const dispatchKey = randomUUID()
		const dispatches = await Promise.all([
			repository.deliveryMilestone(fixture.owner.sessionId, dispatchKey, fulfillment.fulfillmentId, { action: 'dispatch' }),
			other.deliveryMilestone(fixture.owner.sessionId, dispatchKey, fulfillment.fulfillmentId, { action: 'dispatch' }),
		])
		expect(dispatches.filter((result) => result.replayed)).toHaveLength(1)
		const failure = { action: 'failed', reason: 'customer_unavailable', evidence: 'Customer was unavailable at the agreed destination.' }
		await repository.deliveryMilestone(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId, failure)
		const ack = await repository.acknowledgeDelivery(customer.sessionId, randomUUID(), fulfillment.fulfillmentId, {
			purpose: 'correction',
			address,
			statement: 'I confirm availability at this delivery address.',
		})
		await repository.deliveryMilestone(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId, {
			action: 'retry',
			address,
			acknowledgementId: ack.acknowledgementId,
			correction: 'Customer confirmed availability for the corrected attempt.',
		})
		await expect(repository.deliveryMilestone(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId, failure)).resolves.toMatchObject({
			state: 'inspection_pending',
			attempt: 2,
		})
		const command = {
				evidence: 'The undelivered unit is quarantined after inspection.',
				lines: [{ lineId: order.lines[0].lineId, quantity: 1, stockDisposition: 'quarantine' }],
			},
			key = randomUUID()
		await repository.db.$executeRawUnsafe(
			"CREATE FUNCTION reject_test_delivery_inspection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Deliberate delivery inspection failure'; END; $$",
		)
		await repository.db.$executeRawUnsafe(
			'CREATE TRIGGER reject_test_delivery_inspection_trigger BEFORE INSERT ON goods_delivery_inspections FOR EACH ROW EXECUTE FUNCTION reject_test_delivery_inspection()',
		)
		try {
			await expect(repository.inspectDelivery(fixture.owner.sessionId, key, fulfillment.fulfillmentId, command)).rejects.toThrow()
			expect(await repository.db.goodsOrderCancellation.count({ where: { orderId: order.orderId } })).toBe(0)
			expect(await repository.db.goodsRefundOperation.count({ where: { paymentId: payment.paymentId } })).toBe(0)
			expect(await repository.db.inventoryMovement.count({ where: { orderLineId: order.lines[0].lineId, reason: 'returned' } })).toBe(0)
		} finally {
			await repository.db.$executeRawUnsafe('DROP TRIGGER reject_test_delivery_inspection_trigger ON goods_delivery_inspections')
			await repository.db.$executeRawUnsafe('DROP FUNCTION reject_test_delivery_inspection()')
		}
		const inspected = await Promise.all([
			repository.inspectDelivery(fixture.owner.sessionId, key, fulfillment.fulfillmentId, command),
			other.inspectDelivery(fixture.owner.sessionId, key, fulfillment.fulfillmentId, command),
		])
		expect(inspected.filter((result) => result.replayed)).toHaveLength(1)
		await repository.reconcileGoodsRefunds()
		await expect(repository.readGoodsPayment(customer.sessionId, payment.paymentId)).resolves.toMatchObject({ state: 'refunded' })
		expect(await repository.db.inventoryMovement.count({ where: { orderLineId: order.lines[0].lineId, reason: 'quarantined' } })).toBe(1)
	})

	it('goods delivery locks rejected proofs and permits only fresh Customer fallback with a distinct witness', async () => {
		const fixture = await createVendor(3)
		const address = { contactName: 'Customer', phone: '0911000000', locality: 'City', address: 'Gate', point: [41.5, 9.5] as [number, number] }
		const { purchase } = await cancellationPurchase({
			groups: [{ ...fixture.selection.groups[0], fulfillment: { method: 'delivery', zoneId: fixture.zone.id, address } }],
		})
		const order = purchase.orders[0]
		const fulfillment = await repository.readGoodsFulfillment(fixture.owner.sessionId, order.orderId)
		await repository.prepareGoodsFulfillment(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId)
		await repository.deliveryMilestone(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId, { action: 'dispatch' })
		for (let attempt = 0; attempt < 6; attempt++)
			await expect(
				repository.deliveryHandoff(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId, { proof: { method: 'code', code: 'invalid' } }),
			).rejects.toThrow(GoodsCheckoutConflictError)
		await expect(repository.readDelivery(customer.sessionId, fulfillment.fulfillmentId, true)).resolves.toMatchObject({
			codeLocked: true,
			collectionProof: null,
			version: 6,
		})
		await expect(
			repository.acknowledgeDelivery(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId, {
				purpose: 'handoff',
				reason: 'code_unavailable',
				statement: 'I acknowledge receipt of my delivery.',
			}),
		).rejects.toThrow(AccessDeniedError)
		const staleAck = await repository.acknowledgeDelivery(customer.sessionId, randomUUID(), fulfillment.fulfillmentId, {
			purpose: 'handoff',
			reason: 'code_unavailable',
			statement: 'I acknowledge delivery receipt with a witness.',
		})
		now = new Date(now.getTime() + 16 * 60000)
		await expect(
			repository.deliveryHandoff(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId, {
				proof: {
					method: 'fallback',
					acknowledgementId: staleAck.acknowledgementId,
					reason: 'code_unavailable',
					witnessStatement: 'I witnessed Customer receipt of these goods.',
				},
			}),
		).rejects.toThrow(AccessDeniedError)
		const ack = await repository.acknowledgeDelivery(customer.sessionId, randomUUID(), fulfillment.fulfillmentId, {
			purpose: 'handoff',
			reason: 'code_unavailable',
			statement: 'I acknowledge receipt of the delivered goods.',
		})
		const command = {
			proof: {
				method: 'fallback',
				acknowledgementId: ack.acknowledgementId,
				reason: 'code_unavailable',
				witnessStatement: 'I witnessed the Customer receive these goods.',
			},
		}
		const key = randomUUID()
		await expect(repository.deliveryHandoff(fixture.owner.sessionId, key, fulfillment.fulfillmentId, command)).resolves.toMatchObject({
			state: 'delivered',
		})
		await expect(repository.deliveryHandoff(fixture.owner.sessionId, key, fulfillment.fulfillmentId, command)).resolves.toMatchObject({ replayed: true })
		await expect(repository.readGoodsFulfillment(fixture.owner.sessionId, order.orderId)).resolves.toMatchObject({
			state: 'delivered',
			handoff: { method: 'fallback' },
			handoffAt: now.toISOString(),
		})
	})

	it('goods delivery private Customer QR commits one immutable handoff without another inventory movement', async () => {
		const fixture = await createVendor(3)
		const address = { contactName: 'Customer', phone: '0911000000', locality: 'City', address: 'Original gate', point: [41.5, 9.5] as [number, number] }
		const { purchase } = await cancellationPurchase({
			groups: [{ ...fixture.selection.groups[0], fulfillment: { method: 'delivery', zoneId: fixture.zone.id, address } }],
		})
		const order = purchase.orders[0],
			fulfillment = await repository.readGoodsFulfillment(fixture.owner.sessionId, order.orderId)
		await repository.prepareGoodsFulfillment(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId)
		await repository.deliveryMilestone(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId, { action: 'dispatch' })
		const read = GoodsCustomerDeliveryReadSchema.parse(await repository.readDelivery(customer.sessionId, fulfillment.fulfillmentId, true)),
			proof = read.collectionProof!
		expect(proof.qrPayload).toContain(`junction-delivery-v1:${fulfillment.fulfillmentId}:`)
		expect(JSON.stringify(await repository.readDelivery(fixture.owner.sessionId, fulfillment.fulfillmentId))).not.toContain(proof.code)
		await expect(
			repository.deliveryHandoff(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId, { proof: { method: 'code', code: 'invalid' } }),
		).rejects.toThrow(GoodsCheckoutConflictError)
		const before = await repository.db.inventoryMovement.count({ where: { orderLineId: order.lines[0].lineId } }),
			key = randomUUID(),
			command = { proof: { method: 'qr', payload: proof.qrPayload } }
		const handed = await repository.deliveryHandoff(fixture.owner.sessionId, key, fulfillment.fulfillmentId, command)
		expect(handed.state).toBe('delivered')
		await expect(repository.deliveryHandoff(fixture.owner.sessionId, key, fulfillment.fulfillmentId, command)).resolves.toEqual({
			...handed,
			replayed: true,
		})
		await expect(repository.deliveryHandoff(fixture.owner.sessionId, randomUUID(), fulfillment.fulfillmentId, command)).rejects.toThrow(
			GoodsCheckoutConflictError,
		)
		expect(await repository.db.inventoryMovement.count({ where: { orderLineId: order.lines[0].lineId } })).toBe(before)
		await expect(repository.readDelivery(customer.sessionId, fulfillment.fulfillmentId, true)).resolves.toMatchObject({ collectionProof: null })
		expect(await repository.db.goodsDeliveryHandoff.count({ where: { progress: { fulfillmentId: fulfillment.fulfillmentId } } })).toBe(1)
	})
})
