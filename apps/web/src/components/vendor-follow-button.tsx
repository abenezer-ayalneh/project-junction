'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'

export function VendorFollowButton({ vendorId }: { vendorId: string }) {
	const [following, setFollowing] = useState(false)
	const [message, setMessage] = useState('')
	const [busy, setBusy] = useState(false)

	async function toggle() {
		setBusy(true)
		setMessage('')
		try {
			const response = await fetch(`/v1/vendors/${vendorId}/follow`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ following: !following }),
				cache: 'no-store',
			})
			const body: unknown = await response.json()
			if (!response.ok) throw new Error(body && typeof body === 'object' && 'message' in body ? String(body.message) : 'Sign in to follow this Vendor.')
			setFollowing(!following)
			setMessage(!following ? 'Vendor followed.' : 'Vendor unfollowed.')
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'The follow request could not be completed.')
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="flex flex-col items-start gap-2">
			<Button disabled={busy} onClick={() => void toggle()} type="button" variant="outline">
				{following ? 'Following' : 'Follow Vendor'}
			</Button>
			{message ? (
				<p className="text-sm text-muted-foreground" role="status">
					{message}
				</p>
			) : null}
		</div>
	)
}
