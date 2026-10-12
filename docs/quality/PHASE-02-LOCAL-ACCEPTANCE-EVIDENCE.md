# Phase 02 local acceptance evidence — 2026-10-12

**Status:** Complete locally; formal Phase 02 exit remains open.

This audit covers the integrated goods implementation through `P02-C11` and the `P02-C12` acceptance checks. Development, migrations, provider simulations, API processes, storage/scanner checks and browser traffic run on the user's local machine. No staging, remote acceptance or deployment occurred. Local completion does not authorize public release or start Phase 03.

## Requirement and scenario coverage

| Requirement       | Scenario                     | Local proof                                                                                                                                                                                                                                                                                                                                              | Remaining formal gate                                                                                     |
| ----------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `REQ-P02-INV-001` | `TST-P02-001`                | Append-only received/adjusted/damaged/transferred/sold/returned/disposition movements; derived SKU/Location availability; transfer conservation and direct mutation rejection.                                                                                                                                                                           | Production operations and capacity acceptance remain separate.                                            |
| `REQ-P02-CHK-001` | `TST-P02-001`                | Zone/selection/current price/policy validation; multi-Vendor atomic holds; last-unit hold/payment/stock races; partial failure rollback; exact expiry and same-key reconciliation.                                                                                                                                                                       | Mixed Booking/promotional allocation belongs to Phase 04.                                                 |
| `REQ-P02-ORD-001` | `TST-P02-003`                | Controlled local payment commits one immutable Purchase and auto-confirmed Vendor components; late success compensation; scoped partial cancellation/refund; unaffected lines/Vendors retain terms.                                                                                                                                                      | Live signed provider results, balanced ledger and earnings belong to Phase 04.                            |
| `REQ-P02-FUL-001` | `TST-P02-002`                | Customer group pickup/delivery selection; paid address/zone/fee/ETA snapshots; original-zone correction validation.                                                                                                                                                                                                                                      | Fulfillment UI and channel delivery acceptance remain open.                                               |
| `REQ-P02-FUL-002` | `TST-P02-002`, `TST-P02-003` | Ordered dispatch/failure/retry; Customer-confirmed correction once within 48 hours; private code/QR, five-attempt lock and fresh distinct-witness fallback; immutable server handoff time; terminal inspection/refund recovery.                                                                                                                          | Live logistics and formal acceptance are not inferred from API evidence.                                  |
| `REQ-P02-POL-001` | `TST-P02-002`                | Pickup 72-hour window, 48-hour grace and exact expiry; no automatic resale; complete inspection before atomic recovery; replay never extends deadlines.                                                                                                                                                                                                  | Operational notification delivery and independent review remain open.                                     |
| `REQ-P02-RET-001` | `TST-P02-003`                | Paid Standard 7/Flexible 14 and fault/wrong-item/misdescription 30-day boundaries from verified handoff; exact concurrent claims; unused-goods restriction; no restocking fee; logistics responsibility and reasoned recovery; immutable policy and unaffected components.                                                                               | Formal Dispute/appeal authority belongs to Phase 05; earning release/freeze/reversal belongs to Phase 04. |
| `REQ-P02-UX-001`  | `TST-P02-004`                | Served Edge Product/Cart desktop/mobile journey, explicit variant/quantity/Location/fulfillment; failed reads and stock conflicts; changed-price review; lost committed hold replay; reload/release; delivery-pin correction; local payment status bridge. Offline checkout retains the safe draft, creates no reservation and recovers after reconnect. | Independent accessibility/native screen-reader review and full target WCAG/i18n acceptance remain open.   |

The executable stock/payment/cancellation/pickup/delivery/return scenarios are in [goods integration tests](../../libs/platform-core/src/lib/goods-checkout.integration.ts). Inventory/current-authority tests are in [foundation integration tests](../../libs/platform-core/src/lib/postgres-foundation.integration.ts). The served browser journey is [the Cart browser check](../../tools/check-goods-cart-browser.mjs), using the real built API plus explicit transport-failure injection. It does not stub successful business results.

`TST-P02-003` is locally proven for cancellation, returns and delivery retry. Product earning release after the 7/14-day window is **not accepted**: `P04-C07` ledger allocation and `P04-C08` earning release/scoped freezes are still pending. There is no goods earning model or ledger to test yet. Verified handoff and paid policy snapshots provide the future integration facts without inventing earning availability.

## Current verification

All 108 integration scenarios pass across seven isolated suite files, followed by built loopback inventory/quote/hold/payment/cancellation/pickup/delivery/return HTTP smoke. All 33 migrations deploy/replay; compatibility and populated upgrade have no Prisma difference; disposable restore passes. Sixteen workspace-locked writes complete in 826.0 ms (p50 575.2 ms, p95 824.4 ms), a local fixture measurement rather than target capacity acceptance. Five projects pass lint/typecheck/unit/build checks (65 tests, one OpenAPI snapshot; one existing worker test skipped). Documentation and public-contract audits pass. The current served Edge journey and offline draft/reconnect/payment bridge pass.

The final isolated full regression and audit results are recorded in the [C12 evidence directory](./evidence/phase-02-c12-2026-10-12/README.md). Earlier chunk evidence remains valid for its dated local scope: [C06 UI](./evidence/phase-02-c06-2026-10-12/README.md), [C07 payment bridge](./evidence/phase-02-c07-2026-10-12/README.md), [C08 cancellation](./evidence/phase-02-c08-2026-10-12/README.md), [C09 pickup](./evidence/phase-02-c09-2026-10-12/README.md), [C10 delivery](./evidence/phase-02-c10-2026-10-12/README.md), [C11 returns](./evidence/phase-02-c11-2026-10-12/README.md).

The acceptance run identified test-order leakage. Public discovery tests shared a schema with retained commerce fixtures, altering pagination. The media backup controller scanned database references absent from its temporary bucket. The full integration runner now recreates the migrated disposable schema between suite files; the controller fixture separately isolates its four ownership tables. The foundation fixture now explicitly seeds its shared review workspace and measures the one-event concurrency delta rather than assuming an empty workspace outbox. Application filtering and fail-closed backup behavior are preserved. These replace order-dependent checks with complete local fixtures.

## Formal gates still open

- Phase 00/01 target acceptance gaps remain documented in their existing evidence. Local checks do not establish target infrastructure or provider acceptance.
- Phase 04 controlled/live payment contracts, balanced ledger allocation, commission/promotions and goods earning release/freeze/reversal remain dependencies. `TST-P02-003` therefore remains partly open at the formal gate.
- Independent accessibility/native screen-reader review, target security/capacity and recovery acceptance remain separate quality gates. The current browser audit is local self-review.
- Pickup/delivery/return UI, notification channel delivery and formal Dispute/appeal operations are not claimed by backend/API completion. Return instructions/evidence are recorded; no carrier integration exists or is inferred.
- No public-release gate is closed. Phase 06 owns the cumulative public-release contract.

No missing check was moved to staging. No next phase is automatically started.

## Reproduction

Start local PostgreSQL, Redis, MinIO/init and ClamAV with the repository Compose configuration; wait for scanner/storage readiness. Configure only loopback test services and a stable test-only handoff key of at least 32 characters. The integration target refuses a remote database.

```sh
pnpm nx run platform-core:test-integration
pnpm nx run-many -t lint,typecheck,test,build --projects=contracts,platform-core,api,worker,web --parallel=3
pnpm docs:check
pnpm contracts:check
```

The full target requires the local `MEDIA_S3_ENDPOINT`, region and fixture credentials. `FOUNDATION_BROWSER_GOODS=1`, a local `PLAYWRIGHT_MODULE_PATH`, `GOODS_BROWSER_EVIDENCE_DIR`, and `FOUNDATION_TEST_NAME='records scoped inventory'` enable the served Edge journey with isolated API fixtures; build the web target first and keep port 3000 free. Fixture accounts, schemas and browser processes are cleaned up. No package store is committed.
