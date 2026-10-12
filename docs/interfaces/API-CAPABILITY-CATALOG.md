# API Capability Catalog

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** capability-level interface inventory

| ID range        | Capability        | Owner                    | Examples                                                                                                                                                                                                                                                                                                                               |
| --------------- | ----------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API-001`–`009` | identity/access   | Identity                 | session, active context, membership, recent-auth                                                                                                                                                                                                                                                                                       |
| `API-010`–`019` | Vendor/supply     | Vendor/Catalog           | application, Storefront, Location, listing, import                                                                                                                                                                                                                                                                                     |
| `API-020`–`029` | discovery         | Catalog/Discovery        | search, detail, saved/follow, recommendation preference                                                                                                                                                                                                                                                                                |
| `API-030`–`039` | goods/fulfillment | Inventory/Ordering       | private stock movement/availability (`POST /v1/inventory/movements`, `GET /v1/inventory/listings/:listingId/availability`); public Product stock check (`GET /v1/public/listings/:listingId/availability`); goods Location configuration; Customer quote/hold/read/release (`/v1/customer/goods/*`); Order, pickup/delivery milestones |
| `API-040`–`049` | scheduling        | Scheduling/Booking       | availability, hold, Booking, amendment, attendance                                                                                                                                                                                                                                                                                     |
| `API-050`–`059` | checkout/finance  | Checkout/Payments/Ledger | Cart, quote, hold, payment status, receipt, earnings                                                                                                                                                                                                                                                                                   |
| `API-060`–`069` | trust/engagement  | Trust/Support            | return, dispute, SupportCase, review, inquiry, moderation                                                                                                                                                                                                                                                                              |
| `API-070`–`079` | operations/demo   | Platform/Demo            | reconciliation, approval, audit, demo workspace/persona                                                                                                                                                                                                                                                                                |

Example command contracts must name authorization scope, idempotency requirement, aggregate/state guard, normal/failure response, emitted event, asynchronous work, and reconciliation endpoint. Capability routes are not an implementation commitment or public API availability statement.

Phase 02 P02-C06 local public-read addition: `GET /v1/public/listings/:listingId` includes nullable `goodsConfiguration` on public Locations (pickup eligibility, Standard/Flexible return template and delivery zones/fees/minimums/ETA). This is advisory selection context; Customer quotes and holds revalidate publication, current configuration, price and stock. Private goods-configuration writes remain Owner-scoped.

Phase 02 `P02-C07` controlled local proof APIs:

- `POST /v1/customer/goods/payments` starts one payment window for a Customer-owned hold with an idempotency key.
- `POST /v1/customer/goods/payments/:paymentId/local-result` records succeeded/failed/unknown only in local runtime, with server adapter time and held amount/linkage. It is not a production payment webhook.
- `GET /v1/customer/goods/payments/:paymentId` reconciles recorded results and returns current hold/payment/refund/Purchase state; creation/result replay responses preserve original acceptance.
- `GET /v1/customer/goods/purchases/:purchaseId` reads the Customer's immutable paid Purchase and Vendor components.
- `GET /v1/vendor/goods/orders/:orderId` reads only the assigned active Owner's Vendor/Location Order. Private workspace/provider receipts are not exposed.

See [local evidence and Phase 04 provider/finance limits](../requirements/PHASE-02-GOODS-COMMERCE.md#p02-c07--paid-goods-order-commitment--2026-10-12).

Phase 02 `P02-C08` private cancellation APIs:

- `POST /v1/vendor/goods/orders/:orderId/cancellations`: assigned current Owner, idempotency key, reason and exact line quantities/disposition; transactionally appends effects and a pending refund.
- `POST /v1/platform/goods/orders/:orderId/cancellations`: same bounded command under a live expiring Order-specific Finance grant; no catalog-review escalation.
- `GET /v1/platform/goods/orders/:orderId`: only the Order covered by that Finance grant.
- `GET /v1/goods/cancellations/:cancellationId`: current refund state for the owning Customer, assigned Owner or scoped Finance actor. Command replay represents original acceptance.

Purchase/Order reads now expose original snapshots plus cancelled/remaining quantities and scoped cancellation/refund references. Customer payment reads distinguish cumulative pending/completed refunds and partially_refunded/full refunded state. No caller amount/price/authority fields are accepted. These are local controlled proof surfaces; final live providers/discounts/ledger remain Phase 04. See [P02-C08 evidence](../requirements/PHASE-02-GOODS-COMMERCE.md#p02-c08--partial-cancellation-and-refund-allocation--2026-10-12).
