# Cart, Checkout, Purchase, and Orders

> **Status:** Planned domain behavior; no Cart, Checkout, or Order implementation exists.

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
