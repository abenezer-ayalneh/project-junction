'use client'

import {
	type CustomerDiscoveryState,
	CustomerDiscoveryStateSchema,
	type PublicListingPage,
	type PublicVendorPage,
	type RecommendationPage,
	RecommendationPageSchema,
} from 'contracts'
import Link from 'next/link'
import { useState } from 'react'

import { Button } from '@/components/ui/button'

const apiBase = process.env.NEXT_PUBLIC_JUNCTION_RUNTIME_MODE === 'staging' ? '/v1' : (process.env.NEXT_PUBLIC_JUNCTION_API_URL ?? 'http://127.0.0.1:3001/v1')
const isStaging = process.env.NEXT_PUBLIC_JUNCTION_RUNTIME_MODE === 'staging'

async function request(path: string, sessionId: string, body?: unknown): Promise<unknown> {
	const response = await fetch(`${apiBase}${path}`, {
		method: body === undefined ? 'GET' : 'POST',
		headers: { ...(sessionId ? { 'x-junction-session': sessionId } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
		cache: 'no-store',
	})
	const result: unknown = await response.json()
	if (!response.ok)
		throw new Error(result && typeof result === 'object' && 'message' in result ? String(result.message) : `Request failed (${response.status}).`)
	return result
}

export function CustomerDiscovery({ listings, vendors }: { listings: PublicListingPage['items']; vendors: PublicVendorPage['items'] }) {
	const [sessionId, setSessionId] = useState('')
	const [state, setState] = useState<CustomerDiscoveryState | null>(null)
	const [recommendations, setRecommendations] = useState<RecommendationPage | null>(null)
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState('')

	async function run(action: () => Promise<void>) {
		setBusy(true)
		setMessage('')
		try {
			await action()
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'The request could not be completed.')
		} finally {
			setBusy(false)
		}
	}

	function loadState() {
		void run(async () => {
			setState(CustomerDiscoveryStateSchema.parse(await request('/customer/discovery', sessionId)))
			setMessage('Customer discovery state loaded.')
		})
	}

	function updateSave(listingId: string) {
		if (!state) return
		const saved = !state.savedListingIds.includes(listingId)
		void run(async () => {
			await request(`/listings/${listingId}/save`, sessionId, { saved })
			setState(CustomerDiscoveryStateSchema.parse(await request('/customer/discovery', sessionId)))
			setMessage(saved ? 'Listing saved.' : 'Listing removed from saved items.')
		})
	}

	function updateFollow(vendorId: string) {
		if (!state) return
		const following = !state.followedVendorIds.includes(vendorId)
		void run(async () => {
			await request(`/vendors/${vendorId}/follow`, sessionId, { following })
			setState(CustomerDiscoveryStateSchema.parse(await request('/customer/discovery', sessionId)))
			setMessage(following ? 'Vendor followed.' : 'Vendor unfollowed.')
		})
	}

	function updatePreference(personalizationOptIn: boolean) {
		void run(async () => {
			await request('/discovery/preference', sessionId, { personalizationOptIn })
			setState(CustomerDiscoveryStateSchema.parse(await request('/customer/discovery', sessionId)))
			setMessage(personalizationOptIn ? 'Personalization enabled.' : 'Personalization disabled.')
		})
	}

	function loadRecommendations() {
		void run(async () => {
			setRecommendations(RecommendationPageSchema.parse(await request('/public/recommendations', sessionId)))
			setMessage('Recommendations loaded.')
		})
	}

	return (
		<section className="mx-auto max-w-7xl px-5 py-14 sm:px-8" aria-labelledby="customer-discovery-title">
			<h2 id="customer-discovery-title" className="text-3xl font-semibold tracking-tight">
				Save what interests you
			</h2>
			<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
				{isStaging ? (
					<>
						Sign in from your{' '}
						<Link href="/account" className="underline">
							account
						</Link>{' '}
						to save offerings, follow Vendors, and choose whether recommendations use those signals.
					</>
				) : (
					'Use a current synthetic Customer session to save offerings, follow Vendors, and choose whether recommendations use those signals.'
				)}
			</p>
			<div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
				{!isStaging && (
					<label className="grid flex-1 gap-1.5 text-sm font-medium">
						Synthetic Customer session
						<input
							type="password"
							value={sessionId}
							onChange={(event) => {
								setSessionId(event.target.value)
								setState(null)
								setRecommendations(null)
							}}
							className="h-10 rounded-lg border bg-background px-3 font-normal"
							autoComplete="off"
						/>
					</label>
				)}
				<Button type="button" variant="outline" disabled={busy || (!isStaging && !sessionId)} onClick={loadState}>
					Load saved state
				</Button>
			</div>
			{!isStaging && <p className="mt-2 text-xs text-muted-foreground">This session stays in the page and clears on reload.</p>}
			{message && (
				<p className="mt-4 rounded-lg border p-3 text-sm" role="status">
					{message}
				</p>
			)}
			{state && (
				<div className="mt-6 grid gap-6 lg:grid-cols-2">
					<div>
						<h3 className="font-medium">Offerings</h3>
						<ul className="mt-3 grid gap-2">
							{listings.map((listing) => (
								<li key={listing.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
									<span className="text-sm">{listing.title}</span>
									<Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => updateSave(listing.id)}>
										{state.savedListingIds.includes(listing.id) ? 'Remove saved' : 'Save'}
									</Button>
								</li>
							))}
						</ul>
					</div>
					<div>
						<h3 className="font-medium">Vendors</h3>
						<ul className="mt-3 grid gap-2">
							{vendors.map((vendor) => (
								<li key={vendor.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
									<span className="text-sm capitalize">{vendor.slug.replaceAll('-', ' ')}</span>
									<Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => updateFollow(vendor.id)}>
										{state.followedVendorIds.includes(vendor.id) ? 'Unfollow' : 'Follow'}
									</Button>
								</li>
							))}
						</ul>
					</div>
				</div>
			)}
			<div className="mt-8 rounded-xl border p-5">
				<label className="flex items-center gap-3 text-sm font-medium">
					<input
						type="checkbox"
						checked={state?.personalizationOptIn ?? false}
						disabled={busy || !state}
						onChange={(event) => updatePreference(event.target.checked)}
						className="size-4 accent-foreground"
					/>
					Use my saved and followed activity for recommendations
				</label>
				<p className="mt-2 text-xs text-muted-foreground">Off by default. You can turn it off at any time.</p>
				<Button className="mt-4" type="button" variant="outline" disabled={busy} onClick={loadRecommendations}>
					Show recommendations
				</Button>
				{recommendations && (
					<ul className="mt-4 grid gap-2">
						{recommendations.items.map((item) => (
							<li key={item.id} className="rounded-lg border p-3 text-sm">
								<strong>{item.title}</strong>
								<p className="mt-1 text-muted-foreground">{item.reason}</p>
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	)
}
