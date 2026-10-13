# P04-C08 local evidence — 2026-10-13

C07 was fast-forwarded into clean local `main` after fetching `origin`; C08 started on `codex/p04-c08-earning-release`. All development and verification used the user's local machine and disposable loopback PostgreSQL schemas. No staging/remote host, deployment or live funds.

Availability is an append-only source-derived partition of existing mixed seller payable. Original compact unit funding/additive capture and exact refund sources drive the amounts; verified handoff/attendance drives maturity; ReturnCase/Booking contest drives scoped freezes. It is not another sale posting. No payout, transfer, arbitrary balance mutation, retroactive standalone ledger backfill or new Finance decision grant exists in C08.

The focused run passed 17 earning scenarios and built HTTP/actual worker proof. Final full regression adds delivery-fee and inspected-return/refund coverage (19 earning scenarios). The worker proof uses a historical verified-handoff fixture in a disposable schema: it confirms pending before starting the actual built worker, then proves one due release, replay stability, no-store Owner read and anonymous/Customer denial. Ordinary development data remains unseeded. The full runner generates stable per-run fixture secrets, so pickup/attendance checks do not consume the local environment’s placeholder or operator keys. Source-clock injection is confined to disposable integration fixtures; HTTP cannot supply a release time or amount.

Checks and exact counts are in [verification.json](verification.json). Logs retain successful runs, with ANSI formatting removed. Full regression includes all existing goods, Booking, ledger, payment, promotion, mixed Purchase and new earning cases plus local HTTP/worker, upgrade/restore checks. Backend-only C08 changes require no new visual assets or UI finish pass.

Reproduce with local `.env` loaded into the process:

- `pnpm nx run-many -t lint,typecheck,test --projects=contracts,platform-core,api,worker,web --parallel=3`
- `FOUNDATION_TEST_NAME='Phase 04 component earnings' pnpm nx run platform-core:test-integration` for focused PostgreSQL/HTTP/worker checks; omit the variable for full regression.
- `pnpm nx run-many -t build --projects=api,worker,web --parallel=3`
- `node --env-file=.env tools/check-migration-compatibility.mjs`
- `node --env-file=.env tools/check-populated-upgrade.mjs`
- `node --env-file=.env tools/check-restore-rehearsal.mjs`
- `pnpm docs:check` and `pnpm contracts:check`

C08 preserves the recorded Phase 03 no-show timing: contest finalization followed by the snapshotted 48-hour eligibility delay. Two conservative local derived rules are explicit: delivery consideration waits for verified handoff plus the longest original line window, and retained Booking cancellation consideration waits for committed service end plus the contest delay. Formal Dispute/Support/chargeback decisions integrate through their owning later context. C09 batches must refresh authority in the same transaction before selecting available, non-frozen value. Formal provider, independent accessibility, retention, target recovery and phase/public-release gates remain open.
