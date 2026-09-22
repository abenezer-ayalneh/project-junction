import { CircleCheck, DatabaseZap, Network, ServerCog, ShieldCheck, Waypoints } from 'lucide-react'

import { ThemeToggle } from '@/components/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

const foundationItems = [
	{
		title: 'Access context',
		detail: 'Revocable server session, workspace, Vendor, and Location scope.',
		Icon: ShieldCheck,
	},
	{
		title: 'Transport contracts',
		detail: 'Versioned REST envelopes, Zod validation, and idempotent commands.',
		Icon: Network,
	},
	{
		title: 'Durable effects',
		detail: 'Outbox, inbox deduplication, retry state, and worker ownership.',
		Icon: DatabaseZap,
	},
	{
		title: 'Demo isolation',
		detail: 'Synthetic workspaces expire after 24 hours and purge independently.',
		Icon: ServerCog,
	},
]

const proofItems = [
	['Runtime', 'Synthetic test double'],
	['Authority', 'Server-derived context'],
	['Provider mode', 'Deterministic fake only'],
]

export default function Index() {
	return (
		<main className="min-h-svh bg-background">
			<a
				className="absolute top-4 left-4 z-50 -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform focus:translate-y-0"
				href="#foundation">
				Skip to platform foundation
			</a>

			<header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6 sm:px-10">
				<div className="flex items-center gap-2.5" aria-label="Project Junction">
					<Waypoints className="size-6 text-junction-brand" aria-hidden="true" />
					<span className="text-sm font-semibold tracking-tight">Project Junction</span>
				</div>
				<div className="flex items-center gap-2">
					<Badge variant="outline" role="status">
						Synthetic runtime only
					</Badge>
					<ThemeToggle />
				</div>
			</header>

			<section className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:px-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
				<div>
					<p className="text-sm font-medium text-muted-foreground">Phase 00 · Platform foundation</p>
					<h1 className="mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
						Build the boundaries before the marketplace.
					</h1>
					<p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground">
						The executable foundation establishes typed authority, replay-safe commands, durable event handling, and expiring synthetic demo
						data—without exposing commerce, identities, or live providers.
					</p>
				</div>

				<Card aria-labelledby="proof-title">
					<CardHeader>
						<div className="flex items-start justify-between gap-4">
							<div>
								<Badge variant="secondary">Current proof</Badge>
								<CardTitle id="proof-title" className="mt-3 text-xl">
									An honest, testable slice
								</CardTitle>
							</div>
							<CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-label="Verified synthetic foundation" />
						</div>
						<CardDescription>Current runtime boundaries are explicit and reviewable.</CardDescription>
					</CardHeader>
					<CardContent>
						<dl className="space-y-4 text-sm">
							{proofItems.map(([label, value]) => (
								<div key={label} className="flex items-baseline justify-between gap-4 border-b pb-4 last:border-b-0 last:pb-0">
									<dt className="text-muted-foreground">{label}</dt>
									<dd className="text-right font-medium">{value}</dd>
								</div>
							))}
						</dl>
						<Separator className="my-5" />
						<p className="text-sm leading-6 text-muted-foreground">
							No customer transaction, sign-up, live account, payment, or deployment is represented by this screen.
						</p>
					</CardContent>
				</Card>
			</section>

			<section id="foundation" className="border-y bg-muted/30" aria-labelledby="foundation-title">
				<div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 sm:px-10 lg:grid-cols-[0.75fr_1.25fr] lg:py-20">
					<div>
						<p className="text-sm font-medium text-muted-foreground">What is established</p>
						<h2 id="foundation-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
							One platform, explicit ownership.
						</h2>
						<p className="mt-4 max-w-md leading-7 text-muted-foreground">
							Each process has a narrow job: presentation, authoritative commands, or asynchronous delivery. Shared contracts bridge them;
							persistence types do not.
						</p>
					</div>
					<ul className="divide-y rounded-xl border bg-background" aria-label="Foundation capabilities">
						{foundationItems.map(({ title, detail, Icon }) => (
							<li key={title} className="flex gap-4 px-5 py-5 sm:px-6">
								<Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
								<div>
									<h3 className="font-medium">{title}</h3>
									<p className="mt-1.5 max-w-xl leading-7 text-muted-foreground">{detail}</p>
								</div>
							</li>
						))}
					</ul>
				</div>
			</section>

			<footer className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-10">
				<span>Project Junction · technical portfolio foundation</span>
				<span>Specified capability ≠ live service</span>
			</footer>
		</main>
	)
}
