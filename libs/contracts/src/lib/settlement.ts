import { z } from 'zod'
const id = z.string().uuid()
const reason = z.string().trim().min(1).max(500)
export const FinanceCommandSchema = z.discriminatedUnion('action', [
	z.strictObject({
		action: z.literal('open_exception'),
		workspaceId: id,
		sourceId: id,
		code: z.string().trim().min(1).max(100),
		reason,
		evidence: z.string().trim().min(1).max(2000),
	}),
	z.strictObject({
		action: z.literal('propose_fee'),
		workspaceId: id,
		feeKind: z.enum(['processor', 'dispute']),
		amountMinorUnits: z.number().int().safe().positive(),
		reference: z.string().trim().min(1).max(200),
		reason,
		evidence: z.string().trim().min(1).max(2000),
	}),
	z.strictObject({ action: z.literal('reconcile'), workspaceId: id, reason }),
	z.strictObject({ action: z.literal('propose_policy'), workspaceId: id, minimumMinorUnits: z.number().int().safe().positive(), reason }),
	z.strictObject({
		action: z.literal('propose_correction'),
		workspaceId: id,
		exceptionId: id,
		transactionId: id,
		reason,
		evidence: z.string().trim().min(1).max(2000),
	}),
	z.strictObject({ action: z.literal('approve'), workspaceId: id, proposalId: id, reason }),
	z.strictObject({ action: z.literal('run_weekly'), workspaceId: id, reason }),
	z.strictObject({ action: z.literal('simulate_result'), workspaceId: id, transferId: id, outcome: z.enum(['unknown', 'succeeded', 'failed']), reason }),
])
export const FinanceRecordSchema = z.strictObject({
	id,
	workspaceId: id,
	kind: z.string(),
	operationKey: z.string(),
	sourceId: id.nullable(),
	actorId: id.nullable(),
	payload: z.record(z.string(), z.unknown()),
	createdAt: z.string().datetime(),
})
export const FinanceResultSchema = z.strictObject({ sandbox: z.literal(true), records: z.array(FinanceRecordSchema) })
export type FinanceCommand = z.infer<typeof FinanceCommandSchema>
export const VendorPayoutsSchema = z.strictObject({
	sandbox: z.literal(true),
	currency: z.literal('ETB'),
	transfers: z.array(
		z.strictObject({
			transferId: id,
			week: z.string().datetime(),
			status: z.enum(['pending', 'unknown', 'succeeded', 'failed']),
			amountMinorUnits: z.number().int().safe().positive(),
			allocationIds: z.array(id),
		}),
	),
})
