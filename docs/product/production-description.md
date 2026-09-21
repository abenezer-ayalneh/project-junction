# Project Junction — Planned Production Description

> **Status:** Description of the intended mature portfolio deployment. None of the behavior below is currently implemented.
>
> **Provenance:** Confirmed chat decisions are identified with `DEC-xxx` references. Operational details not yet decided are intentionally not invented here.

## What the deployed portfolio product will be

Project Junction will be an installable web marketplace where public visitors discover physical Products and fixed-duration Services, verified Customers purchase or book them, business Vendors operate hybrid Storefronts, and Platform operators administer trust and financial workflows. It will demonstrate complete workflows across the Customer, Vendor, Staff, and Platform sides rather than a collection of disconnected screens. `[DEC-006–DEC-010, DEC-013]`

It will be deployed as a portfolio demonstration, not represented as a regulated live Ethiopian marketplace. Stripe, KYB, SMS, online-meeting, transfer, and payout behavior will be labeled according to the environment and provider mode actually in use. `[DEC-025, DEC-066, DEC-074–DEC-078, DEC-139]`

## Public discovery

Visitors will be able to browse without an account. The marketplace will expose separate Product and Service verticals within unified search, typed taxonomies, filters, location relevance, and explainable rule-based recommendations. A Customer account becomes mandatory at checkout. `[DEC-042–DEC-044, DEC-053]`

Vendor Storefronts will have structured branding and content—identity, cover, description, accent, policies, Locations, updates, offerings, and collections—but no page builder or arbitrary theme engine. Products may be simple or variant-based. Services will have fixed-price, fixed-duration Options and add-ons with declared price and duration effects. `[DEC-021, DEC-102, DEC-130]`

The initial category policy admits only low-risk goods and appointments. Controlled goods, medical, financial and legal services, adult content, weapons, alcohol, regulated categories, and digital goods are excluded. Publication risk rules may hold Listings and media for human review and appeal. `[DEC-046, DEC-047, DEC-063]`

## Customer purchase experience

A Customer will be able to place Products from several Vendors and selected appointment slots into one Cart. An anonymous Cart is local and non-authoritative. Sign-in will visibly merge it with server state and report price, stock, or availability conflicts rather than silently changing the order. `[DEC-022, DEC-152]`

At checkout, Junction will attempt one all-or-nothing 15-minute reservation of every selected SKU quantity and appointment slot. The Cart itself promises neither stock nor availability. If any reservation fails, checkout will not proceed. Provider-reported payment success time will decide whether the hold was valid; success after expiry will be automatically reconciled and refunded. `[DEC-018, DEC-019, DEC-125]`

The Customer will make one full payment and receive one Purchase/receipt. Internally, the Purchase separates Vendor Orders for goods from Bookings for services so that each component can fulfill, cancel, refund, dispute, and release earnings independently. `[DEC-023, DEC-024, DEC-038]`

## Goods after checkout

Paid Product Orders will automatically confirm. Each Vendor fulfillment group will use one Customer-confirmed Location capable of fulfilling all of its lines; Junction will not split a Vendor group across Locations. When several Locations qualify, Junction will rank and explain them using stock, delivery-zone coverage, fee, and ETA. `[DEC-028, DEC-131, DEC-148]`

Customers will choose Vendor-managed delivery or pickup when available. Junction will model progress and handoff evidence but will not operate drivers, dispatching, routing, reservable delivery windows, live GPS, or a carrier network. Pickup is a ready-then-collect flow, not an appointment. Goods handoff will use a one-time Customer code/QR with a controlled evidence fallback. `[DEC-027, DEC-037, DEC-132]`

Exceptional Vendor cancellation may affect a line or quantity while preserving unaffected Purchase components. Refunds will be proportional; a Customer will not be penalized when a Vendor cancellation breaks a promotion or delivery threshold, and a wholly cancelled fulfillment will refund its delivery fee. `[DEC-133]`

## Appointment experience

Paid Bookings will confirm immediately against a specifically allocated qualified Staff member. Customers may choose a named Staff member or “any qualified Staff.” Capacity will be Staff-based in the first release; rooms, chairs, vehicles, equipment, and group seats are not modeled as reservable resources. `[DEC-019, DEC-029, DEC-134]`

Appointments may occur at a Vendor Location or online. Junction’s internal calendar is authoritative and calculates availability from recurring hours, exceptions, breaks, buffers, lead time, booking horizon, qualification, and existing reservations. It will offer read-only iCal export; two-way external calendar synchronization is deferred. `[DEC-020, DEC-050]`

Public-demo online appointments will use a clearly labeled DemoMeet adapter. Private staging will exercise Google Meet creation through the Meet REST API from the assigned Staff member’s separately connected Google identity; Calendar write/sync is not part of this integration. Meeting provisioning happens after paid confirmation, is retried and reconciled, permits a protected manual replacement, and cancels/refunds the Booking if the safety cutoff is reached without a meeting. `[DEC-099–DEC-101, DEC-139]`

Customers will be able to amend time, Staff, Location, Option, and add-ons. The new allocation and financial delta must succeed atomically; if extra payment fails, the original Booking remains. Unchanged components retain their original price while changed/new components use current pricing. `[DEC-032–DEC-034]`

In-person completion uses Customer code/QR plus Staff confirmation. Online completion combines the Junction join action and Staff confirmation. Staff may report no-show with structured evidence. Completion and no-show outcomes remain contestable under the snapshotted policy. No recording or transcription is provided. `[DEC-035, DEC-036, DEC-147]`

## Money and Vendor earnings

Junction will take transaction commission only in the first release. It will calculate commission on Vendor net sale value after Vendor discount, before platform subsidy, excluding delivery, and allocate rounding deterministically using the largest-remainder method. Rates are effective-dated platform defaults with optional audited Vendor overrides; there are no category rates. `[DEC-026, DEC-141, DEC-142]`

The initial provider is Stripe sandbox/Connect, using an embedded Payment Element and a platform charge followed by separate transfers to hosted Express-style connected accounts. ETB is treated as a two-decimal presentment currency; sandbox settlement may convert. Chapa follows as a separate production-complete adapter. These demonstrations will not claim live Ethiopian fund holding or payout capability. `[DEC-025, DEC-075–DEC-078, DEC-103–DEC-105]`

An immutable balanced double-entry subledger will record economic events. Corrections will reverse prior postings rather than mutate history. Product and Booking earnings become available per affected component only after its policy window; a dispute freezes only the affected amount. Weekly payout batches will include eligible balances over the configured minimum, skip frozen value, and provide Finance-visible statements without an arbitrary wallet withdrawal. `[DEC-038, DEC-140, DEC-144]`

Chargeback principal normally affects the responsible Vendor’s economic balance through freeze, reversal, transfer reversal, or negative payable, with an audited Platform override. Junction will reconcile its subledger against provider objects and events. `[DEC-145]`

Customers may explicitly opt to save a Stripe payment method. Junction will retain only provider references and display metadata, and removal will require recent authentication. `[DEC-151]`

## Returns, disputes, support, and reputation

Vendors will select from bounded Platform-defined cancellation and return templates; the chosen terms will be snapshotted on the affected line or Booking. Goods will have a full return workflow. Vendor fault—wrong, damaged, or not-as-described goods—makes the Vendor responsible for return logistics and original delivery when the full fulfillment is affected; eligible change-of-mind returns are Customer-funded. `[DEC-030, DEC-031, DEC-146]`

Platform mediation will use structured evidence and authorize full refund, partial refund, or no refund. Decisions and changes remain immutable and auditable. `[DEC-039]`

Only Customers with a completed Product line or Booking may publish a verified review. Public dimensions separate offering quality from Vendor experience; Staff-specific feedback remains private. Text and media pass moderation. `[DEC-040, DEC-041]`

Messages are tied to an offering, Order, Booking, return, or dispute. They support attachments, blocking, reporting, moderation, and retention, but Junction is not a general social messaging product. Social engagement is limited to wishlists, saved Services/searches, Vendor follows, and moderated Vendor updates. `[DEC-051, DEC-064]`

Notifications will use in-app, email, Web Push, and optional SMS. SMS remains transactional and one-way rather than a marketing or chat channel. `[DEC-065, DEC-074, DEC-122]`

## Vendor and Platform operations

One User can operate several Vendors through preset least-privilege roles: Owner, Manager, Catalog, Fulfillment, Scheduler, Service Staff, and Finance, optionally scoped to Locations. Staff public profile visibility is opt-in; non-public Staff can still be assigned through “any qualified Staff.” `[DEC-010, DEC-067, DEC-150]`

Vendor operations will include Storefront content, CSV catalog/variant/stock import-export, Location inventory, stock movement history, fulfillment, Staff schedules, Bookings, financial statements, and operational/funnel analytics. `[DEC-048, DEC-049, DEC-052]`

Rules will route risky Listings, communications, reviews, and media to human moderation. Appeals and Platform actions will be audited. `[DEC-047, DEC-063]`

## Data rights and resilience visible to users

Users will be able to export and request deletion of their data. Junction will pseudonymize retained records needed for legal, audit, security, and financial integrity instead of corrupting immutable history. `[DEC-060]`

The PWA will cache its shell and safe public content, optimize media, preserve drafts, and use idempotent retry where safe. Availability selection, payment, booking, stock, and other authoritative mutations will require live confirmation. `[DEC-062]`

The target portfolio deployment will publish a status page and measure an internal 99.5% monthly availability objective. This is an engineering SLO, not a customer SLA. `[DEC-137]`
