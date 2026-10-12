'use client'

import { type PublicListingDetail, PublicProductAvailabilitySchema } from 'contracts'
import Link from 'next/link'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { addToCart, goodsRequest } from '@/lib/goods-cart'
import { formatPrice } from '@/lib/marketplace'

export const goodsFieldClass = 'mt-2 w-full rounded-md border bg-background px-3 py-2 text-center focus-visible:outline-2 focus-visible:outline-offset-2'
export function ProductSelection({ listing }: { listing: PublicListingDetail }) {
	const [sku, setSku] = useState('')
	const [locationId, setLocationId] = useState('')
	const [quantity, setQuantity] = useState('1')
	const [method, setMethod] = useState<'pickup' | 'delivery' | ''>('')
	const [message, setMessage] = useState('')
	const [added, setAdded] = useState(false)
	const [busy, setBusy] = useState(false)
	const revision = useRef(0)
	const location = listing.locations.find(({ id }) => id === locationId)
	const configuration = location?.goodsConfiguration
	const price = listing.variants?.find((variant) => variant.sku === sku)?.priceCents ?? (listing.variants?.length ? undefined : listing.priceCents)
	function changed() {
		revision.current++
		setMessage('')
		setAdded(false)
	}
	async function add(event: React.FormEvent) {
		event.preventDefault()
		if (!locationId || !method || (listing.variants?.length && !sku) || !Number.isInteger(Number(quantity)) || Number(quantity) < 1) {
			setMessage('Select a variant, Location, fulfillment method and positive whole quantity.')
			return
		}
		setBusy(true)
		setAdded(false)
		setMessage('Checking stock…')
		const started = revision.current
		try {
			const query = new URLSearchParams({ locationId, quantity, ...(sku ? { sku } : {}) })
			const stock = await goodsRequest(`public/listings/${listing.id}/availability?${query}`, (data) => PublicProductAvailabilitySchema.parse(data))
			if (started !== revision.current) return
			if (!stock.canFulfill) throw new Error(`Only ${stock.available} available for this selection. Change quantity or Location and try again.`)
			addToCart(listing, { locationId, sku, quantity: Number(quantity), method })
			setAdded(true)
			setMessage(`${quantity} added to Cart. Stock is not reserved.`)
		} catch (error) {
			if (started === revision.current) setMessage(error instanceof Error ? error.message : 'Stock could not be checked. Try again.')
		} finally {
			setBusy(false)
		}
	}
	return (
		<form onSubmit={(event) => void add(event)} className="mt-8 space-y-5 border-t pt-6 text-center" aria-label="Product selection">
			<h2 className="text-xl font-semibold">Select product</h2>
			{listing.variants?.length ? (
				<label className="block text-sm">
					Variant
					<select
						aria-label="Variant"
						className={goodsFieldClass}
						value={sku}
						disabled={busy}
						onChange={(event) => {
							changed()
							setSku(event.target.value)
						}}>
						<option value="">Select variant</option>
						{listing.variants.map((variant) => (
							<option key={variant.sku} value={variant.sku}>
								{variant.label} · {variant.sku} · {formatPrice(variant.priceCents)}
							</option>
						))}
					</select>
				</label>
			) : null}
			<label className="block text-sm">
				Quantity
				<input
					className={goodsFieldClass}
					type="number"
					min="1"
					max="2147483647"
					step="1"
					required
					value={quantity}
					disabled={busy}
					onChange={(event) => {
						changed()
						setQuantity(event.target.value)
					}}
				/>
			</label>
			<label className="block text-sm">
				Location
				<select
					aria-label="Location"
					className={goodsFieldClass}
					value={locationId}
					disabled={busy}
					onChange={(event) => {
						changed()
						setLocationId(event.target.value)
						setMethod('')
					}}>
					<option value="">Select Location</option>
					{listing.locations.map((item) => (
						<option key={item.id} value={item.id}>
							{item.label} · {item.city}
						</option>
					))}
				</select>
			</label>
			<label className="block text-sm">
				Fulfillment
				<select
					aria-label="Fulfillment"
					className={goodsFieldClass}
					value={method}
					disabled={busy || !configuration}
					onChange={(event) => {
						changed()
						setMethod(event.target.value as typeof method)
					}}>
					<option value="">Select fulfillment</option>
					{configuration?.pickupEnabled ? <option value="pickup">Pickup</option> : null}
					{configuration?.deliveryZones.length ? <option value="delivery">Vendor delivery</option> : null}
				</select>
			</label>
			{location && !configuration ? <p className="text-sm text-muted-foreground">Fulfillment is not configured at this Location.</p> : null}
			{configuration ? (
				<div className="space-y-2 text-sm text-muted-foreground">
					<p>
						{configuration.returnTemplate === 'flexible' ? '14' : '7'} calendar days for unused-goods returns from verified handoff. Fault
						protection: 30 days. No restocking fee.
					</p>
					{method === 'pickup' ? (
						<p>Collect within 72 hours of readiness, plus 48 hours grace.</p>
					) : method === 'delivery' ? (
						<>
							<p>Select delivery zone and address in Cart. Eligibility is checked with the quote.</p>
							{configuration.deliveryZones.map((zone) => (
								<p key={zone.id}>
									{zone.label}: {formatPrice(zone.feeCents)} delivery · minimum {formatPrice(zone.minimumCents)} · ETA {zone.etaMinutes}{' '}
									minutes{zone.freeDeliveryThresholdCents !== null ? ` · free from ${formatPrice(zone.freeDeliveryThresholdCents)}` : ''}
								</p>
							))}
						</>
					) : null}
				</div>
			) : null}
			<p className="font-semibold">{price === undefined ? 'Select variant for exact price' : `${formatPrice(price)} each`}</p>
			<p className="text-sm text-muted-foreground">Price and stock are checked again at checkout. Adding to Cart does not reserve stock.</p>
			<Button type="submit" disabled={busy}>
				{busy ? 'Checking stock…' : 'Add to Cart'}
			</Button>
			<p role="status" aria-live="polite" className="text-sm">
				{message}
			</p>
			{added ? (
				<div className="flex justify-center gap-5 text-sm">
					<Link href="/cart" className="underline underline-offset-4">
						View Cart
					</Link>
					<Link href="/search?kind=product" className="underline underline-offset-4">
						Continue shopping
					</Link>
				</div>
			) : null}
		</form>
	)
}
