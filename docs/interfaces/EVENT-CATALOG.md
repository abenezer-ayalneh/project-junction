# Event Catalog

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** domain-event contracts and consumers

| ID        | Event family                                     | Producer           | Consumers / ordering / recovery                                            |
| --------- | ------------------------------------------------ | ------------------ | -------------------------------------------------------------------------- |
| `EVT-001` | `VendorApplication*`, `VendorRestricted`         | Vendor/Trust       | operations, audit; per aggregate order; appeal event corrects state        |
| `EVT-010` | `Listing*`, `Media*`, `Import*`                  | Catalog            | search, moderation, notifications; rebuild projection from source          |
| `EVT-020` | `StockMoved`, `HoldCreated/Released/Expired`     | Inventory/Checkout | availability/search/ops; idempotent projection; release compensation       |
| `EVT-030` | `Checkout*`, `PurchaseCreated`, `Payment*`       | Checkout/Payments  | Orders, Bookings, Ledger, notification; inbox/outbox/reconciliation        |
| `EVT-040` | `VendorOrder*`, `Fulfillment*`                   | Ordering           | Customer/Vendor views, trust, earnings policy; evidence preserved          |
| `EVT-050` | `Booking*`, `Meeting*`, `Attendance*`            | Booking            | meeting adapter, notification, earnings; idempotent asynchronous provision |
| `EVT-060` | `Return*`, `Dispute*`, `SupportCase*`, `Review*` | Trust/Support      | ledger, notifications, moderation, audit; compensating decision event      |
| `EVT-070` | `Ledger*`, `Earning*`, `Transfer*`, `Payout*`    | Ledger/Finance     | reconciliation/statements; never mutate historic posting                   |
| `EVT-080` | `Notification*`, `Analytics*`, `DemoWorkspace*`  | Engagement/Demo    | delivery/projection/cleanup; no transactional authority                    |

Events carry immutable event ID, aggregate ID/version, causation/correlation/idempotency IDs, time, schema version, environment/workspace scope, producer, and minimal safe payload. Transactional outbox ensures committed source state; consumer inbox/dedup/retry/dead-letter/replay handles delivery. Ordering is guaranteed only per aggregate/source sequence; consumers reconcile from REST/source truth after gap.

Local `P02-C07` stored event names are `GoodsPaymentStarted`, `GoodsPaymentUnknown`, `GoodsPaymentFailed`, `GoodsPaymentResultRecorded`, `GoodsPurchaseCommitted`, `GoodsVendorOrderConfirmed`, `GoodsRefundRequested` and `GoodsRefundCompleted`, alongside `StockMoved` sold movements and hold release/expiry. Purchase/Order/stock/audit/outbox effects share one transaction; provider receipts are durable before their business reconciliation. Customer events use the Customer workspace and Vendor Order/stock events use only their Vendor workspace. The local refund operation and event IDs are stable across retry; no live finance/ledger/provider effect is claimed.

Local `P02-C08` adds `GoodsOrderPartiallyCancelled`, `GoodsOrderCancelled` and `GoodsCancellationReviewRequested` with existing `GoodsRefundRequested`/`GoodsRefundCompleted` and `StockMoved` effects. Vendor Order/stock events use that Vendor's workspace; Customer refund/review records use the Customer workspace. Quantity/disposition/value allocations, scoped refund intent, state, audit, outbox and replay outcome commit together. Review-required facts are durable; actual post-action review processing remains separately gated.

Local `P02-C09` adds `GoodsFulfillmentCreated`, `GoodsOrderPreparing`, `GoodsPickupReady`, `GoodsPickupAcknowledged`, `GoodsPickupCollected`, `GoodsPickupProofRejected`, `GoodsPickupExpired`, `GoodsPickupInspected` and `GoodsFulfillmentCancelled`. Events expose resource/status references and authoritative time, never collection codes or private evidence text. Ready/collected/expiry/inspection create durable Customer notification work; actual channel-delivery acceptance remains separate.

Local `P02-C10` adds `GoodsDeliveryMilestoneRecorded` for dispatch, failure, correction, verified delivery, deadline expiry and terminal inspection. Payloads contain resource/status/time references, never collection codes, address details or witness statements. Milestones and handoff/inspection evidence are immutable; stock/refund recovery uses the existing cancellation outbox transaction. Customer acknowledgement and rejected primary proof attempts are audited.

Local `P02-C11` adds `GoodsReturnRecorded` with resource/action references for submission, decision, shipment, receipt, inspection and resolution. Customer and Vendor workspaces receive their scoped reference events, without private evidence. Immutable case events retain the detailed evidence. Accepted refunds use existing `GoodsRefundRequested`/`GoodsRefundCompleted`, compensating stock and scoped allocation events; original sale facts remain immutable. Formal earning freezes and ledger reversals depend on Phase 04.

Local `P03-C01` definition events are `ServiceConfigured`, `StaffProfileCreated`, `StaffProfileUpdated` and `StaffPublicConsentChanged`. They use only the owning Vendor workspace and stable aggregate IDs/versions; minimal payloads contain Listing/Staff IDs and omit profile names, User links and qualification lists. Configuration/profile state, audit, outbox and replay outcome share a transaction; retries do not append duplicates. These are durable definition facts, with no slot reservation, Booking or meeting-provider side effect. Remote delivery/provider acceptance is not claimed.
