'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

async function requestVerificationSession(): Promise<string> {
	const configured = process.env.NEXT_PUBLIC_JUNCTION_API_URL ?? '/v1'
	const api = new URL(configured.endsWith('/') ? configured : `${configured}/`, window.location.origin)
	if (api.origin !== window.location.origin) throw new Error('Identity verification requires a same-origin API.')
	const response = await fetch(new URL('identity/verification-session', api), {
		method: 'POST',
		credentials: 'same-origin',
		cache: 'no-store',
	})
	if (!response.ok) throw new Error('Unable to start identity verification.')
	const result: unknown = await response.json()
	if (!result || typeof result !== 'object' || !('url' in result) || typeof result.url !== 'string' || !result.url || result.url.length > 2048) {
		throw new Error('The verification service returned an invalid session.')
	}
	const verificationUrl = new URL(result.url)
	if (verificationUrl.protocol !== 'https:') throw new Error('The verification service returned a non-HTTPS session URL.')
	return verificationUrl.toString()
}

type VerificationStatus = 'loading' | 'unavailable' | 'unverified' | 'verified' | 'rejected'

async function readVerificationStatus(): Promise<Exclude<VerificationStatus, 'loading' | 'unavailable'>> {
	const configured = process.env.NEXT_PUBLIC_JUNCTION_API_URL ?? '/v1'
	const api = new URL(configured.endsWith('/') ? configured : `${configured}/`, window.location.origin)
	if (api.origin !== window.location.origin) throw new Error('Identity verification requires a same-origin API.')
	const response = await fetch(new URL('identity/verification-status', api), { credentials: 'same-origin', cache: 'no-store' })
	if (!response.ok) throw new Error('Unable to read identity verification status.')
	const result: unknown = await response.json()
	if (
		!result ||
		typeof result !== 'object' ||
		!('status' in result) ||
		(result.status !== 'unverified' && result.status !== 'verified' && result.status !== 'rejected')
	)
		throw new Error('The identity service returned an invalid verification status.')
	return result.status
}

export function IdentityVerification() {
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState('')
	const [status, setStatus] = useState<VerificationStatus>('loading')

	useEffect(() => {
		let cancelled = false
		void readVerificationStatus()
			.then((value) => {
				if (!cancelled) setStatus(value)
			})
			.catch(() => {
				if (!cancelled) setStatus('unavailable')
			})
		return () => {
			cancelled = true
		}
	}, [])

	async function start() {
		setBusy(true)
		setMessage('')
		try {
			window.location.assign(await requestVerificationSession())
		} catch {
			setMessage('Identity verification is unavailable. Please try again later.')
		} finally {
			setBusy(false)
		}
	}

	return (
		<section className="space-y-3" aria-label="Identity verification">
			{status === 'loading' && <p className="text-sm text-muted-foreground">Checking your identity-verification status…</p>}
			{status === 'unavailable' && (
				<p role="status" className="text-sm">
					Identity-verification status is temporarily unavailable.
				</p>
			)}
			{status === 'verified' && (
				<p role="status" className="text-sm">
					Your identity and age check has been accepted.
				</p>
			)}
			{status === 'unverified' && (
				<p className="text-sm text-muted-foreground">
					Complete the identity and age check to request Customer or Vendor access. Access changes only after the provider review is accepted.
				</p>
			)}
			{status === 'rejected' && (
				<p role="status" className="text-sm">
					Your identity check was declined. Start a new check if you need to try again.
				</p>
			)}
			{status !== 'loading' && status !== 'unavailable' && status !== 'verified' && (
				<Button type="button" variant="outline" disabled={busy} onClick={() => void start()}>
					{busy ? 'Opening verification…' : status === 'rejected' ? 'Start a new identity check' : 'Start identity verification'}
				</Button>
			)}
			{message && (
				<p role="status" className="text-sm">
					{message}
				</p>
			)}
		</section>
	)
}
