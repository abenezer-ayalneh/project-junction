# Canonical Data Model

> **Document status:** specified
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-010`, `DEC-016`–`DEC-025`, `DEC-049`–`DEC-055`, `DEC-125`, `DEC-129`–`DEC-152`, `DEC-162`–`DEC-189`](../governance/DECISION-REGISTER.md)
> **Normative owner:** target entity relationships; physical columns remain future implementation work

## Model conventions

Identifiers use UUIDv7 [DEC-121]. Money is integer minor units plus ISO currency. Instants use UTC; schedules retain IANA time-zone meaning. Mutable configuration has a version; committed commercial terms are snapshots. `workspace_id` identifies isolated demo ownership where applicable and can never be supplied as trusted caller context.

## Identity and supply

- `User` has sessions, verification factors, MFA/recovery methods, Customer profile, preferences, and optional saved provider payment-method references.
- `Vendor` has lifecycle, Storefront profile, policy selections, commission override, verification references, and memberships.
- `VendorMembership` joins User to Vendor with a preset role and optional Location scope.
- `Staff` belongs to a Vendor and may link to a User. Public profile publication requires explicit Staff consent [DEC-150].
- `Location` owns structured address/pin, hours, inventory, pickup capability, delivery zones, Staff work, and appointment mode.

## Offerings and capacity

- `ProductListing` owns simple/variant Product content; each `ProductVariant` has Vendor SKU and optional barcode.
- `ServiceListing` owns fixed-price/fixed-duration `ServiceOption` and add-ons with known price/time effects.
- Product and Service taxonomies are typed separately but can share curated themes [DEC-044].
- `StockMovement` is immutable. `StockBalance` is a maintained/verified projection. `StockReservation` binds variant, Location, quantity, hold, and expiry.
- `StaffQualification`, recurring `ScheduleRule`, `ScheduleException`, and `SlotReservation` determine availability. Release 1 has no room/equipment capacity [DEC-156].

## Cart, checkout, and commitment

- Anonymous Cart data is client-local. An authenticated `Cart`/snapshot records server-known selections after visible merge [DEC-152].
- `CheckoutQuote` records current validation; it grants no stock/slot guarantee.
- `CheckoutHold` owns one all-or-nothing 15-minute reservation set [DEC-125].
- `Purchase` is the Customer receipt and coordinates one payment result.
- `VendorOrder` represents one Vendor's Product group at one fulfillment Location [DEC-131].
- `Booking` is a separately managed fixed appointment for one Customer party with optional attendee data [DEC-134]. Multiple Bookings remain independent under one Purchase [DEC-182].

## Fulfillment and services

- `Fulfillment` snapshots pickup/delivery method, Location, address/zone/fee/ETA, handoff code/evidence, milestones, failure/retry, and completion.
- `Booking` snapshots Service Option/add-ons, price, Staff choice/assignment, mode, Location/online details, start/end/buffers/time zone, cancellation/amendment policy, and meeting state.
- `BookingAmendment` preserves original and proposed allocation plus financial delta. Failure to charge additional value leaves the original Booking intact [DEC-033].
- `WaitlistEntry` is notification-only and creates neither priority nor reservation [DEC-165].

## Money, trust, and engagement

- `PaymentOperation`, `RefundOperation`, `ProviderInboxEvent`, and `ReconciliationItem` track provider-independent intent and verified result.
- `LedgerAccount`, `LedgerTransaction`, and `LedgerPosting` form the immutable double-entry subledger.
- `EarningLot`, `Freeze`, `Transfer`, `PayoutBatch`, and `VendorStatement` represent availability and disbursement.
- `Coupon`, `Campaign`, `BudgetReservation`, and immutable `PromotionSnapshot` separate Vendor and Platform funding.
- `ReturnCase`, `Dispute`, `Appeal`, and `EvidenceItem` preserve affected units/Booking, reason, financial/logistics decisions, and audit.
- `Review` is tied to a completed Product line or Booking; Vendor response and Customer edit history are retained.
- `Conversation` is scoped to an offering/Order/Booking/return/dispute; `SupportCase` is operational and does not itself authorize money decisions [DEC-168].
- `ModerationCase`, `Notification`, `AuditEntry`, `AnalyticsEvent`, `Media`, and `DemoWorkspace` carry their own lifecycle and retention class.

## Relationship invariants

1. Every tenant-owned record belongs to exactly one real or demo workspace boundary.
2. A Vendor cannot observe or mutate another Vendor's Order/Booking/finance detail merely because both appear in one Purchase.
3. One Stock/Slot reservation belongs to one active hold and can be committed at most once.
4. One Product line uses one Vendor fulfillment Location; there is no split fulfillment.
5. Every ledger transaction balances within one currency.
6. Every public review references an eligible completed component.
7. Every policy/price/commission/promotion decision needed later is snapshotted rather than recalculated from current configuration.

## Related documents

- [Canonical public types](../interfaces/CANONICAL-PUBLIC-TYPES.md)
- [Money and ledger model](MONEY-AND-DOUBLE-ENTRY-LEDGER.md)
- [Location, address, and geospatial model](LOCATION-ADDRESS-AND-GEOSPATIAL-MODEL.md)

## Local goods payment/commitment storage — 2026-10-12

`P02-C07` adds goods-only physical `GoodsPaymentAttempt`, immutable `GoodsLocalPaymentResult`, `GoodsPurchase`, immutable `GoodsVendorOrder`/`GoodsOrderLine` commercial snapshots and recoverable `GoodsRefundOperation`. Each payment links one hold and its exact ETB amount; each Purchase uniquely links that hold/payment and scopes its Customer/workspace. Orders uniquely group Purchase/Vendor at the held Location, and each Order line uniquely links its held allocation. Sold inventory movements reference immutable Order lines. Deferred database checks require complete paid commitment and bounded refunds; child insert guards seal committed aggregates. These are the local goods implementations of the conceptual Purchase/Order boundary, not a claim that the mixed-commerce/final double-entry ledger model is complete.

Local `P02-C08` adds immutable `GoodsOrderCancellation`/`GoodsCancellationLine` quantity/value/disposition records, each cancellation uniquely linked to its durable `GoodsRefundOperation`. Inventory movements link exact cancellation lines and original paid Order lines. Purchase/Order commercial snapshots remain sealed while bounded Order/payment state and append-only effects expose remaining quantity and refund progress. Deferred guards enforce matching complete effects, quantity/capture limits and delivery allocation. Separate `GoodsCancellationGrant` rows bind expiring Platform Finance authority to one User/workspace/Order with provenance and conflict/revocation checks; they do not confer catalog or broad finance authority.

Local `P02-C09` persists `GoodsFulfillment` purchased snapshots, readiness quantity/clock/code ciphertext/digest and immutable `GoodsPickupAcknowledgement`, `GoodsPickupHandoff`, `GoodsPickupInspection`. Inspection links its exact pickup-expiry cancellation/refund effect; database guards preserve time, quantity, scope and evidence invariants. `VendorMembership.goodsFulfillmentEnabled` is explicit scoped operational permission. Terminal pickup clears recoverable code ciphertext.

## Local Service definition seam — P03-C01, 2026-10-12

`listings.service_configuration` is a bounded versioned JSON document validated by strict shared contracts. It stores stable Option/add-on IDs, uniform commercial effects, eligible Locations/modes and Staff qualification references; the existing Vendor workspace lock serializes updates. API writes verify every Staff/Location belongs to the Vendor and every eligible Location is authorized; these JSON references do not have database foreign keys. This is definition configuration, not a reservation or Booking snapshot. `service_configuration_version` supplies optimistic concurrency; configured Services cannot be converted into Products. Legacy Service rows default to null configuration/version zero and gain no scheduling availability automatically.

Staff rows add a display name, profile version and nullable public-consent timestamp. Database checks require a User link and name for public consent. Optional linking verifies/locks an existing active same-Vendor membership and changes only its Staff reference. Private profiles may remain qualified without a User. Public definition responses omit private Staff references and all User links. Allocation, calendar and Booking persistence remain subsequent chunks.

## Local authoritative schedule seam — P03-C02, 2026-10-12

Location rows add `schedule_calendar`/`schedule_version`; Staff rows add per-mode `schedule`/`schedule_version`; Service Listings add `scheduling_rules`/`scheduling_rules_version`. Strict shared contracts validate bounded timezone-local windows and exception dates. All old/new physical Location references are checked against the live Vendor membership; no calendar reference foreign keys are implied by the JSON. Legacy rows default to null/version zero. `vendor_memberships.scheduling_enabled` defaults false and is an explicit scoped operational permission rather than a new identity role.

`staff_allocations` has a real Staff foreign key, UTC half-open occupied bounds and held/booked/terminal state; held rows require expiry. It is the durable occupancy read seam across Services, Locations and modes. C02 does not provide allocation writes to callers or an exclusion/atomic allocation guarantee. C03/C05 will own hold and Booking linkage/commitment. Controlled fixtures verify existing occupancy filtering, not paid Booking creation. Public slot reads use PostgreSQL repeatable-read so definition, schedule and occupancy form a consistent evaluated snapshot; later holds must revalidate current state.
