# Locations, Inventory, Pickup, and Delivery

> **Status:** Planned domain behavior; no stock or fulfillment system exists.

## Location ownership

A Vendor may have multiple Locations. Each Location independently owns normalized address/pin, Product stock, pickup operation, relevant Staff schedules, in-person appointment availability, and delivery zones. `[DEC-017, DEC-054, DEC-055]`

For a Product group from one Vendor, Checkout selects exactly one Customer-confirmed fulfillment Location capable of supplying every line. Junction does not split one Vendor group across Locations. `[DEC-131]`

If several Locations qualify, Junction ranks them using stock, delivery/pickup eligibility, zone, fee, and ETA and explains the ranking before Customer confirmation. `[DEC-148]`

## Address and delivery geometry

A Customer address contains structured locality/address fields plus contact, landmark, delivery instructions, and map pin. The Purchase receives a snapshot so later profile edits do not rewrite fulfillment facts. `[DEC-054]`

Each Location may define PostGIS polygons/zones containing:

- zone geometry;
- fee;
- minimum order;
- free-delivery threshold; and
- ETA range. `[DEC-055, DEC-128]`

MapLibre/MapTiler presents maps and geocoding assistance. PostGIS and normalized domain data decide whether a point lies in a zone and calculate any required distance. Manual pin placement is retained; public OSM endpoints are not a production dependency. `[DEC-095, DEC-128]`

## Inventory ledger

Stock is identified by Vendor, SKU, and Location. The authoritative history is an immutable audited movement ledger, not a mutable quantity without provenance. `[DEC-018, DEC-049]`

Movement reasons must cover at least receipt, adjustment/correction, reservation, release/expiry, committed sale, Vendor cancellation, return receipt/disposition, damage/loss, and administrative reversal. Corrections append a linked compensating movement.

Available-to-promise quantity excludes active reservations and committed unavailable stock. Release 1 allows no oversell, negative availability, or backorder. `[DEC-018]`

## Checkout reservations

Cart quantity does not reserve inventory. Checkout requests one all-or-nothing 15-minute hold across all Product and Booking components. Each stock reservation carries hold ID and expiry and commits/releases idempotently. `[DEC-125]`

Concurrency control must ensure that two transactions cannot both receive the last unit. The eventual implementation may use Prisma for ordinary access and audited parameterized SQL/row or advisory locks for the critical allocation path. `[DEC-084]`

## Paid Order confirmation

After valid provider success within the hold, Product stock commits to Vendor Order lines and the paid Product Order automatically confirms. Vendor rejection after payment is not a routine acceptance flow; Vendor cancellation is an exceptional audited path. `[DEC-028, DEC-125]`

## Fulfillment choice

Customer chooses pickup or Vendor-managed delivery per Vendor group where available. `[DEC-055]`

The selected Location, method, delivery-zone/fee/ETA or pickup policy, destination snapshot, and relevant handoff terms are snapshotted onto the fulfillment.

## Pickup

Pickup is a ready-then-collect workflow. It does not create a Booking or reserve calendar capacity. `[DEC-132]`

Vendor prepares the goods and marks them ready. Collection uses a Customer one-time code/QR. A restricted evidence fallback must capture actor, time, reason, evidence, and audit when the primary proof cannot be used. `[DEC-037, DEC-132]`

The chat did not confirm exact pickup window/grace durations; they must be policy configuration/TBD rather than copied from the previous assistant plan.

## Vendor-managed delivery

Junction records Vendor-operated delivery progress and handoff proof. It does not provide Driver accounts, dispatch, routing, reservable delivery windows, carrier integration, or live GPS in Release 1. `[DEC-027]`

The minimum semantics are preparation, out-for-delivery, successful handoff, and failed attempt, but exact state labels/retry deadlines were not confirmed. Handoff uses the Customer code/QR or controlled evidence fallback. `[DEC-037]`

## Exceptional Vendor cancellation

Vendor may cancel an affected line or quantity without cancelling the whole Purchase. `[DEC-133]`

Rules:

- refund the affected value proportionally;
- release/adjust the affected stock through movements;
- preserve unrelated Product lines and Bookings;
- do not charge the Customer when the Vendor cancellation breaks a minimum/free-delivery/promotion threshold; and
- refund the delivery fee when the fulfillment is wholly Vendor-cancelled. `[DEC-133]`

Cancellation effects must post through the immutable ledger and provider refund/reconciliation workflow. `[DEC-105, DEC-140]`

## Returns and stock disposition

Return receipt does not automatically mean resaleable stock. Inspection records quantity and disposition such as return-to-stock, damaged, quarantine, or loss. Each effect is an immutable movement. Vendor-fault versus eligible change-of-mind reason controls logistics responsibility. `[DEC-031, DEC-049, DEC-146]`

## Notifications and evidence

Customer/Vendor notifications are driven from committed fulfillment events through the outbox. Email, Web Push, in-app, and optional SMS failures do not roll back fulfillment; they retry and remain visible. `[DEC-065, DEC-073, DEC-074, DEC-086]`

Evidence objects are private, scoped, scanned, retained according to the related Purchase/case policy, and never exposed through public Listing media access. `[DEC-088, DEC-129]`

## Acceptance criteria

- concurrent holds never oversell one SKU/Location; `[DEC-018]`
- expiry and failed checkout release reservations exactly once; `[DEC-125]`
- a Product group cannot confirm if one line is unavailable at its selected Location; `[DEC-131]`
- zone containment/fee/threshold/ETA use PostGIS truth, not map rendering output; `[DEC-128]`
- ranking explains why each Location is eligible and Customer confirms it; `[DEC-148]`
- retry of handoff/cancellation/return cannot duplicate stock movement, refund, or ledger posting;
- partial Vendor cancellation preserves unaffected components and threshold economics; `[DEC-133]`
- pickup creates no Staff allocation; `[DEC-132]`
- delivery UI never implies Platform Driver/GPS functionality; and `[DEC-027]`
- return disposition reconciles physical quantity, stock movements, refund, earnings, and evidence.
