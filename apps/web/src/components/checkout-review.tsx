'use client'

import { type MixedQuoteSnapshot } from 'contracts'
import { PublicListingDetailSchema } from 'contracts'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { appointmentDate, appointmentTime } from '@/lib/appointment-intents'
import { goodsRequest } from '@/lib/goods-cart'
import { formatPrice } from '@/lib/marketplace'

export function CheckoutReview({ snapshot }: { snapshot: MixedQuoteSnapshot }) {
	const [names, setNames] = useState<Record<string, { title: string; vendor: string }>>({})
	useEffect(() => {
		let current = true
		const ids = [
			...new Set([...snapshot.goods.flatMap((g) => g.group.lines.map((l) => l.listingId)), ...snapshot.bookings.map((b) => b.snapshot.listingId)]),
		]
		void Promise.all(
			ids.map(async (id) => {
				try {
					const detail = await goodsRequest(`public/listings/${id}`, (data) => PublicListingDetailSchema.parse(data))
					return [id, { title: detail.title, vendor: detail.vendor.displayName }] as const
				} catch {
					return [id, { title: `Product ${id}`, vendor: '' }] as const
				}
			}),
		).then((entries) => {
			if (current) setNames(Object.fromEntries(entries))
		})
		return () => {
			current = false
		}
	}, [snapshot])
	const vendors = [...new Set([...snapshot.goods.map((g) => g.group.vendorId), ...snapshot.bookings.map((b) => b.snapshot.vendorId)])]
	return (
		<div className="space-y-6 text-center">
			{vendors.map((vendorId) => {
				const goods = snapshot.goods.filter((g) => g.group.vendorId === vendorId)
				const bookings = snapshot.bookings.filter((b) => b.snapshot.vendorId === vendorId)
				const listingId = goods[0]?.group.lines[0]?.listingId ?? bookings[0]?.snapshot.listingId
				return (
					<section key={vendorId} className="space-y-4 border-t pt-5">
						<h3 className="font-semibold break-words">{names[listingId]?.vendor || `Vendor ${vendorId}`}</h3>
						{goods.map(({ componentId, group }) => (
							<div key={componentId} className="space-y-3">
								<h4 className="font-medium">Goods · {group.fulfillment.method === 'pickup' ? 'Pickup' : 'Vendor delivery'}</h4>
								{group.lines.map((line) => (
									<div key={`${line.listingId}:${line.sku}`} className="space-y-1">
										<Link className="underline break-words" href={`/listings/${line.listingId}`}>
											{names[line.listingId]?.title ?? 'Product'}
										</Link>
										<p>
											{line.sku ?? 'Standard'} · {line.quantity} × {formatPrice(line.unitPriceCents)} = {formatPrice(line.subtotalCents)}
										</p>
										<p className="text-sm text-muted-foreground">
											Unused-goods returns: {line.policy.changeOfMindDays} days. Fault protection: {line.policy.faultProtectionDays} days.
										</p>
									</div>
								))}
								<p className="text-sm break-words">Location reference: {group.locationId}</p>
								{group.fulfillment.method === 'delivery' ? (
									<p className="text-sm">
										{group.fulfillment.address.contactName} · {group.fulfillment.address.phone} · {group.fulfillment.address.address},{' '}
										{group.fulfillment.address.locality}
									</p>
								) : null}
								<p>Delivery fee: {formatPrice(group.deliveryFeeCents)}</p>
								<p className="text-sm">
									{group.fulfillment.method === 'pickup'
										? 'Collect within 72 hours of readiness, plus 48 hours grace.'
										: `${group.deliveryZone?.label} · ETA ${group.etaMinutes} minutes. One corrected delivery retry within 48 hours.`}
								</p>
							</div>
						))}
						{bookings.map(({ componentId, snapshot: b, policy }) => (
							<div key={componentId} className="space-y-2">
								<h4 className="font-medium">Appointment · {b.serviceTitle}</h4>
								<p>
									{b.optionLabel}
									{b.addons.length ? ` · ${b.addons.map((a) => a.label).join(', ')}` : ''}
								</p>
								<p>
									{b.mode === 'online' ? 'Online' : b.locationLabel} · {b.selectedStaffId ? 'Selected Staff' : 'Any qualified Staff'}
								</p>
								<p>
									{appointmentDate(b.start, b.timezone)} · {appointmentTime(b.start, b.end, b.timezone)} · {b.timezone}
								</p>
								<p>
									{formatPrice(b.priceCents)} · {b.durationMinutes} minutes · Quantity 1
								</p>
								<p className="text-sm text-muted-foreground">
									Cancellation: full refund at least {policy.fullRefundHours} hours before; 50% refund at least {policy.partialRefundHours}{' '}
									hours before; no Customer cancellation refund inside that window. Amendment limit: {policy.amendmentLimit}. Contest window:{' '}
									{policy.contestHours} hours.
								</p>
							</div>
						))}
					</section>
				)
			})}
			{snapshot.promotion ? (
				<dl className="space-y-2 border-t pt-5">
					<div>
						<dt>Items</dt>
						<dd>{formatPrice(snapshot.promotion.grossSaleMinorUnits)}</dd>
					</div>
					<div>
						<dt>Vendor coupon{snapshot.promotion.vendorCoupon ? ` · ${snapshot.promotion.vendorCoupon.definition.code}` : ''}</dt>
						<dd>−{formatPrice(snapshot.promotion.vendorDiscountMinorUnits)}</dd>
					</div>
					<div>
						<dt>Platform campaign{snapshot.promotion.platformCampaign ? ` · ${snapshot.promotion.platformCampaign.definition.code}` : ''}</dt>
						<dd>−{formatPrice(snapshot.promotion.platformSubsidyMinorUnits)}</dd>
					</div>
					<div>
						<dt>Delivery</dt>
						<dd>{formatPrice(snapshot.promotion.deliveryMinorUnits)}</dd>
					</div>
				</dl>
			) : null}
			{snapshot.total ? (
				<p className="text-xl font-semibold">Total: {formatPrice(snapshot.total.minorUnits)}</p>
			) : (
				<p>Total unavailable until all conflicts are resolved.</p>
			)}
			<p className="text-sm text-muted-foreground">
				Vendors are the contracting sellers. Junction issues a non-tax receipt for the sandbox payment. No tax is calculated.
			</p>
		</div>
	)
}
