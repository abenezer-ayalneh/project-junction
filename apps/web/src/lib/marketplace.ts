import { type PublicListingPage, PublicListingPageSchema, PublicStorefrontSchema, type PublicVendorPage, PublicVendorPageSchema } from 'contracts'

const apiBaseUrl = process.env.JUNCTION_API_URL ?? 'http://127.0.0.1:3001/v1'

async function readApi<T>(path: string, parse: (input: unknown) => T): Promise<T | null> {
	try {
		const response = await fetch(`${apiBaseUrl}${path}`, { cache: 'no-store' })
		if (!response.ok) return null
		return parse(await response.json())
	} catch {
		return null
	}
}

export function getPublicListings(query: URLSearchParams): Promise<PublicListingPage | null> {
	const params = new URLSearchParams()
	for (const key of ['kind', 'category', 'q', 'cursor', 'limit']) {
		const value = query.get(key)
		if (value) params.set(key, value)
	}
	const suffix = params.size ? `?${params.toString()}` : ''
	return readApi(`/public/listings${suffix}`, (input) => PublicListingPageSchema.parse(input))
}

export function getPublicVendors(): Promise<PublicVendorPage | null> {
	return readApi('/public/vendors?limit=12', (input) => PublicVendorPageSchema.parse(input))
}

export function getPublicStorefront(slug: string) {
	return readApi(`/public/vendors/${encodeURIComponent(slug)}`, (input) => PublicStorefrontSchema.parse(input))
}

export function formatPrice(priceCents: number | undefined): string {
	if (priceCents === undefined) return 'See options'
	return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB', maximumFractionDigits: 0 }).format(priceCents / 100)
}
