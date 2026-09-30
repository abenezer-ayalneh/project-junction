'use client'

import Link from 'next/link'
import { toDataURL } from 'qrcode'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { authClient } from '@/lib/auth-client'

import { IdentityVerification } from './identity-verification'

type Mode = 'sign-in' | 'sign-up' | 'recover'

export default function AccountPage() {
	const { data: session, isPending } = authClient.useSession()
	const [mode, setMode] = useState<Mode>('sign-in')
	const [name, setName] = useState('')
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState('')
	const [totpUri, setTotpUri] = useState('')
	const [totpQrCode, setTotpQrCode] = useState('')
	const [backupCodes, setBackupCodes] = useState<string[]>([])
	const [totpCode, setTotpCode] = useState('')

	useEffect(() => {
		let cancelled = false
		if (!totpUri) {
			setTotpQrCode('')
			return
		}
		void toDataURL(totpUri, { errorCorrectionLevel: 'M', margin: 1, width: 224 })
			.then((value) => {
				if (!cancelled) setTotpQrCode(value)
			})
			.catch(() => {
				if (!cancelled) setTotpQrCode('')
			})
		return () => {
			cancelled = true
		}
	}, [totpUri])

	async function beginTotpEnrollment(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setBusy(true)
		setMessage('')
		try {
			const result = await authClient.twoFactor.enable({ password, method: 'totp' })
			if (result.error || !result.data || result.data.method !== 'totp') {
				setMessage('Unable to start authenticator setup. Check your password and try again.')
				return
			}
			setTotpUri(result.data.totpURI)
			setBackupCodes(result.data.backupCodes)
			setPassword('')
		} catch {
			setMessage('The identity service is unavailable. Please try again.')
		} finally {
			setBusy(false)
		}
	}

	async function confirmTotp(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setBusy(true)
		try {
			const result = await authClient.twoFactor.verifyTotp({ code: totpCode, trustDevice: false })
			setMessage(result.error ? 'Invalid authenticator code. Try the current code.' : 'Authenticator enabled. Store your backup codes securely.')
			if (!result.error) {
				setTotpUri('')
				setTotpCode('')
			}
		} catch {
			setMessage('The identity service is unavailable. Please try again.')
		} finally {
			setBusy(false)
		}
	}

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setBusy(true)
		setMessage('')
		try {
			if (mode === 'recover') {
				await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/account/reset` })
				setMessage('If this address has an account, a recovery link has been sent.')
				return
			}
			if (mode === 'sign-up') {
				const result = await authClient.signUp.email({ name, email, password, callbackURL: `${window.location.origin}/account/verified` })
				setMessage(
					result.error
						? 'Unable to create the account. Check the details and try again.'
						: 'Check your email for a verification link before signing in.',
				)
				return
			}
			const result = await authClient.signIn.email({ email, password })
			setMessage(result.error ? 'Sign-in failed. Check your credentials and verify your email.' : '')
		} catch {
			setMessage('The identity service is unavailable. Please try again.')
		} finally {
			setBusy(false)
		}
	}

	return (
		<main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-6 px-5 py-12">
			<Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
				← Back to Junction
			</Link>
			<Card>
				<CardHeader>
					<CardTitle>Your account</CardTitle>
				</CardHeader>
				<CardContent>
					{isPending ? (
						<p role="status">Checking your session…</p>
					) : session ? (
						<div className="space-y-4">
							<p>Signed in as {session.user.email}</p>
							<p className="text-sm text-muted-foreground">
								Identity verification is required before private Customer or Vendor actions are available.
							</p>
							{process.env.NEXT_PUBLIC_JUNCTION_RUNTIME_MODE === 'staging' && <IdentityVerification />}
							{session.user.twoFactorEnabled ? (
								<p>Authenticator sign-in is enabled.</p>
							) : (
								<form className="space-y-3" onSubmit={(event) => void beginTotpEnrollment(event)}>
									<p>Add an authenticator app for a second sign-in factor.</p>
									<label className="block space-y-2 text-sm font-medium">
										<span>Current password</span>
										<input
											className="w-full rounded-md border bg-background px-3 py-2"
											type="password"
											autoComplete="current-password"
											required
											value={password}
											onChange={(event) => setPassword(event.target.value)}
										/>
									</label>
									<Button disabled={busy} type="submit">
										Set up authenticator
									</Button>
								</form>
							)}
							{totpUri && (
								<div className="space-y-3 rounded-md border p-4">
									<p>Scan this code with your authenticator app, or add the URI manually. Treat both as secrets.</p>
									{totpQrCode ? (
										<img
											alt="Authenticator setup QR code"
											className="h-56 w-56 rounded-md bg-white p-2"
											height={224}
											src={totpQrCode}
											width={224}
										/>
									) : (
										<p className="text-sm text-muted-foreground" role="status">
											Generating QR code…
										</p>
									)}
									<code className="block break-all text-xs">{totpUri}</code>
									<form className="space-y-2" onSubmit={(event) => void confirmTotp(event)}>
										<label className="block space-y-2 text-sm font-medium">
											<span>Authenticator code</span>
											<input
												className="w-full rounded-md border bg-background px-3 py-2"
												inputMode="numeric"
												autoComplete="one-time-code"
												required
												value={totpCode}
												onChange={(event) => setTotpCode(event.target.value)}
											/>
										</label>
										<Button disabled={busy} type="submit">
											Confirm authenticator
										</Button>
									</form>
								</div>
							)}
							{backupCodes.length > 0 && (
								<div className="space-y-2 rounded-md border p-4">
									<p>Save these backup codes now. Each code can be used once.</p>
									<ul className="grid grid-cols-2 gap-2 font-mono text-sm">
										{backupCodes.map((code) => (
											<li key={code}>{code}</li>
										))}
									</ul>
								</div>
							)}
							<Button type="button" variant="outline" onClick={() => void authClient.signOut()}>
								Sign out
							</Button>
						</div>
					) : (
						<>
							<div className="mb-6 flex flex-wrap gap-2" aria-label="Account action">
								{(['sign-in', 'sign-up', 'recover'] as const).map((action) => (
									<Button
										key={action}
										type="button"
										size="sm"
										variant={mode === action ? 'default' : 'outline'}
										onClick={() => {
											setMode(action)
											setMessage('')
										}}>
										{action === 'sign-in' ? 'Sign in' : action === 'sign-up' ? 'Create account' : 'Recover account'}
									</Button>
								))}
							</div>
							<form className="space-y-4" onSubmit={(event) => void submit(event)}>
								{mode === 'sign-up' && (
									<label className="block space-y-2 text-sm font-medium">
										<span>Name</span>
										<input
											className="w-full rounded-md border bg-background px-3 py-2"
											autoComplete="name"
											required
											value={name}
											onChange={(event) => setName(event.target.value)}
										/>
									</label>
								)}
								<label className="block space-y-2 text-sm font-medium">
									<span>Email</span>
									<input
										className="w-full rounded-md border bg-background px-3 py-2"
										autoComplete="email"
										type="email"
										required
										value={email}
										onChange={(event) => setEmail(event.target.value)}
									/>
								</label>
								{mode !== 'recover' && (
									<label className="block space-y-2 text-sm font-medium">
										<span>Password</span>
										<input
											className="w-full rounded-md border bg-background px-3 py-2"
											autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
											type="password"
											minLength={8}
											required
											value={password}
											onChange={(event) => setPassword(event.target.value)}
										/>
									</label>
								)}
								<Button disabled={busy} type="submit">
									{busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Send recovery link'}
								</Button>
							</form>
						</>
					)}
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
