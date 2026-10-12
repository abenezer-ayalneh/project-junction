# Phase 04 local acceptance evidence

## P04-C01 — Money and immutable ledger — 2026-10-12

**Complete locally.** Phase 02–03 local acceptance evidence supplies the local implementation dependency. Inherited formal provider, independent accessibility, governing retention and target storage/recovery gates remain open. All development and verification used the user's machine and disposable loopback PostgreSQL schemas.

`REQ-P04-FIN-001` foundation: safe integer minor-unit/explicit currency contracts, bigint summation/storage, balanced immutable transactions/postings and once-only exact reversals. Workspace/Vendor/Location scope is checked at commit. The database rejects unbalanced, empty and mixed-currency writes, mutable history and post-commit append. Workspace/economic-event replay is serialized, deduplicated and conflicts on changed terms. Audit and durable ledger events roll back with the originating transaction.

`REQ-P04-FIN-002` foundation: immutable sandbox snapshot makes Junction payment merchant and Vendors contracting sellers. Ordinary processor/dispute fees use Junction expense accounts; fee scenarios leave Vendor payable intact. This establishes accounting primitives, not a provider/settlement claim.

Local checks:

- Ten PostgreSQL scenarios: posting/snapshot/audit/outbox, unsafe/fractional/unbalanced/currency rejection, bigint boundary, concurrent replay/conflict, reversal/compensating repost, foreign scope/reversal, raw history mutation/truncate/append, raw invalid posting/reversal, Junction fee allocation and outer transaction rollback.
- Five-project Nx lint/typecheck/unit checks, including three focused Money/ledger contract tests.
- API/worker/core/contract builds via the integration target; 43-migration compatibility and populated upgrade.

The internal writer accepts a transaction from an authoritative economic-event caller; no browser, Customer, Vendor or manual Finance posting route is exposed. Existing goods/Booking facts are not backfilled or automatically posted yet. C05–C06 integrates economic changes, C03 owns promotion/commission snapshots, C08 earnings, and C09 approved compensating actions/reconciliation/payout. TST-P04-001–004 and formal phase/public-release gates remain open. No UI change or browser acceptance is claimed.

[Verification record](./evidence/phase-04-c01-2026-10-12/verification.json). **Next:** P04-C02 — Mixed Cart and quote coordination.
