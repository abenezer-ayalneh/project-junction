/*
THESIS: A legible control-room foundation, not a commerce landing page.
OWN-WORLD: Cool neutral surfaces, indigo signal, precise rules, no ornamental chrome.
STORY: A reviewer sees the active platform boundaries and what remains deliberately unavailable.
FIRST VIEWPORT: Phase heading left; runtime boundary and executable proof column right.
FORM: A quiet operational briefing with a synthetic-only status rail.
*/

const foundationItems = [
	['Access context', 'Revocable server session, workspace, Vendor, and Location scope.'],
	['Transport contracts', 'Versioned REST envelopes, Zod validation, and idempotent commands.'],
	['Durable effects', 'Outbox, inbox deduplication, retry state, and worker ownership.'],
	['Demo isolation', 'Synthetic workspaces expire after 24 hours and purge independently.'],
]

export default function Index() {
	return (
		<main className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
			<a className="skip-link" href="#foundation">
				Skip to platform foundation
			</a>

			<header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7 sm:px-10">
				<div className="flex items-center gap-3" aria-label="Project Junction">
					<span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--signal)] text-sm font-black text-white shadow-[0_10px_24px_oklch(0.43_0.18_270_/_0.24)]">
						J
					</span>
					<span className="text-sm font-semibold tracking-[-0.01em]">Project Junction</span>
				</div>
				<span className="status-badge" role="status">
					Synthetic runtime only
				</span>
			</header>

			<section className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-14 sm:px-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:pt-28">
				<div>
					<p className="section-label">Phase 00 · Platform foundation</p>
					<h1 className="mt-5 max-w-3xl text-balance text-5xl font-semibold tracking-[-0.045em] sm:text-7xl">
						Build the boundaries before the marketplace.
					</h1>
					<p className="mt-7 max-w-2xl text-pretty text-lg leading-8 text-[var(--muted)] sm:text-xl">
						The executable foundation establishes typed authority, replay-safe commands, durable event handling, and expiring synthetic demo
						data—without exposing commerce, identities, or live providers.
					</p>
				</div>

				<aside className="proof-panel" aria-labelledby="proof-title">
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="section-label">Current proof</p>
							<h2 id="proof-title" className="mt-2 text-xl font-semibold tracking-[-0.025em]">
								An honest, testable slice
							</h2>
						</div>
						<span className="h-3 w-3 shrink-0 rounded-full bg-[var(--success)] shadow-[0_0_0_5px_oklch(0.72_0.15_160_/_0.15)]" />
					</div>
					<dl className="mt-8 grid gap-5 border-y border-[var(--line)] py-6 text-sm">
						<div className="flex items-baseline justify-between gap-4">
							<dt className="text-[var(--muted)]">Runtime</dt>
							<dd className="font-medium">Synthetic test double</dd>
						</div>
						<div className="flex items-baseline justify-between gap-4">
							<dt className="text-[var(--muted)]">Authority</dt>
							<dd className="font-medium">Server-derived context</dd>
						</div>
						<div className="flex items-baseline justify-between gap-4">
							<dt className="text-[var(--muted)]">Provider mode</dt>
							<dd className="font-medium">Deterministic fake only</dd>
						</div>
					</dl>
					<p className="mt-5 text-sm leading-6 text-[var(--muted)]">
						No customer transaction, sign-up, live account, payment, or deployment is represented by this screen.
					</p>
				</aside>
			</section>

			<section id="foundation" className="border-t border-[var(--line)] bg-[var(--surface)]" aria-labelledby="foundation-title">
				<div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 sm:px-10 lg:grid-cols-[0.75fr_1.25fr] lg:py-24">
					<div>
						<p className="section-label">What is established</p>
						<h2 id="foundation-title" className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
							One platform, explicit ownership.
						</h2>
						<p className="mt-5 max-w-md leading-7 text-[var(--muted)]">
							Each process has a narrow job: presentation, authoritative commands, or asynchronous delivery. Shared contracts bridge them;
							persistence types do not.
						</p>
					</div>
					<ul className="divide-y divide-[var(--line)]" aria-label="Foundation capabilities">
						{foundationItems.map(([title, detail], index) => (
							<li key={title} className="grid gap-3 py-5 sm:grid-cols-[2.5rem_1fr] sm:gap-5">
								<span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--signal-soft)] text-sm font-bold text-[var(--signal)]">
									{String(index + 1).padStart(2, '0')}
								</span>
								<div>
									<h3 className="font-semibold tracking-[-0.015em]">{title}</h3>
									<p className="mt-1.5 max-w-xl leading-7 text-[var(--muted)]">{detail}</p>
								</div>
							</li>
						))}
					</ul>
				</div>
			</section>

			<footer className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between sm:px-10">
				<span>Project Junction · technical portfolio foundation</span>
				<span>Specified capability ≠ live service</span>
			</footer>
		</main>
	)
}
