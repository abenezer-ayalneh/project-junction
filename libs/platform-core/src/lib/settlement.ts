import { FinanceCommandSchema, FinanceResultSchema, IdempotencyKeySchema, VendorPayoutsSchema } from 'contracts'

import { type FinanceRecord, type Prisma } from '../../generated/prisma/index.js'
import { AccessDeniedError, assertRecentMfa } from './access.js'
import { refreshEarnings } from './earnings.js'
import { goodsAudit, GoodsCheckoutConflictError, type GoodsDependencies, goodsEmit, goodsJson } from './goods-support.js'
import { stableHash } from './idempotency.js'
import { ImmutableLedger } from './ledger.js'
import { applicationRuntimeMode } from './runtime.js'
type Tx = Prisma.TransactionClient
const view = (r: FinanceRecord) => ({ ...r, createdAt: r.createdAt.toISOString() })
/** Local simulation only. There is no provider disbursement call or withdrawal API. */
export class FinanceSettlement {
	constructor(private readonly deps: GoodsDependencies) {}
	private async lock(tx: Tx) {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout',0))`
	}
	private async authority(tx: Tx, sessionId: string | undefined, workspaceId: string, mutation: boolean) {
		const c = await this.deps.derive(tx, sessionId)
		if (!c.capabilities.includes('platform:finance:configure') || c.activeVendorId) throw new AccessDeniedError()
		const grant = await tx.platformFinanceGrant.findUniqueOrThrow({ where: { userId_workspaceId: { userId: c.actor.userId, workspaceId: c.workspaceId } } })
		if (!grant.settlementWorkspaceIds.includes(workspaceId)) throw new AccessDeniedError()
		// Financial operation authority is stricter than the local configuration exception.
		if (mutation) assertRecentMfa(c, this.deps.now())
		return c
	}
	private async record(
		tx: Tx,
		workspaceId: string,
		kind: string,
		operationKey: string,
		actorId: string | null,
		payload: unknown,
		sourceId: string | null = null,
	) {
		const existing = await tx.financeRecord.findUnique({ where: { workspaceId_operationKey: { workspaceId, operationKey } } })
		if (existing) return existing
		const r = await tx.financeRecord.create({
			data: { workspaceId, kind, operationKey, actorId, payload: goodsJson(payload), sourceId, createdAt: this.deps.now() },
		})
		await goodsAudit(tx, workspaceId, actorId, 'finance.' + kind, { recordId: r.id, sourceId })
		await goodsEmit(tx, () => this.deps.now(), workspaceId, 'FinanceRecordCreated', r.id, 1, operationKey, {
			recordId: r.id,
			kind,
			sourceId,
			sandbox: true,
		})
		return r
	}
	async vendorRead(sessionId: string | undefined) {
		return this.deps.db.$transaction(async (tx) => {
			const context = await this.deps.derive(tx, sessionId, { allowRestrictedVendor: true })
			if (!context.activeVendorId || !context.memberships.some((m) => m.active && m.role === 'vendor_owner' && m.vendorId === context.activeVendorId))
				throw new AccessDeniedError()
			const transfers = await tx.financeRecord.findMany({
					where: { workspaceId: context.workspaceId, kind: 'transfer' },
					orderBy: { createdAt: 'desc' },
					take: 200,
				}),
				read = []
			for (const t of transfers) {
				const data = t.payload as { vendorId: string; lots: { allocationId: string; amount: number }[] }
				if (data.vendorId !== context.activeVendorId) continue
				const visible = await tx.mixedCommerceAllocation.findMany({
					where: {
						id: { in: data.lots.map((l) => l.allocationId) },
						vendorId: context.activeVendorId,
						OR: [{ locationId: null }, { locationId: { in: context.locationIds } }],
					},
					select: { id: true },
				})
				const lots = data.lots.filter((l) => visible.some((a) => a.id === l.allocationId))
				if (!lots.length) continue
				const terminal = await tx.financeRecord.findFirst({ where: { kind: 'transfer_terminal', sourceId: t.id } })
				const unknown = await tx.financeRecord.findFirst({ where: { kind: 'transfer_observation', sourceId: t.id } })
				const batch = await tx.financeRecord.findUniqueOrThrow({ where: { id: t.sourceId ?? '' } })
				read.push({
					transferId: t.id,
					week: (batch.payload as { week: string }).week,
					status: terminal ? (terminal.payload as { outcome: string }).outcome : unknown ? 'unknown' : 'pending',
					amountMinorUnits: lots.reduce((s, l) => s + l.amount, 0),
					allocationIds: lots.map((l) => l.allocationId),
				})
			}
			return VendorPayoutsSchema.parse({ sandbox: true, currency: 'ETB', transfers: read })
		})
	}

	async read(sessionId: string | undefined, workspaceId: string) {
		return this.deps.db.$transaction(async (tx) => {
			await this.authority(tx, sessionId, workspaceId, false)
			return FinanceResultSchema.parse({
				sandbox: true,
				records: (await tx.financeRecord.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 200 })).map(view),
			})
		})
	}
	async command(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		if (applicationRuntimeMode() !== 'local') throw new AccessDeniedError('Finance simulation requires local development.')
		const command = FinanceCommandSchema.parse(input),
			key = IdempotencyKeySchema.parse(keyInput)
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const c = await this.authority(tx, sessionId, command.workspaceId, true)
				const result = await this.deps.replay(tx, c, key, 'POST /v1/platform/finance/operations', command, async () => {
					const w = command.workspaceId,
						actor = c.actor.userId
					let r: FinanceRecord
					if (command.action === 'reconcile') r = await this.reconcile(tx, w, actor, key)
					else if (command.action === 'open_exception') {
						const source = await tx.ledgerTransaction.findFirst({ where: { id: command.sourceId, workspaceId: w } })
						if (!source) throw new AccessDeniedError()
						r = await this.record(tx, w, 'exception', 'manual-exception:' + key, actor, command, command.sourceId)
					} else if (command.action === 'propose_policy') {
						if (!(await tx.vendor.findFirst({ where: { workspaceId: w } })))
							throw new GoodsCheckoutConflictError('A payout policy requires a seller workspace.')
						r = await this.record(tx, w, 'policy_proposal', 'policy:' + key, actor, command)
					} else if (command.action === 'propose_fee') {
						r = await this.record(tx, w, 'fee_proposal', 'fee:' + key, actor, command)
					} else if (command.action === 'propose_correction') {
						const exception = await tx.financeRecord.findFirst({ where: { id: command.exceptionId, workspaceId: w, kind: 'exception' } })
						const original = await tx.ledgerTransaction.findFirst({ where: { id: command.transactionId, workspaceId: w, reversalOf: null } })
						if (!exception || !original || exception.sourceId !== original.id) throw new AccessDeniedError()
						// Reversing authoritative commerce entries must go through their owning context.
						if (!original.economicEventId.startsWith('finance-fee:'))
							throw new GoodsCheckoutConflictError('Use the source commerce compensation workflow for this transaction.')
						r = await this.record(tx, w, 'correction_proposal', 'correction:' + key, actor, command, exception.id)
					} else if (command.action === 'approve') {
						const p = await tx.financeRecord.findFirst({
							where: { id: command.proposalId, workspaceId: w, kind: { in: ['policy_proposal', 'fee_proposal', 'correction_proposal'] } },
						})
						if (!p || p.actorId === actor) throw new AccessDeniedError('A different scoped Finance actor must approve.')
						const originalActor = await tx.platformFinanceGrant.findFirst({
							where: { userId: p.actorId ?? '', revokedAt: null, expiresAt: { gt: new Date() }, settlementWorkspaceIds: { has: w } },
						})
						if (!originalActor || (await tx.vendorMembership.findFirst({ where: { userId: p.actorId ?? '', revokedAt: null } })))
							throw new AccessDeniedError('Proposal authority expired, was revoked or has Vendor affiliation.')
						if (p.kind === 'fee_proposal') {
							const data = p.payload as { feeKind: 'processor' | 'dispute'; amountMinorUnits: number; reason: string; reference: string }
							await new ImmutableLedger().post(tx, {
								workspaceId: w,
								sourceId: p.id,
								economicEventId: 'finance-fee:' + data.reference,
								reason: data.reason,
								postings: [
									{
										account: data.feeKind === 'processor' ? 'platform_processor_fee_expense' : 'platform_dispute_fee_expense',
										vendorId: null,
										locationId: null,
										componentId: null,
										money: { minorUnits: data.amountMinorUnits, currency: 'ETB' },
									},
									{
										account: 'processor_clearing',
										vendorId: null,
										locationId: null,
										componentId: null,
										money: { minorUnits: -data.amountMinorUnits, currency: 'ETB' },
									},
								],
							})
						}
						if (p.kind === 'correction_proposal') {
							const data = p.payload as { transactionId: string; reason: string }
							await new ImmutableLedger().reverse(tx, w, data.transactionId, 'finance-correction:' + p.id, data.reason)
							await this.record(
								tx,
								w,
								'exception_resolution',
								'resolution:' + p.sourceId,
								actor,
								{ proposalId: p.id, reason: command.reason },
								p.sourceId,
							)
						}
						r = await this.record(tx, w, 'approval', 'approve:' + p.id, actor, { reason: command.reason }, p.id)
					} else if (command.action === 'run_weekly') r = await this.weekly(tx, w)
					else {
						const transfer = await tx.financeRecord.findFirst({ where: { id: command.transferId, workspaceId: w, kind: 'transfer' } })
						if (!transfer) throw new AccessDeniedError()
						const terminal = await tx.financeRecord.findUnique({
							where: { workspaceId_operationKey: { workspaceId: w, operationKey: 'terminal:' + transfer.id } },
						})
						if (terminal) {
							if ((terminal.payload as { outcome: string }).outcome !== command.outcome)
								throw new GoodsCheckoutConflictError('Transfer already has a terminal observation.')
							r = terminal
						} else {
							if (command.outcome === 'succeeded') {
								const data = transfer.payload as { amount: number; lots: { allocationId: string; amount: number }[] }

								// Named transfer template debits only already reserved seller payable.
								for (const lot of data.lots) {
									const a = await tx.mixedCommerceAllocation.findUniqueOrThrow({ where: { id: lot.allocationId } })
									await new ImmutableLedger().post(tx, {
										workspaceId: w,
										economicEventId: `finance-transfer:${transfer.id}:${a.id}`,
										sourceId: transfer.id,
										reason: 'Local simulated transfer completion.',
										postings: [
											{
												account: 'vendor_payable',
												vendorId: a.vendorId,
												locationId: a.locationId,
												componentId: a.id,
												money: { minorUnits: lot.amount, currency: 'ETB' },
											},
											{
												account: 'processor_clearing',
												vendorId: null,
												locationId: null,
												componentId: a.id,
												money: { minorUnits: -lot.amount, currency: 'ETB' },
											},
										],
									})
								}
							}
							r = await this.record(
								tx,
								w,
								command.outcome === 'unknown' ? 'transfer_observation' : 'transfer_terminal',
								command.outcome === 'unknown' ? 'unknown:' + transfer.id : 'terminal:' + transfer.id,
								actor,
								{ outcome: command.outcome, reason: command.reason, reference: 'local-transfer:' + transfer.id },
								transfer.id,
							)
						}
					}
					return { sandbox: true as const, records: [view(r)] }
				})
				return FinanceResultSchema.parse(result.outcome)
			},
			{ timeout: 60000 },
		)
	}
	private async reconcile(tx: Tx, w: string, actor: string | null, key: string) {
		const findings: { sourceId: string; code: string }[] = []
		const payments = await tx.mixedPaymentAttempt.findMany({
			where: { workspaceId: w },
			include: { captureLedger: { include: { postings: true } }, refund: true, purchase: true, hold: true },
		})
		for (const p of payments) {
			const receipts = await tx.providerInboxEvent.findMany({
				where: { provider: 'local-mixed-payment', workspaceId: w, payload: { path: ['paymentId'], equals: p.id } },
			})
			const successes = receipts.filter((r) => (r.payload as { outcome?: string }).outcome === 'succeeded' && r.reconciliationState === 'reconciled')
			if (p.captureLedgerId && !successes.length) findings.push({ sourceId: p.id, code: 'capture_without_verified_receipt' })
			if (
				successes.some((r) => {
					const e = r.payload as { amount: { minorUnits: number; currency: string } }
					return e.amount.minorUnits !== Number(p.amountMinorUnits) || e.amount.currency !== p.currency
				})
			)
				findings.push({ sourceId: p.id, code: 'provider_amount_mismatch' })
			if (receipts.some((r) => r.reconciliationState === 'exception')) findings.push({ sourceId: p.id, code: 'inbox_exception' })
			if (
				p.captureLedger &&
				p.captureLedger.postings.filter((x) => x.account === 'processor_clearing').reduce((s, x) => s + x.minorUnits, 0n) !== p.amountMinorUnits
			)
				findings.push({ sourceId: p.id, code: 'capture_ledger_mismatch' })
			if (p.purchase && p.hold.state !== 'committed') findings.push({ sourceId: p.id, code: 'purchase_hold_mismatch' })
			if (p.refund?.state === 'completed' && !p.refund.reversalLedgerId) findings.push({ sourceId: p.id, code: 'refund_without_reversal' })
			if (p.state === 'pending_provider') findings.push({ sourceId: p.id, code: 'provider_outcome_unknown' })
		}
		const allocations = await tx.mixedCommerceAllocation.findMany({
			where: { vendorWorkspaceId: w },
			include: {
				additionalCaptures: { include: { ledger: { include: { postings: true } } } },
				refunds: { include: { ledger: { include: { postings: true } } } },
			},
		})
		for (const a of allocations) {
			const snapshot = a.snapshot as {
				customerMinorUnits: number
				platformSubsidyMinorUnits: number
				commissionMinorUnits: number
				vendorEarningMinorUnits: number
				customer: number
				vendor: number
			}
			const original = await tx.ledgerTransaction.findUnique({
				where: { workspaceId_economicEventId: { workspaceId: w, economicEventId: 'mixed-sale:' + a.id } },
				include: { postings: true },
			})
			const sums = (postings: { account: string; minorUnits: bigint }[]) => ({
				customer: postings.filter((p) => p.account === 'processor_clearing').reduce((s, p) => s + p.minorUnits, 0n),
				vendor: postings.filter((p) => p.account === 'vendor_payable').reduce((s, p) => s + p.minorUnits, 0n),
				commission: postings.filter((p) => p.account === 'platform_commission').reduce((s, p) => s + p.minorUnits, 0n),
				subsidy: postings.filter((p) => p.account === 'platform_promotion_expense').reduce((s, p) => s + p.minorUnits, 0n),
			})
			const expected =
				a.kind === 'delivery'
					? { customer: snapshot.customer, vendor: snapshot.vendor, commission: 0, subsidy: 0 }
					: {
							customer: snapshot.customerMinorUnits,
							vendor: snapshot.vendorEarningMinorUnits,
							commission: snapshot.commissionMinorUnits,
							subsidy: snapshot.platformSubsidyMinorUnits,
						}
			const originalSums = sums(original?.postings ?? [])
			if (
				originalSums.customer !== BigInt(expected.customer) ||
				originalSums.vendor !== -BigInt(expected.vendor) ||
				originalSums.commission !== -BigInt(expected.commission) ||
				originalSums.subsidy !== BigInt(expected.subsidy)
			)
				findings.push({ sourceId: a.id, code: 'sale_allocation_ledger_mismatch' })
			for (const capture of a.additionalCaptures) {
				const v = sums(capture.ledger.postings)
				if (
					v.customer !== BigInt(capture.customerMinorUnits) ||
					v.vendor !== -BigInt(capture.vendorMinorUnits) ||
					v.commission !== -BigInt(capture.commissionMinorUnits)
				)
					findings.push({ sourceId: capture.id, code: 'additional_capture_ledger_mismatch' })
			}
			for (const refund of a.refunds) {
				if (!refund.ledger) {
					findings.push({ sourceId: refund.id, code: 'component_refund_pending' })
					continue
				}
				const v = sums(refund.ledger.postings)
				if (
					!refund.providerReference ||
					v.customer !== -BigInt(refund.customerMinorUnits) ||
					v.vendor !== BigInt(refund.vendorMinorUnits) ||
					v.commission !== BigInt(refund.commissionMinorUnits) ||
					v.subsidy !== -BigInt(refund.subsidyMinorUnits)
				)
					findings.push({ sourceId: refund.id, code: 'component_refund_ledger_mismatch' })
			}
		}

		const imbalances = await tx.$queryRaw<
			{ id: string }[]
		>`SELECT t.id FROM ledger_transactions t JOIN ledger_postings p ON p.transaction_id=t.id WHERE t.workspace_id=${w}::uuid GROUP BY t.id HAVING sum(p.minor_units)<>0`
		for (const row of imbalances) findings.push({ sourceId: row.id, code: 'ledger_unbalanced' })
		const transfers = await tx.financeRecord.findMany({ where: { workspaceId: w, kind: 'transfer' } })
		for (const t of transfers) {
			const terminal = await tx.financeRecord.findFirst({ where: { kind: 'transfer_terminal', sourceId: t.id } })
			if (!terminal) findings.push({ sourceId: t.id, code: 'transfer_outcome_unknown' })
			else {
				const succeeded = (terminal.payload as { outcome: string }).outcome === 'succeeded'
				const data = t.payload as { amount: number }
				const entries = await tx.ledgerPosting.findMany({ where: { transaction: { workspaceId: w, sourceId: t.id }, account: 'vendor_payable' } })
				if (entries.reduce((s, x) => s + x.minorUnits, 0n) !== (succeeded ? BigInt(data.amount) : 0n))
					findings.push({ sourceId: t.id, code: 'transfer_ledger_mismatch' })
			}
		}
		for (const f of findings) await this.record(tx, w, 'exception', 'exception:' + stableHash(f), actor, f, f.sourceId)
		return this.record(tx, w, 'reconciliation', 'reconcile:' + key, actor, {
			findings,
			checkedPayments: payments.length,
			checkedAllocations: allocations.length,
			checkedTransfers: transfers.length,
			matched: findings.length === 0,
		})
	}
	private async weekly(tx: Tx, w: string) {
		const approvals = await tx.financeRecord.findMany({ where: { workspaceId: w, kind: 'approval' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
		let policy: FinanceRecord | null = null
		for (const a of approvals) {
			const p = await tx.financeRecord.findFirst({ where: { id: a.sourceId ?? '', kind: 'policy_proposal' } })
			if (p) {
				policy = p
				break
			}
		}
		if (!policy) throw new GoodsCheckoutConflictError('An approved payout minimum is required.')
		const now = this.deps.now(),
			date = new Date(now)
		date.setUTCHours(0, 0, 0, 0)
		date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
		const key = 'batch:' + date.toISOString().slice(0, 10)
		const old = await tx.financeRecord.findUnique({ where: { workspaceId_operationKey: { workspaceId: w, operationKey: key } } })
		if (old) return old
		await refreshEarnings(tx, now, w)
		const allocations = await tx.mixedCommerceAllocation.findMany({
			where: { vendorWorkspaceId: w },
			include: { earningRevisions: { orderBy: { version: 'desc' }, take: 1 } },
			orderBy: { id: 'asc' },
		})
		const previous = await tx.financeRecord.findMany({ where: { workspaceId: w, kind: 'transfer' } })
		const groups = new Map<string, { lots: { allocationId: string; amount: number }[]; debt: bigint }>()
		for (const a of allocations) {
			const group = groups.get(a.vendorId) ?? { lots: [], debt: 0n }
			groups.set(a.vendorId, group)
			let used = 0n
			for (const t of previous) {
				const failed = await tx.financeRecord.findFirst({
					where: { kind: 'transfer_terminal', sourceId: t.id, payload: { path: ['outcome'], equals: 'failed' } },
				})
				if (failed) continue
				used += BigInt(
					(t.payload as { lots: { allocationId: string; amount: number }[] }).lots
						.filter((l) => l.allocationId === a.id)
						.reduce((s, l) => s + l.amount, 0),
				)
			}
			const value = a.earningRevisions[0].snapshot as { available: number; gross: number; refunded: number; refundPending: number; frozen: number }
			const remaining = BigInt(value.gross) - BigInt(value.refunded) - BigInt(value.refundPending) - BigInt(value.frozen) - used
			if (remaining < 0n) group.debt -= remaining
			const amount = BigInt(value.available) - used
			if (amount > 0n) group.lots.push({ allocationId: a.id, amount: Number(amount) })
		}
		const minimum = (policy.payload as { minimumMinorUnits: number }).minimumMinorUnits
		const vendors = []
		for (const [vendorId, group] of groups) {
			for (const l of group.lots) {
				const offset = group.debt > BigInt(l.amount) ? BigInt(l.amount) : group.debt
				l.amount -= Number(offset)
				group.debt -= offset
			}
			const lots = group.lots.filter((l) => l.amount > 0),
				amount = lots.reduce((s, l) => s + BigInt(l.amount), 0n)
			if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new GoodsCheckoutConflictError('Batch exceeds safe Money range.')
			vendors.push({ vendorId, lots, amount: Number(amount), unrecoveredMinorUnits: Number(group.debt), eligible: amount >= BigInt(minimum) })
		}
		const amount = vendors.filter((v) => v.eligible).reduce((sum, v) => sum + BigInt(v.amount), 0n)
		if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new GoodsCheckoutConflictError('Batch exceeds safe Money range.')
		const batch = await this.record(tx, w, 'batch', key, null, {
			week: date.toISOString(),
			policyId: policy.id,
			amount: Number(amount),
			minimumMinorUnits: minimum,
			vendors,
			status: amount > 0n ? 'allocated' : 'below_minimum',
		})
		for (const v of vendors.filter((v) => v.eligible))
			await this.record(
				tx,
				w,
				'transfer',
				'transfer:' + batch.id + ':' + v.vendorId,
				null,
				{ amount: v.amount, currency: 'ETB', vendorId: v.vendorId, lots: v.lots, reference: 'local-batch:' + batch.id + ':' + v.vendorId },
				batch.id,
			)

		return batch
	}
	async tick() {
		if (applicationRuntimeMode() !== 'local') return 0
		const approvals = await this.deps.db.$queryRaw<
			{ workspaceId: string }[]
		>`SELECT DISTINCT a.workspace_id AS "workspaceId" FROM finance_records a JOIN finance_records p ON p.id=a.source_id WHERE a.kind='approval' AND p.kind='policy_proposal'`

		let count = 0
		for (const { workspaceId } of approvals)
			await this.deps.db.$transaction(
				async (tx) => {
					await this.lock(tx)
					await this.weekly(tx, workspaceId)
					count++
				},
				{ timeout: 60000 },
			)
		return count
	}
}
