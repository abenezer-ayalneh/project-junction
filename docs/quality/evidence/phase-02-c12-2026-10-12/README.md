# P02-C12 local acceptance audit — 2026-10-12

**Status:** Complete locally; formal Phase 02 exit open.

A production Next build and built Nest API ran on loopback with a disposable PostgreSQL schema and verified fixture account in headless Microsoft Edge. The current Product/Cart journey passed explicit selections, failed-read preservation, stock conflict, changed-price review, lost committed hold replay, reload reconciliation, release, out-of-zone pin recovery, desktop/mobile and controlled payment bridge. A true offline browser state plus aborted API transport retained the browser-local Cart draft without reserving stock; reconnect/reload preserved it and resumed authoritative checkout.

- [Product desktop](./product-desktop.png), [Product mobile](./product-mobile.png) and [Cart mobile](./cart-mobile.png) preserve the existing marketplace design and centered selection controls.
- [AwaitingPayment](./cart-awaiting-payment-mobile.png) and [committed local Orders](./cart-paid-mobile.png) reflect server-authoritative hold/payment facts. [Payment bridge record](./payment-bridge.json) records the fixture outcome.

All 108 integration tests pass in seven freshly migrated isolated suites, followed by built goods HTTP smoke. Thirty-three migrations deploy/replay; compatibility/upgrade have no schema difference; restore passes. Five-project lint/typecheck/unit/build checks pass (65 tests and OpenAPI snapshot; one worker test skipped). Documentation/contract audits pass. The test runner removes fixture-order leakage; the previously reported media controller failure is resolved by fixture isolation. [Recorded verification results](./verification.json) preserve counts and open gates.

Full results and requirement/gate mapping are in [Phase 02 local acceptance evidence](../../PHASE-02-LOCAL-ACCEPTANCE-EVIDENCE.md). Live providers, ledger/earnings, independent accessibility, complete fulfillment/return UI and formal phase exit remain open. Every check is local; no staging, remote development or deployment occurred.
