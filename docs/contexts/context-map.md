# Project Junction — Bounded Context Map

> **Status:** Planned ownership map for a modular monolith. No modules are implemented.

## Architectural rule

Project Junction will use one PostgreSQL database and one migration history, but tables and writes remain owned by explicit bounded contexts. Shared storage is not shared authority. Contexts communicate through application contracts and durable domain/integration events, not cross-module table mutation. `[DEC-081, DEC-082, DEC-085]`

Ordering and Booking remain separate contexts. Checkout/Purchase coordinates the initial atomic Customer commitment; Payments/Ledger connects money to both without collapsing their post-purchase lifecycles. `[DEC-023, DEC-082]`

## Context ownership

| Context                | Owns                                                                                                                   | Must not own                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Identity & Access      | User, identity verification, Better Auth linkage, session assurance, MFA/recent-auth, Platform grants                  | Vendor business data, Staff schedule, Cart, money                          |
| Vendors & Locations    | Vendor, membership/role/location scope, Storefront identity, Location/address/pin, onboarding/operational status       | Listings, stock movements, Bookings, ledger postings                       |
| Catalog                | Product/Service Listings, variants, Service Options/add-ons, taxonomies, publication state, CSV import jobs            | Stock truth, Staff availability, payment, search index truth               |
| Inventory              | SKU/Location balances derived from immutable movements, reservations, adjustments, return dispositions                 | Cart, payment, delivery workflow                                           |
| Scheduling             | Staff, qualifications, hours, exceptions, breaks, availability calculation, temporary allocation                       | Paid Booking lifecycle, meeting provider, Customer payment                 |
| Cart & Checkout        | Cart snapshot, quote, all-or-nothing Checkout Hold, checkout idempotency/expiry                                        | Long-lived fulfillment, Booking completion, ledger accounting              |
| Purchase               | Customer-facing Purchase/receipt grouping and immutable commercial snapshots                                           | Vendor fulfillment workflow, appointment workflow, provider money movement |
| Ordering & Fulfillment | Vendor Orders, lines/quantities, selected Location, pickup/delivery lifecycle and handoff evidence                     | Staff scheduling, Booking, provider ledger                                 |
| Booking                | Paid appointment lifecycle, assigned Staff reference, amendment, completion/no-show, meeting requirement               | Staff source schedule, Product fulfillment, payment-provider truth         |
| Payments               | Payment/refund/transfer/payout provider attempts, webhook inbox, reconciliation state, saved-method references         | Commercial policy or ledger mutation by inference                          |
| Ledger & Payout        | accounts, balanced transactions/postings, earning availability/freeze, statements, batch composition, negative payable | Provider webhook transport, Product/Booking state ownership                |
| Pricing & Promotions   | effective commission configuration, coupon/campaign rules and budgets, allocation snapshots                            | Payment capture or ledger posting                                          |
| Returns & Disputes     | Return Case, evidence, logistics responsibility, formal Dispute, mediation outcome                                     | Original Order/Booking history, direct ledger-row edits                    |
| Reviews                | entitlement and verified review, public dimensions, private Staff feedback, Vendor linkage                             | Purchase completion truth, moderation policy engine                        |
| Messaging & Support    | transaction-scoped conversations, attachments, Support Cases, block/report                                             | General social inbox, formal financial decision authority                  |
| Trust & Safety         | publication/communication/review/media moderation case, rule signals, human decision, appeal                           | Source content ownership, direct money changes                             |
| Notifications          | preference, outbox delivery, channel attempts and provider callbacks                                                   | Source business-state transitions                                          |
| Discovery              | Meilisearch projections, query/filter/rank, explainable recommendation output                                          | authoritative Listing, availability, stock, analytics truth                |
| Analytics              | privacy-minimized typed events and Vendor operational/funnel projections                                               | session replay, fingerprinting, source transaction state                   |
| Media                  | object metadata, quarantine, scan/transform/moderation readiness, signed access                                        | Vendor Listing publication decision or message authorization               |
| Demo Workspaces        | synthetic workspace/persona lifecycle, quota, expiry, cleanup metadata                                                 | real User authentication or future-production data                         |

## Principal context relationships

### Supply to discovery

1. Vendors & Locations establishes Vendor/Location eligibility.
2. Catalog creates or changes a Listing.
3. Media reports safe renditions; Trust & Safety reports publication decision.
4. Catalog publishes authoritative state.
5. Outbox events update Discovery; a full rebuild reads authoritative projections.

Discovery never decides that a Listing is published and never owns stock or slot availability. `[DEC-047, DEC-087, DEC-088]`

### Checkout coordination

1. Cart & Checkout receives Customer selection.
2. It asks Pricing & Promotions for a quote and funding reservations.
3. It requests one Stock Reservation set from Inventory and one Staff allocation set from Scheduling.
4. It records one atomic Checkout Hold or rejects the whole attempt.
5. Payments collects the full amount.
6. On provider success inside the hold, Purchase is created, Ordering accepts Product commitments, Booking accepts appointment commitments, and Ledger posts the economic event.
7. On expiry/failure, every temporary reservation releases; late provider success starts automatic refund/reconciliation. `[DEC-022–DEC-024, DEC-125]`

No context may independently “helpfully” confirm its component before Checkout records the coordinated outcome.

### Post-purchase independence

Ordering & Fulfillment and Booking advance independently after a successful Purchase. A cancellation, refund, return, dispute, or earning freeze identifies affected component IDs and quantities. Unaffected components retain their state, policy, money, and availability. `[DEC-038, DEC-133]`

### Evidence to finance

Operational contexts record facts—handoff, completion, no-show, inspection, moderation, dispute outcome. Ledger & Payout converts authorized economic facts into balanced transactions; it does not infer operational truth from status strings. Payments executes/reconciles provider effects; it does not invent accounting entries. `[DEC-035–DEC-039, DEC-105, DEC-140]`

## Synchronous versus asynchronous boundary

Must complete synchronously inside the authoritative request/transaction boundary:

- authorization and scope check;
- quote validation;
- atomic Checkout Hold creation/rejection;
- stock/Staff conflict decision;
- immutable state transition and outbox write; and
- idempotency result recording.

May complete asynchronously through outbox and stable idempotent jobs:

- email, Web Push, and SMS;
- search and analytics projection;
- media scanning/transformation;
- Google Meet provisioning;
- provider reconciliation and retry;
- earnings release and payout batch preparation;
- demo cleanup; and
- webhook-driven follow-up. `[DEC-073, DEC-074, DEC-086–DEC-088, DEC-101, DEC-124, DEC-144]`

## Provider boundary

Payment, disbursement, meeting, email, SMS, maps, object storage, and media tooling are adapters. Provider payloads/references are retained only where necessary; they do not become the domain model. `[DEC-025, DEC-075, DEC-078, DEC-095, DEC-098]`

## Context-map acceptance checks

- no context writes another context’s tables directly;
- no Prisma/persistence type appears in a public API contract; `[DEC-084, DEC-120]`
- every outbox event has one owning transaction and idempotent consumers; `[DEC-086]`
- every cross-context reference is an ID plus an explicit snapshot or lookup contract, not a shared mutable entity;
- search/Redis loss cannot lose business truth; `[DEC-086, DEC-087]`
- `AccessContext` scope applies across every context and async continuation; and `[DEC-129]`
- component-level cancellation/refund/dispute never changes unrelated Purchase components. `[DEC-038, DEC-133]`
