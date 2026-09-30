import Link from 'next/link'

export default function EmailVerifiedPage() {
	return (
		<main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-6 px-5 py-12">
			<h1 className="text-2xl font-semibold tracking-tight">Email verified</h1>
			<p className="text-muted-foreground">Your Project Junction email is confirmed. You can now return to your private staging account.</p>
			<Link className="text-sm font-medium underline underline-offset-4" href="/account">
				Continue to your account
			</Link>
		</main>
	)
}
