import { ArrowLeft, MapPin, Play } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ListingMedia } from '@/components/listing-media'
import { MarketplaceFooter } from '@/components/marketplace-footer'
import { MarketplaceHeader } from '@/components/marketplace-header'
import { ProductSelection } from '@/components/product-selection'
import { ServiceSelection } from '@/components/service-selection'
import { Badge } from '@/components/ui/badge'
import { formatListingPrice, getPublicListing } from '@/lib/marketplace'

type DetailSearchParams = Promise<Record<string, string | string[] | undefined>>

function returnPath(value: string | string[] | undefined) {
	if (typeof value !== 'string') return '/search'
	return value.startsWith('/search') ? value : '/search'
}

export default async function ListingDetail({ params, searchParams }: { params: Promise<{ listingId: string }>; searchParams: DetailSearchParams }) {
	const [{ listingId }, values] = await Promise.all([params, searchParams])
	const listing = await getPublicListing(listingId)
	const backTo = returnPath(values.from)

	if (!listing) {
		if (process.env.NODE_ENV === 'production') notFound()
		return (
			<>
				<main className="min-h-svh bg-background">
					<MarketplaceHeader />
					<section className="mx-auto flex min-h-[60svh] max-w-3xl flex-col justify-center px-5 py-16 sm:px-8">
						<p className="text-sm text-muted-foreground">Public listing</p>
						<h1 className="mt-3 text-3xl font-semibold tracking-tight">This listing is unavailable</h1>
						<p className="mt-3 max-w-xl leading-7 text-muted-foreground">
							It may be unpublished, restricted, or no longer available from this approved Vendor.
						</p>
						<Link className="mt-6 inline-flex w-fit items-center gap-2 text-sm font-medium underline underline-offset-4" href="/search">
							<ArrowLeft className="size-4" aria-hidden="true" />
							Return to discovery
						</Link>
					</section>
				</main>
				<MarketplaceFooter />
			</>
		)
	}

	const isProduct = listing.kind === 'product'
	return (
		<>
			<main className="min-h-svh bg-background">
				<MarketplaceHeader />
				<div className="mx-auto max-w-7xl px-5 py-7 sm:px-8 sm:py-10">
					<nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
						<Link className="hover:text-foreground hover:underline" href={backTo}>
							Discovery
						</Link>
						<span aria-hidden="true">/</span>
						<Link className="capitalize hover:text-foreground hover:underline" href={`/search?kind=${listing.kind}`}>
							{listing.kind}s
						</Link>
						<span aria-hidden="true">/</span>
						<span aria-current="page" className="truncate text-foreground">
							{listing.title}
						</span>
					</nav>

					<section
						className="mt-7 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.75fr)] lg:gap-12"
						aria-labelledby="listing-title">
						<div>
							<ListingMedia title={listing.title} kind={listing.kind} images={listing.images} shortVideo={listing.shortVideo} gallery priority />
							{listing.shortVideo && (
								<div className="mt-4 rounded-xl border p-4">
									<div className="flex items-center gap-2 text-sm font-medium">
										<Play className="size-4" aria-hidden="true" />
										Approved video
									</div>
									<video
										className="mt-3 aspect-video w-full rounded-lg bg-black object-contain"
										controls
										crossOrigin="anonymous"
										preload="metadata"
										poster={`/v1/public/media/${listing.shortVideo.id}/poster`}>
										<source src={`/v1/public/media/${listing.shortVideo.id}/video`} type="video/mp4" />
										{listing.shortVideo.hasCaptions ? (
											<track
												default
												kind="captions"
												label="English"
												src={`/v1/public/media/${listing.shortVideo.id}/captions.vtt`}
												srcLang="en"
											/>
										) : null}
									</video>
									{listing.shortVideo.description ? (
										<p className="mt-3 text-sm text-muted-foreground">{listing.shortVideo.description}</p>
									) : null}
								</div>
							)}
						</div>

						<div className={isProduct ? undefined : 'text-center'}>
							<div className={`flex flex-wrap items-center gap-2 ${isProduct ? '' : 'justify-center'}`}>
								<Badge variant="secondary">{isProduct ? 'Product' : 'Service'}</Badge>
								<span className="text-sm capitalize text-muted-foreground">{listing.category}</span>
							</div>
							<h1 className="mt-4 break-words text-4xl font-semibold tracking-tight sm:text-5xl" id="listing-title">
								{listing.title}
							</h1>
							<Link className="mt-3 inline-flex text-sm font-medium underline underline-offset-4" href={`/vendors/${listing.vendor.slug}`}>
								Sold by {listing.vendor.displayName}
							</Link>
							{isProduct ? <p className="mt-6 text-2xl font-semibold">{formatListingPrice(listing)}</p> : null}
							{isProduct && listing.durationMinutes ? (
								<p className="mt-2 text-sm text-muted-foreground">Fixed duration: {listing.durationMinutes} minutes</p>
							) : null}

							{isProduct ? (
								<ProductSelection listing={listing} />
							) : (
								<ServiceSelection
									listing={listing}
									editId={typeof values.appointmentIntent === 'string' ? values.appointmentIntent : undefined}
								/>
							)}
							{isProduct ? (
								<section className="mt-7 border-t pt-6" aria-labelledby="locations-title">
									<h2 className="font-medium" id="locations-title">
										Public locations
									</h2>
									{listing.locations.length ? (
										<ul className="mt-3 flex flex-wrap gap-2">
											{listing.locations.map((location) => (
												<li className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm" key={location.id}>
													<MapPin className="size-3.5 text-muted-foreground" aria-hidden="true" />
													{location.label} · {location.city}
												</li>
											))}
										</ul>
									) : (
										<p className="mt-3 text-sm text-muted-foreground">This Vendor has not published a location for this listing.</p>
									)}
								</section>
							) : null}
						</div>
					</section>

					<section className="mt-12 max-w-3xl border-t pt-8" aria-labelledby="description-title">
						<h2 className="text-2xl font-semibold tracking-tight" id="description-title">
							About this {isProduct ? 'product' : 'service'}
						</h2>
						<p className="mt-4 whitespace-pre-wrap leading-7 text-muted-foreground">{listing.description}</p>
					</section>
					<section className="mt-10 max-w-3xl border-t pt-8" aria-labelledby="reviews-title">
						<h2 className="text-xl font-semibold tracking-tight" id="reviews-title">
							Reviews
						</h2>
						<p className="mt-3 text-sm text-muted-foreground">No reviews yet. Public review evidence is introduced in a later phase.</p>
					</section>
				</div>
			</main>
			<MarketplaceFooter />
		</>
	)
}
