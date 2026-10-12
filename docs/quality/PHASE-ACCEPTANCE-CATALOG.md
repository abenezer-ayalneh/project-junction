# Phase Acceptance Catalog

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** acceptance scenario identifiers  
**Decision coverage:** `DEC-005`, `DEC-138`, `DEC-157`–`DEC-160`, `DEC-191`–`DEC-193`

| ID            | Phase | Scenario                                                                                                                                                                  | Required future evidence                                        |
| ------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `TST-P00-001` | 00    | scoped access prevents a stale Vendor membership from reading a Location                                                                                                  | API/DB authorization result                                     |
| `TST-P00-002` | 00    | retired synthetic account/workspace routes and schema are absent from every application runtime; no synthetic workspace can be created or restored                        | migration and route-absence inspection                          |
| `TST-P00-003` | 00    | a versioned public API contract and compatible migration path reject persistence-type leakage and incompatible change                                                     | contract/migration report                                       |
| `TST-P00-004` | 00    | an outbox/webhook replay, timeout, and retry create no duplicate business effect and reconcile to durable truth                                                           | inbox/outbox trace + reconciliation result                      |
| `TST-P00-005` | 00    | documentation/status review finds every target claim labeled and every requirement linked to acceptance evidence                                                          | signed coverage-audit record                                    |
| `TST-P01-001` | 01    | approved Vendor publishes a reviewed listing, and prohibited category is blocked                                                                                          | E2E + audit event                                               |
| `TST-P01-002` | 01    | a listing revision/risk review is rejected or returned without publishing stale/unsafe content                                                                            | E2E + moderation/audit event                                    |
| `TST-P01-003` | 01    | CSV dry-run/commit replay is idempotent and produces row-level error/preview evidence                                                                                     | import trace + export comparison                                |
| `TST-P01-004` | 01    | public video stays quarantined until safe processing and caption/no-speech validation complete                                                                            | media trace + accessibility result                              |
| `TST-P01-005` | 01    | desktop/mobile shell and homepage give Products and Services equal category/detail entry with no dead capability-dependent actions                                        | future `EVD-REQ-*` served-browser/navigation record             |
| `TST-P01-006` | 01    | query/filter/sort/pagination survives sharing, reload, and return navigation; full-result ordering, mobile filtering, empty/error recovery are explicit                   | future `EVD-REQ-*` browser + query-contract evidence            |
| `TST-P01-007` | 01    | cards/details/Storefront show approved media, honest price, Vendor identity, missing-review fallback, and publication revocation                                          | future `EVD-REQ-*` browser + public-contract/media evidence     |
| `TST-P02-001` | 02    | two concurrent checkouts cannot oversell a variant/location quantity                                                                                                      | concurrency trace + stock ledger                                |
| `TST-P02-002` | 02    | pickup/delivery group snapshots price, zone, proof, and pickup grace                                                                                                      | E2E + event/ledger records                                      |
| `TST-P02-003` | 02    | partial cancellation, 7/14/30 return eligibility, delivery retry, and product earnings release preserve affected-value isolation                                          | policy/state/ledger trace                                       |
| `TST-P02-004` | 02    | Product variant/quantity/Location/fulfillment selection shows exact price/policy and safely recovers from stock or read failure before Cart entry                         | future `EVD-REQ-*` browser + stock/Cart state evidence          |
| `TST-P03-001` | 03    | concurrent booking intents cannot double-book named/any-qualified Staff                                                                                                   | concurrency trace                                               |
| `TST-P03-002` | 03    | Flexible/Standard cancellation and amendment preserve policy snapshots and correct money                                                                                  | policy and ledger test                                          |
| `TST-P03-003` | 03    | meeting provisioning failure compensates safely and attendance/no-show remains contestable                                                                                | provider/state/ledger trace                                     |
| `TST-P03-004` | 03    | Service Option/add-on/mode/Staff/slot selection shows price/duration/timezone, safely handles lost slots, and distinguishes intent from confirmation                      | future `EVD-REQ-*` browser + scheduling state evidence          |
| `TST-P04-001` | 04    | one Purchase atomically creates mixed-Vendor goods Orders and up to five independent Bookings                                                                             | E2E + idempotency replay                                        |
| `TST-P04-002` | 04    | webhook duplicate/out-of-order delivery cannot imbalance the ledger                                                                                                       | inbox/reconciliation trace                                      |
| `TST-P04-003` | 04    | promotion allocation, commission, earnings window, and idempotent weekly payout use snapshotted values                                                                    | calculation + ledger/payout trace                               |
| `TST-P04-004` | 04    | mixed Cart merge/repricing, verification, unavailable components, hold expiry, unknown payment, reconciliation/late success, and confirmation show authoritative outcomes | future `EVD-REQ-*` browser + Cart/hold/payment state evidence   |
| `TST-P05-001` | 05    | return/dispute/support/moderation action preserves evidence and obeys dual control                                                                                        | E2E + audit record                                              |
| `TST-P05-002` | 05    | personalisation remains off without explicit opt-in                                                                                                                       | privacy test                                                    |
| `TST-P05-003` | 05    | restricted Vendor suspension, review entitlement, private inquiry, and notification rules preserve open obligations and scope                                             | E2E + audit/notification trace                                  |
| `TST-P05-004` | 05    | provider/inbox/Purchase/ledger/payout mismatch opens a reconciled exception rather than editing financial history                                                         | reconciliation case + compensating-posting trace                |
| `TST-P05-005` | 05    | independent aftercare actions preserve unaffected components, genuine review entitlement, and opt-in/opt-out personalization                                              | future `EVD-REQ-*` browser + entitlement/privacy evidence       |
| `TST-P06-001` | 06    | public demo role switch is synthetic, isolated, quota-bound, and purged at 24 hours                                                                                       | E2E + purge report                                              |
| `TST-P06-002` | 06    | restore a clean host to declared RPO/RTO without data promotion                                                                                                           | recovery drill                                                  |
| `TST-P06-003` | 06    | the published 100-user/10-checkout-minute portfolio envelope and relevant saturation metrics meet declared thresholds                                                     | load report + metric export                                     |
| `TST-P06-004` | 06    | public flows meet WCAG/pseudo-locale/low-connectivity behavior without unsafe offline mutation                                                                            | accessibility + network test evidence                           |
| `TST-P06-005` | 06    | release/rollback, environment separation, ASVS applicability, and truthful public claims satisfy the public-release gate                                                  | release-gate record + security/claim evidence                   |
| `TST-P06-006` | 06    | supported marketplace journeys pass responsive/themes/zoom/pseudo-locale, keyboard/screen-reader, media, motion, network, and offline-commitment checks                   | future `EVD-REQ-*` accessibility/network + performance evidence |

The new marketplace scenarios are specified future local acceptance, with concrete checks in the [Marketplace UI/UX specification](../product/MARKETPLACE-UI-UX-SPECIFICATION.md#required-future-local-acceptance). They do not extend any historical execution record. `TST-P04-004` must distinguish current local `DEC-190` authentication from the public-release restoration prerequisites.

## Requirement-to-scenario mapping

This table is the authoritative test association. Each requirement's phase file owns its product wording; a future execution records the linked `EVD-*` class shown in the scenario row above.

| Requirement         | Acceptance scenario(s)       |
| ------------------- | ---------------------------- |
| `REQ-P00-IAM-001`   | `TST-P00-001`                |
| `REQ-P00-IAM-002`   | `TST-P00-001`                |
| `REQ-P00-API-001`   | `TST-P00-001`, `TST-P00-003` |
| `REQ-P00-DATA-001`  | `TST-P00-003`                |
| `REQ-P00-EVT-001`   | `TST-P00-004`                |
| `REQ-P00-DEMO-001`  | `TST-P00-002`                |
| `REQ-P00-NFR-001`   | `TST-P00-005`                |
| `REQ-P00-NFR-002`   | `TST-P00-001`                |
| `REQ-P00-NFR-003`   | `TST-P00-004`                |
| `REQ-P00-NFR-004`   | `TST-P04-002`                |
| `REQ-P00-NFR-005`   | `TST-P06-004`                |
| `REQ-P00-NFR-006`   | `TST-P06-004`                |
| `REQ-P00-NFR-007`   | `TST-P06-005`                |
| `REQ-P00-NFR-008`   | `TST-P06-003`                |
| `REQ-P00-NFR-009`   | `TST-P06-002`                |
| `REQ-P00-NFR-010`   | `TST-P00-002`, `TST-P06-001` |
| `REQ-P01-VND-001`   | `TST-P01-001`                |
| `REQ-P01-CAT-001`   | `TST-P01-001`                |
| `REQ-P01-CAT-002`   | `TST-P01-002`                |
| `REQ-P01-CSV-001`   | `TST-P01-003`                |
| `REQ-P01-DSC-001`   | `TST-P01-001`                |
| `REQ-P01-MEDIA-001` | `TST-P01-004`                |
| `REQ-P01-UX-001`    | `TST-P01-005`                |
| `REQ-P01-UX-002`    | `TST-P01-006`                |
| `REQ-P01-UX-003`    | `TST-P01-007`                |
| `REQ-P02-INV-001`   | `TST-P02-001`                |
| `REQ-P02-CHK-001`   | `TST-P02-001`                |
| `REQ-P02-ORD-001`   | `TST-P02-003`                |
| `REQ-P02-FUL-001`   | `TST-P02-002`                |
| `REQ-P02-FUL-002`   | `TST-P02-002`, `TST-P02-003` |
| `REQ-P02-POL-001`   | `TST-P02-002`                |
| `REQ-P02-RET-001`   | `TST-P02-003`                |
| `REQ-P02-UX-001`    | `TST-P02-004`                |
| `REQ-P03-SCH-001`   | `TST-P03-001`                |
| `REQ-P03-HOLD-001`  | `TST-P03-001`                |
| `REQ-P03-BKG-001`   | `TST-P03-002`                |
| `REQ-P03-BKG-002`   | `TST-P03-002`                |
| `REQ-P03-BKG-003`   | `TST-P03-002`                |
| `REQ-P03-POL-001`   | `TST-P03-002`                |
| `REQ-P03-MTG-001`   | `TST-P03-003`                |
| `REQ-P03-ATT-001`   | `TST-P03-003`                |
| `REQ-P03-UX-001`    | `TST-P03-004`                |
| `REQ-P04-CHK-001`   | `TST-P04-001`                |
| `REQ-P04-CHK-002`   | `TST-P04-001`, `TST-P04-002` |
| `REQ-P04-PUR-001`   | `TST-P04-001`                |
| `REQ-P04-FIN-001`   | `TST-P04-002`                |
| `REQ-P04-FIN-002`   | `TST-P04-002`                |
| `REQ-P04-PRM-001`   | `TST-P04-003`                |
| `REQ-P04-PYO-001`   | `TST-P04-003`                |
| `REQ-P04-UX-001`    | `TST-P04-004`                |
| `REQ-P05-CASE-001`  | `TST-P05-001`                |
| `REQ-P05-RET-001`   | `TST-P02-003`, `TST-P05-001` |
| `REQ-P05-TRUST-001` | `TST-P05-001`, `TST-P05-003` |
| `REQ-P05-REV-001`   | `TST-P05-003`                |
| `REQ-P05-ENG-001`   | `TST-P05-002`, `TST-P05-003` |
| `REQ-P05-PRV-001`   | `TST-P05-002`                |
| `REQ-P05-OPS-001`   | `TST-P05-004`                |
| `REQ-P05-UX-001`    | `TST-P05-005`                |
| `REQ-P06-DEM-001`   | `TST-P06-001`                |
| `REQ-P06-DEM-002`   | `TST-P06-001`                |
| `REQ-P06-REL-001`   | `TST-P06-005`                |
| `REQ-P06-SEC-001`   | `TST-P06-005`                |
| `REQ-P06-REL-002`   | `TST-P06-005`                |
| `REQ-P06-DR-001`    | `TST-P06-002`, `TST-P06-005` |
| `REQ-P06-UX-001`    | `TST-P06-006`, `TST-P06-004` |

No `REQ-P##-*` may be added without a row here and a future evidence class.

## Phase 02 local chunk evidence

On 2026-10-12, `P02-C04` goods quote validation completed locally with PostgreSQL zone boundaries, invalid selections, current-price and immutable policy snapshots, five-minute quote expiry, no-reservation ledger checks, and built API quote/replay/auth regression evidence. See [the dated chunk evidence](../requirements/PHASE-02-GOODS-COMMERCE.md#p02-c04--goods-quote-validation--2026-10-12). This supports the quote portion of `REQ-P02-CHK-001` and the snapshots in `TST-P02-002`; full concurrency, fulfillment/proof, return and browser scenarios remain open. `P02-C05` subsequently completed its local reservation scope; see below.

On 2026-10-12, `P02-C05` completed locally with 15 goods/inventory integration tests and built API regression smoke. Competing holds and stock mutation races cannot oversell; reservation and release failures roll back all lines and transactional evidence; release/expiry races restore each line once. See [dated hold evidence](../requirements/PHASE-02-GOODS-COMMERCE.md#p02-c05--atomic-stock-holds-and-expiry--2026-10-12). This supports the reservation/concurrency portion of `TST-P02-001`; payment commitment and complete Phase 02 journeys remain open. Next is `P02-C06`.

Phase 02 `P02-C09`–`P02-C11` subsequently completed local pickup, Vendor delivery/corrected retry and goods ReturnCase/inspection/refund implementation. `P02-C12` audits all Phase 02 requirement and scenario evidence in [Phase 02 local acceptance evidence](./PHASE-02-LOCAL-ACCEPTANCE-EVIDENCE.md). `TST-P02-003` earning-window integration remains open pending `P04-C07`/`P04-C08`; local chunk completion is separate from formal phase exit.

## Phase 03 C01 local prerequisite evidence — 2026-10-12

`REQ-P03-SCH-001` has partial local coverage for fixed Option/add-on commercial terms, Vendor Location/online eligibility and Staff qualification/public consent. Eleven focused PostgreSQL scenarios plus built HTTP smoke and migration/workspace checks pass; see [C01 evidence](./PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md). This does not accept `TST-P03-001`: actual hours/timezone/slot filtering and atomic no-double-booking proof remain C02/C03 and the phase acceptance chunk. `TST-P03-002`–`004` remain open.

## Phase 03 C02 local availability evidence — 2026-10-12

`REQ-P03-SCH-001` now has local C01–C02 definition and current slot-calculation evidence: hours, replacing date exceptions, breaks, buffers, lead/horizon, timezones, mode/Location, qualification and controlled held/booked occupancy filtering. Twelve unit scenarios, 24 PostgreSQL scenarios (13 C02 + 11 C01), both built HTTP smokes and migration/workspace checks pass; see [C02 evidence](./PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c02--authoritative-slot-calculation--2026-10-12). This supersedes C01's unimplemented slot calculation note. `TST-P03-001` is not accepted: C03's atomic allocation/concurrency proof and later phase lifecycle acceptance remain open. No C03 or later implementation was started.

## Phase 03 C03 local concurrency evidence — 2026-10-12

`REQ-P03-HOLD-001` and the allocation/concurrency portion of `TST-P03-001` have local proof: verified-Customer named/any-Staff fifteen-minute holds, independent database no-overlap, cross-Service/Location/mode capacity, exact expiry/release races, idempotence/privacy, stale revalidation and atomic rollback. Eighteen C03 plus twenty-four C01–C02 PostgreSQL scenarios, three built HTTP smokes, actual worker expiry and migration/workspace checks pass; see [C03 evidence](./PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c03--atomic-namedany-staff-holds--2026-10-12). This supersedes C02's unimplemented atomic-hold note. Formal phase exit and complete paid Booking lifecycle/concurrency acceptance remain the later phase gate; `TST-P03-002`–`004` remain open. Next is C04.

## Phase 03 C04 local selection/recovery evidence — 2026-10-12

`REQ-P03-UX-001` and the selection/recovery portion of `TST-P03-004` have local evidence: exact Option/add-on totals and duration, mode/Location, named/any Staff, timezone and authoritative slots, real slot loss, read/offline recovery and explicitly unconfirmed local Cart intents. Eleven new web tests and served Edge checks pass alongside workspace and Phase 03 database/HTTP regressions. See [C04 evidence](./PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c04--service-selection-and-booking-intent-ui--2026-10-12). Full paid Booking lifecycle and independent accessibility/formal acceptance remain open. Next is C05.
