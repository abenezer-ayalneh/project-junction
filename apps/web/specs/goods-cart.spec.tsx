import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { type PublicListingDetail } from 'contracts'

import { GoodsCart } from '../src/components/goods-cart'
import { ProductSelection } from '../src/components/product-selection'
import { addToCart, readCart } from '../src/lib/goods-cart'

const id = '11111111-1111-4111-8111-111111111111'
const locationId = '22222222-2222-4222-8222-222222222222'
const listing: PublicListingDetail = {
	id,
	kind: 'product',
	category: 'goods',
	title: 'Basket',
	description: 'Woven basket for local tests',
	state: 'published',
	version: 1,
	images: [],
	vendor: { id: '33333333-3333-4333-8333-333333333333', slug: 'vendor', displayName: 'Basket Vendor' },
	variants: [
		{ sku: 'small', label: 'Small', priceCents: 1000 },
		{ sku: 'large', label: 'Large', priceCents: 2000 },
	],
	locations: [
		{ id: locationId, label: 'Shop', city: 'Test city', goodsConfiguration: { pickupEnabled: true, returnTemplate: 'standard', deliveryZones: [] } },
	],
}
const originalFetch = globalThis.fetch
beforeEach(() => {
	globalThis.window.localStorage.clear()
	globalThis.window.sessionStorage.clear()
})
afterEach(() => {
	globalThis.fetch = originalFetch
})
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response
function select() {
	fireEvent.change(screen.getByLabelText('Variant'), { target: { value: 'small' } })
	fireEvent.change(screen.getByLabelText('Location'), { target: { value: locationId } })
	fireEvent.change(screen.getByLabelText('Fulfillment'), { target: { value: 'pickup' } })
}
it('requires explicit selections before any stock read', async () => {
	globalThis.fetch = jest.fn()
	render(<ProductSelection listing={listing} />)
	fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }))
	expect(globalThis.fetch).not.toHaveBeenCalled()
	expect(readCart()).toEqual([])
	expect(screen.getByRole('status').textContent).toContain('Select a variant')
})
it('preserves selections through failed stock reads and conflicts, and retries without a reservation command', async () => {
	globalThis.fetch = jest
		.fn()
		.mockRejectedValueOnce(new Error('Connection lost'))
		.mockResolvedValueOnce(
			response({ listingId: id, locationId, sku: 'small', available: 0, requestedQuantity: 1, canFulfill: false, checkedAt: new Date().toISOString() }),
		)
		.mockResolvedValueOnce(
			response({ listingId: id, locationId, sku: 'small', available: 1, requestedQuantity: 1, canFulfill: true, checkedAt: new Date().toISOString() }),
		)
	render(<ProductSelection listing={listing} />)
	select()
	fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }))
	await screen.findByText('Connection lost')
	expect((screen.getByLabelText('Variant') as globalThis.HTMLSelectElement).value).toBe('small')
	fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }))
	await screen.findByText(/Only 0 available/)
	expect(readCart()).toEqual([])
	fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }))
	await screen.findByRole('link', { name: 'View Cart' })
	expect(readCart()[0]).toMatchObject({ sku: 'small', quantity: 1, unitPriceCents: 1000 })
	expect(jest.mocked(globalThis.fetch).mock.calls.every(([, init]) => !init?.method)).toBe(true)
})
it('combines a repeated SKU and rejects a second Location for the same Vendor', () => {
	const selection = { locationId, sku: 'small', quantity: 1, method: 'pickup' as const }
	addToCart(listing, selection)
	addToCart(listing, selection)
	expect(readCart()).toHaveLength(1)
	expect(readCart()[0].quantity).toBe(2)
	const otherLocation = '44444444-4444-4444-8444-444444444444'
	expect(() =>
		addToCart(
			{ ...listing, locations: [...listing.locations, { ...listing.locations[0], id: otherLocation }] },
			{ ...selection, locationId: otherLocation },
		),
	).toThrow('same Location')
	expect(readCart()[0].quantity).toBe(2)
})
it('retains the Cart on checkout denial and offers sign-in', async () => {
	addToCart(listing, { locationId, sku: 'small', quantity: 1, method: 'pickup' })
	globalThis.fetch = jest.fn(async (url) => response(String(url).includes('/quotes') ? {} : listing, String(url).includes('/quotes') ? 403 : 200))
	render(<GoodsCart />)
	fireEvent.click(await screen.findByRole('button', { name: 'Continue to checkout' }))
	await screen.findByRole('link', { name: 'Sign in' })
	expect(readCart()[0].sku).toBe('small')
})
it('retries an uncertain hold using the persisted request key and unlocks after a definitive conflict', async () => {
	addToCart(listing, { locationId, sku: 'small', quantity: 1, method: 'pickup' })
	const key = '55555555-5555-4555-8555-555555555555'
	globalThis.window.sessionStorage.setItem('junction:goods-hold-pending:v1', JSON.stringify({ quoteId: id, key }))
	globalThis.fetch = jest.fn(async (url) => (String(url).includes('/holds') ? response({}, 409) : response(listing)))
	render(<GoodsCart />)
	fireEvent.click(await screen.findByRole('button', { name: 'Retry original hold request' }))
	await waitFor(() => expect(globalThis.window.sessionStorage.getItem('junction:goods-hold-pending:v1')).toBeNull())
	const call = jest.mocked(globalThis.fetch).mock.calls.find(([url]) => String(url).includes('/holds'))
	expect(call?.[1]?.headers).toMatchObject({ 'Idempotency-Key': key })
	expect(readCart()).toHaveLength(1)
})

it('uses a fresh quote key after an expired quote while retaining safe Cart selections', async () => {
	addToCart(listing, { locationId, sku: 'small', quantity: 1, method: 'pickup' })
	const snapshot = {
		currency: 'ETB',
		totalCents: 1000,
		groups: [
			{
				vendorId: listing.vendor.id,
				locationId,
				configurationVersion: 1,
				fulfillment: { method: 'pickup' },
				deliveryZone: null,
				deliveryFeeCents: 0,
				etaMinutes: null,
				pickupWindowHours: 72,
				pickupGraceHours: 48,
				failedDeliveryRetryHours: null,
				lines: [
					{
						listingId: id,
						listingVersion: 1,
						sku: 'small',
						quantity: 1,
						unitPriceCents: 1000,
						subtotalCents: 1000,
						policy: {
							returnTemplate: 'standard',
							changeOfMindDays: 7,
							faultProtectionDays: 30,
							restockingFeeCents: 0,
							startsAt: 'verified_handoff',
						},
					},
				],
			},
		],
	}
	const keys: string[] = []
	globalThis.fetch = jest.fn(async (url, options) => {
		if (!String(url).includes('/quotes')) return response(listing)
		keys.push((options?.headers as Record<string, string>)['Idempotency-Key'])
		return response({ quoteId: id, expiresAt: new Date(Date.now() - 1000).toISOString(), snapshot, replayed: false })
	})
	render(<GoodsCart />)
	const checkout = await screen.findByRole('button', { name: 'Continue to checkout' })
	fireEvent.click(checkout)
	await screen.findByRole('heading', { name: 'Review quote' })
	fireEvent.click(checkout)
	await waitFor(() => expect(keys).toHaveLength(2))
	expect(keys[0]).not.toBe(keys[1])
	expect(readCart()).toHaveLength(1)
})
