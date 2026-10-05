'use client'

import Link from 'next/link'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { authClient } from '@/lib/auth-client'

type Mode = 'sign-in' | 'sign-up' | 'recover'

export default function AccountPage() {
	const { data: session, isPending } = authClient.useSession()
	const [mode, setMode] = useState<Mode>('sign-in')
	const [name, setName] = useState('')
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState('')
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
						: 'If this is a new email/password account, check Mailpit for a verification link. If you already have an account, sign in with its existing method.',
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

	async function signInWithGoogle() {
		setBusy(true)
		setMessage('')
		try {
			await authClient.signIn.social({ provider: 'google', callbackURL: `${window.location.origin}/account` })
		} catch {
			setMessage('Google sign-in is unavailable. Check the local OAuth configuration and try again.')
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
							<p className="text-sm text-muted-foreground">This local development account uses verified email or Google sign-in. Multi-factor and identity verification return before public release.</p>
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
							<Button className="mb-4" disabled={busy} type="button" variant="outline" onClick={() => void signInWithGoogle()}>
								Continue with Google
							</Button>
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
