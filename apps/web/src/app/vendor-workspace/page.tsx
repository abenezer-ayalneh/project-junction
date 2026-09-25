'use client'

import {
	type CatalogImportResult,
	CatalogImportResultSchema,
	MediaUploadIntentSchema,
	Phase01MediaLimits,
	VendorApplicationResultSchema,
	type VendorCatalog,
	VendorCatalogSchema,
} from 'contracts'
import Link from 'next/link'
import { type FormEvent, useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const apiBase = process.env.NEXT_PUBLIC_JUNCTION_API_URL ?? 'http://127.0.0.1:3001/v1'
const categories = ['goods', 'home', 'fashion', 'beauty', 'appointment', 'education', 'repair'] as const

async function apiRequest(path: string, sessionId: string, body?: unknown, requestKey?: string) {
	const response = await fetch(`${apiBase}${path}`, {
		method: body === undefined ? 'GET' : 'POST',
		headers: {
			'x-junction-session': sessionId,
			...(body === undefined ? {} : { 'content-type': 'application/json', 'idempotency-key': requestKey ?? crypto.randomUUID() }),
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

export default function VendorWorkspace() {
	const [sessionId, setSessionId] = useState('')
	const [issuedSessionId, setIssuedSessionId] = useState('')
	const [catalog, setCatalog] = useState<VendorCatalog | null>(null)
	const [message, setMessage] = useState('')
	const [busy, setBusy] = useState(false)
	const [csv, setCsv] = useState('kind,category,title,description,priceCents,durationMinutes\n')
	const [importResult, setImportResult] = useState<CatalogImportResult | null>(null)
	const [editingListingId, setEditingListingId] = useState<string | null>(null)
	const draftForm = useRef<HTMLFormElement>(null)
	const draftStorageKey = catalog ? `junction:vendor-draft:${catalog.id}` : null

	useEffect(() => {
		if (!draftStorageKey || !draftForm.current) return
		const saved = sessionStorage.getItem(draftStorageKey)
		if (!saved) return
		try {
			const fields = JSON.parse(saved) as Record<string, string>
			for (const [name, value] of Object.entries(fields)) {
				const control = draftForm.current.elements.namedItem(name)
				if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) control.value = value
			}
		} catch {
			sessionStorage.removeItem(draftStorageKey)
		}
	}, [draftStorageKey])

	function savePrivateDraft(form: HTMLFormElement) {
		if (!draftStorageKey) return
		const fields = Object.fromEntries([...new FormData(form)].filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
		sessionStorage.setItem(draftStorageKey, JSON.stringify(fields))
		sessionStorage.removeItem(`${draftStorageKey}:request-key`)
	}

	async function loadCatalog(id = sessionId) {
		setCatalog(VendorCatalogSchema.parse(await apiRequest('/vendor/catalog', id)))
		setMessage('Private catalog loaded.')
	}

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

	function formValue(form: FormData, name: string) {
		const value = form.get(name)
		return typeof value === 'string' ? value.trim() : ''
	}

	function apply(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const form = new FormData(event.currentTarget)
		void run(async () => {
			const result = VendorApplicationResultSchema.parse(
				await apiRequest('/vendor-applications', sessionId, {
					displayName: formValue(form, 'displayName'),
					slug: formValue(form, 'slug'),
					description: formValue(form, 'description'),
					location: { label: formValue(form, 'locationLabel'), city: formValue(form, 'city'), address: formValue(form, 'address') },
				}),
			)
			setSessionId(result.sessionId)
			setIssuedSessionId(result.sessionId)
			await loadCatalog(result.sessionId)
			setMessage('Application submitted. Your storefront and listings stay private until Platform approval.')
		})
	}

	function createListing(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const formElement = event.currentTarget
		const form = new FormData(formElement)
		const kind = formValue(form, 'kind')
		const price = Number(formValue(form, 'price'))
		const retryStorageKey = draftStorageKey ? `${draftStorageKey}:request-key` : null
		const requestKey = (retryStorageKey && sessionStorage.getItem(retryStorageKey)) || crypto.randomUUID()
		if (retryStorageKey) sessionStorage.setItem(retryStorageKey, requestKey)
		void run(async () => {
			await apiRequest(
				'/listings',
				sessionId,
				{
					kind,
					category: formValue(form, 'category'),
					title: formValue(form, 'title'),
					description: formValue(form, 'description'),
					priceCents: Math.round(price * 100),
					...(kind === 'service' ? { durationMinutes: Number(formValue(form, 'duration')) } : {}),
				},
				requestKey,
			)
			await loadCatalog()
			setMessage('Private listing draft created. Submit it when ready for review.')
			formElement.reset()
			if (draftStorageKey) sessionStorage.removeItem(draftStorageKey)
			if (retryStorageKey) sessionStorage.removeItem(retryStorageKey)
		})
	}

	function reviseListing(event: FormEvent<HTMLFormElement>, listing: VendorCatalog['listings'][number]) {
		event.preventDefault()
		const form = new FormData(event.currentTarget)
		const price = formValue(form, 'price')
		void run(async () => {
			await apiRequest(`/listings/${listing.id}/revise`, sessionId, {
				expectedVersion: listing.version,
				kind: listing.kind,
				category: formValue(form, 'category'),
				title: formValue(form, 'title'),
				description: formValue(form, 'description'),
				...(price ? { priceCents: Math.round(Number(price) * 100) } : {}),
				...(listing.kind === 'service' ? { durationMinutes: Number(formValue(form, 'duration')) } : {}),
				...(listing.variants ? { variants: listing.variants } : {}),
			})
			setEditingListingId(null)
			await loadCatalog()
			setMessage('Listing revised as a private draft. Submit the new version for review.')
		})
	}

	function unpublishListing(listingId: string) {
		void run(async () => {
			await apiRequest(`/listings/${listingId}/unpublish`, sessionId, {})
			await loadCatalog()
			setMessage('Listing unpublished and removed from public discovery.')
		})
	}

	function updateStorefront(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const form = new FormData(event.currentTarget)
		void run(async () => {
			await apiRequest('/vendor-storefront', sessionId, {
				displayName: formValue(form, 'displayName'),
				slug: formValue(form, 'slug'),
				description: formValue(form, 'description'),
			})
			await loadCatalog()
			setMessage('Storefront details saved.')
		})
	}

	function importCsv(mode: 'dry_run' | 'commit') {
		void run(async () => {
			const result = CatalogImportResultSchema.parse(await apiRequest('/catalog-imports', sessionId, { templateVersion: 'v1', mode, csv }))
			setImportResult(result)
			if (mode === 'commit' && result.state === 'committed') await loadCatalog()
			setMessage(
				mode === 'commit'
					? result.state === 'committed'
						? 'CSV rows committed as private drafts.'
						: 'CSV commit rejected. Resolve row errors first.'
					: 'CSV preview ready.',
			)
		})
	}

	function exportCsv() {
		void run(async () => {
			const response = await fetch(`${apiBase}/catalog-exports/v1`, { headers: { 'x-junction-session': sessionId }, cache: 'no-store' })
			if (!response.ok) throw new Error(`Export failed (${response.status}).`)
			const contents = await response.text()
			const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }))
			const link = document.createElement('a')
			link.href = url
			link.download = 'junction-catalog-v1.csv'
			link.click()
			window.setTimeout(() => URL.revokeObjectURL(url), 1000)
			setMessage('Catalog CSV exported.')
		})
	}

	function uploadVideo(event: FormEvent<HTMLFormElement>, listingId: string) {
		event.preventDefault()
		const form = new FormData(event.currentTarget)
		const file = form.get('video')
		const captions = formValue(form, 'captions')
		const description = formValue(form, 'description')
		if (!(file instanceof File)) return
		void run(async () => {
			if (file.size > Phase01MediaLimits.maxUploadBytes) throw new Error('Video exceeds the 25 MiB limit.')
			const bytes = await file.arrayBuffer()
			const digest = await crypto.subtle.digest('SHA-256', bytes)
			const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
			const intent = MediaUploadIntentSchema.parse(
				await apiRequest(`/listings/${listingId}/video-upload-intents`, sessionId, {
					bytes: file.size,
					sha256,
					...(captions ? { captionText: captions } : { noSpeechDeclared: true, description }),
				}),
			)
			const uploaded = await fetch(intent.url, { method: intent.method, headers: intent.headers, body: file })
			if (!uploaded.ok) throw new Error(`Private upload failed (${uploaded.status}).`)
			await apiRequest(`/media/${intent.mediaId}/complete-upload`, sessionId, { sha256 })
			setMessage('Video sealed in quarantine. Processing and Platform moderation are pending.')
		})
	}

	return (
		<main className="mx-auto min-h-svh max-w-5xl px-5 py-8 sm:px-8">
			<header className="flex items-center justify-between gap-4 border-b pb-6">
				<Link href="/" className="text-sm font-semibold">
					Junction
				</Link>
				<Badge variant="outline">Synthetic Vendor workspace</Badge>
			</header>
			<div className="py-10">
				<h1 className="text-4xl font-semibold tracking-tight">Your Vendor workspace</h1>
				<p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
					Use a current synthetic Customer session to apply. After application, use the issued Owner session to manage private drafts.
				</p>
			</div>
			<form
				onSubmit={(event) => {
					event.preventDefault()
					void run(() => loadCatalog())
				}}
				className="flex flex-col gap-3 rounded-xl border p-5 sm:flex-row sm:items-end">
				<label className="grid flex-1 gap-1.5 text-sm font-medium">
					Synthetic session ID
					<input
						type="password"
						required
						value={sessionId}
						onChange={(event) => {
							setSessionId(event.target.value)
							setIssuedSessionId('')
							setCatalog(null)
						}}
						className="h-10 rounded-lg border bg-background px-3 font-normal"
						placeholder="Current Customer or Vendor Owner session"
						aria-describedby="session-help"
					/>
				</label>
				<Button disabled={busy} type="submit">
					Load workspace
				</Button>
			</form>
			<p id="session-help" className="mt-2 text-xs text-muted-foreground">
				The session stays in this page only and is cleared when you reload it.
			</p>
			{issuedSessionId && (
				<div className="mt-4 rounded-lg border p-4 text-sm">
					<p className="font-medium">Your new synthetic Owner session</p>
					<p className="mt-1 text-muted-foreground">
						Save it for your next visit to this local workspace. It expires with the original Customer session.
					</p>
					<code className="mt-3 block break-all rounded bg-muted px-3 py-2">{issuedSessionId}</code>
				</div>
			)}
			{message && (
				<p className="mt-5 rounded-lg border px-4 py-3 text-sm" role="status">
					{message}
				</p>
			)}

			{catalog ? (
				<div className="mt-10 grid gap-10">
					<section aria-labelledby="storefront-heading" className="rounded-xl border p-6">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<h2 id="storefront-heading" className="text-2xl font-semibold">
								{catalog.displayName ?? 'Your storefront'}
							</h2>
							<Badge variant="secondary" className="capitalize">
								{catalog.applicationState}
							</Badge>
						</div>
						<p className="mt-3 text-sm text-muted-foreground">{catalog.description}</p>
						<p className="mt-4 text-sm">
							{catalog.locations.map((location) => `${location.label ?? 'Location'} · ${location.city ?? 'City'}`).join(', ')}
						</p>
						{catalog.applicationState !== 'approved' && (
							<p className="mt-4 text-sm font-medium">Your content cannot be published until the application is approved.</p>
						)}
						<form onSubmit={updateStorefront} className="mt-6 grid gap-3 border-t pt-5 sm:grid-cols-2">
							<h3 className="font-medium sm:col-span-2">Edit storefront</h3>
							<label className="grid gap-1 text-sm">
								Business name
								<input
									name="displayName"
									required
									minLength={3}
									maxLength={120}
									defaultValue={catalog.displayName ?? ''}
									className="h-10 rounded-lg border bg-background px-3"
								/>
							</label>
							<label className="grid gap-1 text-sm">
								Public slug
								<input
									name="slug"
									required
									minLength={3}
									pattern="[a-z0-9]+(-[a-z0-9]+)*"
									defaultValue={catalog.slug ?? ''}
									className="h-10 rounded-lg border bg-background px-3"
								/>
							</label>
							<label className="grid gap-1 text-sm sm:col-span-2">
								Description
								<textarea
									name="description"
									required
									minLength={10}
									maxLength={2000}
									defaultValue={catalog.description ?? ''}
									rows={3}
									className="rounded-lg border bg-background p-3"
								/>
							</label>
							<Button disabled={busy} type="submit" variant="outline" className="sm:w-fit">
								Save storefront
							</Button>
						</form>
					</section>
					<section aria-labelledby="listings-heading">
						<h2 id="listings-heading" className="text-2xl font-semibold">
							Listings
						</h2>
						{catalog.listings.length === 0 ? (
							<p className="mt-4 text-sm text-muted-foreground">No drafts yet.</p>
						) : (
							<ul className="mt-4 grid gap-3 sm:grid-cols-2">
								{catalog.listings.map((listing) => (
									<li key={listing.id} className="rounded-xl border p-5">
										<div className="flex items-start justify-between gap-2">
											<h3 className="font-medium">{listing.title}</h3>
											<Badge variant="outline" className="capitalize">
												{listing.state.replaceAll('_', ' ')}
											</Badge>
										</div>
										<p className="mt-2 text-sm text-muted-foreground">{listing.description}</p>
										<p className="mt-3 text-xs text-muted-foreground">
											{listing.kind} · {listing.category} · version {listing.version}
										</p>
										<form onSubmit={(event) => uploadVideo(event, listing.id)} className="mt-5 grid gap-2 border-t pt-4">
											<p className="text-sm font-medium">Short video</p>
											<input name="video" type="file" accept="video/mp4" required className="text-sm" />
											<label className="grid gap-1 text-xs">
												WebVTT captions for any audio
												<textarea name="captions" rows={2} className="rounded-lg border bg-background p-2" placeholder="WEBVTT" />
											</label>
											<label className="grid gap-1 text-xs">
												No-speech description when no captions
												<textarea
													name="description"
													minLength={10}
													maxLength={1000}
													rows={2}
													className="rounded-lg border bg-background p-2"
												/>
											</label>
											<Button type="submit" variant="outline" disabled={busy} className="w-fit">
												Upload for moderation
											</Button>
										</form>
										{['draft', 'rejected', 'unpublished'].includes(listing.state) && (
											<div className="mt-4 flex flex-wrap gap-2">
												<Button
													disabled={busy}
													type="button"
													variant="outline"
													onClick={() =>
														void run(async () => {
															await apiRequest(`/listings/${listing.id}/submit`, sessionId, {})
															await loadCatalog()
															setMessage('Listing submitted for Platform review.')
														})
													}>
													Submit for review
												</Button>
												<Button
													disabled={busy}
													type="button"
													variant="outline"
													onClick={() => setEditingListingId(editingListingId === listing.id ? null : listing.id)}>
													{editingListingId === listing.id ? 'Close revision' : 'Revise'}
												</Button>
											</div>
										)}
										{listing.state === 'published' && (
											<Button
												disabled={busy}
												type="button"
												variant="outline"
												className="mt-4"
												onClick={() => unpublishListing(listing.id)}>
												Unpublish
											</Button>
										)}
										{editingListingId === listing.id && (
											<form onSubmit={(event) => reviseListing(event, listing)} className="mt-5 grid gap-3 border-t pt-5">
												<p className="text-xs text-muted-foreground">
													Editing version {listing.version}. Another change will require you to reload before saving.
												</p>
												<label className="grid gap-1 text-sm">
													Category
													<select
														name="category"
														defaultValue={listing.category}
														className="h-10 rounded-lg border bg-background px-3">
														{categories.map((category) => (
															<option key={category} value={category}>
																{category}
															</option>
														))}
													</select>
												</label>
												<label className="grid gap-1 text-sm">
													Title
													<input
														name="title"
														required
														minLength={3}
														maxLength={160}
														defaultValue={listing.title}
														className="h-10 rounded-lg border bg-background px-3"
													/>
												</label>
												<label className="grid gap-1 text-sm">
													Description
													<textarea
														name="description"
														required
														minLength={10}
														maxLength={4000}
														defaultValue={listing.description}
														rows={3}
														className="rounded-lg border bg-background p-3"
													/>
												</label>
												<label className="grid gap-1 text-sm">
													Price (ETB)
													<input
														name="price"
														type="number"
														required={listing.kind === 'service' || !listing.variants?.length}
														min="0.01"
														step="0.01"
														defaultValue={listing.priceCents ? listing.priceCents / 100 : ''}
														className="h-10 rounded-lg border bg-background px-3"
													/>
												</label>
												{listing.kind === 'service' && (
													<label className="grid gap-1 text-sm">
														Duration in minutes
														<input
															name="duration"
															type="number"
															required
															min="15"
															max="480"
															step="1"
															defaultValue={listing.durationMinutes}
															className="h-10 rounded-lg border bg-background px-3"
														/>
													</label>
												)}
												<Button disabled={busy} type="submit">
													Save revision
												</Button>
											</form>
										)}
									</li>
								))}
							</ul>
						)}
					</section>
					<section aria-labelledby="csv-heading" className="rounded-xl border p-6">
						<h2 id="csv-heading" className="text-2xl font-semibold">
							Catalog CSV
						</h2>
						<p className="mt-2 text-sm text-muted-foreground">Use template v1. Preview validates every row before committing private drafts.</p>
						<label className="mt-4 grid gap-2 text-sm font-medium">
							Choose a CSV file
							<input
								type="file"
								accept=".csv,text/csv"
								className="rounded-lg border bg-background p-2 text-sm"
								onChange={(event) => {
									const file = event.target.files?.[0]
									if (file)
										void file.text().then((contents) => {
											setCsv(contents)
											setImportResult(null)
										})
								}}
							/>
						</label>
						<label className="mt-4 grid gap-2 text-sm font-medium">
							CSV contents
							<textarea
								value={csv}
								onChange={(event) => {
									setCsv(event.target.value)
									setImportResult(null)
								}}
								rows={7}
								spellCheck={false}
								className="w-full rounded-lg border bg-background p-3 font-mono text-xs"
							/>
						</label>
						<div className="mt-4 flex flex-wrap gap-2">
							<Button disabled={busy || !sessionId} type="button" variant="outline" onClick={() => importCsv('dry_run')}>
								Preview CSV
							</Button>
							<Button
								disabled={
									busy ||
									!sessionId ||
									!importResult ||
									importResult.state !== 'dry_run' ||
									importResult.validRowCount !== importResult.rowCount
								}
								type="button"
								onClick={() => importCsv('commit')}>
								Commit valid CSV
							</Button>
							<Button disabled={busy || !sessionId} type="button" variant="outline" onClick={exportCsv}>
								Export catalog
							</Button>
						</div>
						{importResult && (
							<div className="mt-5 text-sm" role="status">
								<p>
									{importResult.validRowCount} of {importResult.rowCount} rows valid · {importResult.state.replaceAll('_', ' ')}
									{importResult.replayed ? ' · replayed' : ''}
								</p>
								<ul className="mt-3 grid gap-2">
									{importResult.rows.map((row) => (
										<li key={row.rowNumber} className="rounded-lg border p-3">
											<strong>
												Row {row.rowNumber}: {row.status}
											</strong>
											<span className="ml-2">{typeof row.preview['title'] === 'string' ? row.preview['title'] : ''}</span>
											{row.errors.length > 0 && <p className="mt-1 text-destructive">{row.errors.join('; ')}</p>}
										</li>
									))}
								</ul>
							</div>
						)}
					</section>
					{!['rejected', 'restricted'].includes(catalog.applicationState) && (
						<section aria-labelledby="new-listing-heading" className="rounded-xl border p-6">
							<h2 id="new-listing-heading" className="text-2xl font-semibold">
								Create a private draft
							</h2>
							<form
								ref={draftForm}
								onInput={(event) => savePrivateDraft(event.currentTarget)}
								onSubmit={createListing}
								className="mt-5 grid gap-4 sm:grid-cols-2">
								<p className="text-xs text-muted-foreground sm:col-span-2">
									This private draft stays in this browser tab through a reload. If the connection fails, reconnect with your Vendor session
									and retry. It clears after successful creation or when the tab closes.
								</p>
								<label className="grid gap-1 text-sm">
									Offering type
									<select name="kind" className="h-10 rounded-lg border bg-background px-3">
										<option value="product">Product</option>
										<option value="service">Service</option>
									</select>
								</label>
								<label className="grid gap-1 text-sm">
									Category
									<select name="category" className="h-10 rounded-lg border bg-background px-3">
										{categories.map((category) => (
											<option key={category} value={category}>
												{category}
											</option>
										))}
									</select>
								</label>
								<label className="grid gap-1 text-sm sm:col-span-2">
									Title
									<input name="title" required minLength={3} maxLength={160} className="h-10 rounded-lg border bg-background px-3" />
								</label>
								<label className="grid gap-1 text-sm sm:col-span-2">
									Description
									<textarea
										name="description"
										required
										minLength={10}
										maxLength={4000}
										rows={3}
										className="rounded-lg border bg-background p-3"
									/>
								</label>
								<label className="grid gap-1 text-sm">
									Price (ETB)
									<input name="price" type="number" required min="0.01" step="0.01" className="h-10 rounded-lg border bg-background px-3" />
								</label>
								<label className="grid gap-1 text-sm">
									Duration in minutes (Services)
									<input name="duration" type="number" min="15" max="480" step="1" className="h-10 rounded-lg border bg-background px-3" />
								</label>
								<Button disabled={busy} type="submit" className="sm:col-span-2 sm:w-fit">
									Create draft
								</Button>
							</form>
						</section>
					)}
				</div>
			) : (
				<section className="mt-10 rounded-xl border p-6" aria-labelledby="application-heading">
					<h2 id="application-heading" className="text-2xl font-semibold">
						Apply as a Vendor
					</h2>
					<p className="mt-2 text-sm text-muted-foreground">Your application and storefront stay private while Platform review is pending.</p>
					<form onSubmit={apply} className="mt-5 grid gap-4 sm:grid-cols-2">
						<label className="grid gap-1 text-sm">
							Business name
							<input name="displayName" required minLength={3} maxLength={120} className="h-10 rounded-lg border bg-background px-3" />
						</label>
						<label className="grid gap-1 text-sm">
							Public slug
							<input name="slug" required minLength={3} pattern="[a-z0-9]+(-[a-z0-9]+)*" className="h-10 rounded-lg border bg-background px-3" />
						</label>
						<label className="grid gap-1 text-sm sm:col-span-2">
							Description
							<textarea name="description" required minLength={10} maxLength={2000} rows={3} className="rounded-lg border bg-background p-3" />
						</label>
						<label className="grid gap-1 text-sm">
							Location name
							<input name="locationLabel" required minLength={2} className="h-10 rounded-lg border bg-background px-3" />
						</label>
						<label className="grid gap-1 text-sm">
							City
							<input name="city" required minLength={2} className="h-10 rounded-lg border bg-background px-3" />
						</label>
						<label className="grid gap-1 text-sm sm:col-span-2">
							Address
							<input name="address" required minLength={5} className="h-10 rounded-lg border bg-background px-3" />
						</label>
						<Button disabled={busy || !sessionId} type="submit" className="sm:col-span-2 sm:w-fit">
							Submit application
						</Button>
					</form>
				</section>
			)}
		</main>
	)
}
