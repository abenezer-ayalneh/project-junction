import { ArrowDownRight, ArrowRight, Search, Waypoints } from 'lucide-react'
import Link from 'next/link'

import { CustomerDiscovery } from '@/components/customer-discovery'
import { ThemeToggle } from '@/components/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatPrice, getPublicListings, getPublicVendors } from '@/lib/marketplace'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const categories = [
	['', 'Everything'],
	['goods', 'Goods'],
	['home', 'Home'],
	['fashion', 'Fashion'],
	['beauty', 'Beauty'],
	['appointment', 'Appointments'],
	['education', 'Learning'],
	['repair', 'Repairs'],
]

export default async function Index({ searchParams }: { searchParams: SearchParams }) {
	const isStaging = process.env.NEXT_PUBLIC_JUNCTION_RUNTIME_MODE === 'staging'
	const values = await searchParams
	const query = new URLSearchParams()
	for (const key of ['kind', 'category', 'q', 'cursor', 'limit']) {
		const value = values[key]
		if (typeof value === 'string') query.set(key, value)
	}
	const [listingPage, vendorPage] = await Promise.all([getPublicListings(query), getPublicVendors()])
	const selectedCategory = query.get('category') ?? ''
	const selectedKind = query.get('kind') ?? ''
	const searchTerm = query.get('q') ?? ''
	const hasFilters = Boolean(selectedCategory || selectedKind || searchTerm)

	return (
		<main className="min-h-svh bg-background">
			<a
				className="absolute top-4 left-4 z-50 -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform focus:translate-y-0"
				href="#discover">
				Skip to discovery
			</a>

			<header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
				<Link className="flex items-center gap-2.5" href="/" aria-label="Junction home">
					<Waypoints className="size-6 text-junction-brand" aria-hidden="true" />
					<span className="text-sm font-semibold tracking-tight">Junction</span>
				</Link>
				<nav className="flex items-center gap-3" aria-label="Main navigation">
					<a className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline" href="#vendors">
						Local vendors
					</a>
					<Link className="text-sm text-muted-foreground transition-colors hover:text-foreground" href="/vendor-workspace">
						Vendor workspace
					</Link>
					<Link className="text-sm text-muted-foreground transition-colors hover:text-foreground" href="/account">
						Account
					</Link>
					<Badge variant="outline">{isStaging ? 'Private staging' : 'Synthetic preview'}</Badge>
					<ThemeToggle />
				</nav>
			</header>

			<section
				className="mx-auto grid max-w-7xl gap-10 px-5 pb-14 pt-10 sm:px-8 sm:pb-20 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-end lg:gap-16"
				aria-labelledby="page-title">
				<div>
					<p className="text-sm font-medium text-muted-foreground">Independent businesses, gathered in one place</p>
					<h1 id="page-title" className="mt-5 max-w-3xl text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-7xl">
						Find the good work happening nearby.
					</h1>
					<p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
						{isStaging
							? 'Browse products and services from Vendors approved for this private staging environment.'
							: 'Browse products and services from local Vendors. Every listing here has passed a publication review in this synthetic preview.'}
					</p>
				</div>
				<div className="relative overflow-hidden rounded-2xl border bg-muted/40 p-6 sm:p-8">
					<div className="absolute -right-8 -top-10 size-44 rounded-full border border-foreground/10" aria-hidden="true" />
					<div className="absolute -right-1 top-7 size-28 rounded-full border border-foreground/10" aria-hidden="true" />
					<div className="relative flex min-h-40 flex-col justify-between gap-8">
						<div>
							<p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">A clearer way to explore</p>
							<p className="mt-4 max-w-sm text-2xl font-medium leading-snug tracking-tight">
								Products to take home. Services to make life easier.
							</p>
						</div>
						<a
							className="inline-flex w-fit items-center gap-2 text-sm font-medium underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
							href="#discover">
							Start exploring <ArrowDownRight className="size-4" aria-hidden="true" />
						</a>
					</div>
				</div>
			</section>

			<section id="discover" className="border-y bg-muted/20" aria-labelledby="discover-title">
				<div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
					<div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
						<div>
							<p className="text-sm text-muted-foreground">The directory</p>
							<h2 id="discover-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
								Browse offerings
							</h2>
						</div>
						<form action="/" method="get" className="grid w-full gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto] md:max-w-xl" role="search">
							<label className="sr-only" htmlFor="catalog-search">
								Search products and services
							</label>
							<div className="flex h-11 items-center gap-2 rounded-lg border bg-background px-3 focus-within:ring-2 focus-within:ring-ring/50">
								<Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
								<input
									id="catalog-search"
									className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
									name="q"
									defaultValue={searchTerm}
									placeholder="Search an offering"
								/>
							</div>
							<Button type="submit" className="h-11">
								Search
							</Button>
						</form>
					</div>

					<form action="/" method="get" className="mt-7 flex flex-wrap items-end gap-3">
						{searchTerm && <input type="hidden" name="q" value={searchTerm} />}
						<div className="grid gap-1.5">
							<label htmlFor="kind" className="text-xs font-medium text-muted-foreground">
								Offering type
							</label>
							<select
								id="kind"
								name="kind"
								defaultValue={selectedKind}
								className="h-10 min-w-40 rounded-lg border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
								<option value="">Products and services</option>
								<option value="product">Products</option>
								<option value="service">Services</option>
							</select>
						</div>
						<div className="grid gap-1.5">
							<label htmlFor="category" className="text-xs font-medium text-muted-foreground">
								Category
							</label>
							<select
								id="category"
								name="category"
								defaultValue={selectedCategory}
								className="h-10 min-w-40 rounded-lg border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
								{categories.map(([value, label]) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</select>
						</div>
						<Button type="submit" variant="outline" className="h-10">
							Apply filters
						</Button>
						{hasFilters && (
							<Link className="px-2 py-2 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground" href="/">
								Clear filters
							</Link>
						)}
					</form>

					<div className="mt-10 flex items-baseline justify-between gap-4 border-b pb-3">
						<h3 className="font-medium">{selectedKind ? (selectedKind === 'product' ? 'Products' : 'Services') : 'All offerings'}</h3>
						<p className="text-sm text-muted-foreground">{listingPage ? `${listingPage.items.length} shown` : 'Catalog unavailable'}</p>
					</div>

					{listingPage === null ? (
						<div className="mt-5 rounded-xl border border-dashed bg-background px-6 py-10" role="status">
							<h4 className="font-medium">{isStaging ? 'The staging catalog is unavailable' : 'The local catalog is not connected'}</h4>
							<p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
								{isStaging
									? 'The catalog could not be reached. Please try again after the staging service is restored.'
									: 'Start the synthetic API and database to load approved listings. This preview does not show sample businesses as live catalog results.'}
							</p>
						</div>
					) : listingPage.items.length === 0 ? (
						<div className="mt-5 rounded-xl border border-dashed bg-background px-6 py-10">
							<h4 className="font-medium">No offerings match these filters</h4>
							<p className="mt-2 text-sm text-muted-foreground">Try another category or clear the search to browse the full directory.</p>
						</div>
					) : (
						<ul className="mt-5 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
							{listingPage.items.map((listing, index) => (
								<li key={listing.id}>
									<Card className="h-full overflow-hidden rounded-xl shadow-none">
										<div
											className={`h-1.5 ${index % 3 === 1 ? 'bg-junction-brand/70' : index % 3 === 2 ? 'bg-foreground/50' : 'bg-foreground/15'}`}
											aria-hidden="true"
										/>
										<CardContent className="flex h-full min-h-52 flex-col p-5">
											<div className="flex flex-wrap items-center gap-2">
												<Badge variant="secondary">{listing.kind === 'product' ? 'Product' : 'Service'}</Badge>
												<span className="text-xs capitalize text-muted-foreground">{listing.category}</span>
											</div>
											<h4 className="mt-5 text-lg font-medium tracking-tight">{listing.title}</h4>
											<p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{listing.description}</p>
											<div className="mt-auto flex items-end justify-between gap-4 pt-6">
												<p className="font-medium">{formatPrice(listing.priceCents)}</p>
												{listing.durationMinutes && <p className="text-xs text-muted-foreground">{listing.durationMinutes} min</p>}
											</div>
										</CardContent>
									</Card>
								</li>
							))}
						</ul>
					)}
					{listingPage?.nextCursor && (
						<div className="mt-8 flex justify-center">
							<Link
								className="inline-flex h-10 items-center gap-2 rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
								href={{ pathname: '/', query: { ...Object.fromEntries(query), cursor: listingPage.nextCursor } }}>
								More offerings <ArrowRight className="size-4" aria-hidden="true" />
							</Link>
						</div>
					)}
				</div>
			</section>

			<section id="vendors" className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20" aria-labelledby="vendors-title">
				<div className="flex items-end justify-between gap-6">
					<div>
						<p className="text-sm text-muted-foreground">Meet the businesses</p>
						<h2 id="vendors-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
							Local storefronts
						</h2>
					</div>
					<span className="hidden text-sm text-muted-foreground sm:block">Approved and published Vendors</span>
				</div>
				{vendorPage === null ? (
					<p className="mt-6 rounded-xl border border-dashed px-5 py-6 text-sm text-muted-foreground" role="status">
						{isStaging
							? 'Storefronts are unavailable while the staging catalog is offline.'
							: 'Storefronts will appear when the synthetic catalog is connected.'}
					</p>
				) : vendorPage.items.length === 0 ? (
					<p className="mt-6 rounded-xl border border-dashed px-5 py-6 text-sm text-muted-foreground">No published storefronts are available yet.</p>
				) : (
					<ul className="mt-7 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
						{vendorPage.items.map((vendor) => (
							<li key={vendor.id}>
								<Link
									href={`/vendors/${encodeURIComponent(vendor.slug)}`}
									className="group flex min-h-24 items-center justify-between gap-4 rounded-xl border p-5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
									<div>
										<p className="font-medium">{vendor.slug.replaceAll('-', ' ')}</p>
										<p className="mt-1 text-sm text-muted-foreground">View storefront</p>
									</div>
									<ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden="true" />
								</Link>
							</li>
						))}
					</ul>
				)}
			</section>
			<CustomerDiscovery listings={listingPage?.items ?? []} vendors={vendorPage?.items ?? []} />

			<footer className="border-t">
				<div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
					<span>Junction · {isStaging ? 'private staging' : 'local discovery preview'}</span>
					<span>Browsing only · no checkout or booking</span>
				</div>
			</footer>
		</main>
	)
}
