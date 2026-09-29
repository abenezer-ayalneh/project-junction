'use client'

import { useState } from 'react'

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

export function IdentityVerification() {
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState('')

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
			<p className="text-sm text-muted-foreground">
				Complete the identity and age check to request Customer or Vendor access. Access changes only after the provider review is accepted.
			</p>
			<Button type="button" variant="outline" disabled={busy} onClick={() => void start()}>
				{busy ? 'Opening verification…' : 'Start identity verification'}
			</Button>
			{message && (
				<p role="status" className="text-sm">
					{message}
				</p>
			)}
		</section>
	)
}
