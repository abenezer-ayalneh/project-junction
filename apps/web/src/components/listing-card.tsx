import type { ListingSummary, PublicListingSummary } from 'contracts'
import Link from 'next/link'

import { ListingMedia } from '@/components/listing-media'
import { ListingSaveButton } from '@/components/listing-save-button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatListingPrice } from '@/lib/marketplace'

type ListingCardData = ListingSummary | PublicListingSummary
type PublicVendor = PublicListingSummary['vendor']

function hasVendor(listing: ListingCardData): listing is PublicListingSummary {
	return 'vendor' in listing
}

export function ListingCard({
	listing,
	vendor,
	priority = false,
	returnTo,
}: {
	listing: ListingCardData
	vendor?: PublicVendor
	priority?: boolean
	returnTo?: string
}) {
	const resolvedVendor = hasVendor(listing) ? listing.vendor : vendor
	const kindLabel = listing.kind === 'product' ? 'Product' : 'Service'

	return (
		<Card className="h-full py-0 shadow-none">
			<ListingMedia title={listing.title} kind={listing.kind} images={listing.images} shortVideo={listing.shortVideo} priority={priority} />
			<CardContent className="flex min-h-52 flex-1 flex-col py-4">
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="secondary">{kindLabel}</Badge>
					<span className="text-xs capitalize text-muted-foreground">{listing.category}</span>
				</div>
				<Link
					className="mt-4 w-fit text-lg font-medium tracking-tight hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					href={`/listings/${listing.id}${returnTo ? `?from=${encodeURIComponent(returnTo)}` : ''}`}>
					{listing.title}
				</Link>
				{resolvedVendor && (
					<Link className="mt-1 w-fit text-sm text-muted-foreground hover:text-foreground hover:underline" href={`/vendors/${resolvedVendor.slug}`}>
						{resolvedVendor.displayName}
					</Link>
				)}
				<p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{listing.description}</p>
				<div className="mt-auto flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pt-5">
					<p className="font-medium">{formatListingPrice(listing)}</p>
					{listing.variants?.length ? <p className="text-xs text-muted-foreground">{listing.variants.length} options</p> : null}
					{listing.durationMinutes ? <p className="text-xs text-muted-foreground">{listing.durationMinutes} min</p> : null}
				</div>
				<ListingSaveButton listingId={listing.id} title={listing.title} />
			</CardContent>
		</Card>
	)
}
