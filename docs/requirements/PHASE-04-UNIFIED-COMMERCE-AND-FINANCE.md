# Phase 04 — Unified Commerce and Finance

**Status:** In local implementation — P04-C01 complete locally; formal phase exit open

**Objective:** make one Customer Purchase safely coordinate multi-Vendor goods and Bookings.  
**Owner:** checkout, payments, ledger, and payout contexts  
**Entry:** Phase 02–03 exit evidence. **Exit:** atomic mixed Purchase, balanced/reconciled finance evidence.  
**Decision coverage:** `DEC-022`–`DEC-026`, `DEC-056`–`DEC-059`, `DEC-073`, `DEC-083`, `DEC-086`, `DEC-104`, `DEC-105`, `DEC-125`, `DEC-140`–`DEC-146`, `DEC-154`, `DEC-155`, `DEC-163`, `DEC-182`, `DEC-187`, `DEC-188`

## Included / excluded

Includes one atomic mixed Cart/Checkout, all-or-nothing 15-minute hold, one customer-facing Purchase, mixed Vendor Orders/Bookings, sandbox payment and late-success compensation, non-tax receipt/Vendor external invoice attachment, promotion/commission snapshots, immutable ledger, delayed earnings, reconciliation, transfer/payout simulation, and fee policy. Excludes live money/merchant legality, wallet/escrow, tax calculator, arbitrary withdrawals, category commission.

## Actors and proof journey

A verified Customer submits a Cart with several Vendor goods groups and up to five independent Booking intents. Checkout validates and holds every stock/Staff component before creating one provider attempt. A verified provider result, never browser success alone, creates one Purchase with independent VendorOrders/Bookings and balanced postings. Finance sees reconciled provider/inbox/ledger evidence, can open an exception, and only uses approved compensating entries. The selected sandbox contract makes Junction payment merchant while Vendors remain contracting sellers; it is not a live settlement claim.

## Functional requirements

- `REQ-P04-CHK-001`: mixed Cart supports several Vendors, Product groups, and no more than five quantity-one Booking intents in one quote/hold/payment.
- `REQ-P04-CHK-002`: a 15-minute all-or-nothing hold commits exactly once; late provider success auto-refunds/compensates.
- `REQ-P04-PUR-001`: Purchase splits to Vendor Orders/Bookings without merging their lifecycles; unaffected components survive partial cancellation/refund.
- `REQ-P04-FIN-001`: every economic change posts balanced immutable entries using `Money`; correction is reversal/new posting only.
- `REQ-P04-FIN-002`: Junction’s selected sandbox model is payment merchant for unified charge and Vendors are contractual sellers; ordinary processor/dispute fees are Junction cost.
- `REQ-P04-PRM-001`: max one Vendor coupon then one Platform campaign; funding, budget reservation, commission rate/basis, rounding, and receipt context snapshot.
- `REQ-P04-PYO-001`: Product earnings release after its 7/14 policy window; Booking earnings after 48-hour contest; disputes freeze only affected value; weekly payout batches are idempotent/reconciled.

`REQ-P04-UX-001`: unified Cart/checkout/confirmation makes Vendor goods groups and independent appointment intents, merge/repricing conflicts, verification requirements, policy/totals, hold expiry, and uncertain payment outcomes explicit; commitment and recovery reflect authoritative coordinated state (`DEC-191`; `TST-P04-004`). The [Marketplace UI/UX specification](../product/MARKETPLACE-UI-UX-SPECIFICATION.md) owns presentation details and preserves the local authentication exception in `DEC-190` plus its public-release restoration gate. This addition remains **Specified — Not Executed — Not Verified**.

## Policies, objects, and state

`POL-FIN-001`–`POL-FIN-005`, `INV-PAY-001`, `INV-CHK-001`; CheckoutQuote, CheckoutHold, Purchase, PaymentAttempt, LedgerTransaction/Posting, Earning, Transfer, PayoutBatch, PromotionReservation. `STATE-CHK-001`, `STATE-PAY-001`, `STATE-EARN-001`; `EVT-CHECKOUT-*`, `EVT-PAYMENT-*`, `EVT-LEDGER-*`, `EVT-PAYOUT-*`.

## Failure/quality/acceptance

Duplicate/out-of-order webhook, hold race, payment/refund/payout collisions, provider timeout, unavailable earnings, and reconciliation mismatch never create/unbalance money. `TST-P04-001` proves one mixed Purchase; `TST-P04-002` proves duplicate webhook/ledger reconciliation; `TST-P04-003` proves promotion, earnings-window, and payout allocation. Finance security/recent-auth/dual control is enforced. Full public demo, broad operations, and commercial payment use remain deferred.

## Implementation chunks

**Plan updated:** 2026-10-12. Chunk boundaries are derived planning defaults; existing requirements, policies and phase gates remain authoritative. Follow the [single-chunk workflow](./MULTIPHASE-REQUIREMENTS.md#single-chunk-workflow). Complete one chunk per request, in the order below, after its dependencies are ready. Each chunk includes relevant contracts/state/events, scoped authority, implementation, local verification and documentation updates.

**Next chunk:** `P04-C02`. Phase 02–03 local acceptance supplies the local implementation dependency; formal provider, independent accessibility, retention and target recovery gates remain open. Completing a chunk does not accept the phase exit.

| Chunk                                                   | Status           | Scope and requirement coverage                                                                                                                               | Dependency                | Completion evidence                                                                                                          |
| ------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `P04-C01` — Money and immutable ledger                  | Complete locally | Balanced integer-minor-unit postings and reversals with the selected sandbox merchant/seller/fee model. (REQ-P04-FIN-001, REQ-P04-FIN-002)                   | Phase 02–03 exit evidence | Reject unbalanced/cross-currency/mutable history; idempotent posting and compensating corrections.                           |
| `P04-C02` — Mixed Cart and quote coordination           | Pending          | Several Vendor goods groups and up to five quantity-one independent Booking intents in one quote. (REQ-P04-CHK-001)                                          | `P04-C01`                 | Invalid sixth intent, merge/repricing conflicts, component snapshots and authority.                                          |
| `P04-C03` — Promotion and commission snapshots          | Pending          | One Vendor coupon then one Platform campaign; budget reservation, funding, commission basis/rate and rounding. (REQ-P04-PRM-001)                             | `P04-C02`                 | Budget contention, replay/release, promotion ordering and frozen receipt totals.                                             |
| `P04-C04` — Atomic mixed 15-minute hold                 | Pending          | Coordinate stock, Staff and promotion reservations all-or-nothing with common expiry. (REQ-P04-CHK-002)                                                      | `P04-C03`                 | Cross-context contention, partial failure/rollback, replay and expiry release without leaked reservations.                   |
| `P04-C05` — Payment inbox and compensation              | Pending          | Local controlled sandbox contract for attempts, verified provider results, inbox deduplication and late-success refunds. (REQ-P04-CHK-002, REQ-P04-FIN-001)  | `P04-C04`                 | Duplicate/out-of-order results, uncertain timeout, expiry race and refund/payment collisions; browser success never commits. |
| `P04-C06` — Purchase split and receipt                  | Pending          | Commit one Purchase with independent Orders/Bookings and balanced postings; non-tax receipt/external invoice attachment. (REQ-P04-PUR-001, REQ-P04-FIN-002)  | `P04-C05`                 | Exactly-once commit, independent lifecycle preservation and scoped partial refund allocations.                               |
| `P04-C07` — Unified checkout and outcome UI             | Pending          | Mixed Cart, verification, totals/policies, countdown, confirmation and uncertain-payment recovery. (REQ-P04-UX-001)                                          | `P04-C06`                 | Served local authority-based outcomes and conflict recovery; DEC-190 local exception/restoration gate and TST-P04-004.       |
| `P04-C08` — Earning release and scoped freezes          | Pending          | Goods 7/14-day release and Booking 48-hour contest delay; disputes freeze affected value only. (REQ-P04-PYO-001)                                             | `P04-C07`                 | Timing boundaries, refund/contest races and unaffected component availability.                                               |
| `P04-C09` — Reconciliation and weekly payout simulation | Pending          | Provider/inbox/Purchase/ledger reconciliation, exception records and idempotent simulated weekly transfer/payout batches. (REQ-P04-FIN-001, REQ-P04-PYO-001) | `P04-C08`                 | Mismatch detection, retry/collision, unavailable earnings and scoped allocation; recent-auth/dual control.                   |
| `P04-C10` — Mixed finance acceptance and phase gate     | Pending          | Complete local mixed Purchase, ledger, promotion, earning and payout evidence. (All Phase 04 requirements)                                                   | `P04-C09`                 | TST-P04-001–004; prove balance/reconciliation/compensation and record provider or phase-entry gate gaps.                     |

**Tracking:** when a chunk finishes, update its status and add dated local implementation/evidence notes in this document, update relevant linked contracts/policies/acceptance documents, and set the next chunk in this document and [Documentation Status](../STATUS.md). If blocked, record the missing dependency and retain this chunk as next; do not silently advance.

## Local implementation notes

### P04-C01 — Money and immutable ledger — 2026-10-12

Complete locally. Money contracts require explicit uppercase currency and safe integer minor units; sums use bigint. Immutable PostgreSQL transactions/postings enforce a single currency, nonzero amounts, balance, Vendor workspace/Location scope, exactly negating once-only reversals and the selected sandbox merchant/seller/fee snapshot. Database triggers reject update/delete/truncate and later append even from raw SQL. Economic-event identity is unique per workspace; a concurrent replay returns the original and changed terms conflict. Posting, audit and durable outbox share the caller's commerce transaction.

This is an internal economic-event seam, with no browser or manual Finance posting endpoint. Callers must supply scope from authoritative components in the same transaction; manual corrections with recent-auth/dual control belong to C09. Existing goods/Booking payment/refund records are not backfilled or represented as ledger-posted: coordinated posting integration belongs to C05–C06; promotion and actual earnings remain C03/C08. Platform fee expense accounts carry ordinary processor/dispute fees without reducing Vendor payable.

Ten focused local PostgreSQL scenarios pass; five-project Nx lint/typecheck/unit checks and 43-migration compatibility/populated upgrade pass. See [local acceptance evidence](../quality/PHASE-04-LOCAL-ACCEPTANCE-EVIDENCE.md) and [verification record](../quality/evidence/phase-04-c01-2026-10-12/verification.json). No remote work, live money or formal phase acceptance. **Next:** `P04-C02` — Mixed Cart and quote coordination.
