# Purchase, Order, and Fulfillment State Machines

**Status:** Specified — Not Executed — Not Verified

## `STATE-ORD-001` — Purchase and Vendor Order

Purchase is created committed once; it is a grouping, not a generic downstream status. Its components transition independently.

| From → to                                          | Actor                         | Guard                            | Side effect                                              | Timeout/terminal/recovery          |
| -------------------------------------------------- | ----------------------------- | -------------------------------- | -------------------------------------------------------- | ---------------------------------- |
| Created → VendorOrderConfirmed                     | Checkout                      | verified paid goods component    | snapshotted Order and earnings pending                   | Vendor cancellation is exceptional |
| Confirmed → Preparing                              | authorized Fulfillment member | Vendor/Location scope            | `EVT-ORDER-PREPARING`                                    | operational retry/audit            |
| Confirmed/Preparing → PartiallyCancelled/Cancelled | authorized Vendor/Platform    | exceptional policy/line quantity | proportional refund/ledger, unaffected components remain | audit/compensation                 |

## `STATE-FUL-001` — Fulfillment

| From → to                           | Actor                       | Guard                                 | Side effect                       | Timeout/terminal/recovery     |
| ----------------------------------- | --------------------------- | ------------------------------------- | --------------------------------- | ----------------------------- |
| Preparing → ReadyForPickup          | Fulfillment member          | pickup method                         | Customer notification/code window | pickup policy clock           |
| Preparing → DeliveryInProgress      | Fulfillment member          | delivery method/zone/address snapshot | milestone event                   | no driver/GPS state           |
| DeliveryInProgress → Delivered      | Fulfillment member          | handoff proof/evidence                | earning policy timing starts      | dispute can challenge         |
| ReadyForPickup → Collected          | Customer + staff / fallback | code/QR or controlled evidence        | handoff event                     | pickup timeout route          |
| DeliveryInProgress → DeliveryFailed | Fulfillment member          | reason/evidence                       | one corrected retry deadline      | retry within 48h or aftercare |

Pickup window is 72 hours with 48-hour grace; expire follows return/inspection/refund path. No state can erase its prior proof/audit.

Local `P02-C07` evidence verifies one paid goods Purchase with complete immutable snapshots and auto-confirmed independent Vendor Orders, idempotent concurrent commitment, sold inventory links and current Customer/assigned Owner read scope. Cancellation and fulfillment transitions remain for `P02-C08` onward; final earning/ledger effects remain Phase 04. See [local payment/Order evidence](../requirements/PHASE-02-GOODS-COMMERCE.md#p02-c07--paid-goods-order-commitment--2026-10-12).

Local `P02-C08` implements Confirmed → PartiallyCancelled/Cancelled for selected paid quantities while retaining immutable Purchase/Order/line snapshots and independent component state. Complete quantity/value/stock effects and one pending refund commit atomically; known completed partial refunds never imply that unrelated value is refunded. Exact full-group cancellation refunds original delivery fee once, while partial cancellation preserves thresholds. Current assigned Owner or expiring Order-scoped Finance authority is required; every action records reason and post-action review work. Restricted Vendor recovery remains limited to existing commitments. Pickup/delivery execution, after-handoff returns and final earning/ledger effects remain for following chunks/Phase 04. See [P02-C08 evidence](../requirements/PHASE-02-GOODS-COMMERCE.md#p02-c08--partial-cancellation-and-refund-allocation--2026-10-12).
