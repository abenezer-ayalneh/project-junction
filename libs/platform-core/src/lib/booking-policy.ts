import { BookingPolicySchema } from 'contracts'

/** Integer minor-unit refunds; exact thresholds belong to the higher refund band. */
export function bookingCancellationRefund(input: unknown, amountCents: number, start: Date, now: Date, providerCancellation: boolean) {
	const policy = BookingPolicySchema.parse(input)
	if (providerCancellation) return amountCents
	const remaining = start.getTime() - now.getTime()
	if (remaining >= policy.fullRefundHours * 3_600_000) return amountCents
	if (remaining >= policy.partialRefundHours * 3_600_000) return Math.floor(amountCents / 2)
	return 0
}
