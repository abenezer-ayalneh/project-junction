import { ArrowLeft, MapPin } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ListingCard } from '@/components/listing-card'
import { MarketplaceFooter } from '@/components/marketplace-footer'
import { MarketplaceHeader } from '@/components/marketplace-header'
import { VendorFollowButton } from '@/components/vendor-follow-button'
import { getPublicStorefront } from '@/lib/marketplace'

export default async function VendorStorefront({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params
	const storefront = await getPublicStorefront(slug)

	if (!storefront) {
		if (process.env.NODE_ENV === 'production') notFound()
		return (
			<>
				<main className="min-h-svh bg-background">
					<MarketplaceHeader />
					<section className="mx-auto flex min-h-[60svh] max-w-3xl flex-col justify-center px-5 py-16 sm:px-8">
						<p className="text-sm text-muted-foreground">Public storefront</p>
						<h1 className="mt-3 text-3xl font-semibold tracking-tight">This storefront is unavailable</h1>
						<p className="mt-3 max-w-xl leading-7 text-muted-foreground">
							The Vendor may be unpublished, restricted, or the local catalog service may be unavailable.
						</p>
						<Link className="mt-6 inline-flex w-fit items-center gap-2 text-sm font-medium underline underline-offset-4" href="/">
							<ArrowLeft className="size-4" aria-hidden="true" />
							Return to discovery
						</Link>
					</section>
				</main>
				<MarketplaceFooter />
			</>
		)
	}

	const products = storefront.listings.filter((listing) => listing.kind === 'product')
	const services = storefront.listings.filter((listing) => listing.kind === 'service')
	const vendor = { id: storefront.id, slug: storefront.slug, displayName: storefront.displayName }

	return (
		<>
			<main className="min-h-svh bg-background">
				<MarketplaceHeader />
				<div className="mx-auto max-w-7xl px-5 py-7 sm:px-8 sm:py-10">
					<Link className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:underline" href="/#vendors">
						<ArrowLeft className="size-4" aria-hidden="true" />
						All storefronts
					</Link>
					<section className="mt-7 overflow-hidden rounded-2xl border bg-card" aria-labelledby="storefront-title">
						{storefront.coverImage ? (
							<img
								alt={storefront.coverImage.alt}
								className="aspect-[3/1] w-full border-b object-cover"
								src={`/v1/public/media/${storefront.coverImage.id}/image`}
							/>
						) : null}
						<div className="p-6 sm:p-8">
							<p className="text-sm text-muted-foreground">Approved Vendor storefront</p>
							<div className="mt-3 flex flex-col justify-between gap-5 md:flex-row md:items-start">
								<div className="flex min-w-0 items-start gap-4">
									{storefront.logoImage ? (
										<img
											alt={storefront.logoImage.alt}
											className="size-16 shrink-0 rounded-xl border bg-muted object-cover"
											src={`/v1/public/media/${storefront.logoImage.id}/image`}
										/>
									) : null}
									<div>
										<h1 className="text-4xl font-semibold tracking-tight sm:text-5xl" id="storefront-title">
											{storefront.displayName}
										</h1>
										<p className="mt-4 max-w-3xl leading-7 text-muted-foreground">{storefront.description}</p>
									</div>
								</div>
								<VendorFollowButton vendorId={storefront.id} />
							</div>
							{storefront.locations.length ? (
								<ul className="mt-6 flex list-none flex-wrap gap-2 p-0" aria-label="Store locations">
									{storefront.locations.map((location) => (
										<li className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm" key={location.id}>
											<MapPin className="size-3.5 text-muted-foreground" aria-hidden="true" />
											{location.label} · {location.city}
										</li>
									))}
								</ul>
							) : (
								<p className="mt-6 text-sm text-muted-foreground">No public locations are available for this Vendor.</p>
							)}
						</div>
					</section>

					<div className="mt-10 grid gap-12 lg:grid-cols-2 lg:gap-10">
						<section aria-labelledby="product-catalog-title">
							<div className="flex items-baseline justify-between gap-4">
								<h2 className="text-2xl font-semibold tracking-tight" id="product-catalog-title">
									Products
								</h2>
								<span className="text-sm text-muted-foreground">{products.length} published</span>
							</div>
							{products.length ? (
								<ul className="mt-5 grid list-none gap-4 p-0 sm:grid-cols-2">
									{products.map((listing, index) => (
										<li key={listing.id}>
											<ListingCard listing={listing} priority={index < 2} vendor={vendor} />
										</li>
									))}
								</ul>
							) : (
								<p className="mt-5 rounded-xl border border-dashed px-5 py-8 text-sm text-muted-foreground">
									This Vendor has no published products yet.
								</p>
							)}
						</section>
						<section aria-labelledby="service-catalog-title">
							<div className="flex items-baseline justify-between gap-4">
								<h2 className="text-2xl font-semibold tracking-tight" id="service-catalog-title">
									Services
								</h2>
								<span className="text-sm text-muted-foreground">{services.length} published</span>
							</div>
							{services.length ? (
								<ul className="mt-5 grid list-none gap-4 p-0 sm:grid-cols-2">
									{services.map((listing, index) => (
										<li key={listing.id}>
											<ListingCard listing={listing} priority={index < 2} vendor={vendor} />
										</li>
									))}
								</ul>
							) : (
								<p className="mt-5 rounded-xl border border-dashed px-5 py-8 text-sm text-muted-foreground">
									This Vendor has no published services yet.
								</p>
							)}
						</section>
					</div>
				</div>
			</main>
			<MarketplaceFooter />
		</>
	)
}
