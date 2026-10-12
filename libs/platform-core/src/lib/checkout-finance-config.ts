import {
	type AccessContext,
	CommissionRateCommandSchema,
	CommissionRateReadSchema,
	CommissionRateResultSchema,
	CouponResolveCommandSchema,
	IdempotencyKeySchema,
	PlatformCampaignCommandSchema,
	PromotionDefinitionSchema,
	PromotionReadSchema,
	PromotionResultSchema,
	VendorCouponCommandSchema,
} from 'contracts'
import { z } from 'zod'

import { type CommissionRate, type Prisma, type PromotionDefinition } from '../../generated/prisma/index.js'
import { AccessDeniedError, assertElevatedSession, assertRequiredMfa } from './access.js'
import { type CheckoutPricing } from './checkout-pricing.js'
import { goodsAudit, GoodsCheckoutConflictError, type GoodsDependencies, goodsEmit, goodsJson } from './goods-support.js'

type Tx = Prisma.TransactionClient
export function promotionView(row: PromotionDefinition) {
	return PromotionReadSchema.parse({
		promotionId: row.id,
		version: 1,
		kind: row.kind,
		vendorId: row.vendorId,
		definition: row.definition,
		vendorIds: row.vendorIds,
		budget: row.budgetMinorUnits === null ? null : { minorUnits: Number(row.budgetMinorUnits), currency: 'ETB' },
	})
}
export function commissionRateView(row: CommissionRate) {
	return CommissionRateReadSchema.parse({
		rateId: row.id,
		version: 1,
		vendorId: row.vendorId,
		basisPoints: row.basisPoints,
		effectiveFrom: row.effectiveFrom.toISOString(),
		effectiveUntil: row.effectiveUntil?.toISOString() ?? null,
	})
}
export class CheckoutFinanceConfiguration {
	constructor(
		private readonly deps: GoodsDependencies,
		private readonly pricing: CheckoutPricing,
	) {}
	private async lock(tx: Tx) {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout',0))`
	}
	private async finance(tx: Tx, sessionId: string | undefined) {
		const context = await this.deps.derive(tx, sessionId)
		if (!context.capabilities.includes('platform:finance:configure') || context.activeVendorId) throw new AccessDeniedError()
		assertRequiredMfa(context)
		return context
	}
	private async owner(tx: Tx, sessionId: string | undefined) {
		const context = await this.deps.derive(tx, sessionId)
		assertElevatedSession(context)
		const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: context.activeVendorId ?? '' } })
		if (vendor.applicationState !== 'approved') throw new AccessDeniedError()
		return context
	}
	private async scope(tx: Tx, listingIds: string[], vendorIds: string[]) {
		const vendors = await tx.vendor.count({ where: { id: { in: vendorIds }, workspace: { kind: 'real' } } })
		if (vendors !== new Set(vendorIds).size) throw new AccessDeniedError()
		if (listingIds.length) {
			const count = await tx.listing.count({
				where: { id: { in: listingIds }, ...(vendorIds.length ? { vendorId: { in: vendorIds } } : {}), vendor: { workspace: { kind: 'real' } } },
			})
			if (count !== listingIds.length) throw new AccessDeniedError('Promotion scope must use eligible Vendor Listings.')
		}
	}
	async publishCoupon(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput),
			command = VendorCouponCommandSchema.parse(input)
		return this.deps.db.$transaction(async (tx) => {
			await this.lock(tx)
			const context = await this.owner(tx, sessionId)
			const result = await this.deps.replay(tx, context, key, 'POST /v1/vendor/coupons', command, async () => {
				await this.scope(tx, command.definition.scope.listingIds, [context.activeVendorId ?? ''])
				return this.publish(tx, context, 'vendor_coupon', context.activeVendorId, command.definition, [], null, command.reason, key)
			})
			return PromotionResultSchema.parse({ ...result.outcome, replayed: result.replayed })
		})
	}
	async publishCampaign(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput),
			command = PlatformCampaignCommandSchema.parse(input)
		return this.deps.db.$transaction(async (tx) => {
			await this.lock(tx)
			const context = await this.finance(tx, sessionId)
			const result = await this.deps.replay(tx, context, key, 'POST /v1/platform/finance/campaigns', command, async () => {
				await this.scope(tx, command.definition.scope.listingIds, command.vendorIds)
				return this.publish(
					tx,
					context,
					'platform_campaign',
					null,
					command.definition,
					command.vendorIds,
					BigInt(command.budget.minorUnits),
					command.reason,
					key,
				)
			})
			return PromotionResultSchema.parse({ ...result.outcome, replayed: result.replayed })
		})
	}
	private async publish(
		tx: Tx,
		context: AccessContext,
		kind: string,
		vendorId: string | null,
		definition: z.infer<typeof PromotionDefinitionSchema>,
		vendorIds: string[],
		budget: bigint | null,
		reason: string,
		key: string,
	) {
		const code = definition.code.toUpperCase(),
			scopeKey = vendorId ?? 'platform'
		definition = { ...definition, scope: { ...definition.scope, listingIds: definition.scope.listingIds.map((id) => id.toLowerCase()) } }
		if (await tx.promotionDefinition.findUnique({ where: { scopeKey_code: { scopeKey, code } } }))
			throw new GoodsCheckoutConflictError('This promotion code already exists. Publish a new code for changed terms.')
		const row = await tx.promotionDefinition.create({
			data: {
				workspaceId: context.workspaceId,
				actorId: context.actor.userId,
				kind,
				vendorId,
				scopeKey,
				code,
				definition: goodsJson({ ...definition, code }),
				vendorIds,
				budgetMinorUnits: budget,
				reason,
			},
		})
		await goodsAudit(tx, context.workspaceId, context.actor.userId, 'checkout.promotion-published', { promotionId: row.id, kind, reason })
		await goodsEmit(tx, () => this.deps.now(), context.workspaceId, 'PromotionDefinitionPublished', row.id, 1, key, { promotionId: row.id, kind })
		return PromotionResultSchema.parse({ ...promotionView(row), replayed: false })
	}
	async publishRate(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput),
			command = CommissionRateCommandSchema.parse(input)
		command.vendorId = command.vendorId?.toLowerCase() ?? null
		return this.deps.db.$transaction(async (tx) => {
			await this.lock(tx)
			const context = await this.finance(tx, sessionId)
			const result = await this.deps.replay(tx, context, key, 'POST /v1/platform/finance/commission-rates', command, async () => {
				if (command.vendorId) await this.scope(tx, [], [command.vendorId])
				const scopeKey = command.vendorId ?? 'global',
					effectiveFrom = new Date(command.effectiveFrom)
				if (await tx.commissionRate.findUnique({ where: { scopeKey_effectiveFrom: { scopeKey, effectiveFrom } } }))
					throw new GoodsCheckoutConflictError('A rate already exists for this scope and effective time.')
				const row = await tx.commissionRate.create({
					data: {
						workspaceId: context.workspaceId,
						actorId: context.actor.userId,
						scopeKey,
						vendorId: command.vendorId,
						basisPoints: command.basisPoints,
						effectiveFrom,
						effectiveUntil: command.effectiveUntil ? new Date(command.effectiveUntil) : null,
						reason: command.reason,
					},
				})
				await goodsAudit(tx, context.workspaceId, context.actor.userId, 'checkout.commission-published', {
					rateId: row.id,
					vendorId: row.vendorId,
					basisPoints: row.basisPoints,
					reason: command.reason,
				})
				await goodsEmit(tx, () => this.deps.now(), context.workspaceId, 'CommissionRatePublished', row.id, 1, key, {
					rateId: row.id,
					vendorId: row.vendorId,
				})
				return CommissionRateResultSchema.parse({ ...commissionRateView(row), replayed: false })
			})
			return CommissionRateResultSchema.parse({ ...result.outcome, replayed: result.replayed })
		})
	}
	async readPromotion(sessionId: string | undefined, idInput: string, kind: 'vendor_coupon' | 'platform_campaign') {
		const id = z.string().uuid().parse(idInput)
		return this.deps.db.$transaction(async (tx) => {
			const row = await tx.promotionDefinition.findUnique({ where: { id } })
			if (!row || row.kind !== kind) throw new AccessDeniedError()
			const context = row.kind === 'vendor_coupon' ? await this.owner(tx, sessionId) : await this.finance(tx, sessionId)
			if (row.workspaceId !== context.workspaceId || (row.vendorId && row.vendorId !== context.activeVendorId)) throw new AccessDeniedError()
			return promotionView(row)
		})
	}
	async readRate(sessionId: string | undefined, idInput: string) {
		const id = z.string().uuid().parse(idInput)
		return this.deps.db.$transaction(async (tx) => {
			const context = await this.finance(tx, sessionId)
			const row = await tx.commissionRate.findFirst({ where: { id, workspaceId: context.workspaceId } })
			if (!row) throw new AccessDeniedError()
			return commissionRateView(row)
		})
	}
	async resolveCoupon(sessionId: string | undefined, input: unknown) {
		const command = CouponResolveCommandSchema.parse(input)
		return this.deps.db.$transaction(async (tx) => {
			const context = await this.deps.derive(tx, sessionId)
			const row = await tx.promotionDefinition.findUnique({ where: { scopeKey_code: { scopeKey: command.vendorId, code: command.code.toUpperCase() } } })
			if (
				!row ||
				!(await tx.vendor.findFirst({
					where: { id: command.vendorId, applicationState: 'approved', publishedAt: { not: null }, workspace: { kind: 'real' } },
				}))
			)
				throw new AccessDeniedError()
			if (!(await this.pricing.eligibleDefinition(tx, row, this.deps.now(), context.actor.userId)))
				throw new GoodsCheckoutConflictError('This coupon is unavailable.')
			return promotionView(row)
		})
	}
}
