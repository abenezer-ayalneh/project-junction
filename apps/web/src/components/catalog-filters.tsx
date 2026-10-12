'use client'

import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, type ReactNode, useRef } from 'react'

import { Button } from '@/components/ui/button'

const categories = [
	['', 'All categories'],
	['goods', 'Goods'],
	['home', 'Home'],
	['fashion', 'Fashion'],
	['beauty', 'Beauty'],
	['appointment', 'Appointments'],
	['education', 'Learning'],
	['repair', 'Repairs'],
] as const

type FilterValues = {
	q: string
	kind: string
	category: string
	vendor: string
	minPriceCents: string
	maxPriceCents: string
	sort: string
}

function requestFromForm(form: HTMLFormElement) {
	const source = new FormData(form)
	const query = new URLSearchParams()
	for (const key of ['q', 'kind', 'category', 'vendor', 'sort']) {
		const value = source.get(key)
		if (typeof value === 'string' && value) query.set(key, value)
	}
	for (const [field, queryKey] of [
		['minPrice', 'minPriceCents'],
		['maxPrice', 'maxPriceCents'],
	] as const) {
		const raw = source.get(field)
		if (typeof raw !== 'string' || !raw.trim()) continue
		const price = Number(raw)
		if (Number.isFinite(price) && price > 0) query.set(queryKey, String(Math.round(price * 100)))
	}
	return query
}

function FilterFields({ values, vendors }: { values: FilterValues; vendors: Array<{ slug: string; displayName: string }> }) {
	return (
		<>
			<input name="q" type="hidden" value={values.q} readOnly />
			<input name="sort" type="hidden" value={values.sort} readOnly />
			<label className="grid min-w-0 gap-1.5 text-sm font-medium">
				Offering type
				<span className="relative block min-w-0">
					<select className="h-10 rounded-lg border bg-background pl-3 pr-9 w-full min-w-0 appearance-none" defaultValue={values.kind} name="kind">
						<option value="">Products and services</option>
						<option value="product">Products</option>
						<option value="service">Services</option>
					</select>
					<ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
				</span>
			</label>
			<label className="grid min-w-0 gap-1.5 text-sm font-medium">
				Category
				<span className="relative block min-w-0">
					<select
						className="h-10 rounded-lg border bg-background pl-3 pr-9 w-full min-w-0 appearance-none"
						defaultValue={values.category}
						name="category">
						{categories.map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
					<ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
				</span>
			</label>
			<label className="grid min-w-0 gap-1.5 text-sm font-medium">
				Vendor
				<span className="relative block min-w-0">
					<select
						className="h-10 rounded-lg border bg-background pl-3 pr-9 w-full min-w-0 appearance-none"
						defaultValue={values.vendor}
						name="vendor">
						<option value="">All Vendors</option>
						{vendors.map((vendor) => (
							<option key={vendor.slug} value={vendor.slug}>
								{vendor.displayName}
							</option>
						))}
					</select>
					<ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
				</span>
			</label>
			<div className="grid grid-cols-2 items-end gap-3">
				<label className="grid min-w-0 gap-1.5 text-sm font-medium">
					Min price (ETB)
					<input
						className="h-10 w-full min-w-0 rounded-lg border bg-background px-3"
						defaultValue={values.minPriceCents ? String(Number(values.minPriceCents) / 100) : ''}
						inputMode="decimal"
						min="0"
						name="minPrice"
						type="number"
					/>
				</label>
				<label className="grid min-w-0 gap-1.5 text-sm font-medium">
					Max price (ETB)
					<input
						className="h-10 w-full min-w-0 rounded-lg border bg-background px-3"
						defaultValue={values.maxPriceCents ? String(Number(values.maxPriceCents) / 100) : ''}
						inputMode="decimal"
						min="0"
						name="maxPrice"
						type="number"
					/>
				</label>
			</div>
		</>
	)
}

export function CatalogFilters({
	values,
	vendors,
	children,
}: {
	values: FilterValues
	vendors: Array<{ slug: string; displayName: string }>
	children: ReactNode
}) {
	const router = useRouter()
	const dialogRef = useRef<HTMLDialogElement>(null)
	const triggerRef = useRef<HTMLButtonElement>(null)
	const fieldsKey = JSON.stringify(values)
	const activeFilters = [
		['kind', values.kind === 'product' ? 'Products' : values.kind === 'service' ? 'Services' : ''],
		['category', values.category],
		['vendor', vendors.find((vendor) => vendor.slug === values.vendor)?.displayName ?? ''],
		['minPriceCents', values.minPriceCents ? `From ETB ${Number(values.minPriceCents) / 100}` : ''],
		['maxPriceCents', values.maxPriceCents ? `Up to ETB ${Number(values.maxPriceCents) / 100}` : ''],
	].filter(([, label]) => label)

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const query = requestFromForm(event.currentTarget)
		dialogRef.current?.close()
		router.push(`/search${query.size ? `?${query.toString()}` : ''}`)
	}

	function removeFilter(key: string) {
		const query = new URLSearchParams()
		for (const [queryKey, value] of Object.entries(values)) if (value && queryKey !== key && queryKey !== 'sort') query.set(queryKey, value)
		if (values.sort && values.sort !== 'newest') query.set('sort', values.sort)
		router.push(`/search${query.size ? `?${query.toString()}` : ''}`)
	}

	return (
		<div className="mt-8 gap-8 lg:flex lg:items-start">
			<aside className="hidden w-64 shrink-0 rounded-xl border p-4 lg:block" aria-label="Catalog filters">
				<div className="flex items-center gap-2">
					<SlidersHorizontal className="size-4" aria-hidden="true" />
					<h2 className="font-medium">Filter results</h2>
				</div>
				<form className="mt-5 grid gap-4" onSubmit={submit}>
					<FilterFields key={fieldsKey} values={values} vendors={vendors} />
					<Button type="submit">Apply filters</Button>
					<Link className="text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground" href="/search">
						Clear filters
					</Link>
				</form>
			</aside>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2 lg:hidden">
					<Button
						ref={triggerRef}
						type="button"
						variant="outline"
						onClick={() => {
							dialogRef.current?.showModal()
						}}>
						<SlidersHorizontal aria-hidden="true" />
						Filter
					</Button>
				</div>

				<dialog
					ref={dialogRef}
					aria-labelledby="catalog-filter-dialog-title"
					className="m-auto w-[min(100%-2rem,28rem)] rounded-xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-foreground/25"
					onClose={() => triggerRef.current?.focus()}>
					<form className="grid gap-4 p-5" onSubmit={submit}>
						<div className="flex items-center justify-between gap-3">
							<h2 id="catalog-filter-dialog-title" className="text-lg font-semibold">
								Filter results
							</h2>
							<button className="rounded-md px-2 py-1 text-sm hover:bg-muted" onClick={() => dialogRef.current?.close()} type="button">
								Close
							</button>
						</div>
						<FilterFields key={fieldsKey} values={values} vendors={vendors} />
						<div className="flex gap-3">
							<Button className="flex-1" type="submit">
								Apply filters
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									dialogRef.current?.close()
									router.push('/search')
								}}>
								Clear filters
							</Button>
						</div>
					</form>
				</dialog>

				{activeFilters.length > 0 && (
					<div className="mt-4 flex flex-wrap gap-2" aria-label="Applied filters">
						{activeFilters.map(([key, label]) => (
							<button className="rounded-full border px-3 py-1 text-sm hover:bg-muted" key={key} onClick={() => removeFilter(key)} type="button">
								{label} <span aria-label={`Remove ${label}`}>×</span>
							</button>
						))}
						<Link className="px-2 py-1 text-sm text-muted-foreground underline underline-offset-4" href="/search">
							Clear all
						</Link>
					</div>
				)}
				{children}
			</div>
		</div>
	)
}
