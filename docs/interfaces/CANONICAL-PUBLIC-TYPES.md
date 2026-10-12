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
