# Project Junction Context Map

Project Junction is a multi-context marketplace. This map points to the glossary for each context and records the intentional boundaries between them. The glossaries define language only; behavior belongs in the linked domain and requirements documents.

## Contexts

- [Identity, Access, and Vendors](./docs/contexts/identity-access-and-vendors/CONTEXT.md) — User identities, Vendor membership, verification, roles, and access grants.
- [Catalog, Inventory, and Locations](./docs/contexts/catalog-inventory-and-locations/CONTEXT.md) — Vendor-owned offerings, variants, stock, Locations, and discovery inputs.
- [Scheduling and Booking](./docs/contexts/scheduling-and-booking/CONTEXT.md) — Service options, Staff availability, appointment allocation, and attendance.
- [Cart and Checkout](./docs/contexts/cart-and-checkout/CONTEXT.md) — Customer intent, pricing snapshots, atomic holds, and Purchase creation.
- [Ordering and Fulfillment](./docs/contexts/ordering-and-fulfillment/CONTEXT.md) — Vendor Orders, pickup, delivery, and handoff evidence.
- [Payments, Ledger, and Payout](./docs/contexts/payments-ledger-and-payout/CONTEXT.md) — Provider-facing payment events, immutable accounting, earnings, and payout batches.
- [Trust, Support, and Moderation](./docs/contexts/trust-support-and-moderation/CONTEXT.md) — Returns, disputes, reviews, Support Cases, evidence, and enforcement.
- [Discovery, Engagement, and Demo](./docs/contexts/discovery-engagement-and-demo/CONTEXT.md) — Search projections, notifications, follows, analytics, public demo workspaces, and synthetic personas.

## Relationships

- **Identity, Access, and Vendors → all contexts**: supplies the scoped actor and Vendor/Platform permissions used to authorize work.
- **Catalog, Inventory, and Locations → Cart and Checkout**: supplies eligible Products, variants, prices, Locations, and stock availability.
- **Scheduling and Booking → Cart and Checkout**: supplies eligible service options and appointment holds.
- **Cart and Checkout → Ordering and Fulfillment / Scheduling and Booking**: creates the Purchase, Vendor Orders, and confirmed Bookings after payment succeeds.
- **Cart and Checkout ↔ Payments, Ledger, and Payout**: Checkout requests payment; Payments records immutable financial effects and later payout eligibility.
- **Ordering and Fulfillment / Scheduling and Booking → Trust, Support, and Moderation**: handoff, attendance, cancellation, return, no-show, and evidence outcomes drive post-purchase cases.
- **all transactional contexts → Discovery, Engagement, and Demo**: emit safe projections, notifications, analytics, and demo-visible activity; those projections never become the source of truth.
