import { randomUUID } from 'node:crypto'

import {
	type AccessContext,
	GoodsQuoteSnapshotSchema,
	GoodsReturnActionCommandSchema,
	GoodsReturnReadSchema,
	GoodsReturnResultSchema,
	GoodsReturnSubmitCommandSchema,
	IdempotencyKeySchema,
} from 'contracts'
import { z } from 'zod'

import { type Prisma } from '../../generated/prisma/index.js'
import { AccessDeniedError, assertRequiredMfa, assertScope } from './access.js'
import { GoodsCancellation } from './goods-cancellation.js'
import { goodsAudit, GoodsCheckoutConflictError, type GoodsDependencies, goodsEmit, goodsJson } from './goods-support.js'

type Transaction = Prisma.TransactionClient
const loaded = {
	orderLine: { include: { order: { include: { purchase: true } } } },
	cancellation: { include: { refund: true } },
	events: { orderBy: { version: 'asc' as const } },
}
/** Scoped return evidence and inspection; exchange always requires a fresh purchase. */
export class GoodsReturns {
	constructor(
		private readonly dependencies: GoodsDependencies,
		private readonly cancellations: GoodsCancellation,
	) {}
	private async lock(tx: Transaction) {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout',0))`
	}
	private customer(context: AccessContext, purchase: { customerId: string; workspaceId: string }) {
		if (purchase.customerId !== context.actor.userId || purchase.workspaceId !== context.workspaceId) throw new AccessDeniedError()
	}
	private owner(context: AccessContext, order: { vendorId: string; vendorWorkspaceId: string; locationId: string }) {
		if (!context.memberships.some((member) => member.active && member.vendorId === order.vendorId && member.role === 'vendor_owner'))
			throw new AccessDeniedError()
		assertScope(context, { workspaceId: order.vendorWorkspaceId, vendorId: order.vendorId, locationId: order.locationId })
		assertRequiredMfa(context)
	}
	private async view(tx: Transaction, id: string) {
		const row = await tx.goodsReturnCase.findUniqueOrThrow({ where: { id }, include: loaded })
		return GoodsReturnReadSchema.parse({
			returnId: row.id,
			orderId: row.orderLine.orderId,
			lineId: row.orderLineId,
			quantity: row.quantity,
			reason: row.reason,
			unused: row.unused,
			state: row.state === 'refund_pending' && row.cancellation?.refund.state === 'succeeded' ? 'refunded' : row.state,
			version: row.version,
			policySnapshot: row.policySnapshot,
			verifiedHandoffAt: row.verifiedHandoffAt.toISOString(),
			eligibleUntil: row.eligibleUntil.toISOString(),
			logisticsPayer: row.logisticsPayer,
			refund: row.cancellation
				? { refundId: row.cancellation.refundId, amountCents: row.cancellation.refund.amountCents, state: row.cancellation.refund.state }
				: null,
			events: row.events.map((event) => ({
				action: event.action,
				evidence: event.evidence,
				version: event.version,
				occurredAt: event.occurredAt.toISOString(),
			})),
		})
	}
	private async event(
		tx: Transaction,
		context: AccessContext,
		row: { id: string; version: number; orderLine: { order: { vendorWorkspaceId: string; purchase: { workspaceId: string } } } },
		action: string,
		evidence: unknown,
		key: string,
	) {
		const now = this.dependencies.now()
		await tx.goodsReturnEvent.create({
			data: { returnId: row.id, version: row.version, action, actorId: context.actor.userId, evidence: goodsJson(evidence), occurredAt: now },
		})
		await goodsAudit(tx, row.orderLine.order.vendorWorkspaceId, context.actor.userId, 'goods.return-' + action, { returnId: row.id })
		for (const workspaceId of new Set([row.orderLine.order.vendorWorkspaceId, row.orderLine.order.purchase.workspaceId]))
			await goodsEmit(tx, () => now, workspaceId, 'GoodsReturnRecorded', row.id, row.version, key, { returnId: row.id, action })
	}
	async submit(sessionId: string | undefined, keyInput: string | undefined, orderInput: string, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput),
			orderId = z.string().uuid().parse(orderInput),
			command = GoodsReturnSubmitCommandSchema.parse(input)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true })
				const order = await tx.goodsVendorOrder.findUnique({
					where: { id: orderId },
					include: {
						purchase: true,
						fulfillment: { include: { handoff: true, delivery: { include: { handoff: true } } } },
						lines: { include: { cancellationLines: true, returns: true } },
					},
				})
				if (!order) throw new AccessDeniedError()
				this.customer(context, order.purchase)
				const result = await this.dependencies.replay(
					tx,
					context,
					key,
					'POST /v1/customer/goods/orders/:orderId/returns',
					{ orderId, command },
					async () => {
						const handoff = order.fulfillment?.handoff ?? order.fulfillment?.delivery?.handoff
						if (!handoff) throw new GoodsCheckoutConflictError('Returns require verified goods handoff.')
						const line = order.lines.find((candidate) => candidate.id === command.lineId)
						if (!line) throw new AccessDeniedError()
						const snapshot = GoodsQuoteSnapshotSchema.shape.groups.element.shape.lines.element.parse(line.snapshot)
						if (command.reason === 'change_of_mind' && !command.unused)
							throw new GoodsCheckoutConflictError('Change-of-mind returns require unused goods.')
						const days = command.reason === 'change_of_mind' ? snapshot.policy.changeOfMindDays : snapshot.policy.faultProtectionDays
						const deadline = new Date(handoff.handedOffAt)
						deadline.setUTCDate(deadline.getUTCDate() + days)
						const now = this.dependencies.now()
						if (now < handoff.handedOffAt || now >= deadline)
							throw new GoodsCheckoutConflictError('The snapshotted return window has ended or handoff time is invalid.')
						const allocated = line.cancellationLines.reduce((sum, item) => sum + item.quantity, 0)
						const reserved = line.returns
							.filter((item) => !['declined', 'resolved_no_refund', 'refund_pending'].includes(item.state))
							.reduce((sum, item) => sum + item.quantity, 0)
						if (command.quantity > snapshot.quantity - allocated - reserved)
							throw new GoodsCheckoutConflictError('Return quantity exceeds the remaining unclaimed paid quantity.')
						const row = await tx.goodsReturnCase.create({
							data: {
								id: randomUUID(),
								orderLineId: line.id,
								customerId: context.actor.userId,
								quantity: command.quantity,
								reason: command.reason,
								unused: command.unused,
								policySnapshot: goodsJson(snapshot.policy),
								verifiedHandoffAt: handoff.handedOffAt,
								eligibleUntil: deadline,
								logisticsPayer: command.reason === 'change_of_mind' ? 'customer' : 'vendor',
								createdAt: now,
							},
							include: loaded,
						})
						await this.event(tx, context, row, 'submit', command, key)
						return this.view(tx, row.id)
					},
				)
				return GoodsReturnResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30000 },
		)
	}
	async action(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown, actor: 'customer' | 'vendor') {
		const key = IdempotencyKeySchema.parse(keyInput),
			id = z.string().uuid().parse(idInput),
			command = GoodsReturnActionCommandSchema.parse(input)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true })
				const row = await tx.goodsReturnCase.findUnique({ where: { id }, include: loaded })
				if (!row) throw new AccessDeniedError()
				if (actor === 'customer') {
					this.customer(context, row.orderLine.order.purchase)
					if (command.action !== 'ship') throw new AccessDeniedError()
				} else {
					this.owner(context, row.orderLine.order)
					if (command.action === 'ship') throw new AccessDeniedError()
				}
				await this.dependencies.lockWorkspace(tx, row.orderLine.order.vendorWorkspaceId)
				const result = await this.dependencies.replay(
					tx,
					context,
					key,
					'POST /v1/' + actor + '/goods/returns/:returnId/actions',
					{ returnId: id, command },
					async () => {
						const transitions = {
							approve: ['submitted', 'approved'],
							decline: ['submitted', 'declined'],
							ship: ['approved', 'in_transit'],
							receive: ['in_transit', 'received'],
							inspect: ['received', 'inspected'],
							refund: ['inspected', 'refund_pending'],
							no_refund: ['inspected', 'resolved_no_refund'],
						} as const
						const [from, to] = transitions[command.action]
						if (row.state !== from) throw new GoodsCheckoutConflictError('Return action is out of order. Read the current case.')
						let cancellationId: string | undefined
						if (command.action === 'refund') {
							const inspected = row.events.find((event) => event.action === 'inspect')
							if (!inspected) throw new GoodsCheckoutConflictError('Inspection evidence is required before refund.')
							const inspection = GoodsReturnActionCommandSchema.parse(inspected.evidence)
							if (inspection.action !== 'inspect') throw new GoodsCheckoutConflictError('Inspection disposition is missing.')
							const cancellation = await this.cancellations.cancelInTransaction(
								tx,
								context,
								key,
								row.orderLine.orderId,
								{
									note: command.evidence.slice(0, 500),
									lines: [{ lineId: row.orderLineId, quantity: row.quantity, stockDisposition: inspection.stockDisposition }],
								},
								'vendor',
								'return_inspection',
								row.reason !== 'change_of_mind',
							)
							cancellationId = cancellation.cancellationId
						}
						const changed = await tx.goodsReturnCase.update({
							where: { id },
							data: { state: to, version: { increment: 1 }, ...(cancellationId ? { cancellationId } : {}) },
							include: loaded,
						})
						await this.event(tx, context, changed, command.action, command, key)
						return this.view(tx, id)
					},
				)
				return GoodsReturnResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30000 },
		)
	}
	async read(sessionId: string | undefined, idInput: string, actor: 'customer' | 'vendor') {
		const id = z.string().uuid().parse(idInput)
		return this.dependencies.db.$transaction(async (tx) => {
			const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true }),
				row = await tx.goodsReturnCase.findUnique({ where: { id }, include: loaded })
			if (!row) throw new AccessDeniedError()
			if (actor === 'customer') this.customer(context, row.orderLine.order.purchase)
			else this.owner(context, row.orderLine.order)
			return this.view(tx, id)
		})
	}
}
