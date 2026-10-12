import { randomUUID } from 'node:crypto'

import {
	BookingHoldSnapshotSchema,
	BookingPolicySchema,
	GoodsQuoteCommandSchema,
	IdempotencyKeySchema,
	MixedCartMergeResultSchema,
	MixedCartMergeSchema,
	MixedCartReadSchema,
	type MixedCartSelection,
	MixedCartSelectionSchema,
	MixedCartWriteResultSchema,
	MixedCartWriteSchema,
	MixedQuoteCommandSchema,
	type MixedQuoteConflict,
	MixedQuoteReadSchema,
	MixedQuoteResultSchema,
	type MixedQuoteSnapshot,
	MixedQuoteSnapshotSchema,
} from 'contracts'
import { z } from 'zod'

import { type MixedCheckoutQuote, type Prisma } from '../../generated/prisma/index.js'
import { AccessDeniedError } from './access.js'
import type { CheckoutPricing } from './checkout-pricing.js'
import type { GoodsCheckout } from './goods-checkout.js'
import { goodsAudit, GoodsCheckoutConflictError, type GoodsDependencies, goodsEmit, goodsJson } from './goods-support.js'
import { stableHash } from './idempotency.js'
import type { ServiceScheduling } from './service-scheduling.js'
type Tx = Prisma.TransactionClient
const empty = (): MixedCartSelection => ({ goodsGroups: [], bookings: [] })
const conflict = (
	kind: MixedQuoteConflict['kind'],
	referenceId: string | null,
	code: MixedQuoteConflict['code'],
	message: string,
	listingId: string | null = null,
	sku: string | null = null,
): MixedQuoteConflict => ({ kind, referenceId, listingId, sku, code, message, expectedPriceCents: null, currentPriceCents: null })

/** Versioned Customer selections and advisory quotes; no reservation writer. */
export class MixedCartCheckout {
	constructor(
		private readonly deps: GoodsDependencies,
		private readonly goods: GoodsCheckout,
		private readonly scheduling: ServiceScheduling,
		private readonly pricing: CheckoutPricing,
	) {}
	private async lock(tx: Tx) {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout', 0))`
	}
	private async cart(tx: Tx, sessionId: string | undefined, verified = false) {
		const context = await this.deps.derive(tx, sessionId)
		if (verified) {
			if (!(await tx.workspace.findFirst({ where: { id: context.workspaceId, kind: 'real' } })))
				throw new AccessDeniedError('Unified checkout requires a real Customer workspace.')
			const user = await tx.user.findUniqueOrThrow({ where: { id: context.actor.userId } })
			if (user.adultVerificationState !== 'verified' || !user.verifiedAt)
				throw new AccessDeniedError('Verified adult Customer identity is required for checkout quotes.')
		}
		const cart = await tx.mixedCart.findUnique({
			where: { workspaceId_customerId: { workspaceId: context.workspaceId, customerId: context.actor.userId } },
		})
		const read = MixedCartReadSchema.parse({ cartId: cart?.id ?? null, version: cart?.version ?? 0, selection: cart ? cart.selection : empty() })
		return { context, cart, read }
	}
	private version(actual: number, expected: number) {
		if (actual !== expected) throw new GoodsCheckoutConflictError('Cart changed. Reload it before continuing.')
	}
	readCart(sessionId: string | undefined) {
		return this.deps.db.$transaction(async (tx) => (await this.cart(tx, sessionId)).read)
	}
	async writeCart(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const command = MixedCartWriteSchema.parse(input)
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const { context, cart, read } = await this.cart(tx, sessionId)
				const result = await this.deps.replay(tx, context, key, 'PUT /v1/customer/cart', command, async () => {
					this.version(read.version, command.expectedVersion)
					const saved = cart
						? await tx.mixedCart.update({ where: { id: cart.id }, data: { selection: goodsJson(command.selection), version: { increment: 1 } } })
						: await tx.mixedCart.create({
								data: { workspaceId: context.workspaceId, customerId: context.actor.userId, selection: goodsJson(command.selection) },
							})
					await goodsAudit(tx, context.workspaceId, context.actor.userId, 'mixed-cart.updated', { cartId: saved.id, version: saved.version })
					await goodsEmit(tx, () => this.deps.now(), context.workspaceId, 'MixedCartUpdated', saved.id, saved.version, key, { cartId: saved.id })
					return MixedCartWriteResultSchema.parse({ cartId: saved.id, version: saved.version, selection: saved.selection, replayed: false })
				})
				return MixedCartWriteResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30_000 },
		)
	}
	private async lockVendors(tx: Tx, selection: MixedCartSelection) {
		const listingIds = selection.bookings.map((b) => b.selection.listingId)
		const listings = await tx.listing.findMany({ where: { id: { in: listingIds } }, select: { vendorId: true } })
		const vendorIds = [...new Set([...selection.goodsGroups.map((g) => g.vendorId), ...listings.map((l) => l.vendorId)])]
		const vendors = await tx.vendor.findMany({ where: { id: { in: vendorIds } }, select: { workspaceId: true } })
		for (const workspaceId of [...new Set(vendors.map((v) => v.workspaceId))].sort()) await this.deps.lockWorkspace(tx, workspaceId)
	}
	async mergePreview(sessionId: string | undefined, input: unknown) {
		const command = MixedCartMergeSchema.parse(input)
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const { read, context } = await this.cart(tx, sessionId)
				this.version(read.version, command.expectedVersion)
				const proposed = structuredClone(read.selection)
				const conflicts: MixedQuoteConflict[] = []
				const matches: z.infer<typeof MixedCartMergeResultSchema>['matches'] = []
				for (const incoming of command.incoming.goodsGroups) {
					const group = proposed.goodsGroups.find((g) => g.vendorId === incoming.vendorId)
					if (!group) {
						proposed.goodsGroups.push(incoming)
						continue
					}
					if (group.locationId !== incoming.locationId || stableHash(group.fulfillment) !== stableHash(incoming.fulfillment)) {
						conflicts.push(
							conflict('goods', group.vendorId, 'selection_conflict', 'Choose one Location and fulfillment selection for this Vendor.'),
						)
						continue
					}
					for (const line of incoming.lines) {
						const current = group.lines.find((l) => l.listingId === line.listingId && (l.sku ?? null) === (line.sku ?? null))
						if (!current) {
							group.lines.push(line)
							continue
						}
						if (current.expectedUnitPriceCents !== line.expectedUnitPriceCents) {
							conflicts.push(
								conflict(
									'goods',
									group.vendorId,
									'selection_conflict',
									'Review different saved prices for this Product.',
									line.listingId,
									line.sku ?? null,
								),
							)
							continue
						}
						const quantity = current.quantity + line.quantity
						matches.push({
							kind: 'goods',
							referenceId: group.vendorId,
							listingId: line.listingId,
							sku: line.sku ?? null,
							previousQuantity: current.quantity,
							incomingQuantity: line.quantity,
							proposedQuantity: quantity,
						})
						current.quantity = quantity
					}
				}
				for (const incoming of command.incoming.bookings) {
					const current = proposed.bookings.find((b) => b.intentId === incoming.intentId)
					if (!current) {
						proposed.bookings.push(incoming)
						continue
					}
					if (stableHash(current) !== stableHash(incoming))
						conflicts.push(
							conflict(
								'booking',
								incoming.intentId,
								'selection_conflict',
								'Resolve different selections for this appointment intent.',
								incoming.selection.listingId,
							),
						)
					else
						matches.push({
							kind: 'booking',
							referenceId: incoming.intentId,
							listingId: incoming.selection.listingId,
							sku: null,
							previousQuantity: 1,
							incomingQuantity: 1,
							proposedQuantity: 1,
						})
				}
				if (command.incoming.promotions) {
					if (proposed.promotions && stableHash(proposed.promotions) !== stableHash(command.incoming.promotions))
						conflicts.push(conflict('cart', null, 'selection_conflict', 'Resolve different promotion selections.'))
					else proposed.promotions = command.incoming.promotions
				}
				if (!MixedCartSelectionSchema.safeParse(proposed).success)
					conflicts.push(conflict('cart', null, 'limit_exceeded', 'Use at most five appointments and ten Vendor groups; review combined quantities.'))
				const selections = conflicts.length ? [read.selection, command.incoming] : [proposed]
				// Lock the union in sorted order before evaluating either side of a conflicted merge.
				const union = {
					goodsGroups: [...read.selection.goodsGroups, ...command.incoming.goodsGroups],
					bookings: [...read.selection.bookings, ...command.incoming.bookings],
				}
				await this.lockVendors(tx, union)
				const now = this.deps.now()
				const reviews = []
				for (const selection of selections) reviews.push(await this.evaluate(tx, selection, now, context.actor.userId))
				return MixedCartMergeResultSchema.parse({
					cart: read,
					incoming: command.incoming,
					proposed: conflicts.length ? null : proposed,
					matches,
					conflicts,
					reviews,
					persisted: false,
				})
			},
			{ timeout: 30_000 },
		)
	}
	/** Caller locks the participating Vendor workspaces. Does not expire or reserve resources. */
	async evaluate(tx: Tx, selection: MixedCartSelection, now: Date, customerId: string): Promise<MixedQuoteSnapshot> {
		const goods: MixedQuoteSnapshot['goods'] = []
		const bookings: MixedQuoteSnapshot['bookings'] = []
		const conflicts: MixedQuoteConflict[] = []
		let total = 0n
		const candidates: { intentId: string; staffIds: string[]; start: number; end: number }[] = []
		for (const group of selection.goodsGroups) {
			try {
				const command = GoodsQuoteCommandSchema.parse({
					groups: [{ ...group, lines: group.lines.map(({ listingId, sku, quantity }) => ({ listingId, sku, quantity })) }],
				})
				const snapshot = await this.goods.buildSnapshot(tx, command, now)
				goods.push({ componentId: randomUUID(), group: snapshot.groups[0] })
				total += BigInt(snapshot.totalCents)
				for (const [index, line] of snapshot.groups[0].lines.entries())
					if (line.unitPriceCents !== group.lines[index].expectedUnitPriceCents) {
						conflicts.push({
							...conflict('goods', group.vendorId, 'price_changed', 'Product price changed. Review the current price.', line.listingId, line.sku),
							expectedPriceCents: group.lines[index].expectedUnitPriceCents,
							currentPriceCents: line.unitPriceCents,
						})
					}
			} catch (error) {
				if (!(error instanceof AccessDeniedError || error instanceof GoodsCheckoutConflictError)) throw error
				conflicts.push(conflict('goods', group.vendorId, 'unavailable', 'Selected goods or fulfillment are unavailable. Review this Vendor group.'))
			}
		}
		for (const intent of selection.bookings) {
			const command = intent.selection
			try {
				const start = new Date(command.start).toISOString()
				const evaluated = await this.scheduling.evaluate(
					tx,
					command.listingId,
					{
						optionId: command.optionId,
						addonIds: command.addonIds,
						mode: command.mode,
						locationId: command.locationId,
						staffId: command.staffId,
						from: start,
						to: new Date(new Date(start).getTime() + 60_000).toISOString(),
					},
					now,
					start,
				)
				const terms = evaluated.result
				const end = new Date(new Date(start).getTime() + terms.durationMinutes * 60_000).toISOString()
				const snapshot = BookingHoldSnapshotSchema.parse({
					listingId: command.listingId,
					vendorId: evaluated.listing.vendorId,
					serviceTitle: evaluated.listing.title,
					optionId: command.optionId,
					optionLabel: evaluated.option.label,
					addons: evaluated.addons,
					mode: command.mode,
					locationId: command.locationId,
					locationLabel: evaluated.location?.label ?? null,
					locationCity: evaluated.location?.city ?? null,
					selectedStaffId: command.staffId,
					timezone: terms.timezone,
					start,
					end,
					currency: 'ETB',
					priceCents: terms.priceCents,
					durationMinutes: terms.durationMinutes,
					bufferBeforeMinutes: terms.bufferBeforeMinutes,
					bufferAfterMinutes: terms.bufferAfterMinutes,
					configurationVersion: terms.configurationVersion,
					rulesVersion: terms.rulesVersion,
				})
				const flexible = evaluated.listing.bookingPolicy === 'flexible'
				const policy = BookingPolicySchema.parse({
					template: evaluated.listing.bookingPolicy,
					version: 1,
					fullRefundHours: flexible ? 24 : 48,
					partialRefundHours: flexible ? 2 : 12,
					amendmentLimit: flexible ? 2 : 1,
					contestHours: 48,
				})
				bookings.push({ componentId: intent.intentId, quantity: 1, snapshot, policy })
				total += BigInt(terms.priceCents)
				if (terms.priceCents !== intent.expectedPriceCents)
					conflicts.push({
						...conflict('booking', intent.intentId, 'price_changed', 'Appointment price changed. Review the current price.', command.listingId),
						expectedPriceCents: intent.expectedPriceCents,
						currentPriceCents: terms.priceCents,
					})
				if (terms.configurationVersion !== command.expectedConfigurationVersion || terms.rulesVersion !== command.expectedRulesVersion)
					conflicts.push(
						conflict('booking', intent.intentId, 'terms_changed', 'Appointment terms changed. Refresh the selection.', command.listingId),
					)
				if (!evaluated.availableStaffIds.length)
					conflicts.push(
						conflict(
							'booking',
							intent.intentId,
							'unavailable',
							'Selected appointment time is unavailable. Choose another time.',
							command.listingId,
						),
					)
				candidates.push({
					intentId: intent.intentId,
					staffIds: evaluated.availableStaffIds,
					start: new Date(start).getTime() - terms.bufferBeforeMinutes * 60_000,
					end: new Date(end).getTime() + terms.bufferAfterMinutes * 60_000,
				})
			} catch (error) {
				if (!(error instanceof AccessDeniedError)) throw error
				conflicts.push(
					conflict('booking', intent.intentId, 'unavailable', 'Selected Service, Option, mode, Location or Staff is unavailable.', command.listingId),
				)
			}
		}
		if (candidates.length && candidates.every((c) => c.staffIds.length) && !this.feasible(candidates))
			for (const candidate of this.competing(candidates))
				conflicts.push(
					conflict('booking', candidate.intentId, 'capacity_conflict', 'Appointment selections compete for the same Staff time. Change a selection.'),
				)
		if (total > 2_147_483_647n) conflicts.push(conflict('cart', null, 'limit_exceeded', 'Combined quote exceeds the supported amount.'))
		const incomplete = conflicts.some((c) => c.code === 'unavailable' || c.code === 'limit_exceeded')
		const snapshot = MixedQuoteSnapshotSchema.parse({
			evaluatedAt: now.toISOString(),
			goods,
			bookings,
			total: incomplete ? null : { minorUnits: Number(total), currency: 'ETB' },
			conflicts,
			reserved: false,
			promotion: null,
			commission: null,
		})
		return this.pricing.apply(tx, snapshot, selection.promotions, customerId, now)
	}
	private competing<T extends { staffIds: string[]; start: number; end: number }>(candidates: T[]): T[] {
		// At most five intents: find a smallest impossible subset so unrelated
		// appointments do not receive a false conflict marker.
		for (let count = 2; count <= candidates.length; count++) {
			for (let mask = 1; mask < 1 << candidates.length; mask++) {
				const subset = candidates.filter((_, index) => Boolean(mask & (1 << index)))
				if (subset.length === count && !this.feasible(subset)) return subset
			}
		}
		return candidates
	}
	private feasible(candidates: { staffIds: string[]; start: number; end: number }[]) {
		const sorted = [...candidates].sort((a, b) => a.staffIds.length - b.staffIds.length)
		const assigned: { staffId: string; start: number; end: number }[] = []
		const visit = (index: number): boolean => {
			if (index === sorted.length) return true
			const candidate = sorted[index]
			for (const staffId of candidate.staffIds) {
				if (assigned.some((a) => a.staffId === staffId && a.start < candidate.end && a.end > candidate.start)) continue
				assigned.push({ staffId, start: candidate.start, end: candidate.end })
				if (visit(index + 1)) return true
				assigned.pop()
			}
			return false
		}
		return visit(0)
	}
	async quote(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const command = MixedQuoteCommandSchema.parse(input)
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const { context, cart, read } = await this.cart(tx, sessionId, true)
				if (!cart || cart.id !== command.cartId) throw new AccessDeniedError()
				const result = await this.deps.replay(tx, context, key, 'POST /v1/customer/checkout/quotes', command, async () => {
					this.version(read.version, command.expectedVersion)
					if (!read.selection.goodsGroups.length && !read.selection.bookings.length)
						throw new GoodsCheckoutConflictError('Cart is empty. Add a Product or appointment.')
					await this.lockVendors(tx, read.selection)
					const now = this.deps.now()
					const snapshot = await this.evaluate(tx, read.selection, now, context.actor.userId)
					const quote = await tx.mixedCheckoutQuote.create({
						data: {
							cartId: cart.id,
							cartVersion: cart.version,
							workspaceId: context.workspaceId,
							customerId: context.actor.userId,
							selection: goodsJson(read.selection),
							snapshot: goodsJson(snapshot),
							createdAt: now,
							expiresAt: new Date(now.getTime() + 5 * 60_000),
						},
					})
					await goodsAudit(tx, context.workspaceId, context.actor.userId, 'mixed-checkout.quote-created', {
						quoteId: quote.id,
						cartId: cart.id,
						cartVersion: cart.version,
						conflicts: snapshot.conflicts.length,
					})
					await goodsEmit(tx, () => now, context.workspaceId, 'MixedCheckoutQuoteCreated', quote.id, 1, key, {
						quoteId: quote.id,
						cartId: cart.id,
						cartVersion: cart.version,
					})
					return MixedQuoteResultSchema.parse({ ...this.quoteView(quote, cart.version), replayed: false })
				})
				// Replay preserves identity/expiry and reports current revision/expiry state.
				const accepted = await tx.mixedCheckoutQuote.findUniqueOrThrow({ where: { id: result.outcome.quoteId } })
				return MixedQuoteResultSchema.parse({ ...this.quoteView(accepted, cart.version), replayed: result.replayed })
			},
			{ timeout: 30_000 },
		)
	}
	private quoteView(quote: MixedCheckoutQuote, currentVersion: number) {
		const snapshot = MixedQuoteSnapshotSchema.parse(quote.snapshot)
		const state =
			quote.expiresAt <= this.deps.now() ? 'expired' : currentVersion !== quote.cartVersion ? 'stale' : snapshot.conflicts.length ? 'conflicts' : 'ready'
		return MixedQuoteReadSchema.parse({
			quoteId: quote.id,
			cartId: quote.cartId,
			cartVersion: quote.cartVersion,
			state,
			expiresAt: quote.expiresAt.toISOString(),
			snapshot,
		})
	}
	async readQuote(sessionId: string | undefined, input: string) {
		const quoteId = z.string().uuid().parse(input)
		return this.deps.db.$transaction(async (tx) => {
			const { context } = await this.cart(tx, sessionId)
			const quote = await tx.mixedCheckoutQuote.findFirst({
				where: { id: quoteId, workspaceId: context.workspaceId, customerId: context.actor.userId },
				include: { cart: true },
			})
			if (!quote) throw new AccessDeniedError()
			return this.quoteView(quote, quote.cart.version)
		})
	}
}
