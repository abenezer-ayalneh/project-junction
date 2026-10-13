import { randomUUID } from 'node:crypto'

import { EconomicAllocationSchema, type LedgerCommand } from 'contracts'

import { type Prisma } from '../../generated/prisma/index.js'
import { goodsAudit, GoodsCheckoutConflictError, type GoodsDependencies, goodsEmit } from './goods-support.js'
import { ImmutableLedger } from './ledger.js'
import { LocalMixedPaymentAdapter } from './local-mixed-payment.js'
import { type FundingVector, originalFunding, proportionFunding } from './mixed-funding.js'
type Tx = Prisma.TransactionClient
export class MixedComponentRefunds {
	private readonly ledger = new ImmutableLedger()
	constructor(
		private readonly deps: GoodsDependencies,
		private readonly adapter: LocalMixedPaymentAdapter,
	) {}
	async goodsValue(tx: Tx, lineId: string, offset: number, quantity: number) {
		const row = await tx.mixedCommerceAllocation.findUnique({ where: { goodsOrderLineId: lineId } })
		if (!row) return null
		const vector = originalFunding(EconomicAllocationSchema.parse(row.snapshot), offset, quantity)
		return { allocationId: row.id, offset, quantity, numerator: 1, denominator: 1, ...vector }
	}
	async deliveryValue(tx: Tx, orderId: string) {
		const line = await tx.goodsOrderLine.findFirst({ where: { orderId }, include: { mixedFunding: true } })
		if (!line?.mixedFunding) return null
		const row = await tx.mixedCommerceAllocation.findUnique({
			where: { purchaseId_key: { purchaseId: line.mixedFunding.purchaseId, key: `delivery:${line.mixedFunding.componentId}` } },
		})
		if (!row) return null
		return { allocationId: row.id, offset: 0, quantity: 1, numerator: 1, denominator: 1, ...(row.snapshot as unknown as FundingVector) }
	}
	async bookingValue(tx: Tx, bookingId: string, numerator: number, denominator: number) {
		const row = await tx.mixedCommerceAllocation.findUnique({ where: { bookingId } })
		if (!row) return null
		const original = originalFunding(EconomicAllocationSchema.parse(row.snapshot), 0, 1)
		return { allocationId: row.id, offset: 0, quantity: 1, numerator, denominator, ...proportionFunding(original, numerator, denominator) }
	}
	async amend(tx: Tx, bookingId: string, sourceId: string, delta: number, oldGross: number) {
		const a = await tx.mixedCommerceAllocation.findUnique({ where: { bookingId }, include: { purchase: true } })
		if (!a) return false
		if (delta > 0) {
			const snapshot = a.purchase.snapshot as unknown as { commission: { rates: { affectedVendorId: string; basisPoints: number }[] } }
			const rate = snapshot.commission.rates.find((r) => r.affectedVendorId === a.vendorId)
			if (!rate) throw new GoodsCheckoutConflictError('Original commission rate missing.')
			const commission = Number((BigInt(delta) * BigInt(rate.basisPoints) + 5000n) / 10000n),
				id = randomUUID()
			const postings: import('contracts').LedgerCommand['postings'] = [
				{ account: 'processor_clearing', vendorId: null, locationId: null, componentId: a.id, money: { currency: 'ETB', minorUnits: delta } },
			]
			if (commission)
				postings.push({
					account: 'platform_commission',
					vendorId: null,
					locationId: null,
					componentId: a.id,
					money: { currency: 'ETB', minorUnits: -commission },
				})
			if (delta - commission)
				postings.push({
					account: 'vendor_payable',
					vendorId: a.vendorId,
					locationId: a.locationId,
					componentId: a.id,
					money: { currency: 'ETB', minorUnits: -(delta - commission) },
				})
			const ledger = await this.ledger.post(tx, {
				workspaceId: a.vendorWorkspaceId,
				sourceId: id,
				economicEventId: `mixed-additional-capture:${id}`,
				reason: 'Controlled independent Booking amendment at original commission rate; no new promotion.',
				postings,
			})
			await tx.mixedAdditionalCapture.create({
				data: {
					id,
					allocationId: a.id,
					sourceId,
					sourceKind: 'booking_amendment',
					providerReference: (await tx.bookingAmendment.findUniqueOrThrow({ where: { id: sourceId } })).paymentReference!,
					customerMinorUnits: delta,
					commissionMinorUnits: commission,
					vendorMinorUnits: delta - commission,
					ledgerId: ledger.transaction.id,
					createdAt: this.deps.now(),
				},
			})
		}
		if (delta < 0) {
			const values = (await this.remainingBookingValues(tx, bookingId, -delta, oldGross))!
			const amount = values.reduce((sum, v) => sum + v.customer, 0)
			const refund = await tx.bookingRefund.create({
				data: { mixedPaymentId: a.purchase.paymentId, semanticKey: `amendment:${sourceId}`, amountCents: amount, createdAt: this.deps.now() },
			})
			for (const value of values) await this.stage(tx, value, { bookingRefundId: refund.id })
		}
		return true
	}
	async remainingBookingValues(tx: Tx, bookingId: string, numerator: number, denominator: number) {
		const a = await tx.mixedCommerceAllocation.findUnique({ where: { bookingId }, include: { additionalCaptures: true, refunds: true } })
		if (!a) return null
		const result = []
		const base = originalFunding(EconomicAllocationSchema.parse(a.snapshot), 0, 1)
		for (const source of [
			{ id: null, vector: base },
			...a.additionalCaptures.map((c) => ({
				id: c.id,
				vector: { customer: c.customerMinorUnits, subsidy: 0, commission: c.commissionMinorUnits, vendor: c.vendorMinorUnits },
			})),
		]) {
			const prior = a.refunds.filter((f) => f.additionalCaptureId === source.id)
			const remaining = {
				customer: source.vector.customer - prior.reduce((s, f) => s + f.customerMinorUnits, 0),
				subsidy: source.vector.subsidy - prior.reduce((s, f) => s + f.subsidyMinorUnits, 0),
				commission: source.vector.commission - prior.reduce((s, f) => s + f.commissionMinorUnits, 0),
				vendor: source.vector.vendor - prior.reduce((s, f) => s + f.vendorMinorUnits, 0),
			}
			const vector = proportionFunding(remaining, numerator, denominator)
			result.push({ allocationId: a.id, additionalCaptureId: source.id, offset: 0, quantity: 1, numerator, denominator, ...vector })
		}
		return result
	}
	async stage(
		tx: Tx,
		value: {
			allocationId: string
			additionalCaptureId?: string | null
			quantity: number
			offset: number
			numerator: number
			denominator: number
		} & FundingVector,
		operation: { goodsRefundId?: string; bookingRefundId?: string },
	) {
		return tx.mixedRefundFunding.create({
			data: {
				allocationId: value.allocationId,
				additionalCaptureId: value.additionalCaptureId ?? null,
				...operation,
				quantity: value.quantity,
				offset: value.offset,
				numerator: value.numerator,
				denominator: value.denominator,
				customerMinorUnits: value.customer,
				subsidyMinorUnits: value.subsidy,
				commissionMinorUnits: value.commission,
				vendorMinorUnits: value.vendor,
				createdAt: this.deps.now(),
			},
		})
	}
	private async post(tx: Tx, id: string, kind: 'goods' | 'booking') {
		const funding = await tx.mixedRefundFunding.findMany({
			where: kind === 'goods' ? { goodsRefundId: id } : { bookingRefundId: id },
			include: { allocation: true },
		})
		for (const f of funding) {
			if (f.ledgerId || !f.providerReference) continue
			const a = f.allocation,
				postings: LedgerCommand['postings'] = []
			const add = (account: 'processor_clearing' | 'platform_promotion_expense' | 'platform_commission' | 'vendor_payable', amount: number) => {
				if (amount)
					postings.push({
						account,
						vendorId: account === 'vendor_payable' ? a.vendorId : null,
						locationId: account === 'vendor_payable' ? a.locationId : null,
						componentId: a.id,
						money: { currency: 'ETB', minorUnits: amount },
					})
			}
			add('processor_clearing', -f.customerMinorUnits)
			add('platform_promotion_expense', -f.subsidyMinorUnits)
			add('platform_commission', f.commissionMinorUnits)
			add('vendor_payable', f.vendorMinorUnits)
			if (postings.length) {
				const result = await this.ledger.post(tx, {
					workspaceId: a.vendorWorkspaceId,
					sourceId: f.id,
					economicEventId: `mixed-component-refund:${f.id}`,
					reason: 'Refund original component funding without changing other components.',
					postings,
				})
				await tx.mixedRefundFunding.update({ where: { id: f.id }, data: { ledgerId: result.transaction.id } })
			}
		}
	}
	async reconcile() {
		this.adapter.assertLocal()
		const goods = await this.deps.db.goodsRefundOperation.findMany({ where: { mixedPaymentId: { not: null }, state: 'pending' }, take: 100 }),
			bookings = await this.deps.db.bookingRefund.findMany({ where: { mixedPaymentId: { not: null }, state: 'pending' }, take: 100 })
		let completed = 0
		for (const entry of [...goods.map((row) => ({ kind: 'goods' as const, row })), ...bookings.map((row) => ({ kind: 'booking' as const, row }))]) {
			const parts = await this.deps.db.mixedRefundFunding.findMany({
				where: entry.kind === 'goods' ? { goodsRefundId: entry.row.id } : { bookingRefundId: entry.row.id },
				include: { additionalCapture: true },
			})
			for (const part of parts) {
				if (part.providerReference) continue
				let reference: string
				try {
					if (part.customerMinorUnits === 0) reference = `local-mixed-zero-refund:${part.id}`
					else {
						const result = await this.adapter.refund({
							operationId: part.id,
							paymentId: part.additionalCapture?.sourceId ?? entry.row.mixedPaymentId!,
							amountMinorUnits: part.customerMinorUnits,
						})
						if (result.state !== 'completed') continue
						reference = result.reference
						if (reference !== `local-mixed-refund:${part.id}`) continue
					}
				} catch {
					continue
				}
				await this.deps.db.$transaction(
					async (tx) => {
						await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout',0))`
						const current = await tx.mixedRefundFunding.findUniqueOrThrow({ where: { id: part.id } })
						if (current.providerReference) return
						await tx.mixedRefundFunding.update({ where: { id: part.id }, data: { providerReference: reference } })
						await this.post(tx, entry.row.id, entry.kind)
					},
					{ timeout: 30000 },
				)
			}
			await this.deps.db.$transaction(
				async (tx) => {
					await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout',0))`
					const remaining = await tx.mixedRefundFunding.count({
						where: { ...(entry.kind === 'goods' ? { goodsRefundId: entry.row.id } : { bookingRefundId: entry.row.id }), providerReference: null },
					})
					if (remaining) return
					const current =
						entry.kind === 'goods'
							? await tx.goodsRefundOperation.findUniqueOrThrow({ where: { id: entry.row.id } })
							: await tx.bookingRefund.findUniqueOrThrow({ where: { id: entry.row.id } })
					if (current.state !== 'pending') return
					if (entry.kind === 'goods')
						await tx.goodsRefundOperation.update({
							where: { id: current.id },
							data: { state: 'succeeded', providerReference: `mixed-component-refund:${current.id}`, completedAt: this.deps.now() },
						})
					else
						await tx.bookingRefund.update({
							where: { id: current.id },
							data: { state: 'succeeded', reference: `mixed-component-refund:${current.id}` },
						})
					const p = await tx.mixedPaymentAttempt.findUniqueOrThrow({ where: { id: current.mixedPaymentId! } })
					await goodsAudit(tx, p.workspaceId, null, 'mixed-component.refunded', { refundId: current.id, paymentId: p.id, kind: entry.kind })
					await goodsEmit(tx, () => this.deps.now(), p.workspaceId, 'MixedComponentRefundCompleted', current.id, 1, null, {
						refundId: current.id,
						paymentId: p.id,
						kind: entry.kind,
					})
					completed++
				},
				{ timeout: 30000 },
			)
		}
		return { completed }
	}
}
