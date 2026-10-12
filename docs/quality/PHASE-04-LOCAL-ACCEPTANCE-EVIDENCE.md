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

## P04-C02 — Mixed Cart and quote coordination — 2026-10-12

**Complete locally.** `REQ-P04-CHK-001` quote/Cart foundation: private server Cart, revisioned explicit replacement and non-persistent merge preview; one immutable advisory quote for several Vendor goods groups and up to five independent quantity-one Booking intents. Stable intent IDs never collapse appointments into quantity. Matching goods quantities and same-intent identity are shown before explicit acceptance; fulfillment/Location, saved-price, same-intent selection and combined-limit conflicts cannot silently overwrite Cart data.

Current evaluation shares existing authoritative goods and scheduling primitives under Customer/Vendor workspace locks. Snapshot covers SKU/quantity/current price/version, delivery pin/zone/threshold/fee/policy, Service Option/add-ons, mode/Location/named-or-any preference, intervals/buffers/timezone/configuration/rules and cancellation policy. Bigint summation yields one explicit Money total; unavailable/incomplete components have no payable total. Repricing, current version changes and unavailable choices block readiness. Joint feasibility accounts for cross-mode/Location buffered occupancy and returns a smallest competing subset without exposing private any-Staff candidates. Expired holds are ignored for advisory availability without a cleanup/reservation mutation.

Quote history cannot be updated/deleted/truncated. Cart owner/identity stays stable and writes advance exactly one revision. Quotes bind exactly one owner/Cart revision and expire at five minutes (derived local default). Reads/retries report current expiry/revision state without extending the deadline. Anonymous or other-Customer/workspace access is denied, quote creation requires verified identity and all new responses use no-store. Audit/outbox/replay is atomic and exact retries append no duplicate event.

Local verification:

- Twenty focused PostgreSQL scenarios prove multi-Vendor/five-appointment snapshots/no allocation, sixth/quantity/identity rejection, concurrent revision/replay/conflict, explicit merge/combined-limit/conflict review, current repricing/acceptance, stock/Staff/publication/Location/consent eligibility, private any/named feasibility, buffered cross-mode conflict isolation, immutable scoped quote/exact expiry, identity/revocation/empty Cart, quote replay, amount bounds, SKU/add-ons/delivery thresholds, advisory expired holds, raw DB scope/revision/quantity/limit/history guards and goods-only/appointment-only composition.
- Combined goods/ledger/mixed regression run: 81 PostgreSQL scenarios pass. That run supplies a disposable handoff proof key in process memory; the first expanded run without it failed existing pickup/return/delivery scenarios before the corrected run passed. No environment secret or application configuration was changed.
- Built local HTTP verifies signed-cookie authority, Cart revision/replay/validation, merge preview, multi-Vendor goods plus appointment total, private no-store reads, no allocation, repricing, stale quote and authoritative replay recovery.
- Five-project Nx lint/typecheck/unit checks pass, including three new mixed Cart boundary tests; the public OpenAPI snapshot includes five new routes and transport schemas. API/worker/core/contract builds pass via integration. 44-migration compatibility/populated upgrade and documentation/public contract audits pass.

These are Cart/quote API primitives and evidence, not an atomic mixed Hold or Purchase. Promotion/commission snapshots are explicitly null until C03; C04–C06 owns actual reservation/payment/Purchase and C07 the visible browser flow. Provider/independent accessibility/retention/target recovery and formal phase/public-release gates remain open. No remote work, browser acceptance or live money is claimed. [Verification record](./evidence/phase-04-c02-2026-10-12/verification.json). **Next:** `P04-C03` — Promotion and commission snapshots.
