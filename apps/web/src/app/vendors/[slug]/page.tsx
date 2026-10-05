import { ArrowLeft, MapPin, Waypoints } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ThemeToggle } from '@/components/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatPrice, getPublicStorefront } from '@/lib/marketplace'
import { runtimeLabel } from '@/lib/runtime-label'

const publicMediaBase = '/v1'

export default async function VendorStorefront({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params
	const storefront = await getPublicStorefront(slug)

	if (!storefront) {
		if (process.env.NODE_ENV === 'production') notFound()
		return (
			<main className="mx-auto flex min-h-svh max-w-3xl flex-col justify-center px-5 py-16">
				<p className="text-sm text-muted-foreground">{runtimeLabel}</p>
				<h1 className="mt-3 text-3xl font-semibold tracking-tight">This storefront is unavailable</h1>
				<p className="mt-3 max-w-xl leading-7 text-muted-foreground">
					The Vendor may be unpublished, or the {runtimeLabel.toLowerCase()} catalog may be unavailable. Public content is shown only while the Vendor is approved and
					published.
				</p>
				<Link href="/" className="mt-6 inline-flex w-fit items-center gap-2 text-sm font-medium underline underline-offset-4">
					<ArrowLeft className="size-4" aria-hidden="true" />
					Return to discovery
				</Link>
			</main>
		)
	}

	return (
		<main className="min-h-svh bg-background">
			<header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
				<Link className="flex items-center gap-2.5" href="/" aria-label="Junction home">
					<Waypoints className="size-6 text-junction-brand" aria-hidden="true" />
					<span className="text-sm font-semibold tracking-tight">Junction</span>
				</Link>
				<div className="flex items-center gap-3">
					<Badge variant="outline">{runtimeLabel}</Badge>
					<ThemeToggle />
				</div>
			</header>
			<div className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 sm:pb-24">
				<Link href="/#vendors" className="inline-flex items-center gap-2 py-4 text-sm text-muted-foreground hover:text-foreground">
					<ArrowLeft className="size-4" aria-hidden="true" />
					All storefronts
				</Link>
				<section className="mt-5 border-b pb-9 sm:pb-12" aria-labelledby="storefront-title">
					<p className="text-sm text-muted-foreground">Independent Vendor</p>
					<h1 id="storefront-title" className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
						{storefront.displayName}
					</h1>
					<p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">{storefront.description}</p>
					{storefront.locations.length > 0 && (
						<ul className="mt-6 flex list-none flex-wrap gap-2 p-0" aria-label="Store locations">
							{storefront.locations.map((location) => (
								<li key={location.id} className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm">
									<MapPin className="size-3.5 text-muted-foreground" aria-hidden="true" />
									{location.label} · {location.city}
								</li>
							))}
						</ul>
					)}
				</section>
				<section className="pt-9 sm:pt-12" aria-labelledby="offerings-title">
					<div className="flex items-end justify-between gap-4">
						<div>
							<p className="text-sm text-muted-foreground">Published offerings</p>
							<h2 id="offerings-title" className="mt-2 text-3xl font-semibold tracking-tight">
								Explore the catalog
							</h2>
						</div>
						<p className="text-sm text-muted-foreground">
							{storefront.listings.length} {storefront.listings.length === 1 ? 'offering' : 'offerings'}
						</p>
					</div>
					{storefront.listings.length === 0 ? (
						<p className="mt-7 rounded-xl border border-dashed px-5 py-8 text-sm text-muted-foreground">
							This Vendor has no published offerings yet.
						</p>
					) : (
						<ul className="mt-7 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
							{storefront.listings.map((listing, index) => (
								<li key={listing.id}>
									<Card className="h-full overflow-hidden rounded-xl shadow-none">
										<div
											className={`h-1.5 ${index % 3 === 1 ? 'bg-junction-brand/70' : index % 3 === 2 ? 'bg-foreground/50' : 'bg-foreground/15'}`}
											aria-hidden="true"
										/>
										<CardContent className="flex h-full min-h-52 flex-col p-5">
											{listing.shortVideo && (
												<div className="mb-4">
													<video
														controls
														crossOrigin="anonymous"
														preload="metadata"
														className="aspect-video w-full rounded-lg bg-black object-contain"
														poster={`${publicMediaBase}/public/media/${listing.shortVideo.id}/poster`}
														aria-label={`Video for ${listing.title}`}>
														<source src={`${publicMediaBase}/public/media/${listing.shortVideo.id}/video`} type="video/mp4" />
														{listing.shortVideo.hasCaptions && (
															<track
																kind="captions"
																src={`${publicMediaBase}/public/media/${listing.shortVideo.id}/captions.vtt`}
																srcLang="en"
																label="English"
																default
															/>
														)}
													</video>
													{listing.shortVideo.description && (
														<p className="mt-2 text-xs text-muted-foreground">{listing.shortVideo.description}</p>
													)}
												</div>
											)}
											<div className="flex items-center gap-2">
												<Badge variant="secondary">{listing.kind === 'product' ? 'Product' : 'Service'}</Badge>
												<span className="text-xs capitalize text-muted-foreground">{listing.category}</span>
											</div>
											<h3 className="mt-5 text-lg font-medium tracking-tight">{listing.title}</h3>
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
				</section>
				<p className="mt-10 border-t pt-5 text-xs text-muted-foreground">{runtimeLabel} · browsing only · no checkout or booking</p>
			</div>
		</main>
	)
}
