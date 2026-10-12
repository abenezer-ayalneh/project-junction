import { type PublicListingDetail } from 'contracts'
import { z } from 'zod'

export const CartLineSchema = z.object({
	listing: z.object({ id: z.string().uuid(), title: z.string(), vendor: z.object({ id: z.string().uuid(), displayName: z.string() }) }),
	locationId: z.string().uuid(),
	locationLabel: z.string(),
	sku: z.string().optional(),
	variantLabel: z.string().optional(),
	quantity: z.number().int().positive().max(2147483647),
	unitPriceCents: z.number().int().positive(),
	method: z.enum(['pickup', 'delivery']),
})
export type CartLine = z.infer<typeof CartLineSchema>
const CartSchema = z.array(CartLineSchema).max(500)
const key = 'junction:goods-cart:v1'
export const lineKey = (line: CartLine) => JSON.stringify([line.listing.id, line.sku ?? null])
export function readCart(): CartLine[] {
	const saved = window.localStorage.getItem(key)
	return saved ? CartSchema.parse(JSON.parse(saved)) : []
}
export function writeCart(lines: CartLine[]) {
	window.localStorage.setItem(key, JSON.stringify(CartSchema.parse(lines)))
	window.dispatchEvent(new Event('junction:cart-changed'))
}
export function addToCart(listing: PublicListingDetail, selection: { locationId: string; sku: string; quantity: number; method: 'pickup' | 'delivery' }) {
	const location = listing.locations.find(({ id }) => id === selection.locationId)
	const variant = listing.variants?.find(({ sku }) => sku === selection.sku)
	if (!location || (listing.variants?.length && !variant)) throw new Error('Select a Location and variant.')
	const lines = readCart()
	const group = lines.find((line) => line.listing.vendor.id === listing.vendor.id)
	if (group && (group.locationId !== location.id || group.method !== selection.method))
		throw new Error('Use the same Location and fulfillment method for this Vendor, or remove its Cart items first.')
	const line = CartLineSchema.parse({
		listing,
		...selection,
		sku: variant?.sku,
		variantLabel: variant?.label,
		locationLabel: location.label,
		unitPriceCents: variant?.priceCents ?? listing.priceCents,
	})
	const index = lines.findIndex((item) => lineKey(item) === lineKey(line))
	if (index >= 0) lines[index] = { ...line, quantity: lines[index].quantity + line.quantity }
	else lines.push(line)
	writeCart(lines)
}

export class GoodsRequestError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message)
	}
}

export async function goodsRequest<T>(path: string, parse: (input: unknown) => T, body?: unknown, idempotencyKey?: string): Promise<T> {
	const response = await fetch(`/v1/${path}`, {
		cache: 'no-store',
		credentials: 'same-origin',
		...(body
			? { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey ?? '' }, body: JSON.stringify(body) }
			: {}),
	})
	if (response.status === 401 || response.status === 403)
		throw new Error('Sign in with an eligible Customer account, then try again. Your selections are saved.')
	if (response.status === 409)
		throw new GoodsRequestError(response.status, 'Stock, price or fulfillment changed. Review your selections and request a fresh quote.')
	if (!response.ok) throw new Error('Could not read the latest result. Keep your selections and try again.')
	return parse(await response.json())
}
