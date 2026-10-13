import { EarningAmountsSchema, VendorEarningsSchema } from 'contracts'

import { type Prisma } from '../../generated/prisma/index.js'
import { AccessDeniedError } from './access.js'
import { goodsAudit, type GoodsDependencies, goodsEmit, goodsJson } from './goods-support.js'
import { stableHash } from './idempotency.js'
type Tx = Prisma.TransactionClient
/** Called inside the authoritative commerce transaction. Availability classifies
 * existing payable; refunds remain the economic reversal writer. No cash moves. */
export async function refreshEarnings(tx: Tx, now: Date, workspaceId?: string) {
	await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout',0))`
	// Worker ticks select only changed authority, in bounded batches. No-op lots
	// cannot starve newly due components behind the first page.
	const due = workspaceId
		? null
		: await tx.$queryRaw<{ id: string }[]>`
		SELECT a.id FROM mixed_commerce_allocations a LEFT JOIN LATERAL
		(SELECT snapshot,observed_at FROM earning_revisions WHERE allocation_id=a.id ORDER BY version DESC LIMIT 1) r ON true
		WHERE r.snapshot IS DISTINCT FROM earning_expected(a.id,GREATEST(${now}::timestamptz,r.observed_at))
		ORDER BY a.id LIMIT 100`
	const allocations = await tx.mixedCommerceAllocation.findMany({
		where: workspaceId ? { OR: [{ vendorWorkspaceId: workspaceId }, { purchase: { workspaceId } }] } : { id: { in: (due ?? []).map((row) => row.id) } },
		orderBy: { id: 'asc' },
	})
	let changed = 0
	for (const a of allocations) {
		const prior = await tx.earningRevision.findFirst({ where: { allocationId: a.id }, orderBy: { version: 'desc' } })
		const observedAt = prior && prior.observedAt > now ? prior.observedAt : now
		const [result] = await tx.$queryRaw<{ snapshot: Prisma.JsonValue }[]>`SELECT earning_expected(${a.id}::uuid,${observedAt}::timestamptz) AS snapshot`
		if (prior && stableHash(prior.snapshot) === stableHash(result.snapshot)) continue
		const version = (prior?.version ?? 0) + 1
		await tx.earningRevision.create({ data: { allocationId: a.id, version, snapshot: goodsJson(result.snapshot), observedAt } })
		await goodsAudit(tx, a.vendorWorkspaceId, null, 'earning.availability-changed', { allocationId: a.id, version })
		await goodsEmit(tx, () => now, a.vendorWorkspaceId, 'EarningAvailabilityChanged', a.id, version, null, { allocationId: a.id, version })
		changed++
	}
	return changed
}
export class ComponentEarnings {
	constructor(private readonly deps: GoodsDependencies) {}
	async refresh() {
		return this.deps.db.$transaction((tx) => refreshEarnings(tx, this.deps.now()), { timeout: 30000 })
	}
	async read(sessionId: string | undefined) {
		return this.deps.db.$transaction(
			async (tx) => {
				await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout',0))`
				const context = await this.deps.derive(tx, sessionId, { allowRestrictedVendor: true })
				if (!context.activeVendorId || !context.memberships.some((m) => m.active && m.role === 'vendor_owner' && m.vendorId === context.activeVendorId))
					throw new AccessDeniedError()
				await refreshEarnings(tx, this.deps.now(), context.workspaceId)
				const allocations = await tx.mixedCommerceAllocation.findMany({
					where: {
						vendorWorkspaceId: context.workspaceId,
						vendorId: context.activeVendorId,
						OR: [{ locationId: null }, { locationId: { in: context.locationIds } }],
					},
					include: { earningRevisions: { orderBy: { version: 'desc' }, take: 1 } },
					orderBy: { id: 'asc' },
				})
				return VendorEarningsSchema.parse({
					currency: 'ETB',
					settlement: 'not_transferred',
					lots: allocations.map((a) => {
						const revision = a.earningRevisions[0]
						const value = revision.snapshot as Record<string, unknown>
						return {
							allocationId: a.id,
							purchaseId: a.purchaseId,
							kind: a.kind,
							locationId: a.locationId,
							goodsOrderLineId: a.goodsOrderLineId,
							bookingId: a.bookingId,
							version: revision.version,
							amounts: EarningAmountsSchema.parse({
								...value,
								eligibleAt: typeof value['eligibleAt'] === 'string' ? new Date(value['eligibleAt']).toISOString() : null,
							}),
						}
					}),
				})
			},
			{ timeout: 30000 },
		)
	}
}
