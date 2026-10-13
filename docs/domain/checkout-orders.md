# Cart, Checkout, Purchase, and Orders

> **Status:** Target domain behavior. Goods Cart/quotes/holds and controlled local paid Purchase/Vendor Orders are implemented; mixed commerce, live providers and final finance remain unverified.

## Cart

One Cart may contain physical Product quantities from several Vendors and selected appointment slots. `[DEC-022]`

An anonymous Cart is stored locally and is non-authoritative. It does not reserve inventory, Staff, price, promotion, Location, delivery zone, or meeting. `[DEC-125, DEC-152]`

After sign-in, Junction must perform a visible merge:

1. identify matching/conflicting selections;
2. re-read current price, publication, stock, Location, delivery, Service, Staff, and slot eligibility;
3. show repricing or unavailable components;
4. ask the Customer to resolve conflicts; and
5. create no reservation until explicit checkout. `[DEC-152]`

## Checkout quote

Before holding resources, Checkout creates a short-lived quote snapshot containing:

- Customer and Vendor/component ownership;
- SKU, quantity, candidate Location and fulfillment method;
- Booking Option/add-ons, mode, candidate interval, named/any preference;
- item/service prices and changed/current versions;
- Vendor coupon and Platform campaign allocations/funding;
- delivery fee/threshold result;
- commission basis/rate snapshot;
- final amount/currency; and
- selected policy references.

The quote is explanatory input to the hold; it is not a guarantee. Fixed-price requirements still permit a price change between Cart and quote, which must be shown before Customer confirmation. `[DEC-034, DEC-045, DEC-141–DEC-143, DEC-152]`

## Atomic Checkout Hold

Checkout creates one all-or-nothing hold lasting 15 minutes. It includes every selected SKU/Location quantity, concrete Staff allocation, and promotion budget reservation. If any participant conflicts, no component remains reserved. `[DEC-018, DEC-019, DEC-125, DEC-143]`

The Hold records a stable idempotency key, Customer/workspace, quote version, component reservations, amount/currency, creation/expiry, and state. Repeating the same request returns the same outcome. `[DEC-083, DEC-125]`

Cart state remains editable only by abandoning/replacing the active checkout attempt; it does not mutate an already-created Hold.

## Payment boundary

Checkout requests full capture of the complete amount. `[DEC-024]`

Stripe Payment Element may require a typed Customer next action. Browser success is not final authority. Verified provider event/reconciliation determines outcome, using provider success time rather than webhook receipt time. `[DEC-105, DEC-125]`

Outcomes:

- **success inside active Hold:** commit all reservations and create Purchase exactly once;
- **known payment failure/cancellation:** release all reservations;
- **Hold expiry without success:** release all reservations; and
- **provider success after expiry:** do not recommit released resources; automatically refund and reconcile. `[DEC-125]`

An unknown provider state stays pending/reconciling rather than guessed success or failure.

## Purchase decomposition

One valid successful checkout creates one Customer Purchase/receipt umbrella. Product components split into Vendor Orders; appointment components become independent Bookings. `[DEC-023]`

Purchase stores immutable commercial snapshots and references but does not own the operational lifecycle of fulfillment or Booking. Each downstream component can complete, cancel, refund, return, dispute, review, and release earnings independently. `[DEC-030, DEC-038, DEC-082]`

## Vendor Orders

A Vendor Order groups Product lines for one Vendor. One fulfillment group selects one Location capable of fulfilling every line; no cross-Location split is permitted. `[DEC-131]`

Paid Product Orders auto-confirm. There is no routine post-payment Vendor “accept/reject” gate. `[DEC-028]`

Exceptional Vendor cancellation may affect a line or quantity only. It must preserve unaffected components, refund proportionally, prevent Customer penalty when Vendor action breaks a threshold, and refund the delivery fee when the whole fulfillment is cancelled. `[DEC-133]`

## Booking creation

Each selected appointment becomes its own confirmed Booking with its concrete Staff allocation after payment succeeds inside the Hold. `[DEC-019, DEC-023, DEC-029]`

Booking failure after payment is not silently dropped. Any asynchronous requirement such as meeting provisioning follows its documented retry/replacement/automatic-refund compensation path. `[DEC-101]`

## Receipt boundary

The Purchase exposes one Customer-oriented receipt that identifies component Vendors and amounts. It is a non-tax Junction receipt; Junction calculates no tax, and a Vendor may attach an external invoice. `[DEC-056, DEC-057]`

The documentation must not make an unconfirmed legal “merchant of record” conclusion solely from the Stripe separate-charges/transfers integration shape.

## Idempotency and reconciliation

Idempotency is mandatory for hold creation, provider payment attempt, Purchase creation, Vendor Order/Booking acceptance, refund, and every async follow-up. `[DEC-083, DEC-086, DEC-105]`

Reconciliation must be able to find:

- provider success without committed Purchase;
- Purchase without expected provider success;
- expired Hold with late success awaiting refund;
- committed reservation without downstream component;
- duplicate/missing ledger posting;
- mismatched refund/transfer amount; and
- outbox job that has not produced its expected effect.

## Acceptance criteria

- one unavailable component rejects the entire Hold; `[DEC-125]`
- retries never duplicate resources, charge, Purchase, components, postings, refunds, or messages;
- provider success time is used even if webhook delivery is delayed; `[DEC-125]`
- late success cannot steal stock/Staff from a later Customer; `[DEC-125]`
- paid goods and Bookings confirm according to their distinct rules; `[DEC-028, DEC-029]`
- Purchase view remains coherent when one component is cancelled/refunded/disputed;
- unaffected components retain state and economic availability; `[DEC-038, DEC-133]`
- anonymous merge changes nothing silently; and `[DEC-152]`
- receipt language stays inside the non-tax/sandbox/portfolio claims. `[DEC-025, DEC-056, DEC-057, DEC-077]`

## Local goods payment/Order implementation — 2026-10-12

[P02-C07](../requirements/PHASE-02-GOODS-COMMERCE.md#p02-c07--paid-goods-order-commitment--2026-10-12) records the controlled local payment API, immutable provider receipt before reconciliation, atomic complete Purchase/Order/sold-ledger commitment, exact expiry/late-success compensation, scoped reads and local evidence. Payment initiation starts the fifteen-minute payment window once after a bounded provisional hold; replay never extends it. The local simulator is denied outside local runtime and receives no caller amount/currency/success timestamp. Cart preserves an active payment lock and reports authoritative local commitment when refreshed. Payment initiation/control UI, live providers, mixed Booking components and final Phase 04 finance are not claimed by that API slice.

Local `P02-C08` cancellation operates independently on exact Vendor Order quantities, exposes immutable original snapshots plus cancelled/remaining quantity and current refund state, and preserves unrelated Orders. Refund allocation uses original paid prices and original delivery terms; a last whole-group cancellation includes delivery fee exactly once. Final discounts/commission/ledger accounting remains Phase 04. [P02-C08](../requirements/PHASE-02-GOODS-COMMERCE.md#p02-c08--partial-cancellation-and-refund-allocation--2026-10-12) owns current scope/evidence.

## Local mixed Cart and quote boundary — 2026-10-12

Phase 04 C02 implements a server Cart scoped by current Customer/workspace, revisioned explicit replacement, and a non-persistent anonymous merge preview. Matches combine Product quantities only in a preview and preserve quantity-one appointment intent IDs; different Vendor fulfillment/Location choices, saved prices or same-intent selections require explicit resolution. Preview re-reads both sides when no combined proposal can be made. It never changes the saved Cart or reserves resources.

One immutable mixed quote snapshots several Vendor goods groups and up to five independent Booking intents, current prices/versions, fulfillment fees/thresholds and applicable policies. Review reports repricing, changed Service terms, unavailable components and a smallest competing Staff subset, including buffers across modes/Locations. Private any-Staff candidate identities are not returned. The quote's Money total is unavailable when components cannot be evaluated. Expired reservations are ignored for advisory availability without cleanup writes. Creation/read/retry requires authoritative Customer scope; quoting additionally requires verified identity. Expiry is five minutes (derived local default), and Cart changes mark old quotes stale. Creation replay preserves the original ID/expiry and reports the current revision/expiry state.

This chunk exposes API/contracts and local evidence, not the unified browser journey. C03 adds promotion/commission snapshots, C04 holds, C05–C06 payment/Purchase and C07 browser merge/checkout/outcomes. Existing goods-only and Booking lifecycles remain available and are not treated as an atomic mixed Purchase. See [C02 evidence](../quality/PHASE-04-LOCAL-ACCEPTANCE-EVIDENCE.md#p04-c02--mixed-cart-and-quote-coordination--2026-10-12).

## Local C03 promotion/commission boundary — 2026-10-13

Cart selects at most one Vendor coupon for the whole mixed selection and one Platform campaign. New complete quotes compute Vendor-funded discount before Platform-funded subsidy, effective commission on after-Vendor-discount sale value excluding delivery/subsidy, and frozen original unit funding/non-tax receipt context. No configured effective rate or ineligible/exhausted promotion means no ready priced quote; no commercial rate is assumed. Pre-promotion delivery thresholds, per-Vendor half-up/largest-remainder grouping and original-allocation refund funding are explicit derived local rules. These snapshots do not issue a Purchase receipt or post economic ledger entries.

The internal budget lifecycle participant rechecks owned current quote, frozen allocations, definition window/usage/capacity and common bounded hold reference. Its atomic reserve/release/expire/consume primitives are ready for C04, with no budget-only Customer endpoint or actual stock/Staff reservation introduced by C03. Configuration uses current Owner or explicit non-Vendor Finance authority, with local MFA exception and no actual development grants/rates seeded. [C03 evidence](../quality/PHASE-04-LOCAL-ACCEPTANCE-EVIDENCE.md#p04-c03--promotion-and-commission-snapshots--2026-10-13).

## Local atomic mixed hold — P04-C04, 2026-10-13

One owned current complete quote creates one all-or-nothing 15-minute hold. Checkout revalidates publication, prices, effective financial policy, stock and scheduling under the shared checkout lock and participating workspace locks. Independent Booking intents receive jointly selected concrete qualified Staff, including buffered half-open intervals; private any-Staff identities remain internal. Stock movements, Staff allocations, campaign/coupon reservations, immutable original quote terms, audit and outbox commit together. Active holds lock Cart edits until release or expiry.

Exact retries recover the current hold without extending its deadline. Customer reads/current-hold recovery and release are scoped and no-store. Release, exact expiry and the actual worker retire every participant once; legacy goods/Booking acceptance also retires due mixed parents before reallocation. Standalone promotion cleanup cannot partially expire a holding mixed parent. The original quote snapshot retains advisory `reserved: false`; the root hold `reserved` reports current reservation state.

Local states are `holding`, `released`, `expired`; payment/provider compensation and Purchase commitment remain C05–C06, and browser checkout remains C07. All development and verification are local. [C04 evidence](../quality/PHASE-04-LOCAL-ACCEPTANCE-EVIDENCE.md#p04-c04--atomic-mixed-15-minute-hold--2026-10-13).

## Local Phase 04 C05 payment inbox and compensation — 2026-10-13

One local-controlled attempt binds the owned mixed Hold and exact Money, keeps its original deadline, and cannot be replaced on timeout. Receipt truth is independent of browser success. Scoped current/read recovery reconciles durable receipts before returning state. Captured uncommitted value stays in Customer refund liability until C06 can atomically create Purchase/Orders/Bookings; no Purchase is created in C05. Release/expiry/known failure retires all resources. A captured abandoned/expired hold creates one full-amount compensation intent in the same transaction; late success never resurrects stock or Staff. Zero-payable attempts need no provider charge or cash ledger entry and remain subject to the original hold deadline.

All development and verification are local. [C05 evidence](../quality/PHASE-04-LOCAL-ACCEPTANCE-EVIDENCE.md#p04-c05--payment-inbox-and-compensation--2026-10-13).
