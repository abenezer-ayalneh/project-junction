'use client'

import Link from 'next/link'

export default function MarketplaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
	return (
		<main className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center px-5 py-16">
			<p className="text-sm font-medium text-muted-foreground">Junction is temporarily unavailable</p>
			<h1 className="mt-3 text-3xl font-semibold tracking-tight">We could not load the marketplace.</h1>
			<p className="mt-3 leading-7 text-muted-foreground">Please try again shortly.</p>
			<div className="mt-7 flex flex-wrap gap-4">
				<button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={reset} type="button">
					Try again
				</button>
				<Link className="self-center text-sm font-medium underline underline-offset-4" href="/account">
					Go to account
				</Link>
			</div>
		</main>
	)
}
