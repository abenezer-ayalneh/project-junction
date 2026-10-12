# Phase 02 — Goods Commerce

**Target status:** Specified — Not Executed — Not Verified. **Local status:** Inventory movements, atomic Location transfers, public Product availability, and goods quotes/holds verified with local PostgreSQL and the built API runtime; the Phase 02 exit remains open.
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

`REQ-P02-UX-001`: Customer Product details make SKU/variant, quantity, Location, price, fulfillment eligibility, and policy context explicit before Add to Cart; missing selections, stock conflicts, and failed reads have safe recovery (`DEC-191`; `TST-P02-004`). The [Marketplace UI/UX specification](../product/MARKETPLACE-UI-UX-SPECIFICATION.md) owns presentation details. This addition remains **Specified — Not Executed — Not Verified** and is not covered by the local inventory-seam evidence below.

## Policies, objects, and state

Uses `POL-GOOD-001`–`POL-GOOD-004`, `INV-INV-001`, `INV-FUL-001`, `INV-ORD-001`. Objects: InventoryMovement, CheckoutQuote/Hold, Purchase, VendorOrder, Fulfillment, AddressSnapshot, ReturnCase. States: `STATE-INV-001`, `STATE-CHK-001`, `STATE-ORD-001`, `STATE-FUL-001`, `STATE-RET-001`. Events: `EVT-STOCK-*`, `EVT-HOLD-*`, `EVT-ORDER-*`, `EVT-FULFILLMENT-*`.

## Failure/quality/acceptance

Expiry/payment race refunds late success; retry is idempotent; failed delivery/pickup expiration preserves evidence; provider/outbox failure reconciles. Stock/fulfillment mutation requires live authority; safe drafts may survive offline. Tests prove concurrency, price/zones, handoff fallback, partial cancellation, 7/14/30 eligibility, pickup grace, failed-delivery retry, and product earning release after its 7/14 window (`TST-P02-001`, `TST-P02-002`, `TST-P02-003`). Booking and atomic mixed payment remain Phase 03–04.

## Implementation chunks

**Plan updated:** 2026-10-12. Chunk boundaries are derived planning defaults; existing requirements, policies and phase gates remain authoritative. Follow the [single-chunk workflow](./MULTIPHASE-REQUIREMENTS.md#single-chunk-workflow). Complete one chunk per request, in the order below, after its dependencies are ready. Each chunk includes relevant contracts/state/events, scoped authority, implementation, local verification and documentation updates.

**Next chunk:** `P02-C04` — Goods quote validation. `P02-C01`–`P02-C03` are complete only for the local scope evidenced in [Local implementation notes](#local-implementation-notes). Existing quote/hold source changes are unverified work to reconcile when their chunks are selected; their presence does not close either chunk.

| Chunk                                                  | Status         | Scope and requirement coverage                                                                                                                                                                                              | Dependency                                                                   | Completion evidence                                                                                                                                              |
| ------------------------------------------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P02-C01` — Inventory movement ledger                  | Local verified | Reasoned append-only receive/adjust/damage movements and derived balances. (REQ-P02-INV-001)                                                                                                                                | Existing Phase 00–01 local foundation; formal entry gates tracked separately | Idempotency, concurrent non-negative availability, SKU isolation and scoped authority.                                                                           |
| `P02-C02` — Atomic Location transfers                  | Local verified | Conserving same-Vendor debit/credit transfers between assigned Locations. (REQ-P02-INV-001)                                                                                                                                 | `P02-C01`                                                                    | Replay/conflicting keys, insufficient stock, rollback and immutable balanced pairs.                                                                              |
| `P02-C03` — Public Product availability                | Local verified | Advisory Location/SKU availability without exposing private ledger data. (REQ-P02-CHK-001)                                                                                                                                  | `P02-C02`                                                                    | Quantity validation, publication/restriction changes and Location/SKU isolation.                                                                                 |
| `P02-C04` — Goods quote validation                     | Pending        | Validate selected lines, quantity, current price, one Location per Vendor group, fulfillment zone/fee/ETA and policy; return an expiring quote without reserving stock. (REQ-P02-CHK-001, REQ-P02-FUL-001, REQ-P02-RET-001) | `P02-C03`                                                                    | Invalid selections, stale prices, unavailable quantities, zone boundaries, exact policy snapshots and expiry; no stock reservation.                              |
| `P02-C05` — Atomic stock holds and expiry              | Pending        | Reserve all quoted goods atomically; implement idempotent replay, release and expiry against stock mutations/transfers. (REQ-P02-CHK-001)                                                                                   | `P02-C04`                                                                    | Competing holds cannot oversell; partial failure rolls back; stale/expired quotes and replay conflicts fail safely.                                              |
| `P02-C06` — Product selection and goods Cart UI        | Pending        | Connect variant/quantity/Location selection, fulfillment choices and goods Cart to authoritative availability/quote/hold APIs. (REQ-P02-UX-001)                                                                             | `P02-C05`                                                                    | Served local UI preserves selections on failed reads, handles stock/price conflicts and never claims advisory stock is reserved; TST-P02-004.                    |
| `P02-C07` — Paid goods Order commitment                | Pending        | Use a local controlled payment adapter to commit valid held stock into Purchase and independent Vendor Orders with snapshots and transactional events. (REQ-P02-ORD-001)                                                    | `P02-C06`                                                                    | Duplicate result commits once; timeout/expiry race and late success compensate; concurrent hold/payment cannot oversell. Final unified finance remains Phase 04. |
| `P02-C08` — Partial cancellation and refund allocation | Pending        | Cancel selected quantities/lines only; release eligible stock and record safe scoped refund allocations. (REQ-P02-ORD-001)                                                                                                  | `P02-C07`                                                                    | Repeated/concurrent cancellation, invalid quantities and unaffected Order lines; adapter failures remain recoverable.                                            |
| `P02-C09` — Pickup readiness and collection            | Pending        | Implement ready state, code/QR collection and controlled fallback evidence. (REQ-P02-FUL-001, REQ-P02-POL-001)                                                                                                              | `P02-C08`                                                                    | Scoped handoff, replay, 72-hour pickup plus 48-hour grace and expiry into inspection/refund treatment.                                                           |
| `P02-C10` — Vendor delivery and corrected retry        | Pending        | Implement ordered delivery milestones, proof and one corrected failed-delivery retry within 48 hours. (REQ-P02-FUL-001, REQ-P02-FUL-002)                                                                                    | `P02-C09`                                                                    | Out-of-order/replayed milestones, failed evidence, retry limit/deadline and immutable fulfillment snapshots.                                                     |
| `P02-C11` — Goods returns and inspection               | Pending        | Scoped ReturnCase, inspection, refund and reasoned inventory recovery; exchange means fresh purchase. (REQ-P02-RET-001)                                                                                                     | `P02-C10`                                                                    | Standard 7/Flexible 14-day and fault 30-day boundaries from verified handoff; no restocking fee; unaffected components survive.                                  |
| `P02-C12` — Goods acceptance and phase gate            | Pending        | Assemble complete local goods journeys, adverse-path evidence and remaining gate decisions. (All Phase 02 requirements)                                                                                                     | `P02-C11`                                                                    | TST-P02-001–004; retry/concurrency/authority/offline proof, earning-window integration with Phase 04 when available; record unresolved formal gates.             |

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
