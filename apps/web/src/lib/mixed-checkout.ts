import { type MixedCartSelection, type MixedQuoteConflict } from 'contracts'

export class CheckoutError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message)
	}
}
export async function checkoutRequest<T>(path: string, parse: (data: unknown) => T, body?: unknown, key?: string, method = 'POST'): Promise<T> {
	if (!navigator.onLine) throw new CheckoutError(0, 'You are offline. Reconnect and refresh checkout status before trying again.')
	const response = await fetch(`/v1/${path}`, {
		cache: 'no-store',
		credentials: 'same-origin',
		...(body === undefined
			? {}
			: { method, headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body) }),
	})
	if (!response.ok) {
		const message =
			response.status === 401
				? 'Sign in to review your saved Cart.'
				: response.status === 403
					? 'This action requires an eligible Customer account and verified adult identity. Local development defers identity verification; it does not approve this account.'
					: response.status === 409
						? 'Checkout changed. Refresh checkout status, then review the Cart and request a fresh quote.'
						: 'Checkout could not be read. Refresh checkout status before retrying.'
		throw new CheckoutError(response.status, message)
	}
	return parse(await response.json())
}
export function acceptCurrentPrices(selection: MixedCartSelection, conflicts: MixedQuoteConflict[]): MixedCartSelection {
	return {
		...selection,
		goodsGroups: selection.goodsGroups.map((group) => ({
			...group,
			lines: group.lines.map((line) => {
				const change = conflicts.find(
					(c) => c.kind === 'goods' && c.code === 'price_changed' && c.listingId === line.listingId && c.sku === (line.sku ?? null),
				)
				return { ...line, expectedUnitPriceCents: change?.currentPriceCents ?? line.expectedUnitPriceCents }
			}),
		})),
		bookings: selection.bookings.map((intent) => {
			const change = conflicts.find((c) => c.kind === 'booking' && c.code === 'price_changed' && c.referenceId === intent.intentId)
			return { ...intent, expectedPriceCents: change?.currentPriceCents ?? intent.expectedPriceCents }
		}),
	}
}
