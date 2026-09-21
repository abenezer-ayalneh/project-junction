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
