import { z } from 'zod'

import { BookingReadSchema } from './bookings.js'
import { MixedQuoteSnapshotSchema } from './mixed-checkout.js'
import { EconomicAllocationSchema } from './promotions.js'
const id = z.string().uuid()
export const MixedInvoiceCommandSchema = z.strictObject({
	invoiceNumber: z.string().trim().min(1).max(120),
	documentUrl: z
		.string()
		.url()
		.max(2000)
		.refine((value) => {
			const url = new URL(value)
			return url.protocol === 'https:' && !url.username && !url.password
		}, 'Use an HTTPS document reference without credentials.'),
})
export const MixedPurchaseReadSchema = z.strictObject({
	purchaseId: id,
	paymentId: id,
	holdId: id,
	paidAt: z.string().datetime(),
	sandbox: z.literal(true),
	capturedMinorUnits: z.number().int().nonnegative(),
	refundedMinorUnits: z.number().int().nonnegative(),
	pendingRefundMinorUnits: z.number().int().nonnegative(),
	addenda: z.array(
		z.strictObject({
			additionId: id,
			componentId: id,
			kind: z.string(),
			customerMinorUnits: z.number().int().nonnegative(),
			commissionMinorUnits: z.number().int().nonnegative(),
			createdAt: z.string().datetime(),
		}),
	),
	receipt: z.strictObject({ kind: z.literal('non_tax_platform_receipt'), taxCalculated: z.literal(false), snapshot: MixedQuoteSnapshotSchema }),
	orders: z.array(
		z.strictObject({
			orderId: id,
			vendorId: id,
			locationId: id,
			state: z.string(),
			fulfillmentId: id,
			lines: z.array(
				z.strictObject({
					lineId: id,
					quantity: z.number().int().positive(),
					cancelledQuantity: z.number().int().min(0),
					funding: EconomicAllocationSchema,
				}),
			),
		}),
	),
	bookings: z.array(BookingReadSchema.extend({ funding: EconomicAllocationSchema })),
	invoices: z.array(z.strictObject({ invoiceId: id, vendorId: id, invoiceNumber: z.string(), documentUrl: z.string(), createdAt: z.string().datetime() })),
})
export const MixedInvoiceResultSchema = z.strictObject({ invoiceId: id, replayed: z.boolean() })
