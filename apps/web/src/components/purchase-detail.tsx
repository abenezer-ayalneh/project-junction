'use client'

import { MixedPurchaseReadSchema } from 'contracts'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'

import { CheckoutReview } from '@/components/checkout-review'
import { Button } from '@/components/ui/button'
import { appointmentDate, appointmentTime } from '@/lib/appointment-intents'
import { formatPrice } from '@/lib/marketplace'
import { checkoutRequest } from '@/lib/mixed-checkout'

export function PurchaseDetail({ purchaseId }: { purchaseId: string }) {
	const [purchase, setPurchase] = useState<z.infer<typeof MixedPurchaseReadSchema> | null>(null)
	const [message, setMessage] = useState('Loading Purchase…')
	const [busy, setBusy] = useState(false)
	const load = useCallback(async () => {
		setBusy(true)
		try {
			setPurchase(await checkoutRequest(`customer/purchases/${purchaseId}`, (v) => MixedPurchaseReadSchema.parse(v)))
			setMessage('')
		} catch (error) {
			setPurchase(null)
			setMessage(error instanceof Error ? error.message : 'Purchase could not be read. Retry.')
		} finally {
			setBusy(false)
		}
	}, [purchaseId])
	useEffect(() => {
		void load()
	}, [load])
	return (
		<div className="space-y-6 text-center">
			<p role="status">{message}</p>
			<Button variant="outline" disabled={busy} onClick={() => void load()}>
				Refresh Purchase
			</Button>
			{purchase ? (
				<>
					<p className="break-words">Purchase reference: {purchase.purchaseId}</p>
					<p>Sandbox payment confirmed · {new Date(purchase.paidAt).toLocaleString()}</p>
					<dl className="space-y-3">
						<div>
							<dt>Captured</dt>
							<dd>{formatPrice(purchase.capturedMinorUnits)}</dd>
						</div>
						<div>
							<dt>Refunded</dt>
							<dd>{formatPrice(purchase.refundedMinorUnits)}</dd>
						</div>
						<div>
							<dt>Refund pending</dt>
							<dd>{formatPrice(purchase.pendingRefundMinorUnits)}</dd>
						</div>
					</dl>
					<h2 className="text-xl font-semibold">Orders and Bookings</h2>
					<p>Each component has its own fulfillment, cancellation and refund status.</p>
					{purchase.orders.map((order) => (
						<section key={order.orderId} className="space-y-2 border-t pt-5">
							<h3 className="font-semibold break-words">Order {order.orderId}</h3>
							<p>{order.state.replaceAll('_', ' ')}</p>
							<p>
								{order.lines.reduce((sum, l) => sum + l.quantity, 0)} items · {order.lines.reduce((sum, l) => sum + l.cancelledQuantity, 0)}{' '}
								cancelled
							</p>
						</section>
					))}
					{purchase.bookings.map((booking) => (
						<section key={booking.bookingId} className="space-y-2 border-t pt-5">
							<h3 className="font-semibold">
								{booking.snapshot.serviceTitle} · {booking.snapshot.optionLabel}
							</h3>
							<p className="break-words">Booking {booking.bookingId}</p>
							<p>{booking.state.replaceAll('_', ' ')}</p>
							<p>{booking.snapshot.mode === 'online' ? 'Online' : booking.snapshot.locationLabel}</p>
							<p>
								{appointmentDate(booking.snapshot.start, booking.snapshot.timezone)} ·{' '}
								{appointmentTime(booking.snapshot.start, booking.snapshot.end, booking.snapshot.timezone)} · {booking.snapshot.timezone}
							</p>
						</section>
					))}
					{purchase.addenda.map((a) => (
						<p key={a.additionId}>
							Appointment adjustment: {formatPrice(a.customerMinorUnits)} · {new Date(a.createdAt).toLocaleString()}
						</p>
					))}
					<h2 className="text-xl font-semibold">Original non-tax receipt</h2>
					<CheckoutReview snapshot={purchase.receipt.snapshot} />
					{purchase.invoices.length ? (
						<section className="space-y-3">
							<h2 className="text-xl font-semibold">Vendor invoices</h2>
							{purchase.invoices.map((invoice) => (
								<p key={invoice.invoiceId}>
									<a className="underline" href={invoice.documentUrl} target="_blank" rel="noopener noreferrer">
										Invoice {invoice.invoiceNumber} (external document)
									</a>
								</p>
							))}
						</section>
					) : null}
				</>
			) : null}
			<Link href="/cart" className="inline-block underline">
				Return to Cart
			</Link>
		</div>
	)
}
