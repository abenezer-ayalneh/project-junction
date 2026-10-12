import { randomUUID } from 'node:crypto'

import {
	type AccessContext,
	DomainEventSchema,
	GoodsHoldCommandSchema,
	GoodsHoldReadSchema,
	GoodsHoldReleaseResultSchema,
	GoodsHoldResultSchema,
	GoodsLocationConfigurationCommandSchema,
	GoodsLocationConfigurationResultSchema,
	GoodsLocationConfigurationSchema,
	type GoodsQuoteCommand,
	GoodsQuoteCommandSchema,
	GoodsQuoteResultSchema,
	type GoodsQuoteSnapshot,
	GoodsQuoteSnapshotSchema,
	IdempotencyKeySchema,
} from 'contracts'
import { z } from 'zod'

import { Prisma, type PrismaClient } from '../../generated/prisma/index.js'
import { AccessDeniedError, assertScope } from './access.js'
import { stableHash } from './idempotency.js'

type Transaction = Prisma.TransactionClient
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
const minute = 60_000
// Derived local defaults: a quote can be accepted for five minutes; a hold lasts the specified fifteen.
const quoteDuration = 5 * minute
const holdDuration = 15 * minute

export class GoodsCheckoutConflictError extends Error {
	readonly code = 'UNAVAILABLE'
	constructor(message = 'Goods are no longer available on these terms. Request a new quote.') {
		super(message)
		this.name = 'GoodsCheckoutConflictError'
	}
}

interface Dependencies {
	db: PrismaClient
	derive(tx: Transaction, sessionId: string | undefined): Promise<AccessContext>
	lockWorkspace(tx: Transaction, id: string): Promise<void>
	replay<T>(
		tx: Transaction,
		context: AccessContext,
		key: string,
		method: string,
		request: unknown,
		create: () => Promise<T>,
	): Promise<{ outcome: T; replayed: boolean }>
	now(): Date
}

/** Goods-only quote and reservation lifecycle. Payment commitment is a later slice. */
export class GoodsCheckout {
	constructor(private readonly dependencies: Dependencies) {}

	private async commerceLock(tx: Transaction) {
		// One checkout lock prevents cross-workspace lock inversions. Existing stock,
		// Location and catalog commands are serialized by their Vendor workspace locks.
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout', 0))`
	}

	private async customer(tx: Transaction, sessionId: string | undefined) {
		const context = await this.dependencies.derive(tx, sessionId)
		const user = await tx.user.findUniqueOrThrow({ where: { id: context.actor.userId } })
		if (user.adultVerificationState !== 'verified' || !user.verifiedAt)
			throw new AccessDeniedError('Verified adult Customer identity is required for goods checkout.')
		return context
	}

	private async lockVendors(tx: Transaction, vendorIds: string[]) {
		const vendors = await tx.vendor.findMany({ where: { id: { in: vendorIds } }, select: { workspaceId: true } })
		if (vendors.length !== new Set(vendorIds).size) throw new AccessDeniedError()
		for (const workspaceId of [...new Set(vendors.map((vendor) => vendor.workspaceId))].sort()) await this.dependencies.lockWorkspace(tx, workspaceId)
	}

	private async ownerLocation(tx: Transaction, context: AccessContext, locationId: string) {
		if (
			!context.activeVendorId ||
			!context.memberships.some((membership) => membership.active && membership.vendorId === context.activeVendorId && membership.role === 'vendor_owner')
		)
			throw new AccessDeniedError()
		const location = await tx.location.findFirst({ where: { id: locationId, vendorId: context.activeVendorId } })
		if (!location) throw new AccessDeniedError()
		assertScope(context, { workspaceId: context.workspaceId, vendorId: location.vendorId, locationId })
		return location
	}

	async readConfiguration(sessionId: string | undefined, locationInput: string) {
		const locationId = z.string().uuid().parse(locationInput)
		return this.dependencies.db.$transaction(async (tx) => {
			const context = await this.dependencies.derive(tx, sessionId)
			const location = await this.ownerLocation(tx, context, locationId)
			return GoodsLocationConfigurationResultSchema.parse({
				locationId,
				version: location.goodsConfigurationVersion,
				configuration: location.goodsConfiguration,
				replayed: false,
			})
		})
	}

	async configure(sessionId: string | undefined, keyInput: string | undefined, locationInput: string, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const locationId = z.string().uuid().parse(locationInput)
		const command = GoodsLocationConfigurationCommandSchema.parse(input)
		return this.dependencies.db.$transaction(async (tx) => {
			const context = await this.dependencies.derive(tx, sessionId)
			const location = await this.ownerLocation(tx, context, locationId)
			const result = await this.dependencies.replay(
				tx,
				context,
				key,
				'PUT /v1/locations/:locationId/goods-configuration',
				{ locationId, command },
				async () => {
					if (location.goodsConfigurationVersion !== command.expectedVersion)
						throw new GoodsCheckoutConflictError('Location configuration changed. Reload before saving.')
					for (const zone of command.configuration.deliveryZones) {
						const geo = JSON.stringify({ type: 'Polygon', coordinates: [zone.polygon] })
						const [valid] = await tx.$queryRaw<
							Array<{ valid: boolean }>
						>`SELECT ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON(${geo}), 4326)) AND ST_Area(ST_GeomFromGeoJSON(${geo})) > 0 AS valid`
						if (!valid?.valid) throw new GoodsCheckoutConflictError('Delivery zone must be a valid polygon with positive area.')
					}
					const updated = await tx.location.update({
						where: { id: locationId },
						data: { goodsConfiguration: json(command.configuration), goodsConfigurationVersion: { increment: 1 } },
					})
					await this.audit(tx, context.workspaceId, context.actor.userId, 'goods.location-configured', {
						locationId,
						version: updated.goodsConfigurationVersion,
					})
					await this.emit(tx, context.workspaceId, 'GoodsConfigurationUpdated', locationId, updated.goodsConfigurationVersion, key, { locationId })
					return GoodsLocationConfigurationResultSchema.parse({
						locationId,
						version: updated.goodsConfigurationVersion,
						configuration: command.configuration,
						replayed: false,
					})
				},
			)
			return GoodsLocationConfigurationResultSchema.parse({ ...result.outcome, replayed: result.replayed })
		})
	}

	private async buildSnapshot(tx: Transaction, selection: GoodsQuoteCommand): Promise<GoodsQuoteSnapshot> {
		const groups: GoodsQuoteSnapshot['groups'] = []
		let totalCents = 0
		for (const group of selection.groups) {
			const location = await tx.location.findFirst({
				where: {
					id: group.locationId,
					vendorId: group.vendorId,
					vendor: { applicationState: 'approved', publishedAt: { not: null }, workspace: { kind: 'real' } },
				},
				include: { vendor: true },
			})
			if (!location || !location.label || !location.city || !location.vendor.publicSlug || !location.vendor.displayName) throw new AccessDeniedError()
			if (!location.goodsConfiguration || !location.goodsConfigurationVersion)
				throw new GoodsCheckoutConflictError('This Location has no goods fulfillment configuration.')
			const configuration = GoodsLocationConfigurationSchema.parse(location.goodsConfiguration)
			const lines: GoodsQuoteSnapshot['groups'][number]['lines'] = []
			let subtotal = 0
			for (const line of group.lines) {
				const listing = await tx.listing.findFirst({
					where: { id: line.listingId, vendorId: group.vendorId, kind: 'product', state: 'published' },
					include: { variants: true },
				})
				if (!listing) throw new AccessDeniedError()
				const variant = line.sku ? listing.variants.find((candidate) => candidate.sku === line.sku) : undefined
				if (listing.variants.length ? !variant : Boolean(line.sku)) throw new AccessDeniedError()
				const unitPriceCents = variant?.priceCents ?? listing.priceCents
				if (unitPriceCents === null || unitPriceCents < 1) throw new GoodsCheckoutConflictError()
				const balance = await tx.inventoryMovement.aggregate({
					where: { listingId: listing.id, locationId: location.id, sku: variant?.sku ?? null },
					_sum: { onHandDelta: true, reservedDelta: true },
				})
				if ((balance._sum.onHandDelta ?? 0) - (balance._sum.reservedDelta ?? 0) < line.quantity)
					throw new GoodsCheckoutConflictError('Selected quantity is unavailable. Change the quantity or Location and request a new quote.')
				const subtotalCents = unitPriceCents * line.quantity
				subtotal += subtotalCents
				lines.push({
					listingId: listing.id,
					listingVersion: listing.version,
					sku: variant?.sku ?? null,
					quantity: line.quantity,
					unitPriceCents,
					subtotalCents,
					policy: {
						returnTemplate: configuration.returnTemplate,
						changeOfMindDays: configuration.returnTemplate === 'standard' ? 7 : 14,
						faultProtectionDays: 30,
						restockingFeeCents: 0,
						startsAt: 'verified_handoff',
					},
				})
			}
			let deliveryFeeCents = 0
			let deliveryZone: GoodsQuoteSnapshot['groups'][number]['deliveryZone'] = null
			if (group.fulfillment.method === 'pickup') {
				if (!configuration.pickupEnabled) throw new GoodsCheckoutConflictError('Pickup is unavailable at this Location.')
			} else {
				const fulfillment = group.fulfillment
				const zone = configuration.deliveryZones.find((candidate) => candidate.id === fulfillment.zoneId)
				if (!zone || subtotal < zone.minimumCents) throw new GoodsCheckoutConflictError('Delivery zone or minimum is unavailable for this group.')
				const geo = JSON.stringify({ type: 'Polygon', coordinates: [zone.polygon] })
				const [eligible] = await tx.$queryRaw<
					Array<{ covered: boolean }>
				>`SELECT ST_Covers(ST_SetSRID(ST_GeomFromGeoJSON(${geo}), 4326), ST_SetSRID(ST_MakePoint(${fulfillment.address.point[0]}, ${fulfillment.address.point[1]}), 4326)) AS covered`
				if (!eligible?.covered) throw new GoodsCheckoutConflictError('The delivery pin is outside the selected zone.')
				deliveryZone = zone
				deliveryFeeCents = zone.freeDeliveryThresholdCents !== null && subtotal >= zone.freeDeliveryThresholdCents ? 0 : zone.feeCents
			}
			totalCents += subtotal + deliveryFeeCents
			if (!Number.isSafeInteger(totalCents) || totalCents > 2_147_483_647)
				throw new GoodsCheckoutConflictError('Quote total exceeds the supported amount.')
			groups.push({
				vendorId: group.vendorId,
				locationId: location.id,
				configurationVersion: location.goodsConfigurationVersion,
				fulfillment: group.fulfillment,
				deliveryZone,
				deliveryFeeCents,
				etaMinutes: deliveryZone?.etaMinutes ?? null,
				pickupWindowHours: group.fulfillment.method === 'pickup' ? 72 : null,
				pickupGraceHours: group.fulfillment.method === 'pickup' ? 48 : null,
				failedDeliveryRetryHours: group.fulfillment.method === 'delivery' ? 48 : null,
				lines,
			})
		}
		return GoodsQuoteSnapshotSchema.parse({ currency: 'ETB', totalCents, groups })
	}

	async quote(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const command = GoodsQuoteCommandSchema.parse(input)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.commerceLock(tx)
				const context = await this.customer(tx, sessionId)
				const result = await this.dependencies.replay(tx, context, key, 'POST /v1/customer/goods/quotes', command, async () => {
					await this.lockVendors(
						tx,
						command.groups.map(({ vendorId }) => vendorId),
					)
					await this.expireDue(tx)
					const snapshot = await this.buildSnapshot(tx, command)
					const quote = await tx.goodsQuote.create({
						data: {
							customerId: context.actor.userId,
							workspaceId: context.workspaceId,
							selection: json(command),
							snapshot: json(snapshot),
							expiresAt: new Date(this.dependencies.now().getTime() + quoteDuration),
						},
					})
					await this.audit(tx, context.workspaceId, context.actor.userId, 'goods.quote-created', {
						quoteId: quote.id,
						totalCents: snapshot.totalCents,
					})
					await this.emit(tx, context.workspaceId, 'GoodsQuoteCreated', quote.id, 1, key, { quoteId: quote.id })
					return GoodsQuoteResultSchema.parse({ quoteId: quote.id, expiresAt: quote.expiresAt.toISOString(), snapshot, replayed: false })
				})
				return GoodsQuoteResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30_000 },
		)
	}

	async hold(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const command = GoodsHoldCommandSchema.parse(input)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.commerceLock(tx)
				const context = await this.customer(tx, sessionId)
				const quote = await tx.goodsQuote.findFirst({
					where: { id: command.quoteId, customerId: context.actor.userId, workspaceId: context.workspaceId },
				})
				if (!quote) throw new AccessDeniedError()
				const result = await this.dependencies.replay(tx, context, key, 'POST /v1/customer/goods/holds', command, async () => {
					const selection = GoodsQuoteCommandSchema.parse(quote.selection)
					await this.lockVendors(
						tx,
						selection.groups.map(({ vendorId }) => vendorId),
					)
					await this.expireDue(tx)
					if (quote.expiresAt <= this.dependencies.now()) throw new GoodsCheckoutConflictError('Quote expired. Request a new quote.')
					if (await tx.goodsHold.findUnique({ where: { quoteId: quote.id } }))
						throw new GoodsCheckoutConflictError('This quote already has a hold. Read that hold or request a new quote.')
					const snapshot = await this.buildSnapshot(tx, selection)
					if (stableHash(snapshot) !== stableHash(quote.snapshot)) throw new GoodsCheckoutConflictError()
					const hold = await tx.goodsHold.create({
						data: { quoteId: quote.id, expiresAt: new Date(this.dependencies.now().getTime() + holdDuration) },
					})
					for (const group of snapshot.groups) {
						const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: group.vendorId } })
						for (const line of group.lines) {
							await tx.goodsHoldLine.create({
								data: {
									holdId: hold.id,
									listingId: line.listingId,
									locationId: group.locationId,
									sku: line.sku,
									quantity: line.quantity,
									vendorId: group.vendorId,
									vendorWorkspaceId: vendor.workspaceId,
								},
							})
							await tx.inventoryMovement.create({
								data: {
									holdId: hold.id,
									listingId: line.listingId,
									locationId: group.locationId,
									sku: line.sku,
									reason: 'held',
									onHandDelta: 0,
									reservedDelta: line.quantity,
									actorKind: 'user',
									actorId: context.actor.userId,
								},
							})
							await this.stockEvent(tx, vendor.workspaceId, hold.id, line.listingId, group.locationId, line.sku, 'held', key)
						}
					}
					await this.audit(tx, context.workspaceId, context.actor.userId, 'goods.hold-created', { holdId: hold.id, quoteId: quote.id })
					await this.emit(tx, context.workspaceId, 'HoldCreated', hold.id, 1, key, {
						holdId: hold.id,
						quoteId: quote.id,
						expiresAt: hold.expiresAt.toISOString(),
					})
					return GoodsHoldResultSchema.parse({
						holdId: hold.id,
						quoteId: quote.id,
						expiresAt: hold.expiresAt.toISOString(),
						currency: snapshot.currency,
						totalCents: snapshot.totalCents,
						replayed: false,
					})
				})
				return GoodsHoldResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30_000 },
		)
	}

	async readHold(sessionId: string | undefined, holdInput: string) {
		const holdId = z.string().uuid().parse(holdInput)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.commerceLock(tx)
				const context = await this.customer(tx, sessionId)
				const hold = await tx.goodsHold.findFirst({
					where: { id: holdId, quote: { customerId: context.actor.userId, workspaceId: context.workspaceId } },
					include: { quote: true, lines: true },
				})
				if (!hold) throw new AccessDeniedError()
				await this.lockVendors(
					tx,
					hold.lines.map(({ vendorId }) => vendorId),
				)
				if (hold.state === 'holding' && hold.expiresAt <= this.dependencies.now()) await this.releaseInTransaction(tx, hold.id, 'expired', null, null)
				const current = await tx.goodsHold.findUniqueOrThrow({ where: { id: hold.id } })
				const snapshot = GoodsQuoteSnapshotSchema.parse(hold.quote.snapshot)
				return GoodsHoldReadSchema.parse({
					holdId,
					quoteId: hold.quoteId,
					expiresAt: hold.expiresAt.toISOString(),
					state: current.state,
					snapshot,
					currency: snapshot.currency,
					totalCents: snapshot.totalCents,
				})
			},
			{ timeout: 30_000 },
		)
	}

	async release(sessionId: string | undefined, keyInput: string | undefined, holdInput: string) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const holdId = z.string().uuid().parse(holdInput)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.commerceLock(tx)
				const context = await this.customer(tx, sessionId)
				const hold = await tx.goodsHold.findFirst({
					where: { id: holdId, quote: { customerId: context.actor.userId, workspaceId: context.workspaceId } },
					include: { lines: true },
				})
				if (!hold) throw new AccessDeniedError()
				const result = await this.dependencies.replay(tx, context, key, 'POST /v1/customer/goods/holds/:holdId/release', { holdId }, async () => {
					await this.lockVendors(
						tx,
						hold.lines.map(({ vendorId }) => vendorId),
					)
					const state = hold.state === 'holding' ? (hold.expiresAt <= this.dependencies.now() ? 'expired' : 'released') : hold.state
					if (state !== 'released' && state !== 'expired') throw new GoodsCheckoutConflictError()
					await this.releaseInTransaction(tx, holdId, state, context.actor.userId, key)
					return GoodsHoldReleaseResultSchema.parse({ holdId, state, replayed: false })
				})
				return GoodsHoldReleaseResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30_000 },
		)
	}

	private async releaseInTransaction(tx: Transaction, holdId: string, state: 'released' | 'expired', actorId: string | null, key: string | null) {
		const hold = await tx.goodsHold.findUniqueOrThrow({ where: { id: holdId }, include: { lines: true, quote: true } })
		if (hold.state !== 'holding') return false
		for (const line of hold.lines) {
			await tx.inventoryMovement.create({
				data: {
					holdId,
					listingId: line.listingId,
					locationId: line.locationId,
					sku: line.sku,
					reason: 'released',
					onHandDelta: 0,
					reservedDelta: -line.quantity,
					actorKind: 'user',
					actorId: hold.quote.customerId,
					note: state === 'expired' ? 'Checkout hold expired.' : 'Customer released checkout hold.',
				},
			})
			await this.stockEvent(tx, line.vendorWorkspaceId, holdId, line.listingId, line.locationId, line.sku, 'released', key)
		}
		await tx.goodsHold.update({ where: { id: holdId }, data: { state, releasedAt: this.dependencies.now() } })
		await this.audit(tx, hold.quote.workspaceId, actorId, `goods.hold-${state}`, { holdId, quoteId: hold.quoteId })
		await this.emit(tx, hold.quote.workspaceId, state === 'expired' ? 'HoldExpired' : 'HoldReleased', holdId, 2, key, { holdId })
		return true
	}

	private async expireDue(tx: Transaction) {
		const due = await tx.goodsHold.findMany({
			where: { state: 'holding', expiresAt: { lte: this.dependencies.now() } },
			include: { lines: true },
			orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
			take: 100,
		})
		await this.lockVendors(tx, [...new Set(due.flatMap(({ lines }) => lines.map(({ vendorId }) => vendorId)))])
		let expired = 0
		for (const hold of due) if (await this.releaseInTransaction(tx, hold.id, 'expired', null, null)) expired++
		return expired
	}

	async expire() {
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.commerceLock(tx)
				return this.expireDue(tx)
			},
			{ timeout: 30_000 },
		)
	}

	private async stockEvent(
		tx: Transaction,
		workspaceId: string,
		holdId: string,
		listingId: string,
		locationId: string,
		sku: string | null,
		reason: string,
		key: string | null,
	) {
		const version = await tx.inventoryMovement.count({ where: { listingId } })
		await this.emit(tx, workspaceId, 'StockMoved', listingId, version, key, { holdId, listingId, locationId, sku, reason })
	}

	private emit(
		tx: Transaction,
		workspaceId: string,
		type: 'GoodsConfigurationUpdated' | 'GoodsQuoteCreated' | 'HoldCreated' | 'HoldReleased' | 'HoldExpired' | 'StockMoved',
		aggregateId: string,
		aggregateVersion: number,
		key: string | null,
		payload: Record<string, unknown>,
	) {
		const eventId = randomUUID()
		const event = DomainEventSchema.parse({
			eventId,
			workspaceId,
			type,
			aggregateId,
			aggregateVersion,
			idempotencyKey: key,
			causationId: eventId,
			correlationId: eventId,
			occurredAt: this.dependencies.now().toISOString(),
			schemaVersion: 1,
			payload,
		})
		return tx.outboxEvent.create({ data: { eventId, workspaceId, type, payload: json(event), occurredAt: new Date(event.occurredAt) } })
	}
	private audit(tx: Transaction, workspaceId: string, actorId: string | null, action: string, metadata: Record<string, unknown>) {
		return tx.auditLog.create({ data: { workspaceId, actorId, action, correlationId: randomUUID(), metadata: json(metadata) } })
	}
}
