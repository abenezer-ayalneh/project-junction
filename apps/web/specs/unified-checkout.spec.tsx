import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { type MixedCartSelection } from 'contracts'

import { UnifiedCheckout } from '../src/components/unified-checkout'
import { acceptCurrentPrices } from '../src/lib/mixed-checkout'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const snapshot = {
	evaluatedAt: new Date().toISOString(),
	goods: [],
	bookings: [],
	total: { currency: 'ETB', minorUnits: 1000 },
	conflicts: [],
	reserved: false,
	promotion: null,
	commission: null,
}
const selection: MixedCartSelection = {
	goodsGroups: [
		{ vendorId: id(2), locationId: id(3), fulfillment: { method: 'pickup' }, lines: [{ listingId: id(4), quantity: 1, expectedUnitPriceCents: 1000 }] },
	],
	bookings: [],
}
const cart = { cartId: id(1), version: 1, selection }
const hold = {
	holdId: id(5),
	quoteId: id(6),
	cartId: id(1),
	state: 'holding',
	createdAt: new Date().toISOString(),
	expiresAt: new Date(Date.now() + 600000).toISOString(),
	reserved: true,
	snapshot,
}
const payment = {
	paymentId: id(7),
	purchaseId: null,
	holdId: id(5),
	holdState: 'holding',
	state: 'unknown',
	provider: 'local-controlled',
	sandbox: true,
	amount: { currency: 'ETB', minorUnits: 1000 },
	createdAt: new Date().toISOString(),
	expiresAt: hold.expiresAt,
	commitmentReady: false,
	refundState: null,
}
let currentHold: unknown = null
let currentPayment: unknown = null
let verification = 'verified'
let handler: (path: string, init?: globalThis.RequestInit) => unknown
const originalFetch = globalThis.fetch
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response
beforeEach(() => {
	localStorage.clear()
	sessionStorage.clear()
	currentHold = null
	currentPayment = null
	verification = 'verified'
	handler = () => undefined
	globalThis.fetch = jest.fn(async (input, init) => {
		const path = String(input)
		const custom = handler(path, init)
		if (custom !== undefined) return (await custom) as Response
		if (path.endsWith('/access-context'))
			return response({ actor: { kind: 'user', userId: id(8) }, workspaceId: id(9), activeVendorId: null, locationIds: [], capabilities: [] })
		if (path.endsWith('/checkout/eligibility'))
			return response({ status: verification, canReserve: verification === 'verified', verificationDeferred: true })
		if (path.endsWith('/customer/cart')) return response(cart)
		if (path.endsWith('/holds/current')) return response({ hold: currentHold })
		if (path.endsWith('/payments/current')) return response({ payment: currentPayment })
		return response({}, 404)
	})
})
afterEach(() => {
	globalThis.fetch = originalFetch
})
it('recovers an unknown attempt and never offers a second payment', async () => {
	currentHold = hold
	currentPayment = payment
	render(<UnifiedCheckout />)
	await screen.findByRole('heading', { name: 'Checking payment status' })
	expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull()
	expect(screen.queryByText('Purchase confirmed')).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Refresh checkout status' }))
	await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith('/v1/customer/checkout/payments/current', expect.anything()))
	expect((globalThis.fetch as jest.Mock).mock.calls.every(([, init]) => !init.method)).toBe(true)
})
it('recovers a committed Purchase only from the server reference', async () => {
	currentHold = { ...hold, state: 'committed', reserved: false }
	currentPayment = { ...payment, state: 'succeeded', holdState: 'committed', purchaseId: id(10) }
	render(<UnifiedCheckout />)
	await screen.findByRole('heading', { name: 'Purchase confirmed' })
	expect(screen.getByRole('link', { name: 'View Purchase and non-tax receipt' }).getAttribute('href')).toBe(`/purchases/${id(10)}`)
})
it('keeps a lost hold request identity across retry and disables duplicate checkout', async () => {
	let calls = 0
	const keys: string[] = []
	handler = (path, init) => {
		if (path.endsWith('/checkout/quotes'))
			return response({ quoteId: id(6), cartId: id(1), cartVersion: 1, state: 'ready', expiresAt: hold.expiresAt, snapshot, replayed: false })
		if (path.endsWith('/checkout/holds')) {
			keys.push((init?.headers as Record<string, string>)['Idempotency-Key'])
			if (++calls === 1) return Promise.reject(new Error('Lost response'))
			return response({ ...hold, replayed: true })
		}
		return undefined
	}
	render(<UnifiedCheckout />)
	fireEvent.click(await screen.findByRole('button', { name: 'Review current quote' }))
	fireEvent.click(await screen.findByRole('button', { name: 'Accept quote and reserve all for 15 minutes' }))
	await screen.findByText('Lost response')
	expect(screen.queryByRole('button', { name: 'Accept quote and reserve all for 15 minutes' })).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Retry original hold request' }))
	await screen.findByRole('heading', { name: 'All selections held' })
	expect(keys).toHaveLength(2)
	expect(keys[0]).toBe(keys[1])
})
it('does not enable payment for an unverified adult account', async () => {
	verification = 'unverified'
	currentHold = hold
	render(<UnifiedCheckout />)
	const button = await screen.findByRole('button', { name: /^Pay / })
	expect((button as globalThis.HTMLButtonElement).disabled).toBe(true)
	expect(screen.getByText('Adult identity: unverified.')).toBeTruthy()
})
it('uses the original deadline to disable expired payment without claiming server expiry', async () => {
	currentHold = { ...hold, expiresAt: new Date(Date.now() - 1000).toISOString() }
	render(<UnifiedCheckout />)
	const button = await screen.findByRole('button', { name: /^Pay / })
	expect((button as globalThis.HTMLButtonElement).disabled).toBe(true)
	expect(screen.getByText(/Deadline reached/)).toBeTruthy()
	expect(screen.queryByRole('heading', { name: 'Hold expired' })).toBeNull()
})
it('requires explicit merge confirmation before saving browser selections', async () => {
	handler = (path) =>
		path.endsWith('/merge-preview')
			? response({
					cart,
					incoming: { goodsGroups: [], bookings: [] },
					proposed: selection,
					matches: [],
					conflicts: [],
					reviews: [snapshot],
					persisted: false,
				})
			: undefined
	render(<UnifiedCheckout />)
	await screen.findByRole('button', { name: 'Review current quote' })
	fireEvent.click(screen.getByRole('button', { name: 'Continue to checkout' }))
	await screen.findByRole('heading', { name: 'Review Cart merge' })
	expect((globalThis.fetch as jest.Mock).mock.calls.some(([, init]) => init.method === 'PUT')).toBe(false)
})
it('updates only the explicitly identified current price', () => {
	const updated = acceptCurrentPrices(selection, [
		{
			kind: 'goods',
			referenceId: null,
			listingId: id(4),
			sku: null,
			code: 'price_changed',
			message: 'Price changed',
			expectedPriceCents: 1000,
			currentPriceCents: 1500,
		},
	])
	expect(updated.goodsGroups[0].lines[0].expectedUnitPriceCents).toBe(1500)
	expect(selection.goodsGroups[0].lines[0].expectedUnitPriceCents).toBe(1000)
})
it('does not infer a Purchase from succeeded payment without a Purchase reference', async () => {
	currentHold = hold
	currentPayment = { ...payment, state: 'succeeded' }
	render(<UnifiedCheckout />)
	await screen.findByRole('heading', { name: 'Checking Purchase status' })
	expect(screen.queryByRole('link', { name: 'View Purchase and non-tax receipt' })).toBeNull()
	expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull()
})
it('recovers a lost payment response on refresh without posting another payment', async () => {
	currentHold = hold
	let starts = 0
	handler = (path, init) => {
		if (path.endsWith('/checkout/payments') && init?.method === 'POST') {
			starts++
			currentPayment = payment
			return Promise.reject(new Error('Lost payment response'))
		}
		return undefined
	}
	render(<UnifiedCheckout />)
	fireEvent.click(await screen.findByRole('button', { name: /^Pay / }))
	await screen.findByText('Lost payment response')
	fireEvent.click(screen.getByRole('button', { name: 'Refresh checkout status' }))
	await screen.findByRole('heading', { name: 'Checking payment status' })
	expect(starts).toBe(1)
	expect(screen.queryByRole('button', { name: 'Retry original payment request' })).toBeNull()
})
it('discards a pending operation from another account scope', async () => {
	sessionStorage.setItem(
		'junction:mixed-checkout-pending:v1',
		JSON.stringify({ scope: `${id(18)}:${id(19)}`, kind: 'hold', referenceId: id(6), key: id(20) }),
	)
	render(<UnifiedCheckout />)
	await screen.findByRole('button', { name: 'Review current quote' })
	expect(screen.queryByRole('button', { name: 'Retry original hold request' })).toBeNull()
	expect(sessionStorage.getItem('junction:mixed-checkout-pending:v1')).toBeNull()
})
it('keeps unavailable components blocking all reservations', async () => {
	handler = (path) =>
		path.endsWith('/checkout/quotes')
			? response({
					quoteId: id(6),
					cartId: id(1),
					cartVersion: 1,
					state: 'conflicts',
					expiresAt: hold.expiresAt,
					snapshot: {
						...snapshot,
						total: null,
						conflicts: [
							{
								kind: 'goods',
								referenceId: id(2),
								listingId: id(4),
								sku: null,
								code: 'unavailable',
								message: 'Product is unavailable.',
								expectedPriceCents: null,
								currentPriceCents: null,
							},
						],
					},
					replayed: false,
				})
			: undefined
	render(<UnifiedCheckout />)
	fireEvent.click(await screen.findByRole('button', { name: 'Review current quote' }))
	await screen.findByText('Product is unavailable.')
	expect((screen.getByRole('button', { name: 'Accept quote and reserve all for 15 minutes' }) as globalThis.HTMLButtonElement).disabled).toBe(true)
})
