# Pricing, Promotions, Commission, and Receipts

> **Status:** Local Phase 04 C03 pricing/promotion/commission snapshot engine is verified; actual Purchase receipt/ledger integration and commercial gates remain open.

## Fixed-price rule

Release 1 supports fixed prices only. Products have a fixed unit price for the chosen SKU. Services have fixed-price Options and add-ons with declared price effects. Quote/auction/negotiated pricing is excluded. `[DEC-021, DEC-045]`

Assigned Staff does not alter Service price or timing. `[DEC-149]`

## Price snapshots and amendments

Checkout revalidates current prices and visibly reports changes before Customer commitment. The Purchase snapshots selected price and funding components. `[DEC-152]`

For Booking amendment:

- unchanged components retain their purchased price; and
- changed/new components use current price. `[DEC-034]`

The delta produces an extra charge or partial refund. Failed extra payment preserves the original Booking. `[DEC-033]`

## Vendor coupons

A Vendor Coupon is funded by that Vendor and applies only to its eligible components. Its definition requires an eligibility window, value rule, scope, usage controls, and immutable checkout allocation snapshot, but exact coupon types/limits were not confirmed and must remain configurable/TBD. `[DEC-058]`

## Platform campaigns

A Platform Campaign is Platform-funded and budget-capped. Concurrent checkout must reserve campaign budget so accepted use cannot exceed the cap. `[DEC-058, DEC-143]`

Funding is economically separate from Vendor discount and must be visible in pricing snapshots and ledger postings.

## Stacking order

At most one Vendor coupon applies first. At most one eligible Platform campaign applies second to the remaining eligible value. No other stacking is part of Release 1. `[DEC-143]`

If a Hold expires or Checkout fails, reserved campaign budget releases idempotently. If payment commits, the reserved allocation becomes consumed. Refund/cancellation treatment follows the snapshotted funding rule and balanced ledger templates.

## Commission

Junction monetizes Release 1 through transaction commission only. `[DEC-026]`

Per affected Product line/quantity or Booking:

1. start with Vendor list sale value;
2. subtract Vendor-funded discount;
3. do not reduce the basis for Platform subsidy;
4. exclude delivery;
5. apply the effective global or audited Vendor-specific rate; and
6. allocate fractional minor-unit results using deterministic largest remainder. `[DEC-141, DEC-142]`

There are no category commission rates. The rate/version and resulting allocation are snapshotted. `[DEC-142]`

## Money representation

All calculations use integer minor units and explicit currency. ETB is the initial product currency and Stripe treats it as two-decimal presentment; sandbox settlement may convert and must be represented as provider metadata rather than rewriting the Customer price. `[DEC-011, DEC-104]`

Rounding order and allocation must be centralized and property-tested so Cart, Checkout, receipt, refund, ledger, and analytics cannot disagree.

## Delivery fee and threshold effects

A Location delivery zone defines fee, minimum, free-delivery threshold, and ETA. `[DEC-055]`

Exceptional Vendor cancellation must not penalize the Customer if it causes a minimum/free-delivery/promotion threshold to fail. A wholly Vendor-cancelled fulfillment refunds delivery fee. `[DEC-133]`

## Loyalty boundary

Loyalty is deferred. If later implemented, it may only be expiring non-cash promotional points and must not become a wallet, withdrawable balance, or fund-holding claim. `[DEC-059]`

## Tax and receipt boundary

Project Junction does not calculate tax in the portfolio release. Displayed demo prices are treated as final prices for the documented flow. `[DEC-056]`

Junction issues a non-tax platform receipt covering the Purchase and identifying relevant Vendor components. It must not be labeled an Ethiopian tax invoice. A Vendor may attach an external invoice. `[DEC-056, DEC-057]`

Receipt data should include:

- Purchase/customer-facing reference and time;
- component Vendor identity;
- Product lines and Bookings;
- quantity/Option/add-ons and price snapshots;
- Vendor discount, Platform campaign, delivery, totals, currency;
- non-tax disclaimer;
- payment/refund status appropriate to current truth; and
- external Vendor invoice reference when provided.

Exact legally required receipt fields for a future Dire Dawa launch require external validation and are not established by the portfolio decision.

## Acceptance criteria

- Cart/Checkout repricing is visible; `[DEC-152]`
- unchanged/changed amendment pricing follows the confirmed rule; `[DEC-034]`
- concurrent Platform campaign use cannot exceed reserved budget; `[DEC-143]`
- no more than one Vendor coupon plus one Platform campaign stacks, in order; `[DEC-143]`
- commission basis excludes delivery and Platform subsidy but includes the effect of Vendor discount; `[DEC-141]`
- largest-remainder allocation is deterministic and totals exactly; `[DEC-141]`
- no category rate is applied; `[DEC-142]`
- Vendor cancellation cannot charge a Customer for Vendor-caused threshold break; `[DEC-133]`
- receipt totals equal payment/ledger snapshots; and
- no receipt or UI claims tax calculation, tax invoice, wallet, or escrow. `[DEC-025, DEC-056, DEC-059]`

## Local implementation boundary — 2026-10-13

C03 publishes immutable version-1 definitions for configurable fixed/percentage coupons/campaigns, optional percentage caps, finite windows, eligible kind/listing/Vendor scopes, minimum sale value and nullable total/per-Customer limits. Null limits explicitly mean unlimited for that configured definition. These are local implementation options; exact commercial coupon types/limits remain unconfirmed. Selection is at most one Vendor coupon across the entire mixed Cart, then one Platform campaign. Eligibility uses the current remaining sale value, excluding delivery. Delivery fee/minimum/free-threshold calculations retain C02's pre-promotion list-sale basis, explicitly recorded as a derived local rule.

Effective rate definitions are append-only with reason/actor. Latest eligible start wins within Vendor/global scope; a Vendor override precedes global and exact end is exclusive. New complete quotes without an effective rate are blocked, including when a zero rate was not explicitly published. Commission is rounded half-up per Vendor total, with exact rate quotas and largest remainders allocated by stable component keys. This per-Vendor rounding boundary is derived to preserve independent seller economics. Fixed/capped discounts allocate the exact amount proportionally; uncapped percentage rules allocate their exact rate quotas. All intermediate arithmetic uses bigint.

Original unit funding is compactly snapshotted in at most six segments per Product line, preserving Vendor discount, Platform subsidy, Customer payable, commission and Vendor proceeds without negative unit values or quantity-sized expansion. Refund funding is `proportional_original_allocations` (derived local rule); later cancellation/refund uses these original segments, not current promotions/rates. Fully funded zero-payable quotes are supported as pricing facts; C05–C06 owns their actual commitment/ledger behavior.

Campaign capacity, reserved and consumed values are enforced through immutable movements and a guarded projection. Internal reserve/release/expiry/consume revalidates actual quote ownership/revision/window, allocation, definition eligibility, usage and common hold reference. Replay never extends deadline; consumed spend cannot be released/reused, and release/expiry is once-only. No standalone public budget writer exists. C04 must integrate this participant with stock/Staff; C05–C06 must integrate verified payment, ledger and full non-tax receipt. Quote/review remains advisory and changes no reservation. [C03 evidence](../quality/PHASE-04-LOCAL-ACCEPTANCE-EVIDENCE.md#p04-c03--promotion-and-commission-snapshots--2026-10-13).

## Local Phase 04 C06 Purchase split and receipt — 2026-10-13

Commitment stores the entire original quote as an immutable non-tax platform receipt with Junction as the controlled sandbox payment merchant and each Vendor as contractual seller. Vendor invoice references are seller-scoped immutable HTTPS references; Junction does not fetch, issue or validate a tax invoice.

Goods partial refunds use stable original unit-segment offsets. Booking cancellation and negative amendments apply eligible gross fractions to remaining original and additive sources: floor Customer/subsidy shares, cap rounded commission by funded value and assign the conserved remainder to Vendor proceeds (derived local rule). Positive controlled Booking amendments use the original commission rate, introduce no new promotion, and appear as receipt addenda. Promotion consumption is immutable and refunds do not restore consumed campaign spend.

All development and verification are local. [C06 evidence](../quality/PHASE-04-LOCAL-ACCEPTANCE-EVIDENCE.md#p04-c06--purchase-split-and-receipt--2026-10-13).
