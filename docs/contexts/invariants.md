# Project Junction — Domain Invariants

> **Status:** Planned invariants. These are future implementation and test obligations, not claims about existing behavior.

## Identity and tenancy

1. One User identity may have several role relationships; identity does not imply Vendor authority. `[DEC-010]`
2. Every Vendor operation is authorized against an active membership, allowed role, and optional Location scope. `[DEC-067]`
3. Vendor Owner/Finance and Platform authority requires MFA; sensitive actions also require recent authentication. `[DEC-069]`
4. Demo authority is valid only inside one non-production synthetic workspace and cannot become a real session. `[DEC-107–DEC-109]`
5. Every protected repository operation requires a typed `AccessContext`; unscoped IDs are never sufficient authority. `[DEC-129]`
6. Public Staff identity is opt-in. Hidden Staff may be allocated only without exposing a public profile. `[DEC-150]`

## Catalog and publication

7. A Listing belongs to exactly one Vendor; there is no shared canonical Product record. `[DEC-016]`
8. A Product is either simple or variant-based in Release 1. `[DEC-102]`
9. A Service purchase resolves to one fixed-price, fixed-duration Option plus declared add-ons. `[DEC-021, DEC-045]`
10. Staff assignment never changes Option price, duration, buffer, or add-on rules. `[DEC-149]`
11. A prohibited-category Listing cannot reach public publication. `[DEC-046]`
12. Risk-held content requires a recorded human decision and supports audited appeal. `[DEC-047, DEC-063]`
13. Search and recommendations cannot make unpublished or ineligible content authoritative. `[DEC-043, DEC-087]`

## Inventory and fulfillment

14. Stock truth is SKU plus Location plus immutable movements. `[DEC-018, DEC-049]`
15. `available = on-hand − active reservations − other committed unavailable quantity` according to a single documented projection; it can never be intentionally negative in the no-backorder model. `[DEC-018]`
16. Cart quantity does not reserve stock. `[DEC-125]`
17. One Vendor fulfillment group uses exactly one Customer-confirmed Location and is never split. `[DEC-131]`
18. Every line in that group is fulfillable from the selected Location when the Checkout Hold commits. `[DEC-131]`
19. A Product Order auto-confirms after paid commitment; Vendor cancellation is an exceptional audited path. `[DEC-028]`
20. Partial Vendor cancellation preserves unaffected lines/quantities and cannot make the Customer pay a broken threshold penalty. `[DEC-133]`
21. A fully Vendor-cancelled fulfillment refunds its delivery fee. `[DEC-133]`
22. Pickup is not a Booking and consumes no Staff calendar slot. `[DEC-132]`
23. Product completion requires Customer handoff proof or a controlled evidence fallback. `[DEC-037]`

## Scheduling and Booking

24. A slot is available only when one qualified Staff member can cover Service duration plus buffers inside schedule, exception, lead-time, and horizon rules. `[DEC-019, DEC-050]`
25. Every confirmed Booking has exactly one allocated Staff member, including “any Staff” selections. `[DEC-019]`
26. One Staff member cannot hold overlapping active allocations after buffers are applied. `[DEC-019]`
27. Release 1 does not reserve rooms, equipment, vehicles, group seats, or other shared resources. `[DEC-134]`
28. A paid Booking confirms immediately. `[DEC-029]`
29. A Booking represents one Customer party and one one-off occurrence. `[DEC-134, DEC-135]`
30. An amendment changes permitted components atomically; failure leaves the original Booking and allocation intact. `[DEC-032, DEC-033]`
31. Unchanged amendment components retain purchase price; changed/new components use current price. `[DEC-034]`
32. Completion/no-show is evidence-backed and contestable according to the purchase-time policy snapshot. `[DEC-035, DEC-036]`
33. No online appointment is recorded or transcribed by Junction. `[DEC-147]`

## Cart, Checkout, and Purchase

34. An anonymous Cart is local and non-authoritative. `[DEC-152]`
35. One Checkout Hold contains all selected SKU reservations and Staff allocations or none. `[DEC-125]`
36. The hold lasts 15 minutes. `[DEC-125]`
37. One checkout performs full capture and produces one Customer Purchase. `[DEC-023, DEC-024]`
38. Product commitments become Vendor Orders; appointment commitments become Bookings. `[DEC-023, DEC-082]`
39. Provider success time—not delayed webhook arrival—determines whether payment succeeded before hold expiry. `[DEC-125]`
40. Provider success after expiry starts automatic refund and reconciliation; it cannot resurrect released stock or Staff. `[DEC-125]`

## Pricing, promotions, and receipts

41. Release 1 prices are fixed. `[DEC-045]`
42. Junction monetizes Release 1 through transaction commission only. `[DEC-026]`
43. Commission basis is Vendor net sale after Vendor discount, before Platform subsidy, excluding delivery. `[DEC-141]`
44. Shared fixed-amount allocation uses deterministic largest-remainder rounding. `[DEC-141]`
45. A transaction uses the effective global commission rate or one audited Vendor override; category rates do not exist. `[DEC-142]`
46. At most one Vendor-funded coupon applies before at most one budget-reserved Platform-funded campaign. `[DEC-058, DEC-143]`
47. Purchase policy, price, discount funding, commission, Location, address, and relevant offering terms are snapshotted; later edits do not rewrite the Purchase. `[DEC-030, DEC-034, DEC-141–DEC-143]`
48. Junction calculates no tax and labels its receipt as non-tax; a Vendor may attach an external invoice. `[DEC-056, DEC-057]`

## Ledger, earnings, and provider money

49. Every ledger transaction is balanced: total debits equal total credits. `[DEC-140]`
50. A posted transaction is immutable; correction uses a linked reversal/new transaction. `[DEC-140]`
51. Provider objects do not replace the internal ledger; provider/internal state is explicitly reconciled. `[DEC-025, DEC-105, DEC-140]`
52. Earnings are tracked at the affected Product line/quantity or Booking component. `[DEC-038]`
53. A dispute freezes only affected economic value. `[DEC-038]`
54. Weekly payout batching excludes frozen value and balances below the configured minimum. `[DEC-144]`
55. Vendor Finance cannot initiate an arbitrary wallet withdrawal. `[DEC-144]`
56. Chargeback principal defaults to the affected Vendor balance unless an authorized audited override says otherwise. `[DEC-145]`
57. Sandbox transfers/payouts do not justify a claim that Junction holds or pays Ethiopian production funds. `[DEC-025, DEC-077]`

## Returns, reviews, and trust

58. Purchased return/cancellation terms come from the immutable selected policy snapshot. `[DEC-030]`
59. Vendor-fault and eligible change-of-mind returns assign logistics cost according to the confirmed reason rule. `[DEC-146]`
60. Formal mediation outcome is exactly full refund, partial refund, or no refund and is evidence-backed/audited. `[DEC-039]`
61. A Review requires one completed Product line or Booking entitlement. `[DEC-040]`
62. Public review dimensions cover offering quality and Vendor experience; Staff feedback remains private. `[DEC-040, DEC-041]`
63. Messaging belongs to an offering/transaction context and cannot become an unrestricted general inbox. `[DEC-064]`
64. Moderation includes human review and an auditable appeal path. `[DEC-063]`

## Privacy, providers, and projections

65. Data deletion cannot destroy required audit/security/financial integrity; retained personal references are pseudonymized. `[DEC-060]`
66. Public demo KYB never accepts real identity documents or performs real registry checks. `[DEC-066]`
67. Email/SMS/meeting/payment retries are idempotent and reconcilable; unsigned provider callbacks are not accepted as unquestioned authority. `[DEC-073, DEC-074, DEC-101, DEC-105]`
68. PostgreSQL is business truth; Redis/BullMQ and Meilisearch can be rebuilt. `[DEC-086, DEC-087]`
69. REST is authoritative after realtime cursor gaps. `[DEC-072, DEC-124]`
70. Domain addresses, pins, polygons, object metadata, and provider references remain owned normalized data rather than raw provider payload authority. `[DEC-088, DEC-095]`
71. Analytics excludes session replay, fingerprinting, and third-party behavioral tracking. `[DEC-123]`
