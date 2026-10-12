/* eslint-disable @typescript-eslint/no-non-null-assertion -- integration suite requires DATABASE_URL */
import { randomUUID } from 'node:crypto'

import type { GoodsQuoteCommand } from 'contracts'

import { AccessDeniedError } from './access.js'
import { GoodsCheckoutConflictError } from './goods-checkout.js'
import { IdempotencyConflictError } from './idempotency.js'
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
		expect(await Promise.all([repository.expireGoodsHolds(), other.expireGoodsHolds()])).toEqual([1, 0])
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
})
