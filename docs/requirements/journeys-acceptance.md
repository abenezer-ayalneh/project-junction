# Project Junction — Critical Journeys and Acceptance Scenarios

> **Status:** Planned acceptance specification; no scenario has been executed.

## 1. Reviewer enters the public demo

**Given** no account, **when** a reviewer starts a demo, **then** Junction creates an isolated synthetic workspace, clearly labels its expiry/quotas, and offers persona switching that cannot reach a real session. Provider-backed operations are sandboxed or deterministic and carry cleanup metadata. `[DEC-107–DEC-109]`

Failure acceptance: using an object ID, WebSocket room, export link, signed object URL, or provider reference from another workspace returns no data and creates no side effect. `[DEC-129]`

## 2. Visitor discovers a hybrid Vendor

The visitor searches Products and Services through separate verticals, opens a structured Vendor Storefront, filters by category/location/availability, and sees explainable recommendation reasons. No account is required. `[DEC-009, DEC-042–DEC-044, DEC-053, DEC-130]`

Failure acceptance: prohibited or held-for-review Listings never appear in public search; a Meilisearch rebuild does not change authoritative publication state. `[DEC-046, DEC-047, DEC-087]`

## 3. Vendor creates supply

A Catalog member imports Product/variant/stock CSV, reviews dry-run row errors and preview, commits once idempotently, uploads media through quarantine, and submits Listings for risk-based publication. A Scheduler configures Staff, qualifications, hours, exceptions, buffers, Service Options, add-ons, and modes. `[DEC-019–DEC-021, DEC-047, DEC-048, DEC-050]`

Failure acceptance: replaying the import does not duplicate Products or stock; a Catalog member cannot edit finance or schedules; pending/rejected media cannot become public through a direct URL.

## 4. Anonymous Cart becomes an authenticated Cart

A visitor creates a local Cart and then signs in. Junction compares it with current prices, stock, Location eligibility, and slot availability and asks the Customer to resolve conflicts visibly. `[DEC-152]`

Failure acceptance: the merge never creates a reservation, silently replaces a Booking, or promises stale price/availability.

## 5. Goods-pickup purchase

The Customer chooses a Vendor Location able to fulfill every line, receives one 15-minute stock hold, pays the full amount with Stripe sandbox, and receives a Purchase/Vendor Order and non-tax receipt. The paid Order auto-confirms. Vendor Fulfillment marks it ready; Customer proves collection with one-time QR/code; earnings enter the policy-based availability schedule; the completed line becomes reviewable. `[DEC-018, DEC-023, DEC-024, DEC-028, DEC-037, DEC-056, DEC-057, DEC-125, DEC-131, DEC-132]`

Failure acceptance:

- simultaneous checkout cannot oversell;
- any unavailable line rejects the entire hold;
- payment success after hold expiry is refunded automatically;
- retry cannot duplicate charge, Order, stock consumption, ledger postings, refund, or notification; and
- Vendor partial cancellation preserves unaffected lines and does not penalize Customer thresholds. `[DEC-125, DEC-133]`

## 6. Vendor-managed delivery

Junction ranks eligible Locations by stock, zone, fee, and ETA; Customer confirms one. Vendor operates delivery milestones and obtains handoff proof. `[DEC-027, DEC-055, DEC-148]`

Failure acceptance: no platform Driver/route/GPS object is implied; a point outside the chosen zone cannot receive that Location’s delivery promise; evidence fallback is restricted and audited.

## 7. Goods return and dispute

Customer requests a return under the snapshotted template. Evidence and reason determine logistics responsibility. Accepted Vendor fault applies Vendor-funded return logistics and original delivery when the full fulfillment is affected. A formal dispute may end in full, partial, or no refund. `[DEC-030, DEC-031, DEC-039, DEC-146]`

Failure acceptance: only affected value freezes; stock and ledger corrections are new immutable movements/postings; unaffected lines and earnings remain operable. `[DEC-038, DEC-049, DEC-140]`

## 8. In-person Booking

Customer selects a fixed Service Option, add-ons, Location, and named/any qualified Staff. Junction atomically reserves one eligible Staff allocation and fully charges. The Booking confirms immediately. At service time, Customer code/QR plus Staff confirmation produces contestable completion. `[DEC-019, DEC-021, DEC-029, DEC-036]`

Failure acceptance: concurrent selection cannot double-book Staff; private Staff is assignable through “any” but is not exposed publicly without consent. `[DEC-150]`

## 9. Online Booking

Public demo uses DemoMeet. Private staging asks the assigned Staff member’s connected Google identity to create a Meet space asynchronously after paid confirmation. `[DEC-099, DEC-100, DEC-139]`

Failure acceptance: provisioning retries safely; protected manual replacement is audited; failure by the safety cutoff cancels and fully refunds; no Calendar write, recording, or transcription occurs. `[DEC-099, DEC-101, DEC-147]`

## 10. Booking amendment

Customer changes one or more of time, Staff, Location, Option, or add-ons. Junction prices unchanged components at purchase price and changed/new components at current price, atomically holds the replacement, and charges or partially refunds the delta. `[DEC-032–DEC-034]`

Failure acceptance: slot or extra-payment failure leaves the original Booking, money, and meeting intact.

## 11. No-show contest

Staff reports no-show with structured evidence. The Customer may contest inside the snapshotted policy window. The final outcome controls refund and earnings availability. `[DEC-035, DEC-038]`

Failure acceptance: Staff assertion alone cannot silently finalize an irreversible financial result; only affected Booking value freezes.

## 12. Mixed multi-Vendor checkout

One Cart contains Product lines from multiple Vendors and independent Booking slots. One atomic hold and full payment create one Purchase split into Vendor Orders and Bookings. Each component then fulfills and settles independently. `[DEC-022–DEC-024, DEC-125]`

Failure acceptance: a failure before payment rejects every reservation; after payment, cancellation/refund/dispute of one component does not destroy or freeze unrelated components.

## 13. Promotions and earnings

One Vendor coupon applies first; one eligible budget-reserved Platform campaign may then apply. Commission uses the confirmed basis and largest-remainder allocation. Eligible earnings join weekly payout batching over the configured minimum. `[DEC-058, DEC-141–DEC-144]`

Failure acceptance: concurrent campaign use cannot exceed its reserved budget; rounding is deterministic; replay cannot duplicate transfer/payout; frozen amounts are omitted without hiding them from statements.

## 14. Chargeback and reconciliation

A provider chargeback maps to affected components and defaults to the responsible Vendor economic balance. Junction freezes/reverses/transfers or records negative payable as necessary; an authorized audited Platform override may change responsibility. `[DEC-145]`

Failure acceptance: provider and internal totals reconcile, every ledger transaction balances, and a correction reverses rather than edits history. `[DEC-140]`

## 15. Review, message, moderation, and appeal

Only a completed line/Booking creates a review entitlement. Public scores distinguish offering quality and Vendor experience; Staff feedback stays private. Transaction-scoped messages and review media may be reported, routed to human moderation, and appealed. `[DEC-040, DEC-041, DEC-063, DEC-064]`

Failure acceptance: no general social inbox, unverified review, hidden Staff feedback leak, or unaudited moderation edit.

## 16. Data export and deletion

User requests export and later deletion. Junction returns scoped data, revokes access where appropriate, deletes mutable personal data, and pseudonymizes retained legal/audit/security/financial records without unbalancing immutable histories. `[DEC-060, DEC-140]`

Failure acceptance: exports never contain another workspace, Vendor, Customer, Staff-private feedback, provider secret, or hidden moderation/security content.
