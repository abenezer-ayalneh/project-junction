# Phase 02 — Goods Commerce

**Target status:** Specified — Not Executed — Not Verified. **Local status:** First inventory-ledger seam verified in the synthetic PostgreSQL and built API runtime; the Phase 02 exit remains open.
**Objective:** prove correct single/multi-Vendor goods behavior privately before unifying with Booking.  
**Owner:** inventory, ordering, and fulfillment contexts  
**Entry:** Phase 00–01. **Exit:** no-oversell goods, fulfillment, return, and policy proof.  
**Decision coverage:** `DEC-018`, `DEC-027`, `DEC-028`, `DEC-037`, `DEC-049`, `DEC-054`, `DEC-055`, `DEC-125`, `DEC-131`–`DEC-133`, `DEC-148`, `DEC-161`, `DEC-166`, `DEC-183`, `DEC-186`, `DEC-187`

## Included / excluded

Includes immutable stock ledger, one fulfillment Location per Vendor group, price/availability quote, strict hold, Product Order, pickup-ready/collection, Vendor delivery zones/milestones/proof, partial cancellation, return/refund then fresh purchase, and exact goods policies. Excludes backorders, product exchanges, platform dispatch, drivers/carriers/GPS, and public release.

## Actors and proof journey

A verified Customer selects a Vendor Location and pickup or Vendor-managed delivery, accepts the quote, and receives a valid goods hold. Checkout commits only current stock; the scoped Vendor fulfillment role records ready/milestone/proof and the Customer presents a handoff code/QR or controlled fallback evidence. Support/Trust later processes a scoped ReturnCase without altering unrelated stock, Orders, or earnings. The proof includes competing holds, partial cancellation, failed-delivery retry, pickup expiry, and 7/14/30-day eligibility.

## Functional requirements

- `REQ-P02-INV-001`: every stock change writes a reasoned immutable movement; derived available stock cannot go negative.
- `REQ-P02-CHK-001`: a goods quote/hold validates SKU-variant/Location, price, zone, policy and expiry; competing holds cannot oversell.
- `REQ-P02-ORD-001`: paid goods auto-confirm into Vendor Order components; allowed cancellation affects only selected quantity/line and allocates refund safely.
- `REQ-P02-FUL-001`: Customer selects pickup/delivery per Vendor group; address/zone/fee/ETA snapshot before payment.
- `REQ-P02-FUL-002`: delivery records ordered milestones/proof; failed delivery receives one corrected retry within 48 hours.
- `REQ-P02-POL-001`: pickup is 72 hours plus a 48-hour grace, then return/inspection/refund treatment; it is not a Booking.
- `REQ-P02-RET-001`: unused-goods change-of-mind templates are Standard 7 calendar days or Flexible 14 calendar days from verified handoff with no restocking fee; fault/wrong-item/material-misdescription protection is 30 days; policies snapshot per line.

## Policies, objects, and state

Uses `POL-GOOD-001`–`POL-GOOD-004`, `INV-INV-001`, `INV-FUL-001`, `INV-ORD-001`. Objects: InventoryMovement, CheckoutQuote/Hold, Purchase, VendorOrder, Fulfillment, AddressSnapshot, ReturnCase. States: `STATE-INV-001`, `STATE-CHK-001`, `STATE-ORD-001`, `STATE-FUL-001`, `STATE-RET-001`. Events: `EVT-STOCK-*`, `EVT-HOLD-*`, `EVT-ORDER-*`, `EVT-FULFILLMENT-*`.

## Failure/quality/acceptance

Expiry/payment race refunds late success; retry is idempotent; failed delivery/pickup expiration preserves evidence; provider/outbox failure reconciles. Stock/fulfillment mutation requires live authority; safe drafts may survive offline. Tests prove concurrency, price/zones, handoff fallback, partial cancellation, 7/14/30 eligibility, pickup grace, failed-delivery retry, and product earning release after its 7/14 window (`TST-P02-001`, `TST-P02-002`, `TST-P02-003`). Booking and atomic mixed payment remain Phase 03–04.

## Local implementation notes

The first Phase 02 chunk adds an append-only PostgreSQL inventory-movement table and private API operations to record received, adjusted, and damaged stock for simple or variant Products at an assigned Vendor Location, then read on-hand, reserved, and derived available quantities. Variant movements are keyed by SKU; revisions cannot remove or convert an item while it has nonzero stock. The command checks that availability stays non-negative and writes audit, outbox, and idempotency records in the same transaction. Expired demo-workspace purge removes its inventory rows. A fresh local PostgreSQL integration run verifies idempotent receive, concurrent damage denial before negative availability, SKU-preserving revisions, and cross-workspace denial; the built API smoke verifies the same private HTTP receive/replay/read/negative/foreign-resource paths. This is local evidence for the inventory seam only: checkout holds, sales, returns, stock transfers, customer availability, and the `TST-P02-*` evidence remain unimplemented.
