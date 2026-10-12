import {
	type AccessContext,
	IdempotencyKeySchema,
	MixedCartSelectionSchema,
	MixedCurrentHoldSchema,
	MixedHoldCommandSchema,
	MixedHoldReadSchema,
	MixedHoldReleaseResultSchema,
	MixedHoldResultSchema,
	type MixedQuoteSnapshot,
	MixedQuoteSnapshotSchema,
} from 'contracts'
import { z } from 'zod'

import { type MixedCheckoutHold, type Prisma } from '../../generated/prisma/index.js'
import { AccessDeniedError } from './access.js'
import { type BookingHolds } from './booking-holds.js'
import { type GoodsCheckout } from './goods-checkout.js'
import { goodsAudit, GoodsCheckoutConflictError, type GoodsDependencies, goodsEmit, goodsJson } from './goods-support.js'
import { stableHash } from './idempotency.js'
import { type MixedCartCheckout } from './mixed-cart.js'
import { type PromotionBudget } from './promotion-budget.js'
import { type ServiceScheduling } from './service-scheduling.js'
import { assignQualifiedStaff, type StaffAssignmentCandidate } from './staff-assignment.js'
type Tx = Prisma.TransactionClient
export class MixedCheckoutHolds {
	constructor(
		private readonly deps: GoodsDependencies,
		private readonly cart: MixedCartCheckout,
		private readonly scheduling: ServiceScheduling,
		private readonly goods: GoodsCheckout,
		private readonly bookings: BookingHolds,
		private readonly budget: PromotionBudget,
	) {}
	private async lock(tx: Tx) {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout',0))`
	}
	private async customer(tx: Tx, sessionId: string | undefined, creation = false) {
		const context = await this.deps.derive(tx, sessionId, creation ? undefined : { allowRestrictedVendor: true })
		if (creation) {
			const user = await tx.user.findUniqueOrThrow({ where: { id: context.actor.userId } })
			if (user.adultVerificationState !== 'verified' || !user.verifiedAt)
				throw new AccessDeniedError('Verified adult Customer identity is required for checkout holds.')
		}
		return context
	}
	private async vendorLocks(tx: Tx, snapshot: MixedQuoteSnapshot) {
		const ids = [...new Set([...snapshot.goods.map((g) => g.group.vendorId), ...snapshot.bookings.map((b) => b.snapshot.vendorId)])]
		const vendors = await tx.vendor.findMany({ where: { id: { in: ids } }, select: { id: true, workspaceId: true } })
		if (vendors.length !== ids.length) throw new GoodsCheckoutConflictError('A selected Vendor is unavailable.')
		for (const workspaceId of [...new Set(vendors.map((v) => v.workspaceId))].sort()) await this.deps.lockWorkspace(tx, workspaceId)
		return new Map(vendors.map((v) => [v.id, v.workspaceId]))
	}
	private view(hold: MixedCheckoutHold) {
		return MixedHoldReadSchema.parse({
			holdId: hold.id,
			quoteId: hold.quoteId,
			cartId: hold.cartId,
			state: hold.state,
			createdAt: hold.createdAt.toISOString(),
			expiresAt: hold.expiresAt.toISOString(),
			reserved: hold.state === 'holding',
			snapshot: hold.snapshot,
		})
	}
	private async facts(tx: Tx, hold: MixedCheckoutHold, actorId: string | null, key: string | null) {
		const snapshot = MixedQuoteSnapshotSchema.parse(hold.snapshot)
		const scopes = await this.vendorLocks(tx, snapshot)
		await goodsAudit(tx, hold.workspaceId, actorId, `mixed-checkout.hold-${hold.state}`, { holdId: hold.id, quoteId: hold.quoteId })
		for (const workspaceId of new Set([hold.workspaceId, ...scopes.values()]))
			await goodsEmit(
				tx,
				() => this.deps.now(),
				workspaceId,
				hold.state === 'holding' ? 'MixedCheckoutHoldCreated' : hold.state === 'released' ? 'MixedCheckoutHoldReleased' : 'MixedCheckoutHoldExpired',
				hold.id,
				hold.state === 'holding' ? 1 : 2,
				key,
				{ holdId: hold.id, quoteId: hold.quoteId, expiresAt: hold.expiresAt.toISOString() },
			)
	}
	private async terminal(tx: Tx, hold: MixedCheckoutHold, state: 'released' | 'expired', actorId: string | null, key: string | null) {
		if (hold.state !== 'holding') return hold
		await this.vendorLocks(tx, MixedQuoteSnapshotSchema.parse(hold.snapshot))
		const lines = await tx.mixedHoldStockLine.findMany({ where: { holdId: hold.id }, orderBy: { id: 'asc' } })
		for (const line of lines) {
			await tx.inventoryMovement.create({
				data: {
					mixedHoldId: hold.id,
					listingId: line.listingId,
					locationId: line.locationId,
					sku: line.sku,
					reason: 'released',
					onHandDelta: 0,
					reservedDelta: -line.quantity,
					actorKind: 'user',
					actorId: hold.customerId,
					note: 'Mixed checkout hold released.',
				},
			})
			await goodsEmit(tx, () => this.deps.now(), line.vendorWorkspaceId, 'StockMoved', line.listingId, 1, key, {
				holdId: hold.id,
				listingId: line.listingId,
				locationId: line.locationId,
				reason: 'released',
			})
		}
		await tx.staffAllocation.updateMany({ where: { mixedIntent: { holdId: hold.id }, state: 'held' }, data: { state } })
		await this.budget.complete(tx, hold.quoteId, hold.id, 'released')
		const updated = await tx.mixedCheckoutHold.update({ where: { id: hold.id }, data: { state, releasedAt: this.deps.now() } })
		await this.facts(tx, updated, actorId, key)
		return updated
	}
	/** Caller takes the shared commerce lock. Release every participant in this same transaction. */
	async expireInTransaction(tx: Tx, cartId?: string) {
		const due = await tx.mixedCheckoutHold.findMany({
			where: { state: 'holding', expiresAt: { lte: this.deps.now() }, ...(cartId ? { cartId } : {}) },
			orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
			take: 100,
		})
		for (const hold of due) await this.terminal(tx, hold, 'expired', null, null)
		return due.length
	}
	async expire() {
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				return this.expireInTransaction(tx)
			},
			{ timeout: 30000 },
		)
	}
	private async staff(tx: Tx, snapshot: MixedQuoteSnapshot, now: Date) {
		const candidates: StaffAssignmentCandidate[] = []
		for (const booking of snapshot.bookings) {
			const b = booking.snapshot
			const evaluated = await this.scheduling.evaluate(
				tx,
				b.listingId,
				{
					optionId: b.optionId,
					addonIds: b.addons.map((a) => a.id),
					mode: b.mode,
					locationId: b.locationId,
					staffId: b.selectedStaffId,
					from: b.start,
					to: new Date(new Date(b.start).getTime() + 60000).toISOString(),
				},
				now,
				b.start,
			)
			candidates.push({
				key: booking.componentId,
				staffIds: evaluated.availableStaffIds,
				start: new Date(b.start).getTime() - b.bufferBeforeMinutes * 60000,
				end: new Date(b.end).getTime() + b.bufferAfterMinutes * 60000,
			})
		}
		const assigned = assignQualifiedStaff(candidates)
		if (!assigned) throw new GoodsCheckoutConflictError('Selected appointment capacity is unavailable. Request a fresh quote.')
		return { assigned, candidates }
	}
	async create(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput),
			command = MixedHoldCommandSchema.parse(input)
		try {
			return await this.deps.db.$transaction(
				async (tx) => {
					await this.lock(tx)
					const context = await this.customer(tx, sessionId, true)
					await this.expireInTransaction(tx)
					const quote = await tx.mixedCheckoutQuote.findFirst({
						where: { id: command.quoteId, workspaceId: context.workspaceId, customerId: context.actor.userId },
						include: { cart: true },
					})
					if (!quote) throw new AccessDeniedError()
					const result = await this.deps.replay(tx, context, key, 'POST /v1/customer/checkout/holds', command, async () => {
						const now = this.deps.now(),
							snapshot = MixedQuoteSnapshotSchema.parse(quote.snapshot)
						if (
							quote.expiresAt <= now ||
							quote.cartVersion !== quote.cart.version ||
							!snapshot.promotion ||
							!snapshot.commission ||
							snapshot.conflicts.length ||
							snapshot.total === null
						)
							throw new GoodsCheckoutConflictError('Quote expired, changed or incomplete. Request a fresh quote.')
						if (await tx.mixedCheckoutHold.findFirst({ where: { OR: [{ quoteId: quote.id }, { cartId: quote.cartId, state: 'holding' }] } }))
							throw new GoodsCheckoutConflictError('This checkout already has a hold. Read or release it before starting another.')
						const vendors = await this.vendorLocks(tx, snapshot)
						await this.goods.expireDue(tx)
						await this.bookings.expireDue(tx)
						const current = await this.cart.evaluate(tx, MixedCartSelectionSchema.parse(quote.selection), now, context.actor.userId, snapshot)
						if (stableHash({ ...current, evaluatedAt: snapshot.evaluatedAt }) !== stableHash(snapshot))
							throw new GoodsCheckoutConflictError('Checkout terms or availability changed. Request a fresh quote.')
						const { assigned, candidates } = await this.staff(tx, snapshot, now)
						const hold = await tx.mixedCheckoutHold.create({
							data: {
								quoteId: quote.id,
								cartId: quote.cartId,
								workspaceId: context.workspaceId,
								customerId: context.actor.userId,
								snapshot: goodsJson(snapshot),
								createdAt: now,
								expiresAt: new Date(now.getTime() + 15 * 60000),
							},
						})
						for (const group of snapshot.goods)
							for (const line of group.group.lines) {
								await tx.mixedHoldStockLine.create({
									data: {
										holdId: hold.id,
										componentId: group.componentId,
										vendorId: group.group.vendorId,
										vendorWorkspaceId: vendors.get(group.group.vendorId) ?? '',
										listingId: line.listingId,
										locationId: group.group.locationId,
										sku: line.sku,
										quantity: line.quantity,
									},
								})
								await tx.inventoryMovement.create({
									data: {
										mixedHoldId: hold.id,
										listingId: line.listingId,
										locationId: group.group.locationId,
										sku: line.sku,
										reason: 'held',
										onHandDelta: 0,
										reservedDelta: line.quantity,
										actorKind: 'user',
										actorId: context.actor.userId,
									},
								})
								await goodsEmit(tx, () => now, vendors.get(group.group.vendorId) ?? '', 'StockMoved', line.listingId, 1, key, {
									holdId: hold.id,
									listingId: line.listingId,
									locationId: group.group.locationId,
									reason: 'held',
								})
							}
						for (const booking of snapshot.bookings) {
							const row = await tx.mixedHoldBookingIntent.create({
								data: {
									holdId: hold.id,
									componentId: booking.componentId,
									vendorId: booking.snapshot.vendorId,
									vendorWorkspaceId: vendors.get(booking.snapshot.vendorId) ?? '',
									listingId: booking.snapshot.listingId,
									snapshot: goodsJson(booking),
								},
							})
							const candidate = candidates.find((c) => c.key === booking.componentId)
							if (!candidate) throw new GoodsCheckoutConflictError()
							await tx.staffAllocation.create({
								data: {
									mixedIntentId: row.id,
									staffId: assigned.get(booking.componentId) ?? '',
									startAt: new Date(candidate.start),
									endAt: new Date(candidate.end),
									state: 'held',
									expiresAt: hold.expiresAt,
									createdAt: now,
								},
							})
						}
						await this.budget.reserve(tx, quote.id, hold.id, hold.expiresAt)
						await this.facts(tx, hold, context.actor.userId, key)
						return MixedHoldResultSchema.parse({ ...this.view(hold), replayed: false })
					})
					const accepted = await tx.mixedCheckoutHold.findUniqueOrThrow({ where: { id: result.outcome.holdId } })
					return MixedHoldResultSchema.parse({ ...this.view(accepted), replayed: result.replayed })
				},
				{ timeout: 30000 },
			)
		} catch (error) {
			if (error instanceof Error && error.message.includes('staff_allocations_no_overlap'))
				throw new GoodsCheckoutConflictError('Selected Staff is no longer available. Request a fresh quote.')
			throw error
		}
	}
	private async owned(tx: Tx, context: AccessContext, holdId: string) {
		const hold = await tx.mixedCheckoutHold.findFirst({ where: { id: holdId, workspaceId: context.workspaceId, customerId: context.actor.userId } })
		if (!hold) throw new AccessDeniedError()
		return hold
	}
	async current(sessionId: string | undefined) {
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.customer(tx, sessionId)
				const cart = await tx.mixedCart.findUnique({
					where: { workspaceId_customerId: { workspaceId: context.workspaceId, customerId: context.actor.userId } },
				})
				if (!cart) return MixedCurrentHoldSchema.parse({ hold: null })
				let hold = await tx.mixedCheckoutHold.findFirst({
					where: { cartId: cart.id, customerId: context.actor.userId, workspaceId: context.workspaceId, quote: { cartVersion: cart.version } },
					orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
				})
				if (hold?.state === 'holding' && hold.expiresAt <= this.deps.now()) hold = await this.terminal(tx, hold, 'expired', null, null)
				return MixedCurrentHoldSchema.parse({ hold: hold ? this.view(hold) : null })
			},
			{ timeout: 30000 },
		)
	}
	async read(sessionId: string | undefined, idInput: string) {
		const id = z.string().uuid().parse(idInput)
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.customer(tx, sessionId)
				let hold = await this.owned(tx, context, id)
				if (hold.state === 'holding' && hold.expiresAt <= this.deps.now()) hold = await this.terminal(tx, hold, 'expired', null, null)
				return this.view(hold)
			},
			{ timeout: 30000 },
		)
	}
	async release(sessionId: string | undefined, keyInput: string | undefined, idInput: string) {
		const key = IdempotencyKeySchema.parse(keyInput),
			id = z.string().uuid().parse(idInput)
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.customer(tx, sessionId),
					hold = await this.owned(tx, context, id)
				const result = await this.deps.replay(tx, context, key, 'POST /v1/customer/checkout/holds/:holdId/release', { holdId: id }, async () => {
					const state = hold.state === 'holding' ? (hold.expiresAt <= this.deps.now() ? 'expired' : 'released') : hold.state
					if (state !== 'released' && state !== 'expired') throw new GoodsCheckoutConflictError()
					await this.terminal(tx, hold, state, context.actor.userId, key)
					return MixedHoldReleaseResultSchema.parse({ holdId: id, state, replayed: false })
				})
				return MixedHoldReleaseResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30000 },
		)
	}
}
