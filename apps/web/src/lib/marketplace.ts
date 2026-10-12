import {
	type PublicListingDetail,
	PublicListingDetailSchema,
	type PublicListingPage,
	PublicListingPageSchema,
	PublicStorefrontSchema,
	type PublicVendorPage,
	PublicVendorPageSchema,
} from 'contracts'

function apiBaseUrl(): string {
	return (
		process.env.JUNCTION_API_URL ??
		(() => {
			throw new Error('JUNCTION_API_URL is required for the catalog.')
		})()
	)
}

async function readApi<T>(path: string, parse: (input: unknown) => T, missingIsExpected = false): Promise<T | null> {
	const url = `${apiBaseUrl()}${path}`
	try {
		const response = await fetch(url, { cache: 'no-store' })
		if (response.status === 404 && missingIsExpected) return null
		if (!response.ok) throw new Error(`Marketplace API returned ${response.status}.`)
		return parse(await response.json())
	} catch {
		return null
	}
}

export function getPublicListings(query: URLSearchParams): Promise<PublicListingPage | null> {
	const params = new URLSearchParams()
	for (const key of ['kind', 'category', 'q', 'vendor', 'minPriceCents', 'maxPriceCents', 'sort', 'cursor', 'limit']) {
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
	return readApi(`/public/vendors/${encodeURIComponent(slug)}`, (input) => PublicStorefrontSchema.parse(input), true)
}

export function getPublicListing(listingId: string): Promise<PublicListingDetail | null> {
	return readApi(`/public/listings/${encodeURIComponent(listingId)}`, (input) => PublicListingDetailSchema.parse(input), true)
}

export function formatPrice(priceCents: number | undefined): string {
	if (priceCents === undefined) return 'See options'
	return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB', maximumFractionDigits: 0 }).format(priceCents / 100)
}

export function formatListingPrice(listing: { priceCents?: number; variants?: Array<{ priceCents: number }> }): string {
	if (listing.priceCents !== undefined) return formatPrice(listing.priceCents)
	if (!listing.variants?.length) return 'Price unavailable'
	return `From ${formatPrice(Math.min(...listing.variants.map((variant) => variant.priceCents)))}`
}
