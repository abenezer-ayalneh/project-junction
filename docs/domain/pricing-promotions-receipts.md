# Pricing, Promotions, Commission, and Receipts

> **Status:** Planned commercial rules; no pricing or promotion engine exists.

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
