import { Search, Waypoints } from 'lucide-react'
import Link from 'next/link'

import { ThemeToggle } from '@/components/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { runtimeLabel } from '@/lib/runtime-label'

export function MarketplaceHeader({ searchQuery = '' }: { searchQuery?: string }) {
	return (
		<header className="border-b bg-background">
			<div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-4 px-5 py-4 sm:px-8">
				<Link className="flex items-center gap-2.5" href="/" aria-label="Junction home">
					<Waypoints className="size-6 text-junction-brand" aria-hidden="true" />
					<span className="text-sm font-semibold tracking-tight">Junction</span>
				</Link>
				<form
					action="/search"
					className="order-3 flex h-10 min-w-0 flex-1 basis-full items-center gap-2 rounded-lg border bg-background px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-foreground sm:order-none sm:basis-auto"
					role="search">
					<Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					<label className="sr-only" htmlFor="marketplace-search">
						Search products and services
					</label>
					<input
						id="marketplace-search"
						className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
						defaultValue={searchQuery}
						name="q"
						placeholder="Search products and services"
					/>
				</form>
				<nav className="ml-auto flex items-center gap-3" aria-label="Account navigation">
					<Link className="text-sm text-muted-foreground hover:text-foreground" href="/account">
						Account
					</Link>
					<Badge className="hidden sm:inline-flex" variant="outline">
						{runtimeLabel}
					</Badge>
					<ThemeToggle />
				</nav>
			</div>
			<nav className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-5 pb-3 sm:px-8" aria-label="Marketplace navigation">
				<Link className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-muted" href="/search?kind=product">
					Products
				</Link>
				<Link className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-muted" href="/search?kind=service">
					Services
				</Link>
				<Link className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" href="/search">
					Categories
				</Link>
				<Link className="ml-auto whitespace-nowrap px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground" href="/vendor-workspace">
					Vendor workspace
				</Link>
			</nav>
		</header>
	)
}
