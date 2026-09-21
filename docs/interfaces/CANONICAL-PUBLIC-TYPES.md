# Canonical Public Types

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** stable transport concepts

| Type                                  | Required semantic fields                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `AccessContext`                       | actor/user reference, role/capability, Vendor and optional Location scope, workspace, session/recent-auth metadata; server-derived |
| `Money`                               | integer `minor`, ISO currency, formatted only at presentation                                                                      |
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
