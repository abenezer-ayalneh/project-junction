'use client'

import { CustomerDiscoveryStateSchema } from 'contracts'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

type SavedState = { ids: string[]; authenticated: boolean }
type SavedContext = { state: SavedState | null; refresh: () => Promise<SavedState>; update: (id: string, saved: boolean) => void }
const SavedListingsContext = createContext<SavedContext | null>(null)

export function SavedListingsProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<SavedState | null>(null)
	const pending = useRef<Promise<SavedState> | null>(null)
	const pathname = usePathname()
	const refresh = useCallback(() => {
		if (pending.current) return pending.current
		pending.current = (async () => {
			const response = await fetch('/v1/customer/discovery', { cache: 'no-store' })
			if (response.status === 401 || response.status === 403) {
				const next = { ids: [], authenticated: false }
				setState(next)
				return next
			}
			if (!response.ok) throw new Error('Saved items are unavailable. Try again.')
			const next = { ids: CustomerDiscoveryStateSchema.parse(await response.json()).savedListingIds, authenticated: true }
			setState(next)
			return next
		})().finally(() => {
			pending.current = null
		})
		return pending.current
	}, [])
	useEffect(() => {
		const reload = () => {
			void refresh().catch(() => setState(null))
		}
		reload()
		window.addEventListener('focus', reload)
		window.addEventListener('junction:discovery-changed', reload)
		return () => {
			window.removeEventListener('focus', reload)
			window.removeEventListener('junction:discovery-changed', reload)
		}
	}, [pathname, refresh])
	return (
		<SavedListingsContext.Provider
			value={{
				state,
				refresh,
				update: (id, saved) =>
					setState((current) =>
						current
							? {
									...current,
									ids: saved ? [...new Set([...current.ids, id])] : current.ids.filter((value) => value !== id),
								}
							: current,
					),
			}}>
			{children}
		</SavedListingsContext.Provider>
	)
}

export function ListingSaveButton({ listingId, title }: { listingId: string; title: string }) {
	const context = useContext(SavedListingsContext)
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState('')
	const [needsSignIn, setNeedsSignIn] = useState(false)
	const running = useRef(false)
	const pendingDesired = useRef<boolean | null>(null)
	const saved = context?.state?.ids.includes(listingId) ?? false
	async function toggle() {
		if (!context || running.current) return
		running.current = true
		setBusy(true)
		setMessage('')
		setNeedsSignIn(false)
		try {
			const current = await context.refresh()
			if (!current.authenticated) {
				setNeedsSignIn(true)
				return
			}
			const nextSaved = pendingDesired.current ?? !current.ids.includes(listingId)
			pendingDesired.current = nextSaved
			const response = await fetch(`/v1/listings/${listingId}/save`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ saved: nextSaved }),
				cache: 'no-store',
			})
			if (response.status === 401 || response.status === 403) {
				pendingDesired.current = null
				throw new Error('Saving is unavailable. Sign in and check that this listing is still published.')
			}
			if (!response.ok) {
				if (response.status < 500) pendingDesired.current = null
				throw new Error('The listing could not be saved. Try again.')
			}
			context.update(listingId, nextSaved)
			pendingDesired.current = null
			setMessage(nextSaved ? 'Listing saved.' : 'Listing removed from saved items.')
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'The connection failed. Try again.')
		} finally {
			running.current = false
			setBusy(false)
		}
	}
	return (
		<div className="mt-3 grid gap-2">
			<Button
				type="button"
				size="sm"
				variant="outline"
				aria-label={`${saved ? 'Remove saved' : 'Save'} ${title}`}
				aria-pressed={saved}
				disabled={busy || !context}
				onClick={() => void toggle()}>
				{busy ? 'Saving…' : saved ? 'Saved' : 'Save'}
			</Button>
			{needsSignIn ? (
				<p role="status" className="text-sm text-muted-foreground">
					<Link className="underline underline-offset-4" href="/account">
						Sign in
					</Link>{' '}
					to save this listing.
				</p>
			) : null}
			{message ? (
				<p role="status" className="text-sm text-muted-foreground">
					{message}
				</p>
			) : null}
		</div>
	)
}
