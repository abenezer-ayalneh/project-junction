# Phase 04 — Unified Commerce and Finance

**Status:** Specified — Not Executed — Not Verified  
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

## Policies, objects, and state

`POL-FIN-001`–`POL-FIN-005`, `INV-PAY-001`, `INV-CHK-001`; CheckoutQuote, CheckoutHold, Purchase, PaymentAttempt, LedgerTransaction/Posting, Earning, Transfer, PayoutBatch, PromotionReservation. `STATE-CHK-001`, `STATE-PAY-001`, `STATE-EARN-001`; `EVT-CHECKOUT-*`, `EVT-PAYMENT-*`, `EVT-LEDGER-*`, `EVT-PAYOUT-*`.

## Failure/quality/acceptance

Duplicate/out-of-order webhook, hold race, payment/refund/payout collisions, provider timeout, unavailable earnings, and reconciliation mismatch never create/unbalance money. `TST-P04-001` proves one mixed Purchase; `TST-P04-002` proves duplicate webhook/ledger reconciliation; `TST-P04-003` proves promotion, earnings-window, and payout allocation. Finance security/recent-auth/dual control is enforced. Full public demo, broad operations, and commercial payment use remain deferred.
