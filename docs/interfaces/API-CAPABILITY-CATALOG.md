# API Capability Catalog

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** capability-level interface inventory

| ID range        | Capability        | Owner                    | Examples                                                                                                                                                                                                                                                                                                                               |
| --------------- | ----------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API-001`–`009` | identity/access   | Identity                 | session, active context, membership, recent-auth                                                                                                                                                                                                                                                                                       |
| `API-010`–`019` | Vendor/supply     | Vendor/Catalog           | application, Storefront, Location, listing, import                                                                                                                                                                                                                                                                                     |
| `API-020`–`029` | discovery         | Catalog/Discovery        | search, detail, saved/follow, recommendation preference                                                                                                                                                                                                                                                                                |
| `API-030`–`039` | goods/fulfillment | Inventory/Ordering       | private stock movement/availability (`POST /v1/inventory/movements`, `GET /v1/inventory/listings/:listingId/availability`); public Product stock check (`GET /v1/public/listings/:listingId/availability`); goods Location configuration; Customer quote/hold/read/release (`/v1/customer/goods/*`); Order, pickup/delivery milestones |
| `API-040`–`049` | scheduling        | Scheduling/Booking       | availability, hold, Booking, amendment, attendance                                                                                                                                                                                                                                                                                     |
| `API-050`–`059` | checkout/finance  | Checkout/Payments/Ledger | Cart, quote, hold, payment status, receipt, earnings                                                                                                                                                                                                                                                                                   |
| `API-060`–`069` | trust/engagement  | Trust/Support            | return, dispute, SupportCase, review, inquiry, moderation                                                                                                                                                                                                                                                                              |
| `API-070`–`079` | operations/demo   | Platform/Demo            | reconciliation, approval, audit, demo workspace/persona                                                                                                                                                                                                                                                                                |

Example command contracts must name authorization scope, idempotency requirement, aggregate/state guard, normal/failure response, emitted event, asynchronous work, and reconciliation endpoint. Capability routes are not an implementation commitment or public API availability statement.

Phase 02 P02-C06 local public-read addition: `GET /v1/public/listings/:listingId` includes nullable `goodsConfiguration` on public Locations (pickup eligibility, Standard/Flexible return template and delivery zones/fees/minimums/ETA). This is advisory selection context; Customer quotes and holds revalidate publication, current configuration, price and stock. Private goods-configuration writes remain Owner-scoped.

Phase 02 `P02-C07` controlled local proof APIs:

- `POST /v1/customer/goods/payments` starts one payment window for a Customer-owned hold with an idempotency key.
- `POST /v1/customer/goods/payments/:paymentId/local-result` records succeeded/failed/unknown only in local runtime, with server adapter time and held amount/linkage. It is not a production payment webhook.
- `GET /v1/customer/goods/payments/:paymentId` reconciles recorded results and returns current hold/payment/refund/Purchase state; creation/result replay responses preserve original acceptance.
- `GET /v1/customer/goods/purchases/:purchaseId` reads the Customer's immutable paid Purchase and Vendor components.
- `GET /v1/vendor/goods/orders/:orderId` reads only the assigned active Owner's Vendor/Location Order. Private workspace/provider receipts are not exposed.

See [local evidence and Phase 04 provider/finance limits](../requirements/PHASE-02-GOODS-COMMERCE.md#p02-c07--paid-goods-order-commitment--2026-10-12).

Phase 02 `P02-C08` private cancellation APIs:

- `POST /v1/vendor/goods/orders/:orderId/cancellations`: assigned current Owner, idempotency key, reason and exact line quantities/disposition; transactionally appends effects and a pending refund.
- `POST /v1/platform/goods/orders/:orderId/cancellations`: same bounded command under a live expiring Order-specific Finance grant; no catalog-review escalation.
- `GET /v1/platform/goods/orders/:orderId`: only the Order covered by that Finance grant.
- `GET /v1/goods/cancellations/:cancellationId`: current refund state for the owning Customer, assigned Owner or scoped Finance actor. Command replay represents original acceptance.

Purchase/Order reads now expose original snapshots plus cancelled/remaining quantities and scoped cancellation/refund references. Customer payment reads distinguish cumulative pending/completed refunds and partially_refunded/full refunded state. No caller amount/price/authority fields are accepted. These are local controlled proof surfaces; final live providers/discounts/ledger remain Phase 04. See [P02-C08 evidence](../requirements/PHASE-02-GOODS-COMMERCE.md#p02-c08--partial-cancellation-and-refund-allocation--2026-10-12).

Local `P02-C09` adds Customer/assigned Vendor reads at `/v1/{customer|vendor}/goods/orders/:orderId/fulfillment`, Vendor prepare/ready/collect/inspect at `/v1/vendor/goods/fulfillments/:fulfillmentId/*`, and Customer fallback acknowledgement at `/v1/customer/goods/fulfillments/:fulfillmentId/acknowledgements`. Every mutation is idempotent. Vendor reads omit the private code; Customer reads return active code/QR only. Staff must have explicit live fulfillment permission and Location assignment; Owner alone inspects financial recovery. Structured evidence is private text; no public attachment route exists.

Phase 02 `P02-C10` local delivery APIs:

- `POST /v1/vendor/goods/fulfillments/:fulfillmentId/delivery-milestones` records dispatch, evidenced failure and one corrected retry under live Owner or explicitly enabled assigned Fulfillment Staff authority. Retry uses the Customer's matching acknowledgement and original paid zone; its deadline stays 48 hours from first failure.
- `GET /v1/customer/goods/fulfillments/:fulfillmentId/delivery` exposes the Customer's active code/QR only; the corresponding Vendor read omits proof.
- `POST /v1/customer/goods/fulfillments/:fulfillmentId/delivery-acknowledgements` records authenticated confirmation of the corrected address or fallback receipt.
- `POST /v1/vendor/goods/fulfillments/:fulfillmentId/delivery-handoff` accepts code/QR or fresh Customer acknowledgement plus distinct assigned witness. Five rejected primary attempts lock proof; terminal handoff removes it.
- `POST /v1/vendor/goods/fulfillments/:fulfillmentId/delivery-inspection` requires an assigned Owner and all frozen undelivered quantities. It atomically records disposition, scoped refund allocation and inspection completion; ordinary cancellation remains denied after dispatch.

Each mutation requires an idempotency key. Fulfillment reads derive delivery state, verified handoff time and inspection recovery from immutable delivery records. Worker expiry preserves evidence without automatic resale.

Phase 02 `P02-C11` local returns APIs:

- `POST /v1/customer/goods/orders/:orderId/returns` submits one eligible exact line/quantity under the Customer's paid policy and verified handoff clock. Active claims reserve quantity; no handoff, used change-of-mind goods, expired windows and overlapping quantities fail safely.
- `POST /v1/customer/goods/returns/:returnId/actions` records shipment evidence only.
- `POST /v1/vendor/goods/returns/:returnId/actions` records assigned Owner approval/instructions, decline, receipt, inspection/disposition and refund or no-refund outcome. Refund allocation and stock compensation commit atomically after inspection.
- `GET /v1/customer/goods/returns/:returnId` and the corresponding Vendor route return only authorized case evidence and current provider reconciliation. Refund acceptance remains `refund_pending` until the controlled local operation succeeds.

Mutation routes require idempotency keys. Exchange is a fresh Purchase. Return policies/quantity/handoff snapshots and event evidence are immutable; current membership, Location and MFA checks apply at mutation/read time.

Phase 03 `P03-C01` locally verified definition APIs (2026-10-12):

- `GET/PUT /v1/listings/:listingId/service-configuration`: active Owner, Service-only, all old/new eligible Location grants, same-Vendor Staff/Locations; PUT requires idempotency key and expected configuration version. Version zero/null means not yet configured.
- `GET/POST /v1/vendor/staff`: Owner private list/create; optional `memberUserId` links an existing active member without changing authority. POST requires an idempotency key.
- `GET/PUT /v1/vendor/staff/:staffId`: linked member or Owner reads; Owner renames with expected profile version and idempotency key, withdrawing prior display consent.
- `PUT /v1/vendor/staff/:staffId/public-consent`: only the profile's authenticated linked Staff member grants/withdraws consent; expected profile version and idempotency key are required.
- `GET /v1/public/listings/:listingId/service-definition`: only published configured Services of approved/published real Vendors. Returns fixed Option/add-on terms, Locations/modes and qualification eligibility; private Staff names/IDs and qualification lists are omitted. Consent controls named Staff display.

Strict command parsing rejects excluded scheduling/commercial models and unknown fields. Stale versions or changed idempotency payloads return 409, invalid commands 400, unauthorized/publication scope 403. Profile/configuration versions, audit, private-workspace outbox and command outcomes commit atomically. Replay represents original acceptance; fresh GET returns current state. No asynchronous slot/allocation/payment effect runs in C01. See [C01 local evidence](../quality/PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md).

Phase 03 `P03-C02` locally verified scheduling APIs (2026-10-12):

- `GET/PUT /v1/locations/:locationId/schedule`: assigned Owner or enabled Scheduler; timezone-local weekday hours/breaks and whole-date replacements. PUT requires expected schedule version and idempotency key.
- `GET/PUT /v1/vendor/staff/:staffId/schedule`: assigned Owner/enabled Scheduler or the authenticated linked Staff's own calendar. Every old/new physical Location scope must be assigned. Each scope is in-person with a Location or online without one; no shared-resource or per-Staff commercial overrides are accepted.
- `GET/PUT /v1/listings/:listingId/scheduling-rules`: active Owner covering all configured eligible Locations; explicit Service timezone, lead minutes, elapsed-day horizon and local slot interval. PUT requires expected rules version and idempotency key.
- `POST /v1/public/listings/:listingId/slots`: read-only body with Option/add-on IDs, in-person/online and matching Location, named `staffId` or null for any qualified Staff, and offset-bearing `from`/`to` instants spanning at most seven elapsed days. No idempotency key or authentication is required; no state/audit/outbox/reservation is created. Responses carry current price/duration/buffers, display timezone, evaluated time, definition/rules versions, unique UTC start/end candidates and `reserved: false`. Named Staff requires current public consent; private any-Staff never exposes identities/counts. Responses use `Cache-Control: no-store`.

All seven scheduling routes use `no-store`. Invalid shape/date/timezone/scope combinations return 400; wrong authority/publication/qualification or unconfigured rule/Location calendar returns 403; stale versions/idempotency conflicts return 409. Missing qualified Staff calendars produce no candidates. Public reads use one consistent current database snapshot and server clock, with no promise of availability at later hold creation. Location timezone drives the in-person grid; Service-rule timezone drives online. Window/query ends are exclusive; exact minimum notice and elapsed horizon start are inclusive. Occupied bounds include buffers. DST repeated times are separate UTC candidates and durations are elapsed minutes. Query limits, whole-day exception semantics and minute precision are derived implementation bounds, not newly claimed User-originated commercial policy.

Local Scheduler enable/disable uses `node --env-file=.env tools/manage-local-scheduler.mjs enable|disable`, with `JUNCTION_RUNTIME_MODE=local`, loopback `DATABASE_URL`, `LOCAL_SCHEDULING_MEMBERSHIP_ID`, `LOCAL_OPERATOR_LABEL` and `LOCAL_SCHEDULING_AUTHORITY_REASON`. The CLI requires an existing active assigned Staff membership in a real workspace, locks workspace/membership, preserves role/Locations and audits provenance/reason. There is no public self-grant API. See [C02 evidence](../quality/PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c02--authoritative-slot-calculation--2026-10-12).

Phase 03 `P03-C03` locally verified appointment hold APIs (2026-10-12):

- `POST /v1/customer/bookings/holds`: authenticated verified adult Customer, idempotency key, listing/Option/add-on IDs, mode and matching Location, named `staffId` or null for any qualified Staff, offset-bearing minute-precision start and expected definition/rules versions. Current shared slot evaluation and capacity allocation commit atomically. Response includes holding state, fifteen-minute deadline and immutable current terms; any-Staff concrete/private identity is omitted. No caller price, seat/resource model, waitlist or recurring appointment fields are accepted.
- `GET /v1/customer/bookings/holds/:holdId`: Customer and original workspace ownership required; returns accepted terms and current state, terminating exact-expired capacity once. Later qualification/publication changes never rewrite accepted terms. Reads are private and `no-store`.
- `POST /v1/customer/bookings/holds/:holdId/release`: same Customer/workspace ownership plus idempotency key; releases only an uncommitted allocation or returns its released/expired terminal state. Expired state wins at the exact deadline; committed holds are denied. Repeating a release or creation key does not allocate anew or extend expiry.

All routes use `no-store`. Invalid shape/precision or missing keys return 400; wrong identity/ownership/selection/publication returns 403; stale versions, lost capacity, changed key payload or committed release returns 409. Mutation replay describes original acceptance and current GET is authoritative. Concrete Staff selection/hold/immutable snapshot/audit/scoped events/replay outcome share one transaction, with independent database overlap exclusion. The worker automatically expires up to 100 due holds per tick without Customer authority. C03 is one-intent Staff reservation, not mixed checkout or paid Booking. See [C03 evidence](../quality/PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c03--atomic-namedany-staff-holds--2026-10-12).

Phase 03 `P03-C04` public definition extension (2026-10-12): `PublicServiceDefinition` adds optional scheduling rules/version and optional Location IANA timezone metadata for date selection. The definition route now uses `no-store`; no private calendar or any-Staff allocation identity is exposed. Existing paths remain unchanged; this chunk adds no mutation API. The browser rechecks definition/slots before saving a local unreserved intent. See [C04 evidence](../quality/PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c04--service-selection-and-booking-intent-ui--2026-10-12).

## Local Phase 03 paid Booking — 2026-10-12

Customer-scoped `POST /v1/customer/bookings/payments`, `POST /v1/customer/bookings/payments/:paymentId/local-result`, `GET /v1/customer/bookings/payments/:paymentId` and `GET /v1/customer/bookings/:bookingId` implement controlled local payment, reconciliation and immutable purchase reads. Mutations require idempotency keys; controlled result/start reject non-local runtime. Start requires verified adult identity. Result/read never accept a browser price or timestamp. Vendor Owner selects Flexible/Standard through the versioned Service configuration command. Promotion/commission remain explicitly absent pending Phase 04. [C05 local evidence](../quality/PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c05--paid-booking-confirmation--2026-10-12).

## Local Booking cancellation — 2026-10-12

`POST /v1/customer/bookings/:bookingId/cancel` and `POST /v1/vendor/bookings/:bookingId/cancel` require reason, expected version and idempotency key. Customer ownership or active scoped Owner/enabled Scheduler authority is checked on every retry. Purchased policy determines Customer refund; Vendor cancellation always returns full value. Payment reads expose pending and completed refund amounts. [C06 evidence](../quality/PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c06--cancellation-policy-and-refunds--2026-10-12).

## Local Booking amendment — 2026-10-12

`POST /v1/customer/bookings/:bookingId/amend` requires expected Booking version, exact current selection/version and explicit controlled extra-payment outcome; no browser amount is accepted. Unsuccessful extra payment preserves the original. Reads expose immutable original and effective snapshots, amendment allowance used, original payment amount, total collected amount and pending/completed refunds. [C07 evidence](../quality/PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c07--atomic-amendments-and-price-delta--2026-10-12).

## Local substitution and waitlists — 2026-10-12

Vendor `POST /v1/vendor/bookings/:bookingId/substitutions` proposes/executes qualified replacement under Owner/Scheduler Location scope. Customer `GET /v1/customer/bookings/substitutions/:proposalId` and `POST .../:proposalId/decision` read/accept/decline/withdraw named consent. Customer `POST /v1/customer/bookings/waitlists`, `GET .../waitlists/:waitlistId` and `POST .../waitlists/:waitlistId/remove` manage notification-only requests. Mutation keys are required; any-Staff replacements expose no private Staff identity. [C08 evidence](../quality/PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c08--staff-substitution-and-waitlists--2026-10-12).

## Local meetings — 2026-10-12

Customer/assigned Staff/scoped Owner reads use `GET /v1/customer/bookings/:bookingId/meeting` or `GET /v1/vendor/bookings/:bookingId/meeting`. `PUT /v1/vendor/staff/:staffId/local-meet-connection` is linked-Staff self authority and accepts only controlled connected state/version, never a token. `POST /v1/vendor/bookings/:bookingId/meeting/replacement` requires scoped Owner, reason, expected version, idempotency key and required MFA; local replacement is generated DemoMeet only. Provider/connection references and raw failures never enter responses/events. [C09 evidence](../quality/PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c09--meeting-provisioning-and-compensation--2026-10-12).

## Local attendance and contest — 2026-10-12

Customer `GET /v1/customer/bookings/:bookingId/attendance`, `GET .../attendance/proof`, `POST .../join` and `POST .../contest` expose private evidence/participation. Vendor `GET /v1/vendor/bookings/:bookingId/attendance`, `POST .../attendance/confirm` and `POST .../no-show` require current assigned Staff and Location scope. Mutation idempotency keys and expected versions are mandatory. Code/QR and raw evidence never enter events. [C10 evidence](../quality/PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c10--attendance-completion-and-no-show-contest--2026-10-12).

## Phase 03 local acceptance — 2026-10-12

Customer `GET /v1/customer/bookings/:bookingId/calendar.ics` exports current read-only iCal terms, private stable UID/version, UTC dates and cancelled status. Current ownership applies; no attendee, private Staff or provider reference is exported. See [C11 evidence](../quality/evidence/phase-03-c11-2026-10-12/acceptance-audit.md).

## Local mixed Cart and advisory quote — 2026-10-12

`GET /v1/customer/cart` reads the session-derived Customer/workspace Cart, returning revision zero before its first save. `PUT /v1/customer/cart` requires an idempotency key, expected revision and explicit complete selection; it never accepts caller ownership or a payable total. Each appointment intent has a distinct ID and quantity one, with a maximum of five; goods retain one Location/fulfillment choice per Vendor.

`POST /v1/customer/cart/merge-preview` returns matching quantities/intent identities, unresolved selection conflicts and current price/availability reviews without saving. A proposed merge is absent when choices or combined limits conflict. Acceptance is an explicit Cart write against the previewed revision. `POST /v1/customer/checkout/quotes` requires verified Customer identity, idempotency key, Cart ID and expected revision. It persists one immutable advisory snapshot of current goods/Booking terms, policies and combined Money, or identified conflicts. Incomplete components have no payable total. `GET /v1/customer/checkout/quotes/:quoteId` applies current Customer/workspace scope and reports `ready`, `conflicts`, `stale` or `expired`; retrying creation preserves identity/deadline while reporting current revision/expiry state. Quotes expire at five minutes (derived local default).

All five routes use `Cache-Control: no-store`. No quote or merge creates/releases inventory, Staff or promotion reservations; only current non-expired occupancy affects advisory availability. Holds, promotion/commission snapshots, payment/Purchase and the unified browser flow remain separate Phase 04 chunks. See [C02 evidence](../quality/PHASE-04-LOCAL-ACCEPTANCE-EVIDENCE.md#p04-c02--mixed-cart-and-quote-coordination--2026-10-12).

## Local promotion and commission configuration — 2026-10-13

Vendor Owner `POST /v1/vendor/coupons` and `GET .../coupons/:promotionId` publish/read immutable owned coupons. Finance `POST /v1/platform/finance/campaigns`, `GET .../campaigns/:promotionId`, `POST .../commission-rates` and `GET .../commission-rates/:rateId` require a current explicit scoped configuration grant, no active Vendor affiliation and required recent MFA outside the local exception. Reviewer/Foundation grants confer no Finance authority. Mutations require idempotency keys and reason; rates are global or Vendor overrides, with no category field. Caller funding/ownership/economic amounts outside the defined configuration are rejected. All responses use no-store.

Customer `POST /v1/customer/promotions/coupon` resolves a supplied Vendor/code under current eligibility/usage; it does not claim Cart eligibility or reserve use. Cart `promotions` selects one nullable Vendor coupon ID and one nullable Platform campaign ID. New complete quote snapshots carry original funding/unit allocation, effective commission and non-tax receipt context. Missing rate or unavailable promotion blocks readiness; old null-finance quote history remains readable. No public budget reserve/consume endpoint exists.

Local operator `node --env-file=.env tools/manage-local-finance.mjs grant|revoke` accepts `LOCAL_FINANCE_EMAIL`, `LOCAL_FINANCE_WORKSPACE_ID`, `LOCAL_OPERATOR_LABEL`, `LOCAL_FINANCE_REASON` and, for a grant, a future `LOCAL_FINANCE_EXPIRES_AT`. It requires explicit local runtime, loopback database, a live email-verified non-Vendor account in a real workspace and writes audit provenance; it neither publishes a commission rate nor creates promotions. CLI proof used disposable identities only. The actual local development schema is current and its Finance configuration tables remain empty; a genuine operator must explicitly choose applicable policy values. [C03 evidence](../quality/PHASE-04-LOCAL-ACCEPTANCE-EVIDENCE.md#p04-c03--promotion-and-commission-snapshots--2026-10-13).
