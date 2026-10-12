'use client'

import {
	GoodsHoldReadSchema,
	GoodsHoldReleaseResultSchema,
	GoodsHoldResultSchema,
	GoodsQuoteCommandSchema,
	GoodsQuoteResultSchema,
	PublicListingDetailSchema,
} from 'contracts'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'

import { goodsFieldClass } from '@/components/product-selection'
import { Button } from '@/components/ui/button'
import { type CartLine, goodsRequest, GoodsRequestError, lineKey, readCart, writeCart } from '@/lib/goods-cart'
import { formatPrice } from '@/lib/marketplace'

type Quote = z.infer<typeof GoodsQuoteResultSchema>
type Hold = z.infer<typeof GoodsHoldReadSchema>
type Detail = z.infer<typeof PublicListingDetailSchema>
type DeliveryDraft = { zoneId: string; contactName: string; phone: string; locality: string; address: string; longitude: string; latitude: string }
const emptyDelivery = (): DeliveryDraft => ({ zoneId: '', contactName: '', phone: '', locality: '', address: '', longitude: '', latitude: '' })
const pendingKey = 'junction:goods-hold-pending:v1'
const PendingSchema = z.object({ quoteId: z.string().uuid(), key: z.string().uuid(), holdId: z.string().uuid().optional() })
export function GoodsCart() {
	const [lines, setLines] = useState<CartLine[] | null>(null)
	const [details, setDetails] = useState<Record<string, Detail>>({})
	const [delivery, setDelivery] = useState<Record<string, DeliveryDraft>>({})
	const [quote, setQuote] = useState<Quote | null>(null)
	const [hold, setHold] = useState<Hold | null>(null)
	const [pending, setPending] = useState<z.infer<typeof PendingSchema> | null>(null)
	const [message, setMessage] = useState('')
	const [busy, setBusy] = useState(false)
	const [now, setNow] = useState(0)
	const running = useRef(false)
	const quoteAttempt = useRef<{ body: unknown; key: string } | null>(null)
	useEffect(() => {
		try {
			setLines(readCart())
			const value = window.sessionStorage.getItem(pendingKey)
			if (value) setPending(PendingSchema.parse(JSON.parse(value)))
		} catch {
			setMessage('Saved Cart could not be read. Clear goods to start again.')
			setLines([])
		}
		const timer = window.setInterval(() => setNow(Date.now()), 1000)
		return () => window.clearInterval(timer)
	}, [])
	useEffect(() => {
		if (!lines?.length) return
		let current = true
		void Promise.all(
			[...new Set(lines.map((line) => line.listing.id))].map(
				async (id) => [id, await goodsRequest(`public/listings/${id}`, (data) => PublicListingDetailSchema.parse(data))] as const,
			),
		)
			.then((entries) => {
				if (current) setDetails(Object.fromEntries(entries))
			})
			.catch(() => {
				if (current) setMessage('Current product details could not be read. Your Cart is saved. Retry by refreshing this page.')
			})
		return () => {
			current = false
		}
	}, [lines])
	const groups = Object.values(
		(lines ?? []).reduce<Record<string, CartLine[]>>((all, line) => {
			;(all[line.listing.vendor.id] ??= []).push(line)
			return all
		}, {}),
	)
	const activeHold = hold?.state === 'holding' || hold?.state === 'awaiting_payment'
	const locked = busy || !!pending || activeHold
	function edit(next: CartLine[]) {
		try {
			writeCart(next)
			setLines(next)
			setQuote(null)
			setHold(null)
			quoteAttempt.current = null
			setMessage('')
		} catch {
			setMessage('Cart could not be saved. Your current selections are unchanged.')
		}
	}
	async function command(work: () => Promise<void>) {
		if (running.current) return
		running.current = true
		setBusy(true)
		setMessage('')
		try {
			await work()
		} catch (error) {
			if (error instanceof GoodsRequestError && error.status === 409 && !pending?.holdId) {
				remember(null)
				setQuote(null)
				quoteAttempt.current = null
			}
			setMessage(
				error instanceof z.ZodError
					? 'Complete the delivery details, including a valid zone and pin, then try again.'
					: error instanceof Error
						? error.message
						: 'Could not read the latest result. Try again.',
			)
		} finally {
			running.current = false
			setBusy(false)
		}
	}
	function remember(value: z.infer<typeof PendingSchema> | null) {
		if (value) window.sessionStorage.setItem(pendingKey, JSON.stringify(value))
		else window.sessionStorage.removeItem(pendingKey)
		setPending(value)
	}
	async function refreshHold(id: string) {
		const result = await goodsRequest(`customer/goods/holds/${id}`, (data) => GoodsHoldReadSchema.parse(data))
		setHold(result)
		if (result.state !== 'holding' && result.state !== 'awaiting_payment') {
			remember(null)
			setQuote(null)
			quoteAttempt.current = null
			setMessage(
				result.state === 'committed' ? 'Local payment confirmed. Goods Orders created.' : 'Hold ended. Your Cart is saved. Request a fresh quote.',
			)
		}
	}
	function quoteCart(event: React.FormEvent) {
		event.preventDefault()
		void command(async () => {
			if (quote && Date.parse(quote.expiresAt) <= Date.now()) quoteAttempt.current = null
			const body = GoodsQuoteCommandSchema.parse({
				groups: groups.map((group) => {
					const first = group[0]
					const draft = delivery[first.listing.vendor.id] ?? emptyDelivery()
					return {
						vendorId: first.listing.vendor.id,
						locationId: first.locationId,
						fulfillment:
							first.method === 'pickup'
								? { method: 'pickup' }
								: {
										method: 'delivery',
										zoneId: draft.zoneId,
										address: {
											contactName: draft.contactName,
											phone: draft.phone,
											locality: draft.locality,
											address: draft.address,
											point: [
												draft.longitude === '' ? NaN : Number(draft.longitude),
												draft.latitude === '' ? NaN : Number(draft.latitude),
											],
										},
									},
						lines: group.map((line) => ({ listingId: line.listing.id, sku: line.sku, quantity: line.quantity })),
					}
				}),
			})
			if (!quoteAttempt.current || JSON.stringify(quoteAttempt.current.body) !== JSON.stringify(body))
				quoteAttempt.current = { body, key: window.crypto.randomUUID() }
			const result = await goodsRequest('customer/goods/quotes', (data) => GoodsQuoteResultSchema.parse(data), body, quoteAttempt.current.key)
			setQuote(result)
			setMessage('Review current prices, delivery and policies before accepting the hold. Stock is not reserved yet.')
		})
	}
	async function accept() {
		const attempt = pending ?? (quote ? { quoteId: quote.quoteId, key: window.crypto.randomUUID() } : null)
		if (!attempt) return
		remember(attempt)
		if (attempt.holdId) {
			await refreshHold(attempt.holdId)
			return
		}
		const result = await goodsRequest('customer/goods/holds', (data) => GoodsHoldResultSchema.parse(data), { quoteId: attempt.quoteId }, attempt.key)
		remember({ ...attempt, holdId: result.holdId })
		await refreshHold(result.holdId)
	}
	if (lines === null) return <p role="status">Loading Cart…</p>
	return (
		<div className="space-y-8">
			<p className="text-sm text-muted-foreground">
				This Cart is saved in this browser. Prices and stock are checked at checkout. Delivery contact details are not saved.
			</p>
			{!lines.length ? (
				<div className="space-y-4">
					<p className="text-sm text-muted-foreground">No goods in Cart.</p>
					<div className="flex justify-center gap-5">
						<Link href="/search?kind=product" className="underline">
							Browse Products
						</Link>
						<Link href="/search?kind=service" className="underline">
							Browse Services
						</Link>
					</div>
				</div>
			) : (
				<form onSubmit={quoteCart} className="space-y-8">
					{groups.map((group) => {
						const first = group[0]
						const vendorId = first.listing.vendor.id
						const detail = details[first.listing.id]
						const location = detail?.locations.find((item) => item.id === first.locationId)
						const config = location?.goodsConfiguration
						return (
							<section key={vendorId} className="space-y-5 border-t pt-6" aria-label={first.listing.vendor.displayName}>
								<h2 className="text-xl font-semibold">{first.listing.vendor.displayName}</h2>
								<p className="text-sm">
									{first.locationLabel} · {first.method === 'pickup' ? 'Pickup' : 'Vendor delivery'}
								</p>
								<label className="block text-sm">
									Location
									<select
										className={goodsFieldClass}
										value={first.locationId}
										disabled={locked || !detail}
										onChange={(event) => {
											const selected = detail?.locations.find((item) => item.id === event.target.value)
											if (selected)
												edit(
													lines.map((line) =>
														line.listing.vendor.id === vendorId
															? { ...line, locationId: selected.id, locationLabel: selected.label }
															: line,
													),
												)
										}}>
										<option value={first.locationId}>{first.locationLabel}</option>
										{detail?.locations
											.filter((item) => item.id !== first.locationId)
											.map((item) => (
												<option key={item.id} value={item.id}>
													{item.label} · {item.city}
												</option>
											))}
									</select>
								</label>
								<label className="block text-sm">
									Fulfillment
									<select
										className={goodsFieldClass}
										value={first.method}
										disabled={locked || !config}
										onChange={(event) =>
											edit(
												lines.map((line) =>
													line.listing.vendor.id === vendorId ? { ...line, method: event.target.value as CartLine['method'] } : line,
												),
											)
										}>
										<option value="pickup" disabled={!config?.pickupEnabled}>
											Pickup
										</option>
										<option value="delivery" disabled={!config?.deliveryZones.length}>
											Vendor delivery
										</option>
									</select>
								</label>
								{group.map((line) => (
									<div key={lineKey(line)} className="grid items-center gap-3 border-b pb-5 sm:grid-cols-[1fr_8rem_auto]">
										<div>
											<Link href={`/listings/${line.listing.id}`} className="font-medium underline underline-offset-4">
												{line.listing.title}
											</Link>
											<p className="text-sm text-muted-foreground">
												{line.variantLabel ? `${line.variantLabel} · ${line.sku} · ` : ''}
												{formatPrice(line.unitPriceCents)} each (Cart price)
											</p>
										</div>
										<label className="text-sm">
											Quantity for {line.listing.title}
											<input
												className={goodsFieldClass}
												type="number"
												min="1"
												step="1"
												max="2147483647"
												value={line.quantity}
												disabled={locked}
												onChange={(event) => {
													const quantity = Number(event.target.value)
													if (Number.isInteger(quantity) && quantity > 0)
														edit(lines.map((item) => (lineKey(item) === lineKey(line) ? { ...item, quantity } : item)))
												}}
											/>
										</label>
										<Button
											type="button"
											variant="outline"
											disabled={locked}
											onClick={() => edit(lines.filter((item) => lineKey(item) !== lineKey(line)))}>
											Remove {line.listing.title}
										</Button>
									</div>
								))}
								{first.method === 'delivery' ? (
									<fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2">
										<legend className="mb-4 font-medium">Delivery address</legend>
										{(['zoneId', 'contactName', 'phone', 'locality', 'address', 'longitude', 'latitude'] as const).map((field) => {
											const draft = delivery[vendorId] ?? emptyDelivery()
											const labels = {
												zoneId: 'Delivery zone',
												contactName: 'Contact name',
												phone: 'Phone',
												locality: 'Locality',
												address: 'Address',
												longitude: 'Longitude',
												latitude: 'Latitude',
											}
											const change = (value: string) => {
												setDelivery((previous) => ({
													...previous,
													[vendorId]: { ...(previous[vendorId] ?? emptyDelivery()), [field]: value },
												}))
												setQuote(null)
												quoteAttempt.current = null
											}
											return (
												<label key={field} className="text-sm">
													{labels[field]}
													{field === 'zoneId' ? (
														<select
															required
															className={goodsFieldClass}
															value={draft[field]}
															onChange={(event) => change(event.target.value)}>
															<option value="">Select zone</option>
															{config?.deliveryZones.map((zone) => (
																<option key={zone.id} value={zone.id}>
																	{zone.label} · {formatPrice(zone.feeCents)} · ETA {zone.etaMinutes} minutes
																</option>
															))}
														</select>
													) : (
														<input
															required
															className={goodsFieldClass}
															value={draft[field]}
															type={field === 'latitude' || field === 'longitude' ? 'number' : 'text'}
															step="any"
															onChange={(event) => change(event.target.value)}
														/>
													)}
												</label>
											)
										})}
										<p className="text-sm text-muted-foreground sm:col-span-2">
											Use your delivery pin coordinates. The quote checks zone coverage, minimum spend and delivery fee.
										</p>
									</fieldset>
								) : null}
							</section>
						)
					})}
					<Button type="submit" disabled={locked}>
						{busy ? 'Checking…' : 'Continue to checkout'}
					</Button>
				</form>
			)}
			<p role="status" aria-live="polite" className="text-sm">
				{message}
			</p>
			{message.includes('Sign in') ? (
				<Link href="/account" className="inline-block underline">
					Sign in
				</Link>
			) : null}
			{quote && !pending && !activeHold ? (
				<section className="space-y-5 border-t pt-6" aria-label="Quote review">
					<h2 className="text-xl font-semibold">Review quote</h2>
					<p>Valid until {new Date(quote.expiresAt).toLocaleTimeString()}</p>
					{quote.snapshot.groups.map((group) => (
						<div key={group.vendorId} className="space-y-3">
							<h3 className="font-medium">{lines.find((line) => line.listing.vendor.id === group.vendorId)?.listing.vendor.displayName}</h3>
							{group.lines.map((line) => {
								const saved = lines.find((item) => item.listing.id === line.listingId && (item.sku ?? null) === line.sku)
								return (
									<div key={JSON.stringify([line.listingId, line.sku])}>
										<p>
											{saved?.listing.title} · {line.sku ?? 'Standard'} · {line.quantity} × {formatPrice(line.unitPriceCents)} ={' '}
											{formatPrice(line.subtotalCents)}
										</p>
										{saved?.unitPriceCents !== line.unitPriceCents ? (
											<p className="font-medium">Price changed from {formatPrice(saved?.unitPriceCents)}. Review the current price.</p>
										) : null}
										<p className="text-sm text-muted-foreground">
											Unused-goods returns: {line.policy.changeOfMindDays} calendar days from verified handoff. Fault protection:{' '}
											{line.policy.faultProtectionDays} days. No restocking fee.
										</p>
									</div>
								)
							})}
							<p>Delivery fee: {formatPrice(group.deliveryFeeCents)}</p>
							<p className="text-sm">
								{group.fulfillment.method === 'pickup'
									? 'Pickup: 72 hours after readiness plus 48 hours grace.'
									: `Delivery: ${group.deliveryZone?.label} · ETA ${group.etaMinutes} minutes · one corrected failed-delivery retry within 48 hours.`}
							</p>
						</div>
					))}
					<p className="text-xl font-semibold">Total: {formatPrice(quote.snapshot.totalCents)}</p>
					<p className="text-sm text-muted-foreground">Accepting reserves all items for 15 minutes. Payment is not available yet.</p>
					<Button disabled={busy || now >= Date.parse(quote.expiresAt)} onClick={() => void command(accept)}>
						Accept quote and hold stock
					</Button>
					{now >= Date.parse(quote.expiresAt) ? <p>Quote expired. Continue to checkout for a fresh quote.</p> : null}
				</section>
			) : null}
			{pending ? (
				<section className="space-y-4 border-t pt-6" aria-label="Hold status">
					<h2 className="text-xl font-semibold">
						{hold?.state === 'awaiting_payment' ? 'Awaiting payment' : hold?.state === 'holding' ? 'Stock held' : 'Checking hold status'}
					</h2>
					{hold ? (
						<>
							<p>Hold expires at {new Date(hold.expiresAt).toLocaleTimeString()}.</p>
							<p>
								{now >= Date.parse(hold.expiresAt)
									? 'Deadline reached. Refresh to confirm the checkout outcome.'
									: hold.state === 'awaiting_payment'
										? 'Payment is pending. Refresh status before changing this Cart.'
										: 'Payment is not available yet.'}
							</p>
						</>
					) : (
						<p>Do not start another hold. Retry checks the original request.</p>
					)}
					<div className="flex flex-wrap justify-center gap-3">
						<Button disabled={busy} onClick={() => void command(accept)}>
							{pending.holdId ? 'Refresh hold status' : 'Retry original hold request'}
						</Button>
						{pending.holdId ? (
							<Button
								variant="outline"
								disabled={busy}
								onClick={() =>
									void command(async () => {
										await goodsRequest(
											`customer/goods/holds/${pending.holdId}/release`,
											(data) => GoodsHoldReleaseResultSchema.parse(data),
											{},
											`release:${pending.holdId}`,
										)
										if (pending.holdId) await refreshHold(pending.holdId)
									})
								}>
								Release hold
							</Button>
						) : null}
					</div>
				</section>
			) : null}
			{!locked && !lines.length ? (
				<Button variant="outline" onClick={() => edit([])}>
					Clear goods
				</Button>
			) : null}
		</div>
	)
}
