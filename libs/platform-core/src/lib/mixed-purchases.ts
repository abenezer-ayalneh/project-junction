import { randomUUID } from 'node:crypto'

import {
	BookingSnapshotSchema,
	type EconomicAllocation,
	GoodsQuoteSnapshotSchema,
	IdempotencyKeySchema,
	type LedgerCommand,
	MixedInvoiceCommandSchema,
	MixedInvoiceResultSchema,
	MixedPurchaseReadSchema,
	MixedQuoteSnapshotSchema,
} from 'contracts'
import { z } from 'zod'

import { type MixedPaymentAttempt, type Prisma } from '../../generated/prisma/index.js'
import { AccessDeniedError, assertRequiredMfa, assertScope } from './access.js'
import { goodsAudit, GoodsCheckoutConflictError, type GoodsDependencies, goodsEmit, goodsJson } from './goods-support.js'
import { ImmutableLedger } from './ledger.js'
import { type FundingVector, originalFunding } from './mixed-funding.js'
import { type PromotionBudget } from './promotion-budget.js'
type Tx = Prisma.TransactionClient
export class MixedPurchases {
	private readonly ledger = new ImmutableLedger()
	constructor(
		private readonly deps: GoodsDependencies,
		private readonly budget: PromotionBudget,
	) {}
	private async post(
		tx: Tx,
		workspaceId: string,
		sourceId: string,
		event: string,
		vector: FundingVector,
		vendorId: string | null,
		locationId: string | null,
		reverse = false,
	) {
		const sign = reverse ? -1 : 1,
			postings: LedgerCommand['postings'] = []
		const add = (account: LedgerCommand['postings'][number]['account'], amount: number) => {
			if (amount)
				postings.push({
					account,
					vendorId: account === 'vendor_payable' ? vendorId : null,
					locationId: account === 'vendor_payable' ? locationId : null,
					componentId: sourceId,
					money: { currency: 'ETB', minorUnits: sign * amount },
				})
		}
		add('processor_clearing', vector.customer)
		add('platform_promotion_expense', vector.subsidy)
		add('platform_commission', -vector.commission)
		add('vendor_payable', -vector.vendor)
		if (!postings.length) return null
		return (
			await this.ledger.post(tx, {
				workspaceId,
				sourceId,
				economicEventId: event,
				reason: reverse ? 'Original mixed component refund funding.' : 'Original mixed component sale funding.',
				postings,
			})
		).transaction.id
	}
	/** Called only with verified capture/no-charge authority inside the commerce transaction. */
	async commit(tx: Tx, payment: MixedPaymentAttempt) {
		const existing = await tx.mixedPurchase.findUnique({ where: { paymentId: payment.id } })
		if (existing) return existing
		const hold = await tx.mixedCheckoutHold.findUniqueOrThrow({
			where: { id: payment.holdId },
			include: { stockLines: true, bookingIntents: { include: { allocation: true } } },
		})
		if (hold.state !== 'holding' || !['succeeded', 'no_payment_required'].includes(payment.state))
			throw new GoodsCheckoutConflictError('Payment is not eligible for Purchase commitment.')
		const paidAt = payment.capturedAt ?? payment.createdAt
		if (paidAt >= hold.expiresAt) throw new GoodsCheckoutConflictError('Payment arrived after the hold deadline.')
		const snapshot = MixedQuoteSnapshotSchema.parse(hold.snapshot)
		if (!snapshot.promotion || !snapshot.commission || !snapshot.total || BigInt(snapshot.total.minorUnits) !== payment.amountMinorUnits)
			throw new GoodsCheckoutConflictError('Incomplete original funding.')
		const user = await tx.user.findUniqueOrThrow({ where: { id: hold.customerId } })
		const listingIds = [
			...new Set([...snapshot.goods.flatMap((g) => g.group.lines.map((l) => l.listingId)), ...snapshot.bookings.map((b) => b.snapshot.listingId)]),
		]
		if (
			user.adultVerificationState !== 'verified' ||
			!user.verifiedAt ||
			(await tx.listing.count({
				where: {
					id: { in: listingIds },
					state: 'published',
					vendor: { applicationState: 'approved', publishedAt: { not: null }, workspace: { kind: 'real' } },
				},
			})) !== listingIds.length
		)
			return null
		const purchase = await tx.mixedPurchase.create({
			data: {
				paymentId: payment.id,
				holdId: hold.id,
				workspaceId: hold.workspaceId,
				customerId: hold.customerId,
				snapshot: goodsJson(snapshot),
				paidAt,
				createdAt: this.deps.now(),
			},
		})
		if (payment.amountMinorUnits > 0n)
			await this.ledger.post(tx, {
				workspaceId: hold.workspaceId,
				sourceId: purchase.id,
				economicEventId: `mixed-purchase:${purchase.id}`,
				reason: 'Allocate captured Customer liability to component seller books.',
				postings: [
					{
						account: 'customer_refund_liability',
						vendorId: null,
						locationId: null,
						componentId: null,
						money: { currency: 'ETB', minorUnits: Number(payment.amountMinorUnits) },
					},
					{
						account: 'processor_clearing',
						vendorId: null,
						locationId: null,
						componentId: null,
						money: { currency: 'ETB', minorUnits: -Number(payment.amountMinorUnits) },
					},
				],
			})
		if (snapshot.goods.length) {
			// Goods-only records are scope/fulfillment projections of the same Purchase.
			// They create neither another provider attempt nor another reservation.
			const goodsSnapshot = GoodsQuoteSnapshotSchema.parse({
				groups: snapshot.goods.map((g) => g.group),
				totalCents: snapshot.goods.reduce(
					(sum, g) => sum + g.group.lines.reduce((total, line) => total + line.subtotalCents, 0) + g.group.deliveryFeeCents,
					0,
				),
				currency: 'ETB',
			})
			const quote = await tx.goodsQuote.create({
				data: {
					workspaceId: hold.workspaceId,
					customerId: hold.customerId,
					snapshot: goodsJson(goodsSnapshot),
					selection: goodsJson({
						groups: snapshot.goods.map((g) => ({
							vendorId: g.group.vendorId,
							locationId: g.group.locationId,
							fulfillment: g.group.fulfillment,
							lines: g.group.lines.map((l) => ({ listingId: l.listingId, sku: l.sku, quantity: l.quantity })),
						})),
					}),
					expiresAt: new Date(hold.createdAt.getTime() + 5 * 60000),
					createdAt: hold.createdAt,
				},
			})
			const goodsHold = await tx.goodsHold.create({
				data: { quoteId: quote.id, mixedHoldId: hold.id, createdAt: hold.createdAt, expiresAt: hold.expiresAt },
			})
			const goods = await tx.goodsPurchase.create({
				data: {
					holdId: goodsHold.id,
					mixedPurchaseId: purchase.id,
					customerId: hold.customerId,
					workspaceId: hold.workspaceId,
					snapshot: goodsJson(goodsSnapshot),
					paidAt,
					createdAt: this.deps.now(),
				},
			})
			for (const g of snapshot.goods) {
				const held = hold.stockLines.filter((l) => l.componentId === g.componentId),
					workspaceId = held[0]?.vendorWorkspaceId
				if (!workspaceId) throw new GoodsCheckoutConflictError('Incomplete stock component.')
				await this.deps.lockWorkspace(tx, workspaceId)
				const order = await tx.goodsVendorOrder.create({
					data: {
						purchaseId: goods.id,
						vendorId: g.group.vendorId,
						vendorWorkspaceId: workspaceId,
						locationId: g.group.locationId,
						snapshot: goodsJson(g.group),
						createdAt: this.deps.now(),
					},
				})
				for (const line of g.group.lines) {
					const stock = held.find((l) => l.listingId === line.listingId && l.sku === line.sku)
					if (!stock) throw new GoodsCheckoutConflictError()
					const projection = await tx.goodsHoldLine.create({
						data: {
							holdId: goodsHold.id,
							mixedStockLineId: stock.id,
							vendorId: stock.vendorId,
							vendorWorkspaceId: stock.vendorWorkspaceId,
							listingId: stock.listingId,
							locationId: stock.locationId,
							sku: stock.sku,
							quantity: stock.quantity,
						},
					})
					const leaf = await tx.goodsOrderLine.create({ data: { orderId: order.id, holdLineId: projection.id, snapshot: goodsJson(line) } })
					const funding = snapshot.promotion.allocations.find(
						(a) => a.componentId === g.componentId && a.listingId === line.listingId && a.sku === line.sku,
					)
					if (!funding) throw new GoodsCheckoutConflictError('Missing original goods funding.')
					await this.allocation(tx, purchase.id, funding, workspaceId, g.group.locationId, leaf.id, null)
					await tx.inventoryMovement.create({
						data: {
							holdId: goodsHold.id,
							mixedHoldId: hold.id,
							orderLineId: leaf.id,
							listingId: stock.listingId,
							locationId: stock.locationId,
							sku: stock.sku,
							reason: 'sold',
							onHandDelta: -stock.quantity,
							reservedDelta: -stock.quantity,
							actorKind: 'user',
							actorId: hold.customerId,
						},
					})
					await goodsEmit(tx, () => this.deps.now(), workspaceId, 'StockMoved', stock.listingId, 1, null, {
						listingId: stock.listingId,
						locationId: stock.locationId,
						reason: 'sold',
						holdId: hold.id,
					})
				}
				await tx.goodsFulfillment.create({
					data: { orderId: order.id, method: g.group.fulfillment.method, snapshot: goodsJson(g.group), createdAt: this.deps.now() },
				})
				if (g.group.deliveryFeeCents > 0) {
					const fee = g.group.deliveryFeeCents
					const id = randomUUID()
					const row = await tx.mixedCommerceAllocation.create({
						data: {
							id,
							purchaseId: purchase.id,
							key: `delivery:${g.componentId}`,
							componentId: g.componentId,
							kind: 'delivery',
							vendorId: g.group.vendorId,
							vendorWorkspaceId: workspaceId,
							locationId: g.group.locationId,
							snapshot: goodsJson({ quantity: 1, customer: fee, subsidy: 0, commission: 0, vendor: fee }),
						},
					})
					await this.post(
						tx,
						workspaceId,
						row.id,
						`mixed-sale:${row.id}`,
						{ customer: fee, subsidy: 0, commission: 0, vendor: fee },
						g.group.vendorId,
						g.group.locationId,
					)
				}
				await goodsAudit(tx, workspaceId, null, 'goods.order-confirmed', { orderId: order.id, purchaseId: purchase.id })
				await goodsEmit(tx, () => this.deps.now(), workspaceId, 'GoodsVendorOrderConfirmed', order.id, 1, null, {
					orderId: order.id,
					purchaseId: purchase.id,
				})
			}
			await tx.goodsHold.update({ where: { id: goodsHold.id }, data: { state: 'committed', committedAt: this.deps.now() } })
		}
		for (const b of snapshot.bookings) {
			const intent = hold.bookingIntents.find((i) => i.componentId === b.componentId)
			if (!intent?.allocation) throw new GoodsCheckoutConflictError('Missing concrete Staff allocation.')
			await this.deps.lockWorkspace(tx, intent.vendorWorkspaceId)
			const projectedHold = await tx.bookingHold.create({
				data: {
					mixedIntentId: intent.id,
					customerId: hold.customerId,
					workspaceId: hold.workspaceId,
					vendorId: intent.vendorId,
					snapshot: goodsJson(b.snapshot),
					createdAt: hold.createdAt,
					expiresAt: hold.expiresAt,
				},
			})
			const purchased = BookingSnapshotSchema.parse({
				...b.snapshot,
				policy: b.policy,
				attendee: null,
				optionPriceCents: b.snapshot.priceCents - b.snapshot.addons.reduce((sum, a) => sum + a.priceCents, 0),
				promotion: null,
				commission: null,
			})
			const booking = await tx.booking.create({
				data: {
					holdId: projectedHold.id,
					mixedPurchaseId: purchase.id,
					allocationId: intent.allocation.id,
					snapshot: goodsJson(purchased),
					confirmedAt: paidAt,
				},
			})
			await tx.staffAllocation.update({ where: { id: intent.allocation.id }, data: { holdId: projectedHold.id, state: 'booked', expiresAt: null } })
			await tx.bookingHold.update({ where: { id: projectedHold.id }, data: { state: 'committed' } })
			const funding = snapshot.promotion.allocations.find((a) => a.componentId === b.componentId)
			if (!funding) throw new GoodsCheckoutConflictError('Missing original Booking funding.')
			await this.allocation(tx, purchase.id, funding, intent.vendorWorkspaceId, b.snapshot.locationId, null, booking.id)
			for (const workspaceId of new Set([hold.workspaceId, intent.vendorWorkspaceId])) {
				await goodsAudit(tx, workspaceId, null, 'booking.confirmed', { bookingId: booking.id, purchaseId: purchase.id })
				await goodsEmit(tx, () => this.deps.now(), workspaceId, 'BookingConfirmed', booking.id, 1, null, {
					bookingId: booking.id,
					purchaseId: purchase.id,
				})
			}
		}
		await this.budget.complete(tx, hold.quoteId, hold.id, 'consumed', paidAt)
		await tx.mixedCheckoutHold.update({ where: { id: hold.id }, data: { state: 'committed' } })
		await goodsAudit(tx, hold.workspaceId, null, 'mixed-purchase.committed', { purchaseId: purchase.id, paymentId: payment.id })
		await goodsEmit(tx, () => this.deps.now(), hold.workspaceId, 'MixedPurchaseCommitted', purchase.id, 1, null, {
			purchaseId: purchase.id,
			paymentId: payment.id,
			sandbox: true,
		})
		return purchase
	}
	private async allocation(
		tx: Tx,
		purchaseId: string,
		allocation: EconomicAllocation,
		workspaceId: string,
		locationId: string | null,
		lineId: string | null,
		bookingId: string | null,
	) {
		const row = await tx.mixedCommerceAllocation.create({
			data: {
				purchaseId,
				key: allocation.key,
				componentId: allocation.componentId,
				kind: allocation.kind,
				vendorId: allocation.vendorId,
				vendorWorkspaceId: workspaceId,
				locationId,
				goodsOrderLineId: lineId,
				bookingId,
				snapshot: goodsJson(allocation),
			},
		})
		await this.post(tx, workspaceId, row.id, `mixed-sale:${row.id}`, originalFunding(allocation, 0, allocation.quantity), allocation.vendorId, locationId)
		return row
	}
	async read(sessionId: string | undefined, idInput: string) {
		const id = z.string().uuid().parse(idInput)
		return this.deps.db.$transaction(async (tx) => {
			const context = await this.deps.derive(tx, sessionId, { allowRestrictedVendor: true })
			const p = await tx.mixedPurchase.findFirst({
				where: { id, workspaceId: context.workspaceId, customerId: context.actor.userId },
				include: {
					goods: { include: { orders: { include: { fulfillment: true, lines: { include: { mixedFunding: true, cancellationLines: true } } } } } },
					bookings: { include: { mixedFunding: true } },
					invoices: true,
					payment: true,
					allocations: { include: { additionalCaptures: true, refunds: true } },
				},
			})
			if (!p) throw new AccessDeniedError()
			return MixedPurchaseReadSchema.parse({
				purchaseId: p.id,
				paymentId: p.paymentId,
				holdId: p.holdId,
				paidAt: p.paidAt.toISOString(),
				sandbox: true,
				capturedMinorUnits:
					Number(p.payment.amountMinorUnits) + p.allocations.flatMap((a) => a.additionalCaptures).reduce((sum, c) => sum + c.customerMinorUnits, 0),
				refundedMinorUnits: p.allocations
					.flatMap((a) => a.refunds)
					.filter((f) => f.providerReference)
					.reduce((sum, f) => sum + f.customerMinorUnits, 0),
				pendingRefundMinorUnits: p.allocations
					.flatMap((a) => a.refunds)
					.filter((f) => !f.providerReference)
					.reduce((sum, f) => sum + f.customerMinorUnits, 0),
				addenda: p.allocations.flatMap((a) =>
					a.additionalCaptures.map((c) => ({
						additionId: c.id,
						componentId: a.componentId,
						kind: c.sourceKind,
						customerMinorUnits: c.customerMinorUnits,
						commissionMinorUnits: c.commissionMinorUnits,
						createdAt: c.createdAt.toISOString(),
					})),
				),
				receipt: { kind: 'non_tax_platform_receipt', taxCalculated: false, snapshot: p.snapshot },
				orders: (p.goods?.orders ?? []).map((o) => ({
					orderId: o.id,
					vendorId: o.vendorId,
					locationId: o.locationId,
					state: o.state,
					fulfillmentId: o.fulfillment?.id,
					lines: o.lines.map((l) => ({
						lineId: l.id,
						quantity: (l.snapshot as { quantity: number }).quantity,
						cancelledQuantity: l.cancellationLines.reduce((sum, c) => sum + c.quantity, 0),
						funding: l.mixedFunding?.snapshot,
					})),
				})),
				bookings: p.bookings.map((b) => ({
					bookingId: b.id,
					state: b.state,
					version: b.version,
					confirmedAt: b.confirmedAt.toISOString(),
					snapshot: b.currentSnapshot ?? b.snapshot,
					originalSnapshot: b.snapshot,
					customerAmendments: b.customerAmendments,
					funding: b.mixedFunding?.snapshot,
				})),
				invoices: p.invoices.map((i) => ({
					invoiceId: i.id,
					vendorId: i.vendorId,
					invoiceNumber: i.invoiceNumber,
					documentUrl: i.documentUrl,
					createdAt: i.createdAt.toISOString(),
				})),
			})
		})
	}
	async invoice(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput),
			id = z.string().uuid().parse(idInput),
			command = MixedInvoiceCommandSchema.parse(input)
		return this.deps.db.$transaction(async (tx) => {
			const context = await this.deps.derive(tx, sessionId, { allowRestrictedVendor: true })
			const vendorId = context.activeVendorId
			if (!vendorId || !context.memberships.some((m) => m.active && m.vendorId === vendorId && m.role === 'vendor_owner')) throw new AccessDeniedError()
			const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: vendorId } })
			assertScope(context, { workspaceId: vendor.workspaceId, vendorId })
			assertRequiredMfa(context)
			await this.deps.lockWorkspace(tx, vendor.workspaceId)
			if (!(await tx.mixedCommerceAllocation.findFirst({ where: { purchaseId: id, vendorId } }))) throw new AccessDeniedError()
			const result = await this.deps.replay(tx, context, key, 'POST /v1/vendor/purchases/:purchaseId/invoices', { purchaseId: id, command }, async () => {
				const invoice = await tx.mixedExternalInvoice.create({
					data: { purchaseId: id, vendorId, actorId: context.actor.userId, ...command, createdAt: this.deps.now() },
				})
				await goodsAudit(tx, vendor.workspaceId, context.actor.userId, 'mixed-purchase.invoice-attached', { invoiceId: invoice.id, purchaseId: id })
				return { invoiceId: invoice.id }
			})
			return MixedInvoiceResultSchema.parse({ ...result.outcome, replayed: result.replayed })
		})
	}
}
