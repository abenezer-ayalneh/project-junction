# Project Junction — Documentation and Future Release Roadmap

> **Status:** Planned sequencing. Local implementation status and evidence are tracked in [Documentation Status](../STATUS.md) and the phase-specific evidence records.

## Sequencing rule

Every capability that becomes public must be production-complete across Customer, Vendor, Platform, failure, security, accessibility, observability, and recovery behavior. Incomplete work remains hidden. “Production-complete” applies to the published slice, not to every eventual Junction feature. `[DEC-004, DEC-005, DEC-138]`

## Phase 0 — Decision-complete documentation

Current work ends after producing and reviewing:

- the project charter, planned production description, phased requirements, scope, personas, and journeys;
- canonical domain language, context ownership, invariants, policies, and state machines;
- architecture, API, provider, security, privacy, test, environment, deployment, observability, recovery, and runbook specifications;
- ADRs for consequential choices;
- a decision-to-document-to-verification traceability audit; and
- the separate parked-venture record and future Dire Dawa re-entry gates.

**Exit gate:** every confirmed chat decision has an authoritative home; proposed defaults are not mislabeled as decisions; contradictions and unresolved questions are visible. No implementation is authorized by this phase.

## Phase 1 — Foundation and demo isolation

Future scope:

- Nx workspace, Next application, Nest API, worker, shared contracts, local dependencies, and CI;
- stock shadcn/ui neutral tokens, Light/Dark/System appearance choices, adaptive role shells, accessibility baseline, and PWA shell;
- Better Auth, session validation, MFA/recent-auth, `AccessContext`, Vendor membership, and Platform authorization;
- immutable audit records, outbox/inbox foundations, provider fakes, and observability baseline; and
- isolated synthetic demo workspaces and cleanup.

**Exit gate:** real and demo identities cannot cross; core authorization and workspace isolation pass adversarial tests; no commerce is public.

## Phase 2 — Marketplace supply

Future scope:

- Vendor onboarding/verification boundary;
- structured Storefronts and Locations;
- Product taxonomies, simple/variant Listings, CSV import-export, media processing, publication review, and Meilisearch projection;
- SKU/Location stock ledger; and
- initial public discovery pages backed by synthetic Vendors.

**Exit gate:** supply can be created, reviewed, published, searched, rebuilt, and audited without checkout claims.

## Phase 3 — Goods pickup: first public transactional slice

This is the first permitted public portfolio release. `[DEC-106, DEC-138]`

Future scope:

- anonymous and authenticated Cart merge;
- atomic stock hold and Stripe sandbox payment;
- Purchase, Vendor Order, receipt, commission, double-entry postings, and reconciliation;
- paid Order auto-confirmation;
- one-Location pickup, ready notification, Customer handoff proof, exceptional partial cancellation, refund, and verified review;
- Customer, Vendor fulfillment, finance, support, and Platform failure journeys; and
- public-demo quotas and cleanup.

**Exit gate:** concurrency proves no oversell; late provider success refunds correctly; every posting balances; the full pickup journey is accessible, observable, recoverable, and truthfully labeled.

## Phase 4 — Vendor delivery and goods aftercare

Future scope:

- PostGIS delivery zones and explainable Location selection;
- delivery fees, thresholds, ETA, Vendor-managed milestones, handoff evidence, and failure handling;
- bounded return templates, return logistics allocation, disputes, partial/full refunds, and affected-value earnings freezes; and
- Vendor delivery and return analytics.

**Exit gate:** delivery and returns preserve unaffected Purchase components and reconcile money, stock, evidence, and notifications.

## Phase 5 — Scheduled Services

Future scope:

- Staff profiles, qualifications, schedules, exceptions, buffers, lead time, and booking horizon;
- fixed-price Options/add-ons and named/any-Staff atomic allocation;
- in-person completion and DemoMeet online appointments;
- Google Meet private-staging adapter and failure compensation;
- amendments, cancellation-policy snapshots, completion/no-show contests, earnings release, and verified reviews; and
- read-only iCal export.

**Exit gate:** concurrency proves no Staff double-booking; the original Booking survives a failed amendment; meeting-provisioning failure reaches a safe refund outcome.

## Phase 6 — Unified mixed marketplace

Future scope:

- one Cart and payment spanning several Vendor Orders and independent Bookings;
- commission overrides, Vendor coupon plus platform campaign funding, per-component earnings, separate transfers, weekly payout batches, and chargebacks;
- partial refund and dispute isolation; and
- Chapa as the second production-complete gateway adapter without an Ethiopian-live claim.

**Exit gate:** mixed checkout is atomic at hold/payment but independently operable afterward; no failure corrupts unaffected components or unbalances the ledger.

## Phase 7 — Marketplace operations and engagement

Future scope:

- scoped messaging, Support Cases, formal disputes, evidence, moderation, and appeals;
- notification preferences and delivery across in-app/email/Web Push/SMS;
- wishlists, saved searches/Services, follows, Vendor updates, and explainable recommendations;
- privacy-minimized Vendor funnel analytics; and
- self-service export/deletion with retained-record pseudonymization.

**Exit gate:** abuse, moderation, privacy, retry, and retention behavior is documented and test-evidenced for every public workflow.

## Phase 8 — Full portfolio hardening

Future scope:

- close the selected security verification target;
- complete manual accessibility and low-connectivity validation;
- validate the agreed load envelope and 99.5% internal SLO instrumentation;
- exercise rollback, point-in-time recovery, and clean-host rebuild procedures; and
- publish an evidence index and honest limitation statement.

**Exit gate:** all then-public slices have current security, accessibility, performance, recovery, and operational evidence.

## Future Dire Dawa track

No roadmap phase above authorizes a live city launch. A separate go/no-go process must validate regulation, tax, consumer protection, privacy, KYB, payment/payout contracts, Vendor and Customer demand, delivery operations, translations, invoices, unit economics, incident ownership, and pilot safeguards. The portfolio environment and data are never promoted. `[DEC-001, DEC-011, DEC-025, DEC-066, DEC-077, DEC-109]`
