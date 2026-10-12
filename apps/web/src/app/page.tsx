import { ArrowRight, Building2 } from 'lucide-react'
import Link from 'next/link'

import { CustomerDiscovery } from '@/components/customer-discovery'
import { ListingCard } from '@/components/listing-card'
import { MarketplaceFooter } from '@/components/marketplace-footer'
import { MarketplaceHeader } from '@/components/marketplace-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { getPublicListings, getPublicVendors } from '@/lib/marketplace'

const productCategories = [
	['goods', 'Goods', 'Everyday essentials and practical finds.'],
	['home', 'Home', 'Useful pieces for the spaces you live in.'],
	['fashion', 'Fashion', 'Clothing, accessories, and personal style.'],
	['beauty', 'Beauty', 'Care and wellbeing offerings.'],
] as const

const serviceCategories = [
	['appointment', 'Appointments', 'Bookable professional time.'],
	['education', 'Learning', 'Lessons and skill-building support.'],
	['repair', 'Repairs', 'Help restoring what you rely on.'],
] as const

function CategoryEntry({ category, label, description, kind }: { category: string; label: string; description: string; kind: 'product' | 'service' }) {
	return (
		<Link
			className="group rounded-xl border bg-card p-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
			href={`/search?kind=${kind}&category=${category}`}>
			<p className="font-medium group-hover:underline">{label}</p>
			<p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
		</Link>
	)
}

function ListingSection({
	title,
	description,
	kind,
	items,
	total,
}: {
	title: string
	description: string
	kind: 'product' | 'service'
	items: Awaited<ReturnType<typeof getPublicListings>>
	total: number | undefined
}) {
	const kindLabel = kind === 'product' ? 'products' : 'services'
	return (
		<section aria-labelledby={`${kind}-discovery-title`}>
			<div className="flex items-end justify-between gap-4">
				<div>
					<h2 className="text-2xl font-semibold tracking-tight" id={`${kind}-discovery-title`}>
						{title}
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">{description}</p>
				</div>
				<Link className="shrink-0 text-sm font-medium underline underline-offset-4" href={`/search?kind=${kind}`}>
					View all {kindLabel}
				</Link>
			</div>
			{items === null ? (
				<p className="mt-5 rounded-xl border border-dashed px-5 py-8 text-sm text-muted-foreground" role="status">
					{title} are unavailable while the local catalog service cannot be reached.
				</p>
			) : items.items.length === 0 ? (
				<p className="mt-5 rounded-xl border border-dashed px-5 py-8 text-sm text-muted-foreground">
					No published {kindLabel} are available yet. You can still explore the other vertical.
				</p>
			) : (
				<>
					<p className="mt-4 text-sm text-muted-foreground">
						{total === undefined ? `${items.items.length} shown` : `${Math.min(items.items.length, total)} of ${total} shown`}
					</p>
					<ul className="mt-4 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2">
						{items.items.map((listing, index) => (
							<li key={listing.id}>
								<ListingCard listing={listing} priority={index < 2} />
							</li>
						))}
					</ul>
				</>
			)}
		</section>
	)
}

export default async function Home() {
	const [products, services, vendors] = await Promise.all([
		getPublicListings(new URLSearchParams({ kind: 'product', limit: '4', sort: 'newest' })),
		getPublicListings(new URLSearchParams({ kind: 'service', limit: '4', sort: 'newest' })),
		getPublicVendors(),
	])
	const customerListings = [...(products?.items ?? []), ...(services?.items ?? [])]

	return (
		<>
			<main className="min-h-svh bg-background">
				<a
					className="absolute top-4 left-4 z-50 -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform motion-reduce:transition-none focus:translate-y-0"
					href="#discover">
					Skip to discovery
				</a>
				<MarketplaceHeader />

				<section className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14" aria-labelledby="page-title">
					<div className="max-w-3xl">
						<p className="text-sm font-medium text-muted-foreground">Browse the local marketplace</p>
						<h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-5xl" id="page-title">
							Products and services, side by side.
						</h1>
						<p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
							Discover published offerings from approved Vendors. Browsing is available here; purchase, booking, and checkout are not part of this
							phase.
						</p>
						<div className="mt-6 flex flex-wrap gap-3">
							<Link
								className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
								href="/search?kind=product">
								Shop products <ArrowRight className="size-4" aria-hidden="true" />
							</Link>
							<Link
								className="inline-flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted"
								href="/search?kind=service">
								Explore services <ArrowRight className="size-4" aria-hidden="true" />
							</Link>
						</div>
					</div>
				</section>

				<section className="border-y bg-muted/20" id="discover" aria-labelledby="category-entry-title">
					<div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
						<div>
							<p className="text-sm text-muted-foreground">Choose a starting point</p>
							<h2 className="mt-2 text-3xl font-semibold tracking-tight" id="category-entry-title">
								Browse by category
							</h2>
						</div>
						<div className="mt-7 grid gap-8 lg:grid-cols-2 lg:gap-10">
							<section aria-labelledby="product-categories-title">
								<h3 className="font-medium" id="product-categories-title">
									Product categories
								</h3>
								<div className="mt-4 grid gap-3 sm:grid-cols-2">
									{productCategories.map(([category, label, description]) => (
										<CategoryEntry category={category} description={description} key={category} kind="product" label={label} />
									))}
								</div>
							</section>
							<section aria-labelledby="service-categories-title">
								<h3 className="font-medium" id="service-categories-title">
									Service categories
								</h3>
								<div className="mt-4 grid gap-3 sm:grid-cols-2">
									{serviceCategories.map(([category, label, description]) => (
										<CategoryEntry category={category} description={description} key={category} kind="service" label={label} />
									))}
								</div>
							</section>
						</div>
					</div>
				</section>

				<div className="mx-auto grid max-w-7xl gap-12 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-2 lg:gap-10">
					<ListingSection
						description="Published fixed-price offerings from approved Vendors."
						items={products}
						kind="product"
						title="Explore products"
						total={products?.total}
					/>
					<ListingSection
						description="Published fixed-duration offerings from approved Vendors."
						items={services}
						kind="service"
						title="Explore services"
						total={services?.total}
					/>
				</div>

				<section className="border-y bg-muted/20" id="vendors" aria-labelledby="vendors-title">
					<div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
						<div className="flex flex-wrap items-end justify-between gap-5">
							<div>
								<p className="text-sm text-muted-foreground">Independent businesses</p>
								<h2 className="mt-2 text-3xl font-semibold tracking-tight" id="vendors-title">
									Public Vendor storefronts
								</h2>
							</div>
							<Badge variant="outline">Approved and published</Badge>
						</div>
						{vendors === null ? (
							<p className="mt-6 rounded-xl border border-dashed px-5 py-8 text-sm text-muted-foreground" role="status">
								Storefronts are unavailable while the local catalog service cannot be reached.
							</p>
						) : vendors.items.length === 0 ? (
							<p className="mt-6 rounded-xl border border-dashed px-5 py-8 text-sm text-muted-foreground">
								No public Vendor storefronts are available yet.
							</p>
						) : (
							<ul className="mt-6 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
								{vendors.items.map((vendor) => (
									<li key={vendor.id}>
										<Link
											className="block h-full focus-visible:rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
											href={`/vendors/${vendor.slug}`}>
											<Card className="h-full py-0 shadow-none hover:bg-muted">
												<CardContent className="flex min-h-32 flex-col justify-between py-4">
													<Building2 className="size-5 text-muted-foreground" aria-hidden="true" />
													<p className="mt-5 font-medium">{vendor.displayName}</p>
													<p className="text-sm text-muted-foreground">View storefront</p>
												</CardContent>
											</Card>
										</Link>
									</li>
								))}
							</ul>
						)}
					</div>
				</section>

				<CustomerDiscovery listings={customerListings} vendors={vendors?.items ?? []} />
			</main>
			<MarketplaceFooter />
		</>
	)
}
