import { randomUUID } from 'node:crypto'

import {
	type AccessContext,
	GoodsOrderCancellationCommandSchema,
	GoodsOrderCancellationResultSchema,
	GoodsQuoteSnapshotSchema,
	GoodsVendorOrderReadSchema,
	IdempotencyKeySchema,
} from 'contracts'
import { z } from 'zod'

import { type Prisma } from '../../generated/prisma/index.js'
import { AccessDeniedError, assertRequiredMfa, assertScope } from './access.js'
import { goodsAudit, GoodsCheckoutConflictError, type GoodsDependencies, goodsEmit } from './goods-support.js'

type Transaction = Prisma.TransactionClient
type Order = Prisma.GoodsVendorOrderGetPayload<{ include: { lines: { include: { cancellationLines: true } }; cancellations: { include: { refund: true } } } }>

/** Exceptional pre-fulfillment cancellation; commercial snapshots stay sealed. */
export class GoodsCancellation {
	constructor(private readonly dependencies: GoodsDependencies) {}
	private authorize(
		context: AccessContext,
		order: { id: string; vendorId: string; vendorWorkspaceId: string; locationId: string },
		actor: 'vendor' | 'platform',
	) {
		if (actor === 'platform') {
			if (
				!context.goodsOrderAuthorities.some(
					(grant) => grant.orderId === order.id && grant.permission === 'cancel' && new Date(grant.expiresAt) > new Date(),
				)
			)
				throw new AccessDeniedError()
		} else {
			if (!context.memberships.some((membership) => membership.active && membership.vendorId === order.vendorId && membership.role === 'vendor_owner'))
				throw new AccessDeniedError()
			assertScope(context, { workspaceId: order.vendorWorkspaceId, vendorId: order.vendorId, locationId: order.locationId })
		}
		assertRequiredMfa(context)
	}
	private async result(tx: Transaction, cancellationId: string, replayed: boolean) {
		const cancellation = await tx.goodsOrderCancellation.findUniqueOrThrow({
			where: { id: cancellationId },
			include: { order: true, refund: true, lines: true },
		})
		return GoodsOrderCancellationResultSchema.parse({
			cancellationId,
			orderId: cancellation.orderId,
			state: cancellation.order.state,
			itemRefundCents: cancellation.itemRefundCents,
			deliveryRefundCents: cancellation.deliveryRefundCents,
			reviewRequired: cancellation.reviewRequired,
			currency: 'ETB',
			lines: cancellation.lines.map((line) => ({
				lineId: line.orderLineId,
				quantity: line.quantity,
				stockDisposition: line.stockDisposition,
				refundCents: line.refundCents,
			})),
			refund: { refundId: cancellation.refund.id, amountCents: cancellation.refund.amountCents, state: cancellation.refund.state },
			replayed,
		})
	}
	async cancel(sessionId: string | undefined, keyInput: string | undefined, orderInput: string, input: unknown, actor: 'vendor' | 'platform') {
		const key = IdempotencyKeySchema.parse(keyInput)
		const orderId = z.string().uuid().parse(orderInput)
		const command = GoodsOrderCancellationCommandSchema.parse(input)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout', 0))`
				const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true })
				return this.cancelInTransaction(tx, context, key, orderId, command, actor, 'pre_fulfillment')
			},
			{ timeout: 30_000 },
		)
	}
	async cancelInTransaction(
		tx: Transaction,
		context: AccessContext,
		key: string,
		orderId: string,
		command: z.infer<typeof GoodsOrderCancellationCommandSchema>,
		actor: 'vendor' | 'platform',
		origin: 'pre_fulfillment' | 'pickup_expiry' | 'delivery_failure' | 'return_inspection',
		refundDeliveryFee = true,
	) {
		const order = await tx.goodsVendorOrder.findUnique({
			where: { id: orderId },
			include: {
				fulfillment: { include: { delivery: true } },
				purchase: true,
				cancellations: { include: { refund: true, returnCase: true } },
				lines: { include: { holdLine: true, cancellationLines: true } },
			},
		})
		if (!order) throw new AccessDeniedError()
		this.authorize(context, order, actor)
		await this.dependencies.lockWorkspace(tx, order.vendorWorkspaceId)
		const replay = await this.dependencies.replay(
			tx,
			context,
			key,
			origin !== 'pre_fulfillment'
				? 'POST /v1/vendor/goods/fulfillments/:fulfillmentId/inspection-effects'
				: `POST /v1/${actor}/goods/orders/:orderId/cancellations`,
			{ orderId, command },
			async () => {
				if (!['confirmed', 'partially_cancelled'].includes(order.state))
					throw new GoodsCheckoutConflictError('This Order cannot be cancelled before fulfillment. Use the appropriate aftercare flow.')
				if (
					origin === 'pre_fulfillment' &&
					order.fulfillment &&
					(!['pending', 'preparing'].includes(order.fulfillment.state) || !!order.fulfillment.delivery)
				)
					throw new GoodsCheckoutConflictError('Fulfillment has advanced. Use the relevant inspection or return path.')
				if (origin === 'pickup_expiry' && (order.fulfillment?.state !== 'inspection_pending' || order.fulfillment.method !== 'pickup'))
					throw new GoodsCheckoutConflictError('Pickup must expire into inspection first.')
				if (origin === 'delivery_failure' && order.fulfillment?.delivery?.state !== 'inspection_pending')
					throw new GoodsCheckoutConflictError('Delivery must enter inspection before recovery.')
				if (origin === 'return_inspection' && order.fulfillment?.state !== 'collected' && order.fulfillment?.delivery?.state !== 'delivered')
					throw new GoodsCheckoutConflictError('Returns require completed verified handoff.')
				const group = GoodsQuoteSnapshotSchema.shape.groups.element.parse(order.snapshot)
				let itemRefundCents = 0
				const selected = command.lines.map((selection) => {
					const line = order.lines.find((candidate) => candidate.id === selection.lineId)
					if (!line) throw new AccessDeniedError()
					const snapshot = GoodsQuoteSnapshotSchema.shape.groups.element.shape.lines.element.parse(line.snapshot)
					const already = line.cancellationLines.reduce((total, prior) => total + prior.quantity, 0)
					if (selection.quantity > snapshot.quantity - already)
						throw new GoodsCheckoutConflictError(
							'Selected cancellation quantity exceeds the remaining purchased quantity. Read the Order and choose a remaining quantity.',
						)
					const refundCents = snapshot.unitPriceCents * selection.quantity
					itemRefundCents += refundCents
					return { selection, line, snapshot, refundCents }
				})
				const remainingQuantity = order.lines.reduce(
					(total, line) =>
						total +
						GoodsQuoteSnapshotSchema.shape.groups.element.shape.lines.element.parse(line.snapshot).quantity -
						line.cancellationLines.reduce((sum, cancellation) => sum + cancellation.quantity, 0) -
						(selected.find((candidate) => candidate.line.id === line.id)?.selection.quantity ?? 0),
					0,
				)
				const state = remainingQuantity === 0 ? 'cancelled' : 'partially_cancelled'
				const previousDeliveryRefund = order.cancellations.reduce((total, cancellation) => total + cancellation.deliveryRefundCents, 0)
				const deliveryRefundCents =
					remainingQuantity === 0 &&
					refundDeliveryFee &&
					!(origin === 'return_inspection' && order.cancellations.some((prior) => prior.returnCase?.reason === 'change_of_mind'))
						? group.deliveryFeeCents - previousDeliveryRefund
						: 0
				const cancellationId = randomUUID()
				const refund = await tx.goodsRefundOperation.create({
					data: {
						paymentId: order.purchase.paymentId,
						semanticKey: `cancellation:${cancellationId}`,
						amountCents: itemRefundCents + deliveryRefundCents,
						createdAt: this.dependencies.now(),
					},
				})
				await tx.goodsOrderCancellation.create({
					data: {
						id: cancellationId,
						orderId,
						refundId: refund.id,
						actorId: context.actor.userId,
						actorKind: actor,
						origin,
						note: command.note,
						itemRefundCents,
						deliveryRefundCents,
						createdAt: this.dependencies.now(),
					},
				})
				for (const { selection, line, snapshot, refundCents } of selected) {
					const effect = await tx.goodsCancellationLine.create({
						data: {
							cancellationId,
							orderLineId: line.id,
							quantity: selection.quantity,
							stockDisposition: selection.stockDisposition,
							refundCents,
						},
					})
					for (const reason of selection.stockDisposition === 'restock'
						? ['returned']
						: ['returned', selection.stockDisposition === 'quarantine' ? 'quarantined' : selection.stockDisposition]) {
						await tx.inventoryMovement.create({
							data: {
								orderLineId: line.id,
								cancellationLineId: effect.id,
								listingId: snapshot.listingId,
								locationId: order.locationId,
								sku: snapshot.sku,
								reason,
								onHandDelta: reason === 'returned' ? selection.quantity : -selection.quantity,
								reservedDelta: 0,
								actorKind: 'user',
								actorId: context.actor.userId,
								note: command.note,
							},
						})
					}
					const version = await tx.inventoryMovement.count({ where: { listingId: snapshot.listingId } })
					await goodsEmit(tx, () => this.dependencies.now(), order.vendorWorkspaceId, 'StockMoved', snapshot.listingId, version, key, {
						cancellationId,
						orderLineId: line.id,
						listingId: snapshot.listingId,
						locationId: order.locationId,
						sku: snapshot.sku,
						reason: 'cancellation-recovery',
						stockDisposition: selection.stockDisposition,
					})
				}
				await tx.goodsVendorOrder.update({ where: { id: orderId }, data: { state } })
				if (state === 'cancelled' && origin === 'pre_fulfillment' && order.fulfillment) {
					await tx.goodsFulfillment.update({
						where: { id: order.fulfillment.id },
						data: { state: 'cancelled', endedAt: this.dependencies.now(), version: { increment: 1 } },
					})
					await goodsEmit(
						tx,
						() => this.dependencies.now(),
						order.vendorWorkspaceId,
						'GoodsFulfillmentCancelled',
						order.fulfillment.id,
						order.fulfillment.version + 1,
						key,
						{ fulfillmentId: order.fulfillment.id, orderId },
					)
				}
				const payment = await tx.goodsPaymentAttempt.findUniqueOrThrow({ where: { id: order.purchase.paymentId } })
				if (payment.state !== 'refund_pending') await tx.goodsPaymentAttempt.update({ where: { id: payment.id }, data: { state: 'refund_pending' } })
				await goodsAudit(tx, order.vendorWorkspaceId, context.actor.userId, 'goods.order-cancelled', {
					cancellationId,
					orderId,
					actor,
					note: command.note,
					itemRefundCents,
					deliveryRefundCents,
					reviewRequired: true,
				})
				await goodsEmit(
					tx,
					() => this.dependencies.now(),
					order.vendorWorkspaceId,
					state === 'cancelled' ? 'GoodsOrderCancelled' : 'GoodsOrderPartiallyCancelled',
					orderId,
					order.cancellations.length + 2,
					key,
					{ cancellationId, orderId, refundId: refund.id },
				)
				await goodsEmit(tx, () => this.dependencies.now(), order.purchase.workspaceId, 'GoodsRefundRequested', refund.id, 1, key, {
					refundId: refund.id,
					cancellationId,
					orderId,
					amountCents: refund.amountCents,
				})
				await goodsEmit(tx, () => this.dependencies.now(), order.purchase.workspaceId, 'GoodsCancellationReviewRequested', cancellationId, 1, key, {
					cancellationId,
					orderId,
					actor,
					reviewRequired: true,
				})
				return this.result(tx, cancellationId, false)
			},
		)
		// Command replay preserves acceptance; read the cancellation for current refund state.
		return GoodsOrderCancellationResultSchema.parse({ ...replay.outcome, replayed: replay.replayed })
	}

	orderView(order: Pick<Order, 'id' | 'purchaseId' | 'vendorId' | 'locationId' | 'state' | 'snapshot' | 'cancellations' | 'lines'>) {
		return GoodsVendorOrderReadSchema.parse({
			orderId: order.id,
			purchaseId: order.purchaseId,
			vendorId: order.vendorId,
			locationId: order.locationId,
			state: order.state,
			snapshot: order.snapshot,
			cancellations: order.cancellations.map((cancellation) => ({
				cancellationId: cancellation.id,
				itemRefundCents: cancellation.itemRefundCents,
				deliveryRefundCents: cancellation.deliveryRefundCents,
				refundId: cancellation.refundId,
				refundState: cancellation.refund.state,
			})),
			lines: order.lines.map((line) => {
				const quantity = GoodsQuoteSnapshotSchema.shape.groups.element.shape.lines.element.parse(line.snapshot).quantity
				const cancelledQuantity = line.cancellationLines.reduce((total, cancellation) => total + cancellation.quantity, 0)
				return { lineId: line.id, snapshot: line.snapshot, cancelledQuantity, remainingQuantity: quantity - cancelledQuantity }
			}),
		})
	}
	async readPlatformOrder(sessionId: string | undefined, orderInput: string) {
		const orderId = z.string().uuid().parse(orderInput)
		return this.dependencies.db.$transaction(async (tx) => {
			const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true })
			const order = await tx.goodsVendorOrder.findUnique({
				where: { id: orderId },
				include: { lines: { include: { cancellationLines: true } }, cancellations: { include: { refund: true } } },
			})
			if (!order) throw new AccessDeniedError()
			this.authorize(context, order, 'platform')
			return this.orderView(order)
		})
	}

	async read(sessionId: string | undefined, cancellationInput: string) {
		const cancellationId = z.string().uuid().parse(cancellationInput)
		return this.dependencies.db.$transaction(async (tx) => {
			const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true })
			const cancellation = await tx.goodsOrderCancellation.findUnique({
				where: { id: cancellationId },
				include: { order: { include: { purchase: true } } },
			})
			if (!cancellation) throw new AccessDeniedError()
			const { order } = cancellation
			if (order.purchase.customerId !== context.actor.userId || order.purchase.workspaceId !== context.workspaceId)
				this.authorize(context, order, context.goodsOrderAuthorities.some((grant) => grant.orderId === order.id) ? 'platform' : 'vendor')
			return this.result(tx, cancellationId, false)
		})
	}
}
