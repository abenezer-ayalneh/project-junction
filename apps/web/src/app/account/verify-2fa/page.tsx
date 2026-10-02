'use client'

import Link from 'next/link'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { authClient } from '@/lib/auth-client'

export default function VerifyTwoFactorPage() {
	const [code, setCode] = useState('')
	const [backup, setBackup] = useState(false)
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState('')

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setBusy(true)
		setMessage('')
		try {
			const result = backup
				? await authClient.twoFactor.verifyBackupCode({ code, trustDevice: false })
				: await authClient.twoFactor.verifyTotp({ code, trustDevice: false })
			if (result.error) setMessage('The code was not accepted. Try the current code or a backup code.')
			else window.location.href = '/account'
		} catch {
			setMessage('The identity service is unavailable. Please try again.')
		} finally {
			setBusy(false)
		}
	}

	return (
		<main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-6 px-5 py-12">
			<Link href="/account" className="text-sm text-muted-foreground hover:text-foreground">
				← Back to account
			</Link>
			<Card>
				<CardHeader>
					<CardTitle>Confirm your sign-in</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<form className="space-y-4" onSubmit={(event) => void submit(event)}>
						<label className="block space-y-2 text-sm font-medium">
							<span>{backup ? 'Backup code' : 'Authenticator code'}</span>
							<input
								className="w-full rounded-md border bg-background px-3 py-2"
								autoComplete="one-time-code"
								inputMode={backup ? 'text' : 'numeric'}
								required
								value={code}
								onChange={(event) => setCode(event.target.value)}
							/>
						</label>
						<Button disabled={busy} type="submit">
							{busy ? 'Checking…' : 'Verify code'}
						</Button>
					</form>
					<Button
						type="button"
						variant="link"
						onClick={() => {
							setBackup(!backup)
							setCode('')
							setMessage('')
						}}>
						{backup ? 'Use authenticator code' : 'Use a backup code'}
					</Button>
					{message && (
						<p role="status" className="text-sm">
							{message}
						</p>
					)}
				</CardContent>
			</Card>
		</main>
	)
}
