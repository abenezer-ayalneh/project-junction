import { type LedgerCommand, LedgerCommandSchema, SandboxMerchantModel } from 'contracts'

import { type Prisma } from '../../generated/prisma/index.js'
import { goodsAudit, goodsEmit, goodsJson } from './goods-support.js'
import { IdempotencyConflictError, stableHash } from './idempotency.js'

type Tx = Prisma.TransactionClient
export class LedgerConflictError extends Error {}
/** Internal economic-event writer. Call inside the same DB transaction as the
 * authoritative commerce change. No Customer/Vendor/Finance HTTP writer exists.
 * workspaceId comes from the authoritative component, never browser input. */
export class ImmutableLedger {
	async post(tx: Tx, input: LedgerCommand) {
		return this.append(tx, LedgerCommandSchema.parse(input), null)
	}
	async reverse(tx: Tx, workspaceId: string, originalId: string, economicEventId: string, reason: string) {
		await this.lock(tx, workspaceId)
		const original = await tx.ledgerTransaction.findFirst({
			where: { id: originalId, workspaceId },
			include: { postings: { orderBy: { ordinal: 'asc' } } },
		})
		if (!original || original.reversalOf) throw new LedgerConflictError('Only an original transaction in this workspace may be reversed.')
		const command = LedgerCommandSchema.parse({
			workspaceId,
			economicEventId,
			reason,
			sourceId: original.sourceId,
			postings: original.postings.map((p) => ({
				account: p.account,
				vendorId: p.vendorId,
				locationId: p.locationId,
				componentId: p.componentId,
				money: { currency: p.currency, minorUnits: -Number(p.minorUnits) },
			})),
		})
		return this.append(tx, command, originalId)
	}
	private async lock(tx: Tx, workspaceId: string) {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`junction:ledger:${workspaceId}`}, 0))`
	}
	private async append(tx: Tx, command: LedgerCommand, reversalOf: string | null) {
		await this.lock(tx, command.workspaceId)
		const requestHash = stableHash({ command, reversalOf, merchantModel: SandboxMerchantModel })
		const existing = await tx.ledgerTransaction.findUnique({
			where: { workspaceId_economicEventId: { workspaceId: command.workspaceId, economicEventId: command.economicEventId } },
			include: { postings: { orderBy: { ordinal: 'asc' } } },
		})
		if (existing) {
			if (existing.requestHash !== requestHash) throw new IdempotencyConflictError()
			return { transaction: existing, replayed: true }
		}
		if (reversalOf && (await tx.ledgerTransaction.findUnique({ where: { reversalOf } }))) throw new LedgerConflictError('Transaction already reversed.')
		const transaction = await tx.ledgerTransaction.create({
			data: {
				workspaceId: command.workspaceId,
				economicEventId: command.economicEventId,
				sourceId: command.sourceId,
				reason: command.reason,
				currency: command.postings[0].money.currency,
				requestHash,
				reversalOf,
				merchantModel: goodsJson(SandboxMerchantModel),
				postings: {
					create: command.postings.map((p, ordinal) => ({
						ordinal,
						account: p.account,
						vendorId: p.vendorId,
						locationId: p.locationId,
						componentId: p.componentId,
						currency: p.money.currency,
						minorUnits: BigInt(p.money.minorUnits),
					})),
				},
			},
			include: { postings: { orderBy: { ordinal: 'asc' } } },
		})
		await goodsAudit(tx, command.workspaceId, null, reversalOf ? 'ledger.reversed' : 'ledger.posted', {
			transactionId: transaction.id,
			economicEventId: command.economicEventId,
			sourceId: command.sourceId,
			reversalOf,
			reason: command.reason,
		})
		await goodsEmit(
			tx,
			() => transaction.createdAt,
			command.workspaceId,
			reversalOf ? 'LedgerTransactionReversed' : 'LedgerTransactionPosted',
			transaction.id,
			1,
			command.economicEventId,
			{ transactionId: transaction.id, sourceId: command.sourceId, reversalOf, currency: transaction.currency },
		)
		return { transaction, replayed: false }
	}
}
