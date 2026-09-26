'use client'

import Link from 'next/link'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { authClient } from '@/lib/auth-client'

export default function ResetPasswordPage() {
	const [password, setPassword] = useState('')
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState('')

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const token = new URLSearchParams(window.location.search).get('token')
		if (!token) {
			setMessage('This recovery link is invalid or expired. Request a new link from the account page.')
			return
		}
		setBusy(true)
		try {
			const result = await authClient.resetPassword({ newPassword: password, token })
			setMessage(result.error ? 'This recovery link is invalid or expired. Request a new link.' : 'Password updated. You can now sign in.')
		} catch {
			setMessage('The identity service is unavailable. Please try again.')
		} finally {
			setBusy(false)
		}
	}

	return (
		<main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-6 px-5 py-12">
			<Link href="/account" className="text-sm text-muted-foreground hover:text-foreground">
				← Back to your account
			</Link>
			<Card>
				<CardHeader>
					<CardTitle>Reset your password</CardTitle>
				</CardHeader>
				<CardContent>
					<form className="space-y-4" onSubmit={(event) => void submit(event)}>
						<label className="block space-y-2 text-sm font-medium">
							<span>New password</span>
							<input
								className="w-full rounded-md border bg-background px-3 py-2"
								type="password"
								autoComplete="new-password"
								minLength={8}
								required
								value={password}
								onChange={(event) => setPassword(event.target.value)}
							/>
						</label>
						<Button type="submit" disabled={busy}>
							{busy ? 'Please wait…' : 'Set new password'}
						</Button>
					</form>
					{message && (
						<p className="mt-4 text-sm" role="status">
							{message}
						</p>
					)}
				</CardContent>
			</Card>
		</main>
	)
}
