# Phase 02 — Goods Commerce

**Target status:** Specified — Not Executed — Not Verified. **Local status:** Inventory, transfer, availability, quotes/holds, Product/Cart UI and controlled paid goods Purchase/Orders and partial cancellation/refund allocation verified locally; the Phase 02 exit remains open.
**Objective:** prove correct single/multi-Vendor goods behavior privately before unifying with Booking.  
**Owner:** inventory, ordering, and fulfillment contexts  
**Entry:** Phase 00–01. **Exit:** no-oversell goods, fulfillment, return, and policy proof.  
**Decision coverage:** `DEC-018`, `DEC-027`, `DEC-028`, `DEC-037`, `DEC-049`, `DEC-054`, `DEC-055`, `DEC-125`, `DEC-131`–`DEC-133`, `DEC-148`, `DEC-161`, `DEC-166`, `DEC-183`, `DEC-186`, `DEC-187`

## Included / excluded

Includes immutable stock ledger, one fulfillment Location per Vendor group, price/availability quote, strict hold, Product Order, pickup-ready/collection, Vendor delivery zones/milestones/proof, partial cancellation, return/refund then fresh purchase, and exact goods policies. Excludes backorders, product exchanges, platform dispatch, drivers/carriers/GPS, and public release.

## Actors and proof journey

A verified Customer selects a Vendor Location and pickup or Vendor-managed delivery, accepts the quote, and receives a valid goods hold. Checkout commits only current stock; the scoped Vendor fulfillment role records ready/milestone/proof and the Customer presents a handoff code/QR or controlled fallback evidence. Support/Trust later processes a scoped ReturnCase without altering unrelated stock, Orders, or earnings. The proof includes competing holds, partial cancellation, failed-delivery retry, pickup expiry, and 7/14/30-day eligibility.

## Functional requirements

- `REQ-P02-INV-001`: every stock change writes a reasoned immutable movement; derived available stock cannot go negative.
- `REQ-P02-CHK-001`: a goods quote/hold validates SKU-variant/Location, price, zone, policy and expiry; competing holds cannot oversell.
- `REQ-P02-ORD-001`: paid goods auto-confirm into Vendor Order components; allowed cancellation affects only selected quantity/line and allocates refund safely.
- `REQ-P02-FUL-001`: Customer selects pickup/delivery per Vendor group; address/zone/fee/ETA snapshot before payment.
- `REQ-P02-FUL-002`: delivery records ordered milestones/proof; failed delivery receives one corrected retry within 48 hours.
- `REQ-P02-POL-001`: pickup is 72 hours plus a 48-hour grace, then return/inspection/refund treatment; it is not a Booking.
- `REQ-P02-RET-001`: unused-goods change-of-mind templates are Standard 7 calendar days or Flexible 14 calendar days from verified handoff with no restocking fee; fault/wrong-item/material-misdescription protection is 30 days; policies snapshot per line.

`REQ-P02-UX-001`: Customer Product details make SKU/variant, quantity, Location, price, fulfillment eligibility, and policy context explicit before Add to Cart; missing selections, stock conflicts, and failed reads have safe recovery (`DEC-191`; `TST-P02-004`). The [Marketplace UI/UX specification](../product/MARKETPLACE-UI-UX-SPECIFICATION.md) owns presentation details. This addition is implemented and locally verified under `P02-C06`; independent accessibility and formal phase-exit acceptance remain open.

## Policies, objects, and state

Uses `POL-GOOD-001`–`POL-GOOD-004`, `INV-INV-001`, `INV-FUL-001`, `INV-ORD-001`. Objects: InventoryMovement, CheckoutQuote/Hold, Purchase, VendorOrder, Fulfillment, AddressSnapshot, ReturnCase. States: `STATE-INV-001`, `STATE-CHK-001`, `STATE-ORD-001`, `STATE-FUL-001`, `STATE-RET-001`. Events: `EVT-STOCK-*`, `EVT-HOLD-*`, `EVT-ORDER-*`, `EVT-FULFILLMENT-*`.

## Failure/quality/acceptance

Expiry/payment race refunds late success; retry is idempotent; failed delivery/pickup expiration preserves evidence; provider/outbox failure reconciles. Stock/fulfillment mutation requires live authority; safe drafts may survive offline. Tests prove concurrency, price/zones, handoff fallback, partial cancellation, 7/14/30 eligibility, pickup grace, failed-delivery retry, and product earning release after its 7/14 window (`TST-P02-001`, `TST-P02-002`, `TST-P02-003`). Booking and atomic mixed payment remain Phase 03–04.

## Implementation chunks

**Plan updated:** 2026-10-12. Chunk boundaries are derived planning defaults; existing requirements, policies and phase gates remain authoritative. Follow the [single-chunk workflow](./MULTIPHASE-REQUIREMENTS.md#single-chunk-workflow). Complete one chunk per request, in the order below, after its dependencies are ready. Each chunk includes relevant contracts/state/events, scoped authority, implementation, local verification and documentation updates.

**Next chunk:** `P02-C11` — Goods returns and inspection. `P02-C01`–`P02-C03` are complete only for the local scope evidenced in [Local implementation notes](#local-implementation-notes). Goods quote validation is locally complete under `P02-C04`; atomic stock holds and expiry are locally reconciled under `P02-C05`.

| Chunk                                                  | Status           | Scope and requirement coverage                                                                                                                                                                                              | Dependency                                                                   | Completion evidence                                                                                                                                              |
| ------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P02-C01` — Inventory movement ledger                  | Local verified   | Reasoned append-only receive/adjust/damage movements and derived balances. (REQ-P02-INV-001)                                                                                                                                | Existing Phase 00–01 local foundation; formal entry gates tracked separately | Idempotency, concurrent non-negative availability, SKU isolation and scoped authority.                                                                           |
| `P02-C02` — Atomic Location transfers                  | Local verified   | Conserving same-Vendor debit/credit transfers between assigned Locations. (REQ-P02-INV-001)                                                                                                                                 | `P02-C01`                                                                    | Replay/conflicting keys, insufficient stock, rollback and immutable balanced pairs.                                                                              |
| `P02-C03` — Public Product availability                | Local verified   | Advisory Location/SKU availability without exposing private ledger data. (REQ-P02-CHK-001)                                                                                                                                  | `P02-C02`                                                                    | Quantity validation, publication/restriction changes and Location/SKU isolation.                                                                                 |
| `P02-C04` — Goods quote validation                     | Complete locally | Validate selected lines, quantity, current price, one Location per Vendor group, fulfillment zone/fee/ETA and policy; return an expiring quote without reserving stock. (REQ-P02-CHK-001, REQ-P02-FUL-001, REQ-P02-RET-001) | `P02-C03`                                                                    | Invalid selections, stale prices, unavailable quantities, zone boundaries, exact policy snapshots and expiry; no stock reservation.                              |
| `P02-C05` — Atomic stock holds and expiry              | Complete locally | Reserve all quoted goods atomically; implement idempotent replay, release and expiry against stock mutations/transfers. (REQ-P02-CHK-001)                                                                                   | `P02-C04`                                                                    | Competing holds cannot oversell; partial failure rolls back; stale/expired quotes and replay conflicts fail safely.                                              |
| `P02-C06` — Product selection and goods Cart UI        | Complete locally | Connect variant/quantity/Location selection, fulfillment choices and goods Cart to authoritative availability/quote/hold APIs. (REQ-P02-UX-001)                                                                             | `P02-C05`                                                                    | Served local UI preserves selections on failed reads, handles stock/price conflicts and never claims advisory stock is reserved; TST-P02-004.                    |
| `P02-C07` — Paid goods Order commitment                | Complete locally | Use a local controlled payment adapter to commit valid held stock into Purchase and independent Vendor Orders with snapshots and transactional events. (REQ-P02-ORD-001)                                                    | `P02-C06`                                                                    | Duplicate result commits once; timeout/expiry race and late success compensate; concurrent hold/payment cannot oversell. Final unified finance remains Phase 04. |
| `P02-C08` — Partial cancellation and refund allocation | Complete locally | Cancel selected quantities/lines only; release eligible stock and record safe scoped refund allocations. (REQ-P02-ORD-001)                                                                                                  | `P02-C07`                                                                    | Repeated/concurrent cancellation, invalid quantities and unaffected Order lines; adapter failures remain recoverable.                                            |
| `P02-C09` — Pickup readiness and collection            | Complete locally | Implement ready state, code/QR collection and controlled fallback evidence. (REQ-P02-FUL-001, REQ-P02-POL-001)                                                                                                              | `P02-C08`                                                                    | Scoped handoff, replay, 72-hour pickup plus 48-hour grace and expiry into inspection/refund treatment.                                                           |
| `P02-C10` — Vendor delivery and corrected retry        | Complete locally | Implement ordered delivery milestones, proof and one corrected failed-delivery retry within 48 hours. (REQ-P02-FUL-001, REQ-P02-FUL-002)                                                                                    | `P02-C09`                                                                    | Out-of-order/replayed milestones, failed evidence, retry limit/deadline and immutable fulfillment snapshots.                                                     |
| `P02-C11` — Goods returns and inspection               | Pending          | Scoped ReturnCase, inspection, refund and reasoned inventory recovery; exchange means fresh purchase. (REQ-P02-RET-001)                                                                                                     | `P02-C10`                                                                    | Standard 7/Flexible 14-day and fault 30-day boundaries from verified handoff; no restocking fee; unaffected components survive.                                  |
| `P02-C12` — Goods acceptance and phase gate            | Pending          | Assemble complete local goods journeys, adverse-path evidence and remaining gate decisions. (All Phase 02 requirements)                                                                                                     | `P02-C11`                                                                    | TST-P02-001–004; retry/concurrency/authority/offline proof, earning-window integration with Phase 04 when available; record unresolved formal gates.             |

**Tracking:** when a chunk finishes, update its status and add dated local implementation/evidence notes in this document, update relevant linked contracts/policies/acceptance documents, and set the next chunk in this document and [Documentation Status](../STATUS.md). If blocked, record the missing dependency and retain this chunk as next; do not silently advance.

## Local implementation notes

The first Phase 02 chunk adds an append-only PostgreSQL inventory-movement table and private API operations to record received, adjusted, and damaged stock for simple or variant Products at an assigned Vendor Location, then read on-hand, reserved, and derived available quantities. Variant movements are keyed by SKU; revisions cannot remove or convert an item while it has nonzero stock. The command checks that availability stays non-negative and writes audit, outbox, and idempotency records in the same transaction. A fresh local PostgreSQL integration run verifies idempotent receive, concurrent damage denial before negative availability, SKU-preserving revisions, and cross-workspace denial; the built API smoke verifies the same private HTTP receive/replay/read/negative/foreign-resource paths. This is local evidence for the inventory seam only: checkout holds, sales, returns, customer availability, and the `TST-P02-*` evidence remain unimplemented.

### Atomic Location transfers — 2026-10-12

The private `POST /v1/inventory/transfers` API transfers a positive quantity of a simple Product or selected variant SKU between two distinct assigned Locations of the active Vendor. An active Owner supplies an idempotency key and reason note. The transaction revalidates live membership and both Location scopes, checks derived source availability, and appends linked `transferred` debit/credit movements, one audit record, one `StockMoved` outbox event, and the replay outcome. It shares the existing workspace lock with stock mutations and Listing revisions. The response contains the transfer and movement IDs plus the resulting source/destination balances; an idempotent replay returns the original result, not a new balance calculation. Conflicting key reuse is rejected.

The additive migration preserves existing movements, adds the transfer link/index, enforces conserving same-Vendor/item/actor pairs at commit, and rejects movement updates/deletes. Corrections require new compensating movements. This is an immediate inventory relocation command, not a shipment, in-transit stock workflow, or Customer fulfillment action. No transfer UI or checkout behavior is introduced.

Local verification passed:

- Three PostgreSQL integration scenarios cover the existing stock seam, simple/variant transfers, concurrent transfers with insufficient-source rejection, concurrent duplicate replay, conflicting replay, SKU isolation, same/foreign Vendor and cross-workspace denial, unassigned Location and anonymous denial, Service rejection, and same-Location rejection. A deliberately failed destination write rolls back movements, audit, outbox, and idempotency records; the same key succeeds after the failure is removed. Direct database checks reject movement mutation, an orphan transfer movement, and an unbalanced pair.
- The built API smoke uses a disposable authenticated local fixture and an ephemeral loopback port. It verifies HTTP transfer/replay, conflicting replay, insufficient stock, invalid quantity, missing key, anonymous and foreign-Location denial, and the resulting private availability read.
- All 27 migrations deploy into a fresh disposable local schema; replay reports no pending migrations. The populated supported-foundation upgrade passes with no Prisma schema difference.
- Contracts, platform-core, API, and worker Nx lint/typecheck/unit targets pass. The API OpenAPI snapshot includes the transfer command and response. The worker's existing unit suite remains skipped.

Reproduce the focused integration and built API checks with the local fixture environment:

```sh
set -a
source .env.integration.example
set +a
FOUNDATION_TEST_NAME='transfers inventory|immutable inventory|records scoped inventory' pnpm nx run platform-core:test-integration
```

This closes the local transfer implementation chunk supporting `REQ-P02-INV-001` and `STATE-INV-001`; it does not accept the full `TST-P02-*` journey or Phase 02 exit. Availability/quote/hold, payment, fulfillment, and returns remain pending.

### Public Product availability — 2026-10-12

`GET /v1/public/listings/:listingId/availability` reads current derived stock without a session. It requires a selected public Vendor Location and, for variant Products, an existing SKU. `quantity` is an optional positive integer (default 1). The response contains Listing/Location/SKU, available quantity, requested quantity, `canFulfill`, and `checkedAt`; private on-hand/reserved balances, movement reasons, actors, and workspace IDs are omitted.

The read validates the published Product, approved/published Vendor, real workspace, and public Location in one repeatable-read PostgreSQL snapshot. Missing, private, unpublished, restricted, Service, foreign-Location, and mismatched-SKU resources use the existing access-denied response. Invalid identifiers/query values use the existing invalid-request response. No ledger, audit, outbox, or idempotency records are written. This is advisory availability at the read snapshot: it does not validate price, fulfillment zones, policies, or reserve stock, and `canFulfill` is not a checkout guarantee.

Local verification: the focused PostgreSQL suite covers zero stock, requested quantities, Location/SKU isolation, invalid input, live unpublication and Vendor restriction, private Locations, and Service denial alongside the existing movement/transfer regressions. The built API smoke checks anonymous reads after transfers, quantity validation, private/foreign/SKU denial, and immediate denial after unpublication. Contracts, platform-core, and API lint/typecheck/unit targets pass; the OpenAPI snapshot documents the response and query.

Reproduce locally with the same disposable fixture runner:

```sh
set -a
source .env.integration.example
set +a
FOUNDATION_TEST_NAME='public product availability|records scoped inventory|transfers inventory|immutable inventory' pnpm nx run platform-core:test-integration
```

This completes the public availability API slice supporting `REQ-P02-CHK-001`. Product selection UI, quotes, atomic holds, expiry/competing-hold proof, payment, fulfillment, returns, and full Phase 02 acceptance remain pending.

### Goods quotes and atomic holds — 2026-10-12

The next local API slice adds verified-adult Customer goods quotes and all-or-nothing stock holds across Vendor groups and workspaces. An assigned active Owner first configures a Location using `GET`/`PUT /v1/locations/:locationId/goods-configuration`: pickup eligibility, Standard/Flexible returns, and delivery zones with valid PostGIS polygons, fees, minimums, optional free-delivery thresholds, and ETA. Configuration writes require expected version and idempotency key; no Location is implicitly enabled for fulfillment.

`POST /v1/customer/goods/quotes` accepts one selected Location and pickup/delivery method per Vendor, explicit Product/SKU quantities, and delivery contact/address/pin when applicable. It checks current publication, stock, integer ETB prices, delivery minimum and polygon coverage. It persists immutable selection and snapshots: Listing/configuration versions, line prices, 7/14-day return template, 30-day fault protection, no restocking fee, pickup 72+48 hours or delivery fee/ETA/zone/address and 48-hour retry. Quotes do not reserve stock. The five-minute quote acceptance window and signed-in verified-adult quote requirement are derived implementation defaults; the specified hold duration is fifteen minutes.

`POST /v1/customer/goods/holds` accepts only a Customer-owned quote ID and idempotency key, revalidates every term, and atomically appends all `held` movements plus hold lines, audit, outbox, and replay records. Stock writes and transfers share Vendor workspace locks; checkout commands additionally share a global advisory lock to prevent lock inversions across Customer/Vendor workspaces. This deliberately serializes checkout allocation and should be revisited with measured contention before scaling. Duplicate replay returns the original acceptance, including its original expiry; `GET /v1/customer/goods/holds/:holdId` is authoritative for current state. A quote creates at most one hold.

`POST /v1/customer/goods/holds/:holdId/release` releases every line once. The worker sweeps up to 100 expired holds per tick, while hold reads and subsequent quote/hold attempts also reconcile expiry. Release/expiry append `released` movements and terminal events; they preserve original snapshots and do not require continuing Vendor publication or Customer authority for worker expiry. Availability can remain conservatively reserved until expiry reconciliation runs. Database constraints reject incomplete reservation/release ledgers, orphan movements, quote/line mutation, and reopening terminal holds. Conflicts return HTTP 409 `UNAVAILABLE` with recovery copy; authentication/resource scope uses the existing access-denied contract.

Local verification uses the disposable PostgreSQL schema and built loopback API. Seven goods scenarios cover multi-Vendor/workspace snapshots, variant prices, delivery fees/free threshold, pickup/policy snapshots, competing holds, duplicate replay, transfer/damage denial against reserved stock, deliberate later-line failure with full transaction rollback and same-key recovery, exact expiry boundary, repeat expiry/release, stale-price/configuration/publication rejection, identity/resource denial, invalid geometry, and direct database guards. The existing four inventory/availability regressions also run. The built API smoke verifies Owner configuration, quote/hold/read/release, replay/conflicts, anonymous denial, and availability before/after reservations. Fresh migration replay, populated upgrade and schema compatibility are checked locally. Contracts/platform-core/API/worker lint and typecheck pass; unit suites and OpenAPI snapshot pass, with the worker's existing unit suite skipped.

```sh
set -a
source .env.integration.example
set +a
FOUNDATION_TEST_NAME='goods |public product availability|records scoped inventory|transfers inventory|immutable inventory' pnpm nx run platform-core:test-integration
pnpm db:compat:check
pnpm db:upgrade:check
```

This closes the local goods quote/reservation API slice supporting `REQ-P02-CHK-001`, `INV-INV-001`, and the goods portion of `STATE-CHK-001`. Holds remain in `holding` until release/expiry; no provider intent or `awaiting_payment` transition is claimed. Payment commitment, late-success compensation, Orders, fulfillment execution, returns, promotion/commission allocation, Product selection/cart UI, and full Phase 02 acceptance remain pending.

### P02-C04 — Goods quote validation — 2026-10-12

Reconciled the existing quote implementation from the clean integrated `main` baseline and added a dedicated PostgreSQL quote validation scenario. Quote creation validates Product/SKU, positive integer quantity and available stock, one Location per Vendor, pickup configuration, delivery zone/minimum/fee/ETA, and current authoritative prices. Persisted quotes snapshot Standard/Flexible 7/14-day returns, 30-day fault protection, zero restocking fees, verified-handoff policy start, pickup 72+48 hours and delivery retry 48 hours. A five-minute expiry remains a derived default. Quotes do not reserve stock; clients accept current prices from the returned snapshot rather than submit an expected price.

The new scenario verifies polygon edge/corner inclusion and a pin just outside, unknown zones, duplicate Vendor groups/lines, fractional/excess quantity, foreign Location, delivery minimum below threshold, disabled pickup, fresh prices after a listing revision, preserved old snapshots, and an unchanged stock ledger after successful and rejected quotes. Existing coverage verifies variant selection, multi-Vendor policy/fee snapshots, free-delivery threshold, identity denial and expired/stale quote rejection on acceptance.

Local verification: disposable loopback PostgreSQL migration deployment and repeat deployment, eight goods integration scenarios, four inventory/availability regressions, and the built loopback API configuration/quote/replay/auth/availability smoke passed. The existing smoke also exercises hold/release regressions; these do not close `P02-C05`. Contracts, platform-core and API lint/typecheck/unit targets and one OpenAPI snapshot passed. Formal `TST-P02-*`, payment, Orders, fulfillment execution and returns remain open.

```sh
set -a
source .env.integration.example
set +a
FOUNDATION_TEST_NAME='goods quote|goods checkout denies|goods hold rejects|public product availability|records scoped inventory|transfers inventory|immutable inventory' pnpm nx run platform-core:test-integration
pnpm nx run-many -t lint,typecheck,test --projects=contracts,platform-core,api --parallel=3
```

**Next:** `P02-C05` — Atomic stock holds and expiry. No staging or remote verification was performed.

### P02-C05 — Atomic stock holds and expiry — 2026-10-12

Reconciled the existing goods hold/release/expiry implementation from integrated local `main`. All quoted lines reserve in one PostgreSQL transaction with hold lines, inventory movements, audit, outbox and idempotency records. Current quote expiry, publication, stock, price, Location configuration and policy snapshots are revalidated before reservation. The checkout advisory lock and Vendor workspace locks serialize reservations with stock mutations and transfers. This global checkout lock remains a local implementation tradeoff; throughput has not been accepted.

Added three PostgreSQL adverse-path scenarios: a hold racing damage of the last unit permits exactly one operation; a deliberate later-line release failure rolls back movements, audit, outbox and replay records across Vendor groups; and Customer release racing expiry restores each simple/variant line once with one terminal audit. Worker expiry also restores stock after Customer verification revocation and Listing unpublication, without requiring Customer authorization. The existing concurrent expiry assertion now permits either worker to win.

Local verification passed eleven goods scenarios and four inventory/availability regressions (15 tests), including competing holds, same-key replay/conflict, multi-Vendor reservation rollback and retry, stock transfer/damage denial, exact fifteen-minute expiry, stale/expired quote rejection, resource denial and database immutability guards. Fresh migration deployment and repeat deployment passed in a disposable loopback schema. Built local API smoke passed configuration, quote/hold/read/release/replay, stock reservation/restoration, public availability and inventory transfers. Contracts/platform-core/API/worker lint, typecheck and unit targets passed, with the existing worker test skipped; the OpenAPI snapshot passed.

```sh
set -a
source .env.integration.example
set +a
FOUNDATION_TEST_NAME='goods |public product availability|records scoped inventory|transfers inventory|immutable inventory' pnpm nx run platform-core:test-integration
pnpm nx run-many -t lint,typecheck,test --projects=contracts,platform-core,api,worker --parallel=3
```

The local goods hold expires fifteen minutes after creation in `holding`; payment initiation and its timing relationship remain for `P02-C07`. Worker expiry processes at most 100 due holds per tick; reads and new quote/hold commands also reconcile expiry. Idempotent creation replay preserves the original acceptance and expiry, so clients read the hold for authoritative current state. This completes the local reservation portion of `REQ-P02-CHK-001` and provides concurrency/ledger support for `TST-P02-001`; full checkout/payment and phase-exit acceptance remain open. No staging or remote verification was performed.

**Next:** `P02-C06` — Product selection and goods Cart UI.

### P02-C06 — Product selection and goods Cart UI — 2026-10-12

Product details now require explicit variant/SKU (when applicable), positive whole quantity, Location and configured pickup/delivery choice. They show exact selected price, 7/14-day unused-goods returns, 30-day fault protection, no restocking fee, pickup timing and configured delivery fees/minimums/ETA. Stock is checked before Add to Cart; failures preserve selections and offer the same action for retry. The public Listing detail contract now includes each public Location's nullable goods configuration, without private membership, ledger or workspace data. Current quote/hold revalidation remains authoritative after publication/configuration changes.

The browser-local goods Cart combines matching SKUs, preserves Vendor groups and enforces one Location/fulfillment method per Vendor. It supports quantity/removal and group Location/method edits. Delivery zone, contact/address and explicit pin coordinates are entered in Cart and remain memory-only. Continue to checkout submits an idempotent quote, displays current prices and changes from Cart prices, snapshots, fees/ETA/policies and total before explicit hold acceptance. Anonymous Cart selections persist across sign-in and are repriced by that quote; no server Cart or Phase 04 mixed-Cart merge is claimed. Expired quotes receive fresh keys. Hold creation preserves its original key in session storage before sending, locks edits on uncertain results, retries the original command, reads authoritative hold state and permits release. Reload does not discard an uncertain/active hold. Cart additions and quotes never claim stock reservation or payment success.

Local verification passed:

- Six new component tests cover missing selections with no stock request, failed reads/stock conflict recovery, repeated SKU and same-Vendor Location enforcement, checkout denial/sign-in recovery, original hold-key retry/definitive rejection and fresh expired-quote keys. All 19 web tests passed.
- Fifteen focused PostgreSQL goods/inventory regressions passed, with all 28 migrations and repeat deployment in a fresh disposable loopback schema. The built API smoke passed existing transfer/availability/configuration/quote/hold/release paths plus the public goods-configuration contract.
- A served production web build in local Microsoft Edge used the actual built loopback API and disposable verified-account fixture. It passed explicit selection validation, a deliberately failed stock read with preserved selection, insufficient stock, Cart persistence without reservation, changed-price review, a deliberately lost response after a real hold commit, same-key replay without a second reservation, reload reconciliation, release and stock restoration, outside-zone delivery rejection and corrected-pin quote. Browser routing only proxies to the actual local API and injects the stated failures; successful responses are not stubbed.
- Desktop (1440px) and mobile (320px) screenshots were inspected; mobile Product and Cart have no page overflow. The mechanical design detector returned no findings. Web/contracts/platform-core/API lint, typecheck and unit suites passed (60 tests and one OpenAPI snapshot). Local web Webpack and API builds passed; the API retains its six existing optional-dependency/source-map warnings.

Reproduce the browser journey with the bundled local Playwright module path and local fixture environment (ports 3000 must be free):

```sh
set -a
source .env.integration.example
set +a
PLAYWRIGHT_MODULE_PATH=/absolute/local/runtime/node_modules/playwright/index.mjs FOUNDATION_BROWSER_GOODS=1 FOUNDATION_TEST_NAME='goods |public product availability|records scoped inventory|transfers inventory|immutable inventory' pnpm nx run platform-core:test-integration
pnpm nx run-many -t lint,typecheck,test --projects=web,contracts,platform-core,api --parallel=3
```

[Local browser captures](../quality/evidence/phase-02-c06-2026-10-12/README.md) provide the dated `TST-P02-004` UI evidence. This is local chunk completion, not independent WCAG/native screen-reader acceptance or Phase 02 exit. Goods APIs retain their verified-adult eligibility check; the disposable verified fixture does not fabricate verification for current ordinary local accounts or change `DEC-190`. Payment, Purchase/Orders, fulfillment execution and returns remain for later chunks. No staging or remote verification was performed.

**Next:** `P02-C07` — Paid goods Order commitment.

### P02-C07 — Paid goods Order commitment — 2026-10-12

The goods-only controlled local payment API now converts valid held stock into one immutable Customer Purchase and independently scoped auto-confirmed Vendor Orders. `POST /v1/customer/goods/payments` accepts a Customer-owned hold and idempotency key, validates eligibility/publication and moves Holding → AwaitingPayment. The existing provisional Holding timeout remains fifteen minutes; initiation starts the specified fifteen-minute payment window once. A replay retains the original payment ID/deadline and cannot extend it. The authoritative hold/payment read includes the current deadline; earlier hold-creation replay still represents its original acceptance.

The local simulator's `POST /v1/customer/goods/payments/:paymentId/local-result` accepts only succeeded/failed/unknown for that Customer-owned attempt and is denied outside local runtime. Amount/currency/hold linkage come from the accepted snapshot; success time comes from the server-side controlled adapter clock, never request input. Immutable provider receipts persist before business reconciliation. This endpoint is a local test control, not a live payment webhook or browser-authoritative payment success. `GET /v1/customer/goods/payments/:paymentId`, worker expiry and reconciliation consume recorded results. Processing/unknown never imply Purchase creation or authorize a second attempt.

A timely result on the still-reserved AwaitingPayment hold commits once, even when reconciliation occurs after the deadline. The transaction appends one sold movement per allocation (debiting on-hand and reserved quantity), Purchase, complete per-Vendor Order/line snapshots, Customer/Vendor audit and transactional outbox events. Later-line failure rolls back all these effects while the previously committed provider receipt survives for retry. Committed holds cannot release stock. Customer Purchase reads and assigned active Owner Order reads omit unrelated components and require current resource authority. Original quotes, paid commercial terms, Order lines, receipts and movements are immutable; database guards enforce complete matching sold/Order/payment links and prevent appending children after commitment.

Known failure releases once. Unknown results remain reconcilable after expiry. Success at or after exact expiry, or after Customer release, cannot reclaim stock: it moves the hold to Compensating, records one full-amount refund operation and emits recovery work. The worker completes deterministic local refunds idempotently; adapter failure leaves the same operation pending. Refund totals cannot exceed captured amount. A 100-attempt bounded payment sweep runs before expiry; due holds with unreconciled recorded success are excluded from premature release. Targeted reads reconcile their own payment beyond the batch rather than treating delayed work as failure. Worker reconciliation requires no continuing Customer adult verification or Vendor session.

Local verification passed:

- Nine new PostgreSQL payment scenarios plus eleven goods quote/hold and four inventory/availability regressions (24 tests). They cover one-time fifteen-minute initiation/replay, foreign/anonymous ownership and non-local simulator denial, immutable provider input, multi-Vendor/simple/variant commitment, duplicate/concurrent results/reconcilers, assigned/revoked Owner reads, immutable commercial/payment data, unknown → failure release, provider success one millisecond before expiry with delayed reconciliation and revoked verification, exact-expiry late success preserving another Customer's stock, refund adapter failure/retry, complete later-line rollback/retry, last-unit competition and Customer release races. A 101-attempt backlog proves no recorded timely success is prematurely expired, including targeted reads beyond the worker batch.
- The built loopback API smoke passed payment start/replay/conflict, anonymous denial, unknown and recorded success/replay, authoritative reconciliation, one Purchase/auto-confirmed Owner-scoped Order, original price/quantity snapshots, stock consumption, conflicting final-result denial and committed-hold release denial. Existing configuration/quote/hold/release, public stock and transfer smoke checks also passed.
- All 29 migrations and repeat deployment passed in disposable local schemas; Prisma compatibility has no schema difference, and the populated supported-foundation upgrade passed. Contracts/platform-core/API/worker/web Nx lint/typecheck/unit targets passed (61 tests and one OpenAPI snapshot; existing worker test skipped). API, worker and local Webpack web builds passed; API retains its six existing optional-dependency/source-map warnings. The integration runner also reports the current pg concurrent-client-query deprecation warning.

```sh
set -a
source .env.integration.example
set +a
FOUNDATION_TEST_NAME='goods |public product availability|records scoped inventory|transfers inventory|immutable inventory' pnpm nx run platform-core:test-integration
pnpm db:compat:check
pnpm db:upgrade:check
pnpm nx run-many -t lint,typecheck,test --projects=contracts,platform-core,api,worker,web --parallel=3
```

This completes the local controlled payment/Order chunk supporting `REQ-P02-ORD-001` and the goods portion of `STATE-CHK-001`/`STATE-PAY-001`. It does not accept a Stripe/Chapa provider, live money, generic signed production webhooks, mixed Booking commitment, final ledger/commission/promotion/earning allocation or Phase 02 exit. Those finance/provider integrations remain Phase 04. The public Cart continues to expose quote/hold/release and preserves locks through AwaitingPayment; an authoritative committed hold reports local paid Orders. Payment control and Purchase/Owner Order reads remain API proof surfaces. A served Edge bridge initiated the local adapter through the actual API, verified locked AwaitingPayment in Cart, then recorded success and verified committed local Orders/stock through Cart refresh. One new component test and [mobile status captures](../quality/evidence/phase-02-c07-2026-10-12/README.md) cover that bridge; the design detector returned no findings. Partial cancellation, fulfillment and returns remain for the following chunks. No staging or remote verification was performed.

**Next:** `P02-C08` — Partial cancellation and refund allocation.

### P02-C08 — Partial cancellation and refund allocation — 2026-10-12

Exceptional pre-fulfillment cancellation now targets selected quantities of one paid Vendor Order. `POST /v1/vendor/goods/orders/:orderId/cancellations` requires a current assigned Owner, idempotency key, reason and unique line selections with positive whole quantities and explicit restock/damaged disposition. Purchased quantity/price/policy/fulfillment snapshots remain immutable; append-only cancellation lines expose cancelled and remaining quantity. Unselected lines and other Vendor Orders retain their state, stock and terms. Replay preserves acceptance; `GET /v1/goods/cancellations/:cancellationId` returns current refund state to the owning Customer, assigned Owner or scoped Finance authority.

Cancellation refunds the paid unit price times the selected quantity in integer ETB minor units. No current catalog price or caller refund amount is used. Partial cancellation preserves original delivery minimum/free-threshold/fee terms without a surcharge or requalification penalty. The final cancellation of the whole group includes its original paid delivery fee exactly once. Promotions/commission allocations remain absent pending Phase 04; no unsupported discounted refund claim is introduced. One durable refund operation per cancellation remains pending through adapter failure; the worker completes it with the same operation identity. Payment reads report cumulative completed/pending amounts and distinguish refund_pending, partially_refunded and refunded across independent components.

Eligible stock returns through linked reasoned `returned` movements. Damaged/non-sellable units append a matching `damaged` movement in the same transaction so availability does not increase. The cancellation, line quantity/value allocations, complete stock effects, scoped refund, Order/payment state, audit, outbox and replay result commit together. Shared checkout/Vendor workspace locks serialize cancellation with sales, holds, transfers and stock changes. Database guards reject over-cancellation, orphan/wrong-SKU/wrong-actor/unexpected damage effects, mutable commercial/effect records, incorrect delivery refund timing, incomplete effects, refund amounts beyond verified capture and refund states inconsistent with durable operations. The cancellation module shares typed transaction/audit/event helpers with checkout; no public Prisma/provider types are exposed.

`POST /v1/platform/goods/orders/:orderId/cancellations` and the matching scoped Order read require a live expiring Order-specific Platform Finance grant, carried in the server-derived AccessContext and separate from catalog-review authority. The local operator CLI `tools/manage-local-goods-cancellation-grant.mjs` grants/revokes only explicit Order scope for a verified local account with a non-Vendor session, a reason, operator provenance and bounded expiry (derived default 60 minutes, configurable 1–1440). No public self-grant API exists. Own-Customer/own-Vendor financial authority conflicts are denied; acquiring a conflicting membership removes effective authority immediately. Grant/member/session revocation is rechecked before mutation or replay. Revocation remains possible for an already-ineligible grant. MFA remains required outside the explicit local deferral. Every cancellation records `reviewRequired=true` and a durable post-action review event; review processing and final risk-tier finance workflows remain Phase 05/04 respectively.

A restricted Vendor's still-assigned Owner may read/cancel its existing paid Order and switch out of/back into its assigned context to resolve the commitment. The explicit aftercare derivation path does not enable normal catalog, stock, new quote/hold or payment writes; rejected/revoked/unassigned authority still fails closed. The chunk introduces private API proof surfaces, not a new cancellation UI or a Customer discretionary cancellation rule.

Local verification passed:

- Nine new PostgreSQL scenarios plus goods quote/hold/payment, inventory/transfer/public availability and the prior live membership/restriction regression (34 tests). They verify multi-Vendor/SKU isolation, original prices after a catalog price change, restock versus damaged stock, quantity projections, replay/conflicting keys, concurrent duplicate and competing cancellation, exact full-group delivery refund, preserved free/minimum terms after partial cancellation, aggregate refund limits, Customer/foreign/unassigned Owner denial, reviewer non-escalation, exact Finance scope, expiry/revocation/conflict denial, restricted-Vendor recovery without ordinary-write authority, pending adapter failure/retry, complete later-line rollback and same-key recovery, invalid/foreign/duplicate effects and last-unit recovery racing checkout. Focused follow-ups verify wrong-SKU/unapproved damage denial and revocation of ineligible grants.
- Built loopback API smoke passed partial/full cancellation and quantity/stock recovery, replay/conflict, missing key/fractional/anonymous denial, current cancellation/refund reads, real local operator CLI grant/revoke with authenticated Finance routes, fully refunded amount and restricted Owner reads without new stock authority. Existing paid Order, unknown/payment replay, quote/hold/release, public stock and transfer smoke also passed.
- All 30 migrations deploy and replay into disposable local schemas; Prisma compatibility reports no difference and the populated supported-foundation upgrade passes. Contracts/platform-core/API/worker/web lint/typecheck/unit targets passed (61 tests and one OpenAPI snapshot; existing worker test skipped). API/worker builds passed with the API's six existing optional-dependency/source-map warnings and the current pg concurrent-client-query deprecation warning in integration.

```sh
set -a
source .env.integration.example
set +a
FOUNDATION_TEST_NAME='goods |public product availability|records scoped inventory|transfers inventory|immutable inventory|rechecks current membership' pnpm nx run platform-core:test-integration
pnpm db:compat:check
pnpm db:upgrade:check
pnpm nx run-many -t lint,typecheck,test --projects=contracts,platform-core,api,worker,web --parallel=3
```

The local CLI requires `LOCAL_FINANCE_EMAIL`, `LOCAL_GOODS_ORDER_ID`, `LOCAL_OPERATOR_LABEL` and `LOCAL_GOODS_GRANT_REASON` under the local runtime/database environment, followed by `node tools/manage-local-goods-cancellation-grant.mjs grant` or `revoke`. It was exercised only against a disposable authenticated fixture; no ordinary account was granted finance authority. [Dated local evidence](../quality/evidence/phase-02-c08-2026-10-12/README.md) records these limits. This completes the local partial-cancellation/refund-allocation chunk supporting `REQ-P02-ORD-001` and `STATE-ORD-001`; it does not close fulfillment, returns, earning/ledger integration, post-action review acceptance or formal Phase 02 exit. No staging or remote verification was performed.

**Next:** `P02-C09` — Pickup readiness and collection.

### P02-C09 — Pickup readiness and collection — 2026-10-12

Paid Orders now receive immutable-snapshot fulfillment records in their payment commitment transaction. Existing paid Orders migrate to unstarted fulfillment only; no readiness or handoff is inferred. Assigned Owner or explicitly enabled, Location-scoped Fulfillment Staff can prepare and mark pickup ready. Staff profile or generic Staff membership alone is insufficient; a separate membership flag is server-derived in AccessContext. The local operator CLI `tools/manage-local-goods-fulfillment.mjs` updates that flag with provenance/reason/audit. Owner remains required for financial inspection. Existing restricted Vendor commitments remain resolvable without opening new catalog/stock authority.

Readiness freezes the exact remaining uncancelled quantities and purchased pickup policy, starts 72 hours plus 48 hours grace, and creates a random private one-time code. A stable configured `JUNCTION_GOODS_HANDOFF_SECRET` encrypts codes using AES-256-GCM with fulfillment-bound associated data; a bound digest verifies collection. Only the owning Customer read returns the code and SVG QR during the active window/grace. Owner/Staff reads, events and audit omit the secret. The QR contains a fulfillment-bound versioned payload and is independently decoded in the built API smoke. Code formatting permits hyphens/spaces for manual entry. Terminal reads remove code/QR, terminal storage clears ciphertext, and five rejected proofs lock primary proof until controlled fallback. This bounded attempt limit is a derived local default.

Collection records one immutable handoff with actor, Customer, method and server time, and never moves sold stock again. Idempotent replay preserves the original acceptance; new-key repeat or later cancellation cannot duplicate handoff or restore stock. Fallback accepts only code-unavailable/accessibility reason, a private authenticated Customer statement for this fulfillment and a distinct assigned witness statement. Acknowledgement must be fresh within fifteen minutes (derived default), match Customer/fulfillment/reason and predate handoff. Foreign/stale acknowledgements fail; evidence is private structured text, never a public media attachment. No binary evidence upload/scanning claim is introduced. Current session/member/Location authority is checked again before replay.

At the exact 72-hour boundary pickup enters grace; at exact 120 hours the worker/read/collection path moves it to inspection_pending and removes the code. Expiry appends audit/outbox but does not restock or infer refund success. An Owner inspects every frozen remaining quantity once with reasoned restock/damaged/quarantine/lost disposition. Inspection, immutable evidence, quantity/value recovery, full remaining policy refund operation, Order/payment state, audit/outbox and replay result commit atomically. Restock increases availability; damaged/quarantined/lost effects offset the recovery movement and do not offer resale stock. Later-line/inspection failure rolls back effects and permits the same-key retry. Worker refund recovery retains the prior controlled local adapter behavior. Ordinary pre-fulfillment cancellation is blocked after readiness; inspection uses an explicit pickup-expiry origin and cannot bypass the actual fulfillment state.

Local verification:

- Eight pickup PostgreSQL scenarios cover code privacy and one-time collection/replay, immutable handoff, wrong QR binding and five-attempt lock/fallback, exact 72/120-hour boundaries and inspection/refund, QR collection near expiry, explicit Staff authority/Location/revocation and foreign Customer denial, stale/foreign fallback denial, inspection rollback/same-key quarantine recovery, remaining-quantity freeze/readiness replay without deadline extension, direct handoff-without-evidence denial, post-ready cancellation denial and incomplete inspection denial. The full focused suite passed 42 goods/inventory/authority scenarios.
- Built loopback API smoke covers out-of-order readiness, prepare/ready replay, Customer-only code/QR, independently decoded actual SVG QR via jsQR, wrong code rejection, one QR collection/replay, terminal proof removal, plus prior cancellation/payment/stock paths.
- All 31 migrations deploy/replay in disposable local schemas; compatibility and populated supported-foundation upgrade are checked locally. Five-project Nx lint/typecheck/unit targets pass (61 tests and one OpenAPI snapshot; existing worker test skipped). API/worker builds retain the prior optional-dependency/source-map warnings and pg integration deprecation warning.

```sh
set -a
source .env.integration.example
set +a
FOUNDATION_TEST_NAME='goods |public product availability|records scoped inventory|transfers inventory|immutable inventory|rechecks current membership' pnpm nx run platform-core:test-integration
pnpm db:compat:check
pnpm db:upgrade:check
pnpm nx run-many -t lint,typecheck,test --projects=contracts,platform-core,api,worker,web --parallel=3
```

This is local API/worker pickup completion supporting `REQ-P02-FUL-001`, `REQ-P02-POL-001` and pickup `STATE-FUL-001`, not a new pickup UI, delivery/returns completion, native screen-reader acceptance, actual notification-channel delivery, final earning/ledger integration or Phase 02 exit. Events provide durable notification work; channel delivery remains separately gated. The local dependency tree uses pnpm 11; package-manager commands used that matching tool with the unchanged declared pnpm 10 preference. Frozen installation passed, and lockfile additions are limited to QR/decode dependencies plus reconciling the already-declared zod dependency. No package store is committed. No staging or remote verification was performed.

**Next:** `P02-C10` — Vendor delivery and corrected retry.

### P02-C10 — In progress — 2026-10-12

Work started from clean integrated local `main` on `codex/p02-c10-goods-delivery`. A typed delivery milestone guard now validates preparation/dispatch, evidence-backed first failure, one corrected retry before the exact 48-hour deadline, terminal second failure and expiry into inspection. Corrected contact/address is separate from the paid original snapshot. Four focused unit tests cover ordering, exact deadline, immutable original address and invalid evidence/contact/pin inputs. The platform-core unit target passes 22 tests including existing regressions.

This is implementation progress only. The guard is now wired into transactional repository dispatch/failure/retry commands with immutable milestone records and original paid-zone PostGIS validation. Three focused PostgreSQL scenarios verify replay/out-of-order rejection, outside-zone rollback, unchanged paid snapshots, current scope denial, exact retry deadline, concurrent worker expiry without stock recovery and private one-time delivery code/QR handoff. Built local HTTP smoke now exercises dispatch/failure/correction/handoff and Customer-only proof reads. All 32 migrations deploy and replay in disposable schemas. Primary code/QR handoff and HTTP routes are now implemented. Controlled fallback, bounded rejected-proof attempts, Customer correction acknowledgement, complete terminal fulfillment/inspection coupling, broader rollback/concurrency evidence and final chunk audit remain required. `P02-C10` stays next; no delivery capability or chunk completion is claimed.

### P02-C10 — Vendor delivery and corrected retry — 2026-10-12

C10 is complete locally. Delivery dispatch freezes uncancelled quantities, encrypted private Customer code/QR and original paid policy. Ordered immutable milestones enforce one Customer-confirmed in-zone correction within 48 hours of first failure, keeping paid price, fee and policy unchanged. Five failed primary proofs lock code/QR; fresh Customer receipt acknowledgement plus a distinct assigned witness provides controlled fallback. Successful handoff records authoritative server time without another stock movement. Second failure or deadline expiry closes delivery proof and requires complete Owner inspection before atomic reasoned recovery and scoped refund allocation. Generic fulfillment reads expose actual delivery state, handoff and inspection evidence.

Local evidence: five new PostgreSQL delivery scenarios plus four pure policy tests; 47 commerce/authority regression scenarios and built authenticated HTTP dispatch/failure/Customer-confirmed correction/code handoff smoke pass. Concurrent duplicate dispatch/inspection yield one effect; injected inspection failure rolls back cancellation, stock and refund with same-key recovery. Stale Customer fallback is denied. All 32 migrations deploy/replay, compatibility reports no difference and populated upgrade passes. All five projects pass lint/typecheck/unit checks (65 tests and OpenAPI snapshot; existing worker test skipped). Documentation and contract audits pass.

The broader local integration run passed 98 scenarios and failed one unrelated media backup controller scenario (`runs the actual controller, refuses a competing owner and stops the scheduler cleanly`). Local MinIO and ClamAV were started after an initial missing-service failure; the remaining controller failure is recorded as a regression limitation, not delivery acceptance. No remote/staging testing occurred. Delivery UI, channel delivery, live payment refunds, Phase 04 earnings and formal phase exit remain separately gated.

Reproduce against local PostgreSQL with a stable test-only `JUNCTION_GOODS_HANDOFF_SECRET`:

```sh
FOUNDATION_TEST_NAME='goods |public product availability|records scoped inventory|transfers inventory|immutable inventory|rechecks current membership' pnpm nx run platform-core:test-integration
pnpm nx run-many -t lint,typecheck,test --projects=contracts,platform-core,api,worker,web --parallel=3
pnpm docs:check
pnpm contracts:check
```

See [C10 local evidence](../quality/evidence/phase-02-c10-2026-10-12/README.md). C11 is next; formal entry/exit gates are unchanged.
