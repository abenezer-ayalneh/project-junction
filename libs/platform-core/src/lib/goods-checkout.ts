import { randomUUID } from 'node:crypto'

import {
	type AccessContext,
	DomainEventSchema,
	GoodsHoldCommandSchema,
	GoodsHoldReadSchema,
	GoodsHoldReleaseResultSchema,
	GoodsHoldResultSchema,
	GoodsLocalPaymentResultCommandSchema,
	GoodsLocationConfigurationCommandSchema,
	GoodsLocationConfigurationResultSchema,
	GoodsLocationConfigurationSchema,
	GoodsPaymentReadSchema,
	GoodsPaymentResultSchema,
	GoodsPaymentStartCommandSchema,
	GoodsPurchaseReadSchema,
	type GoodsQuoteCommand,
	GoodsQuoteCommandSchema,
	GoodsQuoteResultSchema,
	type GoodsQuoteSnapshot,
	GoodsQuoteSnapshotSchema,
	GoodsVendorOrderReadSchema,
	IdempotencyKeySchema,
} from 'contracts'
import { z } from 'zod'

import { Prisma, type PrismaClient } from '../../generated/prisma/index.js'
import { AccessDeniedError, assertScope } from './access.js'
import { stableHash } from './idempotency.js'
import { LocalGoodsPaymentAdapter } from './local-goods-payment.js'

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
	payments?: LocalGoodsPaymentAdapter
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

/** Goods-only quote, reservation and controlled local payment commitment lifecycle. */
export class GoodsCheckout {
	private readonly payments: LocalGoodsPaymentAdapter
	constructor(private readonly dependencies: Dependencies) {
		this.payments = dependencies.payments ?? new LocalGoodsPaymentAdapter()
	}

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
				const payment = await tx.goodsPaymentAttempt.findUnique({ where: { holdId } })
				if (payment) await this.reconcilePaymentResults(tx, payment.id)
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
				if (['holding', 'awaiting_payment'].includes(hold.state) && hold.expiresAt <= this.dependencies.now())
					await this.releaseInTransaction(tx, hold.id, 'expired', null, null)
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
				const payment = await tx.goodsPaymentAttempt.findUnique({ where: { holdId } })
				if (payment) await this.reconcilePaymentResults(tx, payment.id)
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
					const state = ['holding', 'awaiting_payment'].includes(hold.state)
						? hold.expiresAt <= this.dependencies.now()
							? 'expired'
							: 'released'
						: hold.state
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
		if (!['holding', 'awaiting_payment'].includes(hold.state)) return false
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
		await this.reconcilePaymentResults(tx)
		const due = await tx.goodsHold.findMany({
			where: {
				state: { in: ['holding', 'awaiting_payment'] },
				expiresAt: { lte: this.dependencies.now() },
				NOT: { payment: { is: { state: { in: ['processing', 'unknown'] }, result: { is: { outcome: 'succeeded' } } } } },
			},
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

	private async paymentView(tx: Transaction, paymentId: string) {
		const payment = await tx.goodsPaymentAttempt.findUniqueOrThrow({
			where: { id: paymentId },
			include: { hold: true, purchase: true, refunds: { orderBy: { createdAt: 'asc' } } },
		})
		return GoodsPaymentReadSchema.parse({
			paymentId,
			holdId: payment.holdId,
			state: payment.state,
			amountCents: payment.amountCents,
			currency: payment.currency,
			provider: payment.provider,
			holdState: payment.hold.state,
			expiresAt: payment.hold.expiresAt.toISOString(),
			purchaseId: payment.purchase?.id ?? null,
			refunds: payment.refunds.map((refund) => ({ refundId: refund.id, amountCents: refund.amountCents, state: refund.state })),
		})
	}

	private async ownedPayment(tx: Transaction, sessionId: string | undefined, paymentId: string) {
		const context = await this.dependencies.derive(tx, sessionId)
		const payment = await tx.goodsPaymentAttempt.findFirst({
			where: { id: paymentId, hold: { quote: { customerId: context.actor.userId, workspaceId: context.workspaceId } } },
			include: { hold: { include: { quote: true, lines: true } } },
		})
		if (!payment) throw new AccessDeniedError()
		return { context, payment }
	}

	async startPayment(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		this.payments.assertLocal()
		const key = IdempotencyKeySchema.parse(keyInput)
		const command = GoodsPaymentStartCommandSchema.parse(input)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.commerceLock(tx)
				const context = await this.customer(tx, sessionId)
				const hold = await tx.goodsHold.findFirst({
					where: { id: command.holdId, quote: { customerId: context.actor.userId, workspaceId: context.workspaceId } },
					include: { quote: true, lines: true },
				})
				if (!hold) throw new AccessDeniedError()
				const result = await this.dependencies.replay(tx, context, key, 'POST /v1/customer/goods/payments', command, async () => {
					await this.lockVendors(
						tx,
						hold.lines.map((line) => line.vendorId),
					)
					if (hold.state !== 'holding' || hold.expiresAt <= this.dependencies.now())
						throw new GoodsCheckoutConflictError('Hold ended or payment already started. Read its current state.')
					for (const line of hold.lines) {
						const listing = await tx.listing.findFirst({
							where: {
								id: line.listingId,
								state: 'published',
								vendor: { applicationState: 'approved', publishedAt: { not: null }, workspace: { kind: 'real' } },
							},
						})
						if (!listing) throw new GoodsCheckoutConflictError('Product publication changed. Release this hold and request a fresh quote.')
					}
					const snapshot = GoodsQuoteSnapshotSchema.parse(hold.quote.snapshot)
					const payment = await tx.goodsPaymentAttempt.create({
						data: { holdId: hold.id, amountCents: snapshot.totalCents, createdAt: this.dependencies.now() },
					})
					await tx.goodsHold.update({
						where: { id: hold.id },
						data: { state: 'awaiting_payment', expiresAt: new Date(this.dependencies.now().getTime() + holdDuration) },
					})
					await this.audit(tx, context.workspaceId, context.actor.userId, 'goods.payment-started', { paymentId: payment.id, holdId: hold.id })
					await this.emit(tx, context.workspaceId, 'GoodsPaymentStarted', payment.id, 1, key, {
						paymentId: payment.id,
						holdId: hold.id,
						provider: 'local-controlled',
					})
					return this.paymentView(tx, payment.id)
				})
				return GoodsPaymentResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30_000 },
		)
	}

	// Controlled provider receipt is durable before business reconciliation. No
	// browser-supplied price, currency, timestamp or provider reference is accepted.
	async recordLocalPaymentResult(sessionId: string | undefined, keyInput: string | undefined, paymentInput: string, input: unknown) {
		this.payments.assertLocal()
		const key = IdempotencyKeySchema.parse(keyInput)
		const paymentId = z.string().uuid().parse(paymentInput)
		const command = GoodsLocalPaymentResultCommandSchema.parse(input)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.commerceLock(tx)
				const { context, payment } = await this.ownedPayment(tx, sessionId, paymentId)
				const result = await this.dependencies.replay(
					tx,
					context,
					key,
					'POST /v1/customer/goods/payments/:paymentId/local-result',
					{ paymentId, command },
					async () => {
						const existing = await tx.goodsLocalPaymentResult.findUnique({ where: { paymentId } })
						if (existing && existing.outcome !== command.outcome)
							throw new GoodsCheckoutConflictError('This payment already has a final provider result.')
						if (!existing) {
							if (command.outcome === 'unknown') {
								if (payment.state === 'processing') {
									await tx.goodsPaymentAttempt.update({ where: { id: paymentId }, data: { state: 'unknown' } })
									await this.audit(tx, context.workspaceId, context.actor.userId, 'goods.payment-unknown', { paymentId })
									await this.emit(tx, context.workspaceId, 'GoodsPaymentUnknown', paymentId, 2, key, { paymentId })
								}
							} else {
								await tx.goodsLocalPaymentResult.create({
									data: {
										paymentId,
										outcome: command.outcome,
										succeededAt: command.outcome === 'succeeded' ? this.dependencies.now() : null,
										receivedAt: this.dependencies.now(),
									},
								})
								await this.audit(tx, context.workspaceId, context.actor.userId, 'goods.payment-result-recorded', {
									paymentId,
									outcome: command.outcome,
								})
								await this.emit(tx, context.workspaceId, 'GoodsPaymentResultRecorded', paymentId, 2, key, {
									paymentId,
									outcome: command.outcome,
								})
							}
						}
						return this.paymentView(tx, paymentId)
					},
				)
				return GoodsPaymentResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30_000 },
		)
	}

	private async reconcilePaymentResults(tx: Transaction, paymentId?: string) {
		const attempts = await tx.goodsPaymentAttempt.findMany({
			where: { ...(paymentId ? { id: paymentId } : {}), state: { in: ['processing', 'unknown'] }, result: { isNot: null } },
			include: { result: true, hold: { include: { quote: true, lines: true } } },
			orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
			take: 100,
		})
		await this.lockVendors(
			tx,
			attempts.flatMap(({ hold }) => hold.lines.map((line) => line.vendorId)),
		)
		for (const payment of attempts) {
			const { hold, result } = payment
			if (!result) continue
			if (result.outcome === 'failed') {
				await this.releaseInTransaction(tx, hold.id, hold.expiresAt <= this.dependencies.now() ? 'expired' : 'released', null, null)
				await tx.goodsPaymentAttempt.update({ where: { id: payment.id }, data: { state: 'failed' } })
				await this.audit(tx, hold.quote.workspaceId, null, 'goods.payment-failed', { paymentId: payment.id })
				await this.emit(tx, hold.quote.workspaceId, 'GoodsPaymentFailed', payment.id, 3, null, { paymentId: payment.id })
				continue
			}
			const succeededAt = result.succeededAt
			if (!succeededAt) throw new GoodsCheckoutConflictError('Provider success is missing its authoritative time.')
			if (hold.state !== 'awaiting_payment' || succeededAt < payment.createdAt || succeededAt >= hold.expiresAt) {
				await this.releaseInTransaction(tx, hold.id, 'expired', null, null)
				await tx.goodsHold.update({ where: { id: hold.id }, data: { state: 'compensating' } })
				await tx.goodsPaymentAttempt.update({ where: { id: payment.id }, data: { state: 'refund_pending' } })
				const refund = await tx.goodsRefundOperation.create({
					data: { paymentId: payment.id, semanticKey: `late-success:${payment.id}`, amountCents: payment.amountCents },
				})
				await this.audit(tx, hold.quote.workspaceId, null, 'goods.late-success-compensation', { paymentId: payment.id, refundId: refund.id })
				await this.emit(tx, hold.quote.workspaceId, 'GoodsRefundRequested', refund.id, 1, null, {
					paymentId: payment.id,
					refundId: refund.id,
					amountCents: payment.amountCents,
				})
				continue
			}
			const snapshot = GoodsQuoteSnapshotSchema.parse(hold.quote.snapshot)
			if (payment.amountCents !== snapshot.totalCents || payment.currency !== snapshot.currency)
				throw new GoodsCheckoutConflictError('Payment does not match the held amount.')
			const purchase = await tx.goodsPurchase.create({
				data: {
					holdId: hold.id,
					paymentId: payment.id,
					customerId: hold.quote.customerId,
					workspaceId: hold.quote.workspaceId,
					snapshot: json(snapshot),
					paidAt: succeededAt,
					createdAt: this.dependencies.now(),
				},
			})
			for (const group of snapshot.groups) {
				const reserved = hold.lines.filter((line) => line.vendorId === group.vendorId)
				const order = await tx.goodsVendorOrder.create({
					data: {
						purchaseId: purchase.id,
						vendorId: group.vendorId,
						vendorWorkspaceId: reserved[0].vendorWorkspaceId,
						locationId: group.locationId,
						snapshot: json(group),
						createdAt: this.dependencies.now(),
					},
				})
				for (const line of group.lines) {
					const allocation = reserved.find((item) => item.listingId === line.listingId && item.sku === line.sku)
					if (!allocation || allocation.quantity !== line.quantity) throw new GoodsCheckoutConflictError('Incomplete held allocation.')
					const balance = await tx.inventoryMovement.aggregate({
						where: { listingId: line.listingId, locationId: group.locationId, sku: line.sku },
						_sum: { onHandDelta: true, reservedDelta: true },
					})
					if ((balance._sum.onHandDelta ?? 0) < line.quantity || (balance._sum.reservedDelta ?? 0) < line.quantity)
						throw new GoodsCheckoutConflictError('Held stock is unavailable.')
					const orderLine = await tx.goodsOrderLine.create({ data: { orderId: order.id, holdLineId: allocation.id, snapshot: json(line) } })
					await tx.inventoryMovement.create({
						data: {
							holdId: hold.id,
							orderLineId: orderLine.id,
							listingId: line.listingId,
							locationId: group.locationId,
							sku: line.sku,
							reason: 'sold',
							onHandDelta: -line.quantity,
							reservedDelta: -line.quantity,
							actorKind: 'user',
							actorId: hold.quote.customerId,
						},
					})
					await this.stockEvent(tx, allocation.vendorWorkspaceId, hold.id, line.listingId, group.locationId, line.sku, 'sold', null)
				}
				await this.audit(tx, order.vendorWorkspaceId, null, 'goods.order-confirmed', { orderId: order.id, purchaseId: purchase.id })
				await this.emit(tx, order.vendorWorkspaceId, 'GoodsVendorOrderConfirmed', order.id, 1, null, { orderId: order.id, purchaseId: purchase.id })
			}
			await tx.goodsPaymentAttempt.update({ where: { id: payment.id }, data: { state: 'succeeded' } })
			await tx.goodsHold.update({ where: { id: hold.id }, data: { state: 'committed', committedAt: this.dependencies.now() } })
			await this.audit(tx, hold.quote.workspaceId, null, 'goods.purchase-committed', { purchaseId: purchase.id, paymentId: payment.id })
			await this.emit(tx, hold.quote.workspaceId, 'GoodsPurchaseCommitted', purchase.id, 1, null, { purchaseId: purchase.id, paymentId: payment.id })
		}
		return attempts.length
	}

	async reconcilePayments() {
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.commerceLock(tx)
				return this.reconcilePaymentResults(tx)
			},
			{ timeout: 30_000 },
		)
	}

	async reconcileRefunds() {
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.commerceLock(tx)
				const refunds = await tx.goodsRefundOperation.findMany({
					where: { state: 'pending' },
					orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
					take: 100,
					include: { payment: { include: { hold: { include: { quote: true } } } } },
				})
				let completed = 0
				for (const refund of refunds) {
					let result: { reference: string }
					try {
						result = await this.payments.refund({ operationId: refund.id, paymentId: refund.paymentId, amountCents: refund.amountCents })
					} catch {
						continue
					}
					await tx.goodsRefundOperation.update({
						where: { id: refund.id },
						data: { state: 'succeeded', providerReference: result.reference, completedAt: this.dependencies.now() },
					})
					await tx.goodsPaymentAttempt.update({ where: { id: refund.paymentId }, data: { state: 'refunded' } })
					await this.audit(tx, refund.payment.hold.quote.workspaceId, null, 'goods.refund-completed', { refundId: refund.id })
					await this.emit(tx, refund.payment.hold.quote.workspaceId, 'GoodsRefundCompleted', refund.id, 2, null, {
						refundId: refund.id,
						paymentId: refund.paymentId,
					})
					completed++
				}
				return completed
			},
			{ timeout: 30_000 },
		)
	}

	async readPayment(sessionId: string | undefined, paymentInput: string) {
		const paymentId = z.string().uuid().parse(paymentInput)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.commerceLock(tx)
				await this.ownedPayment(tx, sessionId, paymentId)
				await this.reconcilePaymentResults(tx, paymentId)
				await this.expireDue(tx)
				return this.paymentView(tx, paymentId)
			},
			{ timeout: 30_000 },
		)
	}

	private orderView(order: {
		id: string
		purchaseId: string
		vendorId: string
		locationId: string
		state: string
		snapshot: Prisma.JsonValue
		lines: { id: string; snapshot: Prisma.JsonValue }[]
	}) {
		return GoodsVendorOrderReadSchema.parse({
			orderId: order.id,
			purchaseId: order.purchaseId,
			vendorId: order.vendorId,
			locationId: order.locationId,
			state: order.state,
			snapshot: order.snapshot,
			lines: order.lines.map((line) => ({ lineId: line.id, snapshot: line.snapshot })),
		})
	}
	async readPurchase(sessionId: string | undefined, purchaseInput: string) {
		const purchaseId = z.string().uuid().parse(purchaseInput)
		return this.dependencies.db.$transaction(async (tx) => {
			const context = await this.dependencies.derive(tx, sessionId)
			const purchase = await tx.goodsPurchase.findFirst({
				where: { id: purchaseId, customerId: context.actor.userId, workspaceId: context.workspaceId },
				include: { orders: { include: { lines: true } } },
			})
			if (!purchase) throw new AccessDeniedError()
			return GoodsPurchaseReadSchema.parse({
				purchaseId: purchase.id,
				holdId: purchase.holdId,
				paymentId: purchase.paymentId,
				paidAt: purchase.paidAt.toISOString(),
				snapshot: purchase.snapshot,
				orders: purchase.orders.map((order) => this.orderView(order)),
			})
		})
	}
	async readVendorOrder(sessionId: string | undefined, orderInput: string) {
		const orderId = z.string().uuid().parse(orderInput)
		return this.dependencies.db.$transaction(async (tx) => {
			const context = await this.dependencies.derive(tx, sessionId)
			if (
				!context.memberships.some(
					(membership) => membership.active && membership.vendorId === context.activeVendorId && membership.role === 'vendor_owner',
				)
			)
				throw new AccessDeniedError()
			const order = await tx.goodsVendorOrder.findFirst({
				where: { id: orderId, vendorId: context.activeVendorId ?? '', vendorWorkspaceId: context.workspaceId },
				include: { lines: true },
			})
			if (!order) throw new AccessDeniedError()
			assertScope(context, { workspaceId: order.vendorWorkspaceId, vendorId: order.vendorId, locationId: order.locationId })
			return this.orderView(order)
		})
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
		type: import('contracts').DomainEvent['type'],
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
