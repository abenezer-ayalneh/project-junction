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
