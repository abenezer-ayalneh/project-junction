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
