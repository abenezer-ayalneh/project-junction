import { ArrowRight, ChevronDown } from 'lucide-react'
import Link from 'next/link'

import { CatalogFilters } from '@/components/catalog-filters'
import { ListingCard } from '@/components/listing-card'
import { MarketplaceFooter } from '@/components/marketplace-footer'
import { MarketplaceHeader } from '@/components/marketplace-header'
import { getPublicListings, getPublicVendors } from '@/lib/marketplace'

type SearchParams = Promise<Record<string, string | string[] | undefined>>
const allowedKeys = ['kind', 'category', 'q', 'vendor', 'minPriceCents', 'maxPriceCents', 'sort', 'cursor', 'limit'] as const

function first(values: Record<string, string | string[] | undefined>, key: string) {
	const value = values[key]
	return typeof value === 'string' ? value : ''
}

function pageQuery(values: Record<string, string | string[] | undefined>, overrides: Record<string, string | undefined> = {}) {
	const query = new URLSearchParams()
	for (const key of allowedKeys) {
		const value = Object.hasOwn(overrides, key) ? overrides[key] : first(values, key)
		if (value) query.set(key, value)
	}
	return query
}

function ListingResults({
	title,
	kind,
	page,
	values,
}: {
	title: string
	kind: 'product' | 'service'
	page: Awaited<ReturnType<typeof getPublicListings>>
	values: Record<string, string | string[] | undefined>
}) {
	const kindLabel = kind === 'product' ? 'products' : 'services'
	const nextQuery = page?.nextCursor ? pageQuery(values, { kind, cursor: page.nextCursor }) : null
	const returnTo = `/search${pageQuery(values).size ? `?${pageQuery(values).toString()}` : ''}`

	return (
		<section className="mt-7" aria-labelledby={`${kind}-results-title`}>
			<div className="flex items-end justify-between gap-4 border-b pb-3">
				<h2 className="text-xl font-semibold tracking-tight" id={`${kind}-results-title`}>
					{title}
				</h2>
				<p className="text-sm text-muted-foreground">{page ? `${page.total} total` : 'Catalog unavailable'}</p>
			</div>
			{page === null ? (
				<div className="mt-5 rounded-xl border border-dashed px-5 py-8" role="status">
					<h3 className="font-medium">The catalog is unavailable</h3>
					<p className="mt-2 text-sm leading-6 text-muted-foreground">
						The local catalog service could not be reached. Try again when it is available.
					</p>
					<Link className="mt-4 inline-flex text-sm font-medium underline underline-offset-4" href={returnTo}>
						Try again
					</Link>
				</div>
			) : page.items.length === 0 ? (
				<div className="mt-5 rounded-xl border border-dashed px-5 py-8">
					<h3 className="font-medium">No {kindLabel} match these filters</h3>
					<p className="mt-2 text-sm leading-6 text-muted-foreground">Keep exploring with another category, Vendor, or price range.</p>
					<Link className="mt-4 inline-flex text-sm font-medium underline underline-offset-4" href={`/search?kind=${kind}`}>
						Clear filters
					</Link>
				</div>
			) : (
				<>
					<ul className="mt-5 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
						{page.items.map((listing, index) => (
							<li key={listing.id}>
								<ListingCard listing={listing} priority={index < 3} returnTo={returnTo} />
							</li>
						))}
					</ul>
					{nextQuery && (
						<div className="mt-8 flex justify-center">
							<Link
								className="inline-flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted"
								href={`/search?${nextQuery.toString()}`}>
								More {kindLabel} <ArrowRight className="size-4" aria-hidden="true" />
							</Link>
						</div>
					)}
				</>
			)}
		</section>
	)
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
	const values = await searchParams
	const requestedKind = first(values, 'kind')
	const selectedKind: 'product' | 'service' | '' = requestedKind === 'product' || requestedKind === 'service' ? requestedKind : ''
	const query = pageQuery(values, { kind: selectedKind || undefined })
	if (!query.has('sort')) query.set('sort', 'newest')
	const [vendors, scopedPage, products, services] = await Promise.all([
		getPublicVendors(),
		selectedKind ? getPublicListings(query) : Promise.resolve(null),
		selectedKind ? Promise.resolve(null) : getPublicListings(new URLSearchParams({ ...Object.fromEntries(query), kind: 'product' })),
		selectedKind ? Promise.resolve(null) : getPublicListings(new URLSearchParams({ ...Object.fromEntries(query), kind: 'service' })),
	])
	const filterValues = {
		q: first(values, 'q'),
		kind: selectedKind,
		category: first(values, 'category'),
		vendor: first(values, 'vendor'),
		minPriceCents: first(values, 'minPriceCents'),
		maxPriceCents: first(values, 'maxPriceCents'),
		sort: first(values, 'sort') || 'newest',
	}
	const browseTitle = filterValues.q
		? `Results for “${filterValues.q}”`
		: selectedKind
			? selectedKind === 'product'
				? 'Products'
				: 'Services'
			: 'Products and services'
	const sortQuery = pageQuery(values, { cursor: undefined })

	return (
		<>
			<main className="min-h-svh bg-background">
				<MarketplaceHeader searchQuery={filterValues.q} />
				<div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
					<div className="flex flex-col justify-between gap-5 border-b pb-6 sm:flex-row sm:items-end">
						<div>
							<p className="text-sm text-muted-foreground">Marketplace search</p>
							<h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{browseTitle}</h1>
						</div>
						<form action="/search" className="flex items-end gap-2">
							{[...sortQuery.entries()].map(([key, value]) =>
								key === 'sort' ? null : <input key={key} name={key} type="hidden" value={value} readOnly />,
							)}
							<label className="grid gap-1 text-sm font-medium">
								Sort
								<span className="relative block min-w-0">
									<select
										key={filterValues.sort}
										className="h-9 rounded-lg border bg-background pl-3 pr-9 text-sm w-full min-w-0 appearance-none"
										defaultValue={filterValues.sort}
										name="sort">
										<option value="newest">Recently published</option>
										<option value="price_asc">Price: low to high</option>
										<option value="price_desc">Price: high to low</option>
									</select>
									<ChevronDown
										className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
										aria-hidden="true"
									/>
								</span>
							</label>
							<button className="h-9 rounded-lg border px-3 text-sm font-medium hover:bg-muted" type="submit">
								Apply
							</button>
						</form>
					</div>

					<CatalogFilters values={filterValues} vendors={vendors?.items ?? []}>
						{selectedKind ? (
							<ListingResults
								kind={selectedKind}
								page={scopedPage}
								title={selectedKind === 'product' ? 'Products' : 'Services'}
								values={values}
							/>
						) : (
							<>
								<ListingResults kind="product" page={products} title="Products" values={values} />
								<ListingResults kind="service" page={services} title="Services" values={values} />
							</>
						)}
					</CatalogFilters>
				</div>
			</main>
			<MarketplaceFooter />
		</>
	)
}
