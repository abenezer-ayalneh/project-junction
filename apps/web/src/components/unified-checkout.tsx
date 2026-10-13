'use client'

import {
	AccessContextResponseSchema,
	CheckoutEligibilitySchema,
	MixedCartMergeResultSchema,
	MixedCartReadSchema,
	type MixedCartSelection,
	MixedCartSelectionSchema,
	MixedCartWriteResultSchema,
	MixedCurrentHoldSchema,
	MixedCurrentPaymentSchema,
	MixedHoldReleaseResultSchema,
	MixedHoldResultSchema,
	MixedPaymentResultSchema,
	MixedQuoteResultSchema,
	PromotionReadSchema,
	PublicListingDetailSchema,
} from 'contracts'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'

import { AppointmentIntents } from '@/components/appointment-intents'
import { CheckoutReview } from '@/components/checkout-review'
import { GoodsCart } from '@/components/goods-cart'
import { goodsFieldClass } from '@/components/product-selection'
import { Button } from '@/components/ui/button'
import { readAppointmentIntents, writeAppointmentIntents } from '@/lib/appointment-intents'
import { readCart, writeCart } from '@/lib/goods-cart'
import { formatPrice } from '@/lib/marketplace'
import { acceptCurrentPrices, CheckoutError, checkoutRequest as request } from '@/lib/mixed-checkout'
import { isLocalDevelopment } from '@/lib/runtime-label'

type Cart = z.infer<typeof MixedCartReadSchema>
type Preview = z.infer<typeof MixedCartMergeResultSchema>
type Quote = z.infer<typeof MixedQuoteResultSchema>
type Hold = z.infer<typeof MixedHoldResultSchema>
type Payment = z.infer<typeof MixedPaymentResultSchema>
const PendingSchema = z.object({ scope: z.string(), kind: z.enum(['hold', 'payment']), referenceId: z.string().uuid(), key: z.string().uuid() })
type Pending = z.infer<typeof PendingSchema>
const pendingKey = 'junction:mixed-checkout-pending:v1'
const empty: MixedCartSelection = { goodsGroups: [], bookings: [] }
export function UnifiedCheckout() {
	const [verification, setVerification] = useState('unverified')
	const [canReserve, setCanReserve] = useState(false)
	const [details, setDetails] = useState<Record<string, z.infer<typeof PublicListingDetailSchema>>>({})
	const [cart, setCart] = useState<Cart | null>(null)
	const [preview, setPreview] = useState<Preview | null>(null)
	const [quote, setQuote] = useState<Quote | null>(null)
	const [hold, setHold] = useState<Hold | null>(null)
	const [payment, setPayment] = useState<Payment | null>(null)
	const [pending, setPending] = useState<Pending | null>(null)
	const [busy, setBusy] = useState(false)
	const [ready, setReady] = useState(false)
	const [message, setMessage] = useState('')
	const [online, setOnline] = useState(true)
	const [now, setNow] = useState(0)
	const [coupon, setCoupon] = useState('')
	const [couponVendor, setCouponVendor] = useState('')
	const scope = useRef('')
	const running = useRef(false)
	const writeAttempt = useRef<{ body: unknown; key: string } | null>(null)
	const importSource = useRef<{ goods: ReturnType<typeof readCart>; appointments: ReturnType<typeof readAppointmentIntents> } | null>(null)
	const remember = useCallback((value: Pending | null) => {
		if (value) sessionStorage.setItem(pendingKey, JSON.stringify(value))
		else sessionStorage.removeItem(pendingKey)
		setPending(value)
	}, [])
	const recover = useCallback(async () => {
		const context = await request('access-context', (v) => AccessContextResponseSchema.parse(v))
		const nextScope = `${context.actor.userId}:${context.workspaceId}`
		if (scope.current && scope.current !== nextScope) {
			setPreview(null)
			setQuote(null)
			writeAttempt.current = null
			importSource.current = null
		}
		scope.current = nextScope
		const identity = await request('customer/checkout/eligibility', (v) => CheckoutEligibilitySchema.parse(v))
		setVerification(identity.status)
		setCanReserve(identity.canReserve)
		const c = await request('customer/cart', (v) => MixedCartReadSchema.parse(v))
		const p = await request('customer/checkout/payments/current', (v) => MixedCurrentPaymentSchema.parse(v))
		const h = await request('customer/checkout/holds/current', (v) => MixedCurrentHoldSchema.parse(v))
		setCart(c)
		setHold(h.hold ? { ...h.hold, replayed: true } : null)
		setPayment(p.payment ? { ...p.payment, replayed: true } : null)
		let saved: Pending | null = null
		try {
			const raw = sessionStorage.getItem(pendingKey)
			saved = raw ? PendingSchema.parse(JSON.parse(raw)) : null
		} catch {
			/* Authoritative recovery still succeeds without a readable local marker. */
		}
		if (saved && saved.scope !== nextScope) saved = null
		if (saved?.kind === 'hold' && h.hold?.quoteId === saved.referenceId) saved = null
		if (saved?.kind === 'payment' && p.payment?.holdId === saved.referenceId) saved = null
		remember(saved)
		setReady(true)
	}, [remember])
	const run = useCallback(async (work: () => Promise<void>) => {
		if (running.current) return
		running.current = true
		setBusy(true)
		setMessage('')
		try {
			await work()
		} catch (error) {
			if (error instanceof CheckoutError && (error.status === 401 || error.status === 403)) {
				setQuote(null)
				setPreview(null)
				if (error.status === 401) {
					setCart(null)
					setHold(null)
					setPayment(null)
					setReady(false)
				}
			}
			setMessage(
				error instanceof z.ZodError
					? 'Review required delivery details and keep no more than five appointments.'
					: error instanceof Error
						? error.message
						: 'Could not read checkout. Refresh status before retrying.',
			)
		} finally {
			running.current = false
			setBusy(false)
		}
	}, [])
	useEffect(() => {
		void run(recover)
		const network = () => {
			setOnline(navigator.onLine)
			setQuote(null)
			setPreview(null)
		}
		setOnline(navigator.onLine)
		setNow(Date.now())
		window.addEventListener('online', network)
		window.addEventListener('offline', network)
		const timer = window.setInterval(() => setNow(Date.now()), 1000)
		return () => {
			clearInterval(timer)
			window.removeEventListener('online', network)
			window.removeEventListener('offline', network)
		}
	}, [recover, run])
	useEffect(() => {
		let current = true
		const ids = [
			...new Set([
				...(cart?.selection.goodsGroups.flatMap((g) => g.lines.map((l) => l.listingId)) ?? []),
				...(cart?.selection.bookings.map((b) => b.selection.listingId) ?? []),
			]),
		]
		void Promise.all(
			ids.map(async (id) => {
				try {
					return [id, await request(`public/listings/${id}`, (v) => PublicListingDetailSchema.parse(v))] as const
				} catch {
					return null
				}
			}),
		).then((values) => {
			if (current) setDetails(Object.fromEntries(values.filter((v) => v !== null)))
		})
		return () => {
			current = false
		}
	}, [cart])
	const uncertain = payment && ['pending_provider', 'unknown', 'refund_pending'].includes(payment.state)
	const active = hold?.state === 'holding'
	const locked = busy || !!pending || active || !!uncertain
	const consumeImported = () => {
		const source = importSource.current
		if (!source) return
		// Only remove the exact reviewed browser snapshot; another tab's additions survive.
		if (JSON.stringify(readCart()) === JSON.stringify(source.goods)) writeCart([])
		if (JSON.stringify(readAppointmentIntents()) === JSON.stringify(source.appointments)) writeAppointmentIntents([])
		importSource.current = null
	}
	const previewBrowser = useCallback(
		async (goodsGroups: MixedCartSelection['goodsGroups']) => {
			await run(async () => {
				await recover()
				const c = await request('customer/cart', (v) => MixedCartReadSchema.parse(v))
				const appointments = readAppointmentIntents()
				const incoming = MixedCartSelectionSchema.parse({
					goodsGroups,
					bookings: appointments.map((i) => ({ intentId: i.id, quantity: 1, selection: i.command, expectedPriceCents: i.priceCents })),
				})
				importSource.current = { goods: readCart(), appointments }
				setPreview(await request('customer/cart/merge-preview', (v) => MixedCartMergeResultSchema.parse(v), { expectedVersion: c.version, incoming }))
				setQuote(null)
			})
		},
		[recover, run],
	)
	async function save(selection: MixedCartSelection, version: number, imported = false) {
		const body = { expectedVersion: version, selection: MixedCartSelectionSchema.parse(selection) }
		if (!writeAttempt.current || JSON.stringify(writeAttempt.current.body) !== JSON.stringify(body))
			writeAttempt.current = { body, key: crypto.randomUUID() }
		const result = await request('customer/cart', (v) => MixedCartWriteResultSchema.parse(v), body, writeAttempt.current.key, 'PUT')
		setCart(result)
		setHold(null)
		setPayment(null)
		setPreview(null)
		setQuote(null)
		writeAttempt.current = null
		if (imported) consumeImported()
		setMessage('Cart saved. Review a current quote before reserving.')
	}
	async function quoteCart() {
		if (!cart?.cartId) return
		setQuote(
			await request(
				'customer/checkout/quotes',
				(v) => MixedQuoteResultSchema.parse(v),
				{ cartId: cart.cartId, expectedVersion: cart.version },
				crypto.randomUUID(),
			),
		)
		setPreview(null)
	}
	async function submitPending(attempt: Pending) {
		if (attempt.scope !== scope.current) throw new Error('Account changed. Refresh checkout status.')
		remember(attempt)
		try {
			if (attempt.kind === 'hold') {
				setHold(await request('customer/checkout/holds', (v) => MixedHoldResultSchema.parse(v), { quoteId: attempt.referenceId }, attempt.key))
				setPayment(null)
				setQuote(null)
			} else
				setPayment(await request('customer/checkout/payments', (v) => MixedPaymentResultSchema.parse(v), { holdId: attempt.referenceId }, attempt.key))
			remember(null)
		} catch (error) {
			if (error instanceof CheckoutError && [400, 401, 403, 409].includes(error.status)) {
				remember(null)
				setQuote(null)
				await recover()
			}
			throw error
		}
	}
	const conflicts = preview ? [...preview.conflicts, ...preview.reviews.flatMap((r) => r.conflicts)] : (quote?.snapshot.conflicts ?? [])
	const snapshot = hold?.state === 'holding' ? hold.snapshot : quote?.snapshot
	const deadline = hold?.expiresAt
	const seconds = deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000)) : 0
	return (
		<div className="grid gap-10 text-center lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
			<div className="min-w-0 space-y-8">
				<p className="text-sm text-muted-foreground">Browser selections are unreserved. Sign in to review and merge them with your account Cart.</p>
				<AppointmentIntents locked={locked} />
				<section className="border-t pt-6 space-y-4" aria-label="Browser goods">
					<h2 className="text-xl font-semibold">Goods</h2>
					<GoodsCart onCheckout={previewBrowser} checkoutLocked={locked || !online} />
				</section>
			</div>
			<section className="min-w-0 space-y-5" aria-label="Unified checkout">
				<h2 className="text-2xl font-semibold">Checkout</h2>
				<p className="text-sm">One sandbox payment covers all Vendor goods and up to five independent appointments.</p>
				<p className="text-sm text-muted-foreground">
					{isLocalDevelopment
						? 'Local development defers MFA and Didit. Accounts remain adult-unverified; holds and payment require verified adult identity. These controls must be restored before public release.'
						: 'Checkout requires an eligible account and verified adult identity. Complete the required account verification before payment.'}
				</p>
				<p>Adult identity: {verification}.</p>
				<Link href="/account" className="inline-block underline">
					Account and sign-in
				</Link>
				{!online ? <p role="status">You are offline. Reconnect and refresh checkout status. No payment outcome is confirmed by this page.</p> : null}
				<p role="status" aria-live="polite">
					{message}
				</p>
				<Button
					variant="outline"
					disabled={busy || !online}
					onClick={() =>
						void run(async () => {
							await recover()
							setQuote(null)
							setPreview(null)
							setMessage('Checkout status refreshed.')
						})
					}>
					Refresh checkout status
				</Button>
				{preview && !active && !pending ? (
					<section className="space-y-4 border-t pt-5" aria-label="Merge review">
						<h3 className="text-lg font-semibold">Review Cart merge</h3>
						<p>No changes have been saved.</p>
						{preview.reviews.map((review, index) => (
							<CheckoutReview key={index} snapshot={review} />
						))}
						{preview.matches.map((match, index) => (
							<p key={index}>
								Matching {match.kind === 'goods' ? 'Product' : 'appointment'}: saved {match.previousQuantity}, incoming {match.incomingQuantity}
								, proposed {match.proposedQuantity}.
							</p>
						))}
						<p>
							{preview.proposed?.goodsGroups.length ?? 0} Vendor goods groups · {preview.proposed?.bookings.length ?? 0} appointments after merge.
						</p>
						<div className="flex flex-wrap justify-center gap-3">
							<Button
								disabled={busy || !online || !preview.proposed}
								onClick={() =>
									void run(async () => {
										if (preview.proposed) await save(preview.proposed, preview.cart.version, true)
									})
								}>
								Save merged Cart
							</Button>
							<Button
								variant="outline"
								disabled={busy || !online}
								onClick={() =>
									void run(async () => {
										await save(preview.incoming, preview.cart.version, true)
									})
								}>
								Replace account Cart with browser selections
							</Button>
							<Button
								variant="outline"
								disabled={busy}
								onClick={() => {
									setPreview(null)
									importSource.current = null
								}}>
								Keep account Cart
							</Button>
						</div>
						<p className="text-sm">
							Replacing removes the previous account selections. Keeping the account Cart leaves browser selections unchanged.
						</p>
					</section>
				) : null}
				{conflicts.length ? (
					<section className="space-y-3" aria-label="Checkout conflicts">
						<h3 className="font-semibold">Resolve selections</h3>
						<ul className="space-y-3">
							{conflicts.map((c, i) => (
								<li key={i}>
									<p>{c.message}</p>
									{c.currentPriceCents !== null ? (
										<p>
											Saved: {formatPrice(c.expectedPriceCents ?? undefined)} · Current: {formatPrice(c.currentPriceCents)}
										</p>
									) : null}
									{c.listingId ? (
										<Link href={`/listings/${c.listingId}`} className="underline">
											Review listing
										</Link>
									) : null}
								</li>
							))}
						</ul>
						{quote && cart && conflicts.some((c) => c.code === 'price_changed') ? (
							<Button
								disabled={locked || !online}
								onClick={() => void run(() => save(acceptCurrentPrices(cart.selection, conflicts), cart.version))}>
								Accept displayed current prices
							</Button>
						) : null}
					</section>
				) : null}
				{cart && !active && !pending && !uncertain && !preview ? (
					<section className="space-y-4 border-t pt-5" aria-label="Account Cart">
						<h3 className="text-lg font-semibold">Account Cart</h3>
						{!cart.selection.goodsGroups.length && !cart.selection.bookings.length ? (
							<p>Your account Cart is empty. Add Products or appointments, then continue to checkout.</p>
						) : null}
						{cart.selection.goodsGroups.map((group) => (
							<div key={group.vendorId} className="space-y-2">
								<p className="break-words">
									{details[group.lines[0]?.listingId]?.vendor.displayName ?? 'Vendor'} · {group.fulfillment.method}
								</p>
								{group.lines.map((line) => (
									<div key={`${line.listingId}:${line.sku}`} className="space-y-2">
										<Link className="underline" href={`/listings/${line.listingId}`}>
											{details[line.listingId]?.title ?? 'Product'} · {line.sku ?? 'Standard'}
										</Link>
										<p>
											{line.quantity} × {formatPrice(line.expectedUnitPriceCents)}
										</p>
										<label className="block text-sm">
											Quantity for {details[line.listingId]?.title ?? 'saved Product'}
											<input
												type="number"
												min="1"
												max="2147483647"
												step="1"
												className={goodsFieldClass}
												defaultValue={line.quantity}
												key={`${cart.version}:${line.listingId}:${line.sku}`}
												disabled={locked || !online}
												onBlur={(event) => {
													const quantity = Number(event.target.value)
													if (Number.isInteger(quantity) && quantity > 0 && quantity <= 2147483647 && quantity !== line.quantity)
														void run(() =>
															save(
																{
																	...cart.selection,
																	goodsGroups: cart.selection.goodsGroups.map((g) =>
																		g !== group
																			? g
																			: { ...g, lines: g.lines.map((l) => (l !== line ? l : { ...l, quantity })) },
																	),
																},
																cart.version,
															),
														)
												}}
											/>
										</label>
										<Button
											variant="outline"
											disabled={locked || !online}
											onClick={() =>
												void run(() =>
													save(
														{
															...cart.selection,
															goodsGroups: cart.selection.goodsGroups
																.map((g) => (g !== group ? g : { ...g, lines: g.lines.filter((l) => l !== line) }))
																.filter((g) => g.lines.length),
														},
														cart.version,
													),
												)
											}>
											Remove saved Product
										</Button>
									</div>
								))}
							</div>
						))}
						{cart.selection.bookings.map((b) => (
							<div key={b.intentId} className="space-y-2">
								<Link className="underline" href={`/listings/${b.selection.listingId}`}>
									{details[b.selection.listingId]?.title ?? 'Appointment'} · {new Date(b.selection.start).toLocaleString()} (your local time)
								</Link>
								<p>Quantity 1 · {formatPrice(b.expectedPriceCents)}</p>
								<Button
									variant="outline"
									disabled={locked || !online}
									onClick={() =>
										void run(() => save({ ...cart.selection, bookings: cart.selection.bookings.filter((i) => i !== b) }, cart.version))
									}>
									Remove saved appointment
								</Button>
							</div>
						))}
						{cart.selection.goodsGroups.length || cart.selection.bookings.length ? (
							<>
								<label className="block text-sm">
									Coupon Vendor
									<select
										className={goodsFieldClass}
										value={couponVendor}
										onChange={(e) => setCouponVendor(e.target.value)}
										disabled={locked}>
										<option value="">Select Vendor</option>
										{[
											...new Set([
												...cart.selection.goodsGroups.map((g) => g.vendorId),
												...cart.selection.bookings.flatMap((b) =>
													details[b.selection.listingId] ? [details[b.selection.listingId].vendor.id] : [],
												),
											]),
										].map((id) => (
											<option key={id} value={id}>
												{Object.values(details).find((d) => d.vendor.id === id)?.vendor.displayName ?? id}
											</option>
										))}
									</select>
								</label>
								<label className="block text-sm">
									Vendor coupon
									<input
										className={goodsFieldClass}
										value={coupon}
										maxLength={40}
										disabled={locked}
										onChange={(e) => setCoupon(e.target.value)}
									/>
								</label>
								<Button
									variant="outline"
									disabled={locked || !online || !couponVendor || !coupon.trim()}
									onClick={() =>
										void run(async () => {
											const promotion = await request('customer/promotions/coupon', (v) => PromotionReadSchema.parse(v), {
												vendorId: couponVendor,
												code: coupon.trim(),
											})
											await save(
												{
													...cart.selection,
													promotions: {
														vendorCouponId: promotion.promotionId,
														platformCampaignId: cart.selection.promotions?.platformCampaignId ?? null,
													},
												},
												cart.version,
											)
										})
									}>
									Apply Vendor coupon
								</Button>
								{cart.selection.promotions ? (
									<Button
										variant="outline"
										disabled={locked || !online}
										onClick={() =>
											void run(() =>
												save({ ...cart.selection, promotions: { vendorCouponId: null, platformCampaignId: null } }, cart.version),
											)
										}>
										Remove promotions
									</Button>
								) : null}
								<Button disabled={locked || !online} onClick={() => void run(quoteCart)}>
									Review current quote
								</Button>
								<Button variant="outline" disabled={locked || !online} onClick={() => void run(() => save(empty, cart.version))}>
									Clear account Cart
								</Button>
							</>
						) : null}
					</section>
				) : null}
				{snapshot ? <CheckoutReview snapshot={snapshot} /> : null}
				{quote && !active && !pending ? (
					<div className="space-y-3">
						<p>Quote valid until {new Date(quote.expiresAt).toLocaleTimeString()}. Nothing is reserved.</p>
						<Button
							disabled={locked || !online || !canReserve || quote.state !== 'ready' || now >= Date.parse(quote.expiresAt)}
							onClick={() =>
								void run(() => submitPending({ scope: scope.current, kind: 'hold', referenceId: quote.quoteId, key: crypto.randomUUID() }))
							}>
							Accept quote and reserve all for 15 minutes
						</Button>
						{now >= Date.parse(quote.expiresAt) ? <p>Quote expired. Request a fresh quote.</p> : null}
					</div>
				) : null}
				{hold ? (
					<section className="space-y-4 border-t pt-5" aria-label="Coordinated hold">
						<h3 className="text-lg font-semibold">{active ? 'All selections held' : `Hold ${hold.state}`}</h3>
						<p>Original deadline: {new Date(hold.expiresAt).toLocaleString()}</p>
						{active ? (
							<>
								<p className="tabular-nums">
									{seconds
										? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} remaining`
										: 'Deadline reached. Refresh status to confirm release or payment outcome.'}
								</p>
								{!payment && !pending ? (
									<Button
										disabled={busy || !online || seconds === 0 || !canReserve}
										onClick={() =>
											void run(() =>
												submitPending({ scope: scope.current, kind: 'payment', referenceId: hold.holdId, key: crypto.randomUUID() }),
											)
										}>
										Pay {formatPrice(hold.snapshot.total?.minorUnits)} · sandbox
									</Button>
								) : null}
								<Button
									variant="outline"
									disabled={busy || !online || !!pending}
									onClick={() =>
										void run(async () => {
											await request(
												`customer/checkout/holds/${hold.holdId}/release`,
												(v) => MixedHoldReleaseResultSchema.parse(v),
												{},
												`release:${hold.holdId}`,
											)
											await recover()
											setQuote(null)
										})
									}>
									Abandon entire checkout
								</Button>
								<p className="text-sm">
									Abandoning releases all reservations. A late successful payment is refunded; refresh until its outcome is known.
								</p>
							</>
						) : (
							<p>Your account selections are saved. Review a fresh quote when the payment outcome is resolved.</p>
						)}
					</section>
				) : null}
				{pending ? (
					<div className="space-y-3">
						<p>Checking {pending.kind} status. Do not start another checkout.</p>
						<Button disabled={busy || !online || !ready} onClick={() => void run(() => submitPending(pending))}>
							Retry original {pending.kind} request
						</Button>
					</div>
				) : null}
				{payment ? (
					<section className="space-y-4 border-t pt-5" aria-label="Payment outcome">
						<h3 className="text-lg font-semibold">
							{['pending_provider', 'unknown'].includes(payment.state)
								? 'Checking payment status'
								: payment.state === 'refund_pending'
									? 'Refund pending'
									: payment.state === 'refunded'
										? 'Payment refunded'
										: payment.purchaseId
											? 'Purchase confirmed'
											: payment.state === 'failed'
												? 'Payment failed'
												: 'Checking Purchase status'}
						</h3>
						<p className="break-words">Payment reference: {payment.paymentId}</p>
						{payment.purchaseId ? (
							<Link className="inline-block underline" href={`/purchases/${payment.purchaseId}`}>
								View Purchase and non-tax receipt
							</Link>
						) : (
							<p>No Purchase is confirmed. Refresh checkout status to check the authoritative outcome.</p>
						)}
						{uncertain ? <p>Keep this reference for support. Refresh this attempt; do not submit another payment.</p> : null}
						{isLocalDevelopment && ['pending_provider', 'unknown'].includes(payment.state) ? (
							<fieldset className="space-y-3" disabled={busy || !online}>
								<legend className="w-full text-sm font-medium">Local sandbox result</legend>
								<p className="text-sm">Records a controlled provider result. Confirmation appears only after server processing.</p>
								<div className="flex flex-wrap justify-center gap-3">
									{(['unknown', 'succeeded', 'failed'] as const).map((outcome) => (
										<Button
											key={outcome}
											variant="outline"
											onClick={() =>
												void run(async () => {
													await request(
														`customer/checkout/payments/${payment.paymentId}/local-result`,
														(v) => MixedPaymentResultSchema.parse(v),
														{ outcome },
														`${payment.paymentId}:${outcome}`,
													)
													await recover()
												})
											}>
											{outcome === 'unknown' ? 'Simulate timeout' : outcome === 'succeeded' ? 'Simulate success' : 'Simulate failure'}
										</Button>
									))}
								</div>
							</fieldset>
						) : null}
					</section>
				) : null}
			</section>
		</div>
	)
}
