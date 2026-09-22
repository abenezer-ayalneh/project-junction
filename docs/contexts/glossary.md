# Project Junction — Canonical Domain Glossary

> **Status:** Planned domain language; no corresponding code or database objects exist yet.
>
> **Provenance:** `DEC-nnn` references are confirmed planning decisions. Capitalized terms below have the stated meaning throughout Project Junction documentation.

## Identity and organization

### User

A real authenticated human identity. A User may act as a Customer and may hold memberships in multiple Vendors. `User` is not synonymous with Customer, Vendor, or Staff. `[DEC-010]`

### Customer

The role in which a User browses, buys Products, books Services, receives fulfillment, requests aftercare, and reviews completed components. Browsing may be anonymous, but checkout requires a verified Customer account. `[DEC-053]`

### Vendor

A business seller on Junction. A Vendor owns its Storefront, Locations, Listings, Staff, operational policies, Orders/Bookings, and economic balance. Release 1 does not support individual C2C sellers. `[DEC-008]`

### Vendor Membership

The relationship granting one User one or more preset Vendor roles, optionally narrowed to specified Locations. A membership is scoped; it is not a global role flag. `[DEC-010, DEC-067]`

### Location

A Vendor-owned operational place. A Location may own stock, pickup, Staff schedules, in-person Service availability, and delivery zones. A Vendor may have several Locations. `[DEC-017]`

### Staff

A Vendor-owned service-capacity profile. Staff has qualifications, availability, and assigned Bookings and may optionally be linked to a User for operational access. Public visibility requires opt-in; non-public Staff remains eligible for “any qualified Staff.” `[DEC-019, DEC-150]`

### AccessContext

The typed authority supplied to protected application and persistence operations. It distinguishes a real User session from a Demo Persona and carries workspace, Customer, Vendor membership, Location scope, and Platform grants. Resource IDs never replace AccessContext authorization. `[DEC-107, DEC-129]`

### Demo Workspace and Demo Persona

A Demo Workspace is an isolated, expiring synthetic dataset. A Demo Persona is workspace-limited simulated authority used for role switching; it is not a User or a bypass around Better Auth. `[DEC-107–DEC-109]`

## Catalog and discovery

### Storefront

A structured Vendor profile with branding, Locations, policies, updates, collections, Products, and Services. It is not a page builder or arbitrary theme; Vendor identity comes from logo, cover, and content, without a Vendor-selected accent color. `[DEC-009, DEC-130]`

### Listing

A Vendor-owned publication record for one Product or Service. A Listing has draft/publication state and moderation history. Junction has no shared canonical catalog record from which all Vendors sell. `[DEC-016, DEC-047]`

### Product

A physical good offered at a fixed price. A Product may be simple or variant-based and is sold through Vendor-owned Listings. Digital goods are excluded. `[DEC-045, DEC-046, DEC-102]`

### Variant and SKU

A Variant is one selectable Product configuration. An SKU is the Vendor’s stock identity for a simple Product or Variant. Availability is always evaluated for a specific SKU at a specific Location. `[DEC-018, DEC-049]`

### Service

A Vendor offering delivered as a fixed-duration appointment at a Vendor Location or online. Service is not quote-based work, a rental, a group class, or a recurring series. `[DEC-007, DEC-020, DEC-134, DEC-135]`

### Service Option

A fixed-price, fixed-duration selectable version of a Service. Add-ons have declared price and time effects. Service Option economics do not vary by assigned Staff. `[DEC-021, DEC-149]`

### Taxonomy

The typed classification tree for Products or Services. The two taxonomies remain distinct even when cross-market themes connect their discovery experiences. `[DEC-044]`

## Inventory and scheduling

### Stock Movement

An immutable audited increase, decrease, reservation, release, sale, return, correction, or other change to one SKU at one Location. Corrections are additional movements, not edits to history. `[DEC-049]`

### Stock Reservation

A temporary claim against available SKU/Location quantity created by Checkout. Cart quantity is not a reservation. Junction does not oversell or backorder. `[DEC-018, DEC-125]`

### Qualification

The fact that Staff is permitted to deliver a Service Option. Qualification is part of availability and allocation.

### Schedule and Availability

A Schedule is Staff recurring hours plus exceptions and breaks. Availability is a calculated set of possible appointment starts after qualifications, duration, buffers, lead time, booking horizon, existing allocations, mode, and Location are considered. `[DEC-019, DEC-050]`

### Booking Allocation

The atomic claim of one qualified Staff member for one Booking interval. “Any Staff” still resolves to a concrete Staff allocation. Rooms/equipment are not Release 1 capacity constraints. `[DEC-019, DEC-134]`

## Commerce

### Cart

A Customer’s mutable selection of Product quantities and candidate Booking slots. Anonymous Cart state is local and non-authoritative. A Cart promises neither price, stock, nor appointment availability. `[DEC-022, DEC-125, DEC-152]`

### Checkout Hold

The atomic, all-or-nothing, 15-minute reservation of all selected Product stock and Booking allocations while payment completes. `[DEC-125]`

### Purchase

The Customer-facing record and receipt umbrella created by one successful full checkout payment. It groups Vendor Orders and Bookings but does not erase their independent post-payment lifecycles. `[DEC-023, DEC-024]`

### Vendor Order

The goods component of a Purchase belonging to one Vendor. It contains Product lines grouped for Vendor fulfillment.

### Order Line

The snapshotted purchase of one SKU, quantity, unit price, policy, tax/receipt representation, promotion allocation, commission basis, and fulfillment context. Refunds, returns, reviews, and earnings may operate at line/quantity granularity. `[DEC-030, DEC-038, DEC-133]`

### Booking

The purchased Service appointment component of a Purchase: Customer party, Service Option/add-ons, assigned Staff, mode, Location or meeting, interval, price/policy snapshot, and lifecycle. It is one-off and confirms immediately after paid allocation. `[DEC-029, DEC-134, DEC-135]`

### Fulfillment

The Vendor-operated delivery or pickup lifecycle for one Vendor Order group from one Location. Fulfillment is not a Platform fleet/driver system. `[DEC-027, DEC-131]`

### Handoff Proof

Customer one-time code/QR, or a restricted evidence fallback, proving Product pickup/delivery. `[DEC-037]`

### Completion Evidence

For in-person Service: Customer code/QR plus Staff confirmation. For online Service: Junction join action plus Staff confirmation. Completion remains contestable. `[DEC-036]`

### No-show Report

A Staff-submitted assertion, with structured evidence, that the Customer did not attend. It does not become financially final until its contest policy permits. `[DEC-035]`

## Money

### Money

An amount in integer minor units paired with an ISO currency. ETB is the initial presentment currency and uses two decimal places in the selected Stripe flow. `[DEC-011, DEC-104]`

### Payment

The provider interaction used to collect the full Checkout amount. Provider success time is authoritative for determining whether success fell inside the Checkout Hold; webhook receipt time is not. `[DEC-024, DEC-105, DEC-125]`

### Refund

A provider and internal-ledger operation returning all or part of paid value. A refund is not a destructive edit of the Purchase or original postings.

### Ledger Transaction and Posting

A Ledger Transaction is an immutable balanced collection of debit and credit Postings representing one economic event. Corrections use reversal transactions. `[DEC-140]`

### Earning

Vendor economic value attributable to one Product line/quantity or Booking. It may be pending, available, frozen, paid, reversed, or part of a negative payable. Availability follows the component’s snapshotted policy. `[DEC-038, DEC-144, DEC-145]`

### Transfer

Movement represented through the payment provider from the platform charge to a connected Vendor account in the Stripe sandbox architecture. It is reconciled independently from the internal ledger. `[DEC-103, DEC-105]`

### Payout Batch

The weekly aggregation of eligible Vendor value over a configurable minimum, excluding frozen amounts. It is automatic; Vendors do not make arbitrary wallet withdrawals. `[DEC-144]`

### Commission

Junction’s initial and only monetization: a transaction charge calculated on Vendor net sale after Vendor discount, before Platform subsidy, excluding delivery. `[DEC-026, DEC-141]`

### Vendor Coupon and Platform Campaign

A Vendor Coupon is Vendor-funded. A Platform Campaign is budget-reserved and Platform-funded. At most one of each stacks, in that order. `[DEC-058, DEC-143]`

## Aftercare and trust

### Policy Template and Policy Snapshot

A bounded Platform-defined cancellation/return rule set, selected by a Vendor. The Policy Snapshot is the immutable version attached to the purchased component so later policy changes do not rewrite Customer terms. `[DEC-030]`

### Return Case

The workflow for Customer return of goods, including eligibility, reason/evidence, logistics responsibility, receipt/inspection, stock disposition, refund, earnings, and dispute linkage. `[DEC-031, DEC-146]`

### Dispute

A formal evidence-backed case that authorizes a Platform decision of full, partial, or no refund and may freeze affected economic value. A Dispute is distinct from ordinary support conversation. `[DEC-038, DEC-039]`

### Review Entitlement and Review

A Review Entitlement is created only by completion of a Product line or Booking. It permits a verified multidimensional Review covering offering quality and Vendor experience; Staff-specific feedback is private. `[DEC-040, DEC-041]`

### Scoped Conversation

A message thread attached to an offering, Order, Booking, return, or dispute. It is not a general-purpose social inbox. `[DEC-064]`

### Moderation Case and Appeal

A rules-triggered or reported item awaiting human action, with evidence and an audited route for contesting the decision. `[DEC-047, DEC-063]`

## Reserved terminology

The documentation must not use the following without an explicit later decision or external validation:

- **Escrow** or **wallet** for the internal ledger;
- **live Ethiopian payments/payouts/KYB** for sandbox demonstrations;
- **merchant of record** as a legal conclusion inferred only from a Stripe integration shape;
- **AI recommendation** for rule-based ranking;
- **tax invoice** for a Junction non-tax receipt; or
- **delivery network** for Vendor-managed milestone tracking.
