# Canonical Public Types

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** stable transport concepts

| Type                                  | Required semantic fields                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `AccessContext`                       | actor/user reference, role/capability, Vendor and optional Location scope, workspace, session/recent-auth metadata; server-derived |
| `Money`                               | integer `minorUnits`, ISO currency, formatted only at presentation                                                                 |
| `CheckoutQuote`                       | id, Customer context, components, prices/funding, eligibility/expiry, selected fulfillment/booking inputs                          |
| `CheckoutHold`                        | id, quote reference, reserved stock/Staff components, state, expiry, idempotency linkage                                           |
| `Purchase`                            | Customer-facing reference, component IDs, snapshots, total/payment/refund status                                                   |
| `VendorOrder`                         | Vendor/Location, goods lines, fulfillment state, component financial reference                                                     |
| `Fulfillment`                         | method, address/zone/pickup snapshot, milestones, handoff evidence state                                                           |
| `Booking`                             | service/option/add-ons, Staff preference/assignment, timing/time zone, mode, attendance/meeting/policy snapshot                    |
| `ReturnCase`                          | exact component/quantity, policy/evidence/eligibility/logistics/refund state                                                       |
| `Dispute`                             | affected value, evidence, decision/appeal/financial state                                                                          |
| `SupportCase`                         | participant/context links, status, messages, audit; no unilateral financial authority                                              |
| `LedgerTransaction` / `LedgerPosting` | cause, account, debit/credit Money, immutable references, balance constraint                                                       |

Public type schemas serialize safe identifiers/statuses only. They do not expose provider secrets, internal moderation signals, unscoped Staff/customer data, or raw ledger internals.

## Local Phase 04 transport boundary — 2026-10-12

The implemented Money JSON field is `minorUnits` with explicit uppercase `currency`; safe integers become bigint for ledger arithmetic/storage. C02 publishes `MixedCartRead`, `MixedCartWrite`, `MixedCartMerge`/result and `MixedQuoteCommand`/read/result. The Cart contains several Vendor goods groups and up to five distinct quantity-one Booking intents, with last-reviewed prices and service configuration/rules versions. A merge result contains a proposed selection only when selection/combined-limit conflicts are absent, matching quantities/intent identities and current advisory reviews; `persisted` is false. A mixed quote carries independently identified component snapshots, combined Money (null when incomplete), identified conflicts, expiry/revision status and `reserved: false`. Promotion/commission snapshots and actual Hold/Purchase remain later chunks. [C02 evidence](../quality/PHASE-04-LOCAL-ACCEPTANCE-EVIDENCE.md#p04-c02--mixed-cart-and-quote-coordination--2026-10-12).

Local C03 expands optional Cart promotion selection to one Vendor coupon plus one Platform campaign. A complete new `MixedQuoteSnapshot` now contains funding/definition references, exact component/unit allocations, effective rate/source/basis/rounding, original refund funding and non-tax receipt context. Money remains explicit ETB integer minor units; unavailable configuration has no payable total. Old nullable financial snapshots are retained as historical read compatibility, not a new Hold commitment promise. Configuration DTOs cover coupon/campaign/value/window/scope/usage and effective global/Vendor rates with reason; there is no category rate or public budget writer. `platform:finance:configure` is an explicit scoped expiring grant, not inherited from Reviewer/Foundation or Vendor roles. [C03 evidence](../quality/PHASE-04-LOCAL-ACCEPTANCE-EVIDENCE.md#p04-c03--promotion-and-commission-snapshots--2026-10-13).

## Local Phase 04 C04 hold transport — 2026-10-13

`MixedHoldCommand` carries only `quoteId`. `MixedHoldRead` carries owned hold/quote/Cart IDs, `holding|released|expired`, fixed creation/expiry, root `reserved` and the original `MixedQuoteSnapshot`. The immutable snapshot's `reserved: false` describes its advisory evaluation; root `reserved` is authoritative for the current hold. Create/release results add `replayed`; `MixedCurrentHold` wraps a nullable hold for current Cart recovery. Concrete private any-Staff allocations never appear in these types. Payment/Purchase states are not introduced by C04.

## Local Phase 04 C05 payment inbox and compensation — 2026-10-13

`MixedPaymentStart` has only `holdId`; `MixedPaymentSimulation` has only `outcome`. `MixedPaymentRead` exposes payment/hold IDs, `holdState`, sandbox/local-controlled marker, exact Money, original dates, `pending_provider|unknown|succeeded|failed|refund_pending|refunded|no_payment_required`, `commitmentReady` and nullable `pending|unknown|completed` refund state. Create/simulator results add `replayed`; current recovery wraps nullable `payment`. `MixedPaymentWebhookAck` reports accepted/duplicate inbox delivery, not Purchase success. No signing key, private Staff or provider reference is exposed. Commitment readiness requires retained unexpired resources and verified capture, or a zero-payable no-charge path.

All development and verification are local. [C05 evidence](../quality/PHASE-04-LOCAL-ACCEPTANCE-EVIDENCE.md#p04-c05--payment-inbox-and-compensation--2026-10-13).

## Local Phase 04 C06 Purchase split and receipt — 2026-10-13

`MixedPaymentRead` now carries nullable `purchaseId`; `MixedHoldRead`/payment `holdState` add `committed`. `MixedPurchaseRead` exposes original non-tax receipt, existing independent goods Order and Booking identifiers/states, exact original economic allocation per line/Booking, immutable invoice references, additive amendment records and captured/refunded/pending minor-unit totals. `MixedInvoiceCommand` accepts only invoice number and HTTPS document reference; `MixedInvoiceResult` returns opaque invoice ID and replay status. Receipt values remain original after lifecycle changes; addenda and derived refund totals show later economic facts separately.

All development and verification are local. [C06 evidence](../quality/PHASE-04-LOCAL-ACCEPTANCE-EVIDENCE.md#p04-c06--purchase-split-and-receipt--2026-10-13).
