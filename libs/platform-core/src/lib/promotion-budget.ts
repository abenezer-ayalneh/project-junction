import { MixedQuoteSnapshotSchema } from 'contracts'

import { type Prisma, type PromotionReservation } from '../../generated/prisma/index.js'
import { type CheckoutPricing } from './checkout-pricing.js'
import { goodsAudit, GoodsCheckoutConflictError, goodsEmit } from './goods-support.js'
type Tx = Prisma.TransactionClient
/** Internal lifecycle participant for C04's atomic hold coordinator. No public
 * budget-only reservation/consumption endpoint is exposed. */
export class PromotionBudget {
	constructor(
		private readonly now: () => Date,
		private readonly pricing: CheckoutPricing,
	) {}
	private async lock(tx: Tx) {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout',0))`
	}
	async reserve(tx: Tx, quoteId: string, holdRef: string, expiresAt: Date) {
		await this.lock(tx)
		const quote = await tx.mixedCheckoutQuote.findUniqueOrThrow({ where: { id: quoteId }, include: { cart: true } })
		const snapshot = MixedQuoteSnapshotSchema.parse(quote.snapshot)
		if (!snapshot.promotion || !snapshot.commission || snapshot.conflicts.length || snapshot.total === null)
			throw new GoodsCheckoutConflictError('A complete priced quote is required for a hold.')
		const promotions = [snapshot.promotion.vendorCoupon, snapshot.promotion.platformCampaign].filter((p) => p !== null)
		const existing = await tx.promotionReservation.findMany({ where: { quoteId }, orderBy: { promotionId: 'asc' } })
		if (existing.length) {
			if (
				existing.length !== promotions.length ||
				existing.some(
					(r) =>
						r.holdRef !== holdRef ||
						r.expiresAt.getTime() !== expiresAt.getTime() ||
						!promotions.some((p) => p.promotionId === r.promotionId && BigInt(p.allocated.minorUnits) === r.amountMinorUnits),
				)
			)
				throw new GoodsCheckoutConflictError('This quote already has a different promotion reservation.')
			for (const row of existing) {
				await tx.$queryRaw`SELECT id FROM promotion_definitions WHERE id=${row.promotionId}::uuid FOR UPDATE`
				if (
					row.state === 'reserved' &&
					row.expiresAt <= this.now() &&
					!(await tx.mixedCheckoutHold.findFirst({ where: { id: row.holdRef, state: 'holding' } }))
				)
					await this.terminal(tx, row, 'released', this.now())
			}
			return { reservations: await tx.promotionReservation.findMany({ where: { quoteId }, orderBy: { promotionId: 'asc' } }), replayed: true }
		}
		const now = this.now()
		if (quote.expiresAt <= now || quote.cart.version !== quote.cartVersion || expiresAt <= now || expiresAt.getTime() > now.getTime() + 15 * 60000)
			throw new GoodsCheckoutConflictError('Quote or hold deadline is unavailable.')
		const reservations = []
		// Sorted locks protect campaign projection and coupon usage controls together.
		for (const applied of [...promotions].sort((a, b) => (a.promotionId < b.promotionId ? -1 : 1))) {
			await tx.$queryRaw`SELECT id FROM promotion_definitions WHERE id=${applied.promotionId}::uuid FOR UPDATE`
			const definition = await tx.promotionDefinition.findUniqueOrThrow({ where: { id: applied.promotionId } })
			await this.expirePromotion(tx, definition.id, now)
			if (!(await this.pricing.eligibleDefinition(tx, definition, now, quote.customerId)))
				throw new GoodsCheckoutConflictError('Promotion eligibility or usage changed. Request a fresh quote.')
			if (definition.kind === 'platform_campaign' && BigInt(applied.allocated.minorUnits) > (await this.pricing.availableBudget(tx, definition.id, now)))
				throw new GoodsCheckoutConflictError('Campaign budget is unavailable. Request a fresh quote.')
			const row = await tx.promotionReservation.create({
				data: {
					promotionId: definition.id,
					quoteId,
					holdRef,
					workspaceId: quote.workspaceId,
					customerId: quote.customerId,
					amountMinorUnits: BigInt(applied.allocated.minorUnits),
					createdAt: now,
					expiresAt,
				},
			})
			if (definition.kind === 'platform_campaign')
				await tx.campaignBudgetMovement.create({
					data: {
						promotionId: definition.id,
						reservationId: row.id,
						kind: 'reserved',
						reservedDelta: row.amountMinorUnits,
						consumedDelta: 0n,
						createdAt: now,
					},
				})
			await this.fact(tx, row, 'reserved', now)
			reservations.push(row)
		}
		return { reservations, replayed: false }
	}
	private async fact(tx: Tx, row: PromotionReservation, state: 'reserved' | 'released' | 'consumed', now: Date) {
		await goodsAudit(tx, row.workspaceId, null, `checkout.promotion-${state}`, {
			reservationId: row.id,
			quoteId: row.quoteId,
			holdRef: row.holdRef,
			promotionId: row.promotionId,
		})
		await goodsEmit(
			tx,
			() => now,
			row.workspaceId,
			state === 'reserved' ? 'PromotionBudgetReserved' : state === 'released' ? 'PromotionBudgetReleased' : 'PromotionBudgetConsumed',
			row.id,
			state === 'reserved' ? 1 : 2,
			null,
			{ reservationId: row.id, holdRef: row.holdRef, promotionId: row.promotionId },
		)
	}
	private async terminal(tx: Tx, row: PromotionReservation, state: 'released' | 'consumed', now: Date) {
		if (row.state === state) return row
		if (row.state !== 'reserved') throw new GoodsCheckoutConflictError('Promotion reservation is already terminal.')
		if (state === 'consumed' && row.expiresAt <= now) throw new GoodsCheckoutConflictError('Promotion reservation expired.')
		const promotion = await tx.promotionDefinition.findUniqueOrThrow({ where: { id: row.promotionId } })
		const updated = await tx.promotionReservation.update({ where: { id: row.id }, data: { state, completedAt: now } })
		if (promotion.kind === 'platform_campaign')
			await tx.campaignBudgetMovement.create({
				data: {
					promotionId: row.promotionId,
					reservationId: row.id,
					kind: state,
					reservedDelta: -row.amountMinorUnits,
					consumedDelta: state === 'consumed' ? row.amountMinorUnits : 0n,
					createdAt: now,
				},
			})
		await this.fact(tx, updated, state, now)
		return updated
	}
	async complete(tx: Tx, quoteId: string, holdRef: string, state: 'released' | 'consumed', eligibleAt?: Date) {
		await this.lock(tx)
		const rows = await tx.promotionReservation.findMany({ where: { quoteId }, orderBy: { promotionId: 'asc' } })
		if (rows.some((r) => r.holdRef !== holdRef)) throw new GoodsCheckoutConflictError('Promotion reservations belong to a different hold.')
		const result = []
		for (const row of rows) {
			await tx.$queryRaw`SELECT id FROM promotion_definitions WHERE id=${row.promotionId}::uuid FOR UPDATE`
			result.push(await this.terminal(tx, row, state, eligibleAt ?? this.now()))
		}
		return result
	}
	private async expirePromotion(tx: Tx, promotionId: string, now: Date) {
		const due = await tx.promotionReservation.findMany({ where: { promotionId, state: 'reserved', expiresAt: { lte: now } }, orderBy: { id: 'asc' } })
		for (const row of due)
			if (!(await tx.mixedCheckoutHold.findFirst({ where: { id: row.holdRef, state: 'holding' } }))) await this.terminal(tx, row, 'released', now)
	}
	async expire(tx: Tx) {
		await this.lock(tx)
		const now = this.now(),
			due = await tx.promotionReservation.findMany({
				where: { state: 'reserved', expiresAt: { lte: now } },
				select: { promotionId: true },
				distinct: ['promotionId'],
			})
		for (const id of due.map((r) => r.promotionId).sort()) {
			await tx.$queryRaw`SELECT id FROM promotion_definitions WHERE id=${id}::uuid FOR UPDATE`
			await this.expirePromotion(tx, id, now)
		}
	}
}
