'use client'

import {
	type CatalogHealth,
	CatalogHealthSchema,
	type MediaReviewQueue,
	MediaReviewQueueSchema,
	type PlatformReviewQueue,
	PlatformReviewQueueSchema,
} from 'contracts'
import Link from 'next/link'
import { type FormEvent, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { runtimeLabel } from '@/lib/runtime-label'

const apiBase = '/v1'

async function apiRequest(path: string, body?: unknown) {
	const response = await fetch(`${apiBase}${path}`, {
		method: body === undefined ? 'GET' : 'POST',
		headers: {
			...(body === undefined ? {} : { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }),
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
		cache: 'no-store',
	})
	const result: unknown = await response.json()
	if (!response.ok) {
		const detail = result && typeof result === 'object' && 'message' in result ? String(result.message) : `Request failed (${response.status})`
		throw new Error(detail)
	}
	return result
}

function mergeQueue(current: PlatformReviewQueue, next: PlatformReviewQueue): PlatformReviewQueue {
	return {
		applications: [...new Map([...current.applications, ...next.applications].map((item) => [item.id, item])).values()],
		listings: [...new Map([...current.listings, ...next.listings].map((item) => [item.listing.id, item])).values()],
		applicationsNextCursor: next.applicationsNextCursor,
		listingsNextCursor: next.listingsNextCursor,
	}
}

export default function PlatformReview() {
	const [queue, setQueue] = useState<PlatformReviewQueue | null>(null)
	const [mediaQueue, setMediaQueue] = useState<MediaReviewQueue | null>(null)
	const [catalogHealth, setCatalogHealth] = useState<CatalogHealth | null>(null)
	const [mediaPreview, setMediaPreview] = useState<{ mediaId: string; videoUrl: string; posterUrl: string; captionText: string | null } | null>(null)
	const [message, setMessage] = useState('')
	const [busy, setBusy] = useState(false)

	async function run(action: () => Promise<void>) {
		setBusy(true)
		setMessage('')
		try {
			await action()
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'The review request could not be completed.')
		} finally {
			setBusy(false)
		}
	}

	async function loadQueue(append = false) {
		const query = new URLSearchParams({ limit: '50' })
		if (append && queue?.applicationsNextCursor) query.set('applicationCursor', queue.applicationsNextCursor)
		if (append && queue?.listingsNextCursor) query.set('listingCursor', queue.listingsNextCursor)
		const next = PlatformReviewQueueSchema.parse(await apiRequest(`/platform/review-queue?${query.toString()}`))
		setQueue(append && queue ? mergeQueue(queue, next) : next)
		if (!append) setMediaQueue(MediaReviewQueueSchema.parse(await apiRequest('/platform/media-review-queue?limit=50')))
		if (!append) setCatalogHealth(CatalogHealthSchema.parse(await apiRequest('/platform/catalog-health')))
		setMessage('Review queue loaded.')
	}

	function formValue(form: FormData, name: string) {
		const value = form.get(name)
		return typeof value === 'string' ? value.trim() : ''
	}

	function review(event: FormEvent<HTMLFormElement>, path: string, expectedVersion?: number) {
		event.preventDefault()
		const form = new FormData(event.currentTarget)
		void run(async () => {
			await apiRequest(path, {
				decision: formValue(form, 'decision'),
				note: formValue(form, 'note'),
				...(expectedVersion === undefined ? {} : { expectedVersion }),
			})
			await loadQueue()
			setMessage('Review decision recorded. The queue reflects current state.')
		})
	}

	return (
		<main className="mx-auto min-h-svh max-w-6xl px-5 py-8 sm:px-8">
			<header className="flex items-center justify-between gap-4 border-b pb-6">
				<Link href="/" className="text-sm font-semibold">
					Junction
				</Link>
				<Badge variant="outline">{runtimeLabel} review</Badge>
			</header>
			<div className="py-10">
				<h1 className="text-4xl font-semibold tracking-tight">Review queue</h1>
				<p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
					Only a scoped Platform review session can load pending Vendor applications and listings. Each decision requires a review note.
				</p>
			</div>
			<form
				onSubmit={(event) => {
					event.preventDefault()
					void run(() => loadQueue())
				}}
				className="flex flex-col gap-3 rounded-xl border p-5 sm:flex-row sm:items-end">
				<Button type="submit" disabled={busy}>
					Load queue
				</Button>
			</form>
			<p className="mt-2 text-xs text-muted-foreground">
				A verified reviewer account can load the queue. Sign in again with your authenticator within 15 minutes before recording a decision.
			</p>
			{message && (
				<p className="mt-5 rounded-lg border px-4 py-3 text-sm" role="status">
					{message}
				</p>
			)}

			{queue && (
				<div className="mt-10 grid gap-12">
					{catalogHealth && (
						<section aria-labelledby="catalog-health-heading" className="rounded-xl border p-5">
							<h2 id="catalog-health-heading" className="text-xl font-semibold">
								Catalog health
							</h2>
							<p className="mt-2 text-sm text-muted-foreground">
								Published {catalogHealth.publishedListings} · projected {catalogHealth.projectedListings} · lagging{' '}
								{catalogHealth.laggingListings} · oldest lag {Math.round(catalogHealth.oldestLagSeconds)}s
							</p>
							<p className="mt-1 text-sm text-muted-foreground">
								Pending reviews {catalogHealth.pendingReviews} · oldest {Math.round(catalogHealth.oldestReviewLagSeconds)}s · import dry runs{' '}
								{catalogHealth.importDryRuns} · oldest {Math.round(catalogHealth.oldestImportDryRunSeconds)}s
							</p>
							<p className="mt-1 text-sm text-muted-foreground">
								Review events {catalogHealth.reviewEvents} · import jobs {catalogHealth.importJobs} · media pending {catalogHealth.mediaPending}{' '}
								· media dead letters {catalogHealth.mediaDeadLetters}
							</p>
							{catalogHealth.laggingListings > 0 && (
								<p className="mt-2 text-sm font-medium" role="alert">
									Search projection is lagging behind published listings.
								</p>
							)}
						</section>
					)}
					<section aria-labelledby="media-queue-heading">
						<h2 id="media-queue-heading" className="border-b pb-3 text-2xl font-semibold">
							Video moderation
						</h2>
						{mediaQueue?.items.length ? (
							<ul className="mt-5 grid gap-4 lg:grid-cols-2">
								{mediaQueue.items.map((item) => (
									<li key={item.id} className="rounded-xl border p-5">
										<h3 className="text-lg font-medium">{item.listingTitle}</h3>
										<p className="mt-2 text-sm text-muted-foreground">
											{item.vendorName ?? 'Vendor'} · {item.durationSeconds.toFixed(1)} seconds · {item.outputWidth} × {item.outputHeight}{' '}
											· {item.captioned ? 'Captioned' : 'No speech declared'} · version {item.version}
										</p>
										{item.description && <p className="mt-2 text-sm">{item.description}</p>}
										<Button
											type="button"
											variant="outline"
											disabled={busy}
											className="mt-4"
											onClick={() =>
												void run(async () => {
													const preview = (await apiRequest(`/platform/media/${item.id}/preview`)) as {
														mediaId: string
														videoUrl: string
														posterUrl: string
														captionText: string | null
													}
													setMediaPreview(preview)
												})
											}>
											Load private preview
										</Button>
										{mediaPreview?.mediaId === item.id && (
											<div className="mt-4">
												<video
													controls
													preload="metadata"
													poster={mediaPreview.posterUrl}
													className="aspect-video w-full rounded-lg bg-black object-contain"
													aria-label={`Review video for ${item.listingTitle}`}>
													<source src={mediaPreview.videoUrl} type="video/mp4" />
													{mediaPreview.captionText && (
														<track
															kind="captions"
															src={`data:text/vtt;charset=utf-8,${encodeURIComponent(mediaPreview.captionText)}`}
															srcLang="en"
															label="English"
															default
														/>
													)}
												</video>
												{mediaPreview.captionText && (
													<pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs">{mediaPreview.captionText}</pre>
												)}
											</div>
										)}
										<form
											onSubmit={(event) => {
												review(event, `/platform/media/${item.id}/review`, item.version)
												setMediaPreview(null)
											}}
											className="mt-5 grid gap-3">
											<label className="grid gap-1 text-sm">
												Decision
												<select name="decision" className="h-10 rounded-lg border bg-background px-3">
													<option value="approve">Approve</option>
													<option value="reject">Reject</option>
												</select>
											</label>
											<label className="grid gap-1 text-sm">
												Review note
												<textarea
													name="note"
													required
													minLength={3}
													maxLength={1000}
													rows={2}
													className="rounded-lg border bg-background p-3"
												/>
											</label>
											<Button disabled={busy} type="submit" className="w-fit">
												Record media decision
											</Button>
										</form>
									</li>
								))}
							</ul>
						) : (
							<p className="mt-5 text-sm text-muted-foreground">No processed videos awaiting moderation.</p>
						)}
					</section>
					<section aria-labelledby="application-queue-heading">
						<div className="flex items-end justify-between gap-4 border-b pb-3">
							<h2 id="application-queue-heading" className="text-2xl font-semibold">
								Vendor applications
							</h2>
							<span className="text-sm text-muted-foreground">{queue.applications.length} loaded</span>
						</div>
						{queue.applications.length === 0 ? (
							<p className="mt-5 text-sm text-muted-foreground">No applications awaiting review.</p>
						) : (
							<ul className="mt-5 grid gap-4 lg:grid-cols-2">
								{queue.applications.map((application) => (
									<li key={application.id} className="rounded-xl border p-5">
										<div className="flex items-start justify-between gap-3">
											<h3 className="text-lg font-medium">{application.displayName ?? 'Unnamed Vendor'}</h3>
											<Badge variant="secondary">Pending</Badge>
										</div>
										<p className="mt-2 text-sm text-muted-foreground">{application.description}</p>
										<p className="mt-3 text-xs text-muted-foreground">
											{application.slug} ·{' '}
											{application.locations.map((location) => `${location.label ?? 'Location'}, ${location.city ?? 'City'}`).join('; ')}
										</p>
										<form onSubmit={(event) => review(event, `/vendor-applications/${application.id}/review`)} className="mt-5 grid gap-3">
											<label className="grid gap-1 text-sm">
												Decision
												<select name="decision" className="h-10 rounded-lg border bg-background px-3">
													<option value="approve">Approve</option>
													<option value="reject">Reject</option>
													<option value="restrict">Restrict</option>
												</select>
											</label>
											<label className="grid gap-1 text-sm">
												Review note
												<textarea
													name="note"
													required
													minLength={3}
													maxLength={1000}
													rows={2}
													className="rounded-lg border bg-background p-3"
												/>
											</label>
											<Button disabled={busy} type="submit" className="w-fit">
												Record decision
											</Button>
										</form>
									</li>
								))}
							</ul>
						)}
					</section>
					<section aria-labelledby="listing-queue-heading">
						<div className="flex items-end justify-between gap-4 border-b pb-3">
							<h2 id="listing-queue-heading" className="text-2xl font-semibold">
								Listing reviews
							</h2>
							<span className="text-sm text-muted-foreground">{queue.listings.length} loaded</span>
						</div>
						{queue.listings.length === 0 ? (
							<p className="mt-5 text-sm text-muted-foreground">No eligible listings awaiting review.</p>
						) : (
							<ul className="mt-5 grid gap-4 lg:grid-cols-2">
								{queue.listings.map((item) => (
									<li key={item.listing.id} className="rounded-xl border p-5">
										<div className="flex items-start justify-between gap-3">
											<h3 className="text-lg font-medium">{item.listing.title}</h3>
											<Badge variant="secondary">Pending review</Badge>
										</div>
										<p className="mt-2 text-sm text-muted-foreground">{item.listing.description}</p>
										<p className="mt-3 text-xs text-muted-foreground">
											{item.vendorName ?? item.vendorId} · {item.listing.kind} · {item.listing.category} · version {item.listing.version}
										</p>
										<p className="mt-2 text-sm">
											{item.listing.priceCents === undefined ? 'Variant prices' : `ETB ${(item.listing.priceCents / 100).toFixed(2)}`}
											{item.listing.durationMinutes ? ` · ${item.listing.durationMinutes} minutes` : ''}
										</p>
										{item.listing.variants && (
											<ul className="mt-2 text-xs text-muted-foreground">
												{item.listing.variants.map((variant) => (
													<li key={variant.sku}>
														{variant.sku} · {variant.label} · ETB {(variant.priceCents / 100).toFixed(2)}
													</li>
												))}
											</ul>
										)}
										<form
											onSubmit={(event) => review(event, `/listings/${item.listing.id}/review`, item.listing.version)}
											className="mt-5 grid gap-3">
											<label className="grid gap-1 text-sm">
												Decision
												<select name="decision" className="h-10 rounded-lg border bg-background px-3">
													<option value="approve">Approve</option>
													<option value="reject">Reject</option>
												</select>
											</label>
											<label className="grid gap-1 text-sm">
												Review note
												<textarea
													name="note"
													required
													minLength={3}
													maxLength={1000}
													rows={2}
													className="rounded-lg border bg-background p-3"
												/>
											</label>
											<Button disabled={busy} type="submit" className="w-fit">
												Record decision
											</Button>
										</form>
									</li>
								))}
							</ul>
						)}
					</section>
					{(queue.applicationsNextCursor || queue.listingsNextCursor) && (
						<Button type="button" variant="outline" disabled={busy} className="w-fit" onClick={() => void run(() => loadQueue(true))}>
							Load more pending work
						</Button>
					)}
				</div>
			)}
		</main>
	)
}
