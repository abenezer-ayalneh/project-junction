import { z } from 'zod'

/** JSON boundary uses safe integers; arithmetic and database storage use bigint. */
export const MoneySchema = z.object({ minorUnits: z.number().int().safe(), currency: z.string().regex(/^[A-Z]{3}$/) }).strict()
export type Money = z.infer<typeof MoneySchema>
export const LedgerAccountSchema = z.enum([
	'processor_clearing',
	'customer_refund_liability',
	'vendor_payable',
	'platform_commission',
	'platform_promotion_expense',
	'platform_processor_fee_expense',
	'platform_dispute_fee_expense',
])
export const LedgerPostingSchema = z
	.object({
		account: LedgerAccountSchema,
		vendorId: z.string().uuid().nullable(),
		locationId: z.string().uuid().nullable(),
		componentId: z.string().uuid().nullable(),
		money: MoneySchema,
	})
	.strict()
	.superRefine((posting, ctx) => {
		if ((posting.account === 'vendor_payable') !== (posting.vendorId !== null))
			ctx.addIssue({ code: 'custom', message: 'Only Vendor payable postings require a Vendor.' })
		if (posting.locationId && !posting.vendorId) ctx.addIssue({ code: 'custom', message: 'Location requires Vendor scope.' })
		if (!posting.money.minorUnits) ctx.addIssue({ code: 'custom', message: 'Posting must be nonzero.' })
	})
export const LedgerCommandSchema = z
	.object({
		workspaceId: z.string().uuid(),
		economicEventId: z.string().min(1).max(200),
		sourceId: z.string().uuid(),
		reason: z.string().trim().min(1).max(500),
		postings: z.array(LedgerPostingSchema).min(2).max(100),
	})
	.strict()
	.superRefine((command, ctx) => {
		if (new Set(command.postings.map((p) => p.money.currency)).size !== 1) ctx.addIssue({ code: 'custom', message: 'Transaction must use one currency.' })
		if (command.postings.reduce((sum, p) => sum + BigInt(p.money.minorUnits), 0n) !== 0n)
			ctx.addIssue({ code: 'custom', message: 'Transaction must balance.' })
	})
export type LedgerCommand = z.infer<typeof LedgerCommandSchema>
export const SandboxMerchantModel = Object.freeze({
	paymentMerchant: 'junction',
	contractingSeller: 'vendor',
	ordinaryProcessorFees: 'junction',
	ordinaryDisputeFees: 'junction',
	settlement: 'sandbox_only',
} as const)
