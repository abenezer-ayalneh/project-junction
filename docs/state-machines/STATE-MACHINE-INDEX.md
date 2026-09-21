# State Machine Index

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** lifecycle index and transition contract

Every transition defines actor, guard, side effect/event, timeout/terminal outcome, and recovery path in its machine. State is never altered by direct database repair; recovery emits an explicit command/event/correction.

| ID                  | Machine                            | Authority                           |
| ------------------- | ---------------------------------- | ----------------------------------- |
| `STATE-VND-001`     | Vendor application                 | Vendor/Catalog/Trust                |
| `STATE-LISTING-001` | listing revision and publication   | Vendor/Catalog/Trust                |
| `STATE-MED-001`     | media asset                        | Catalog/Media                       |
| `STATE-INV-001`     | inventory movement                 | Inventory                           |
| `STATE-CHK-001`     | CheckoutHold                       | Checkout                            |
| `STATE-PAY-001`     | payment attempt                    | Payments/Reconciliation             |
| `STATE-ORD-001`     | Purchase and Vendor Order          | Ordering/Fulfillment                |
| `STATE-FUL-001`     | fulfillment                        | Ordering/Fulfillment                |
| `STATE-BKG-001`     | Booking, amendment, and attendance | Scheduling/Booking                  |
| `STATE-MTG-001`     | meeting provision                  | Scheduling/Booking/Provider adapter |
| `STATE-RET-001`     | return, dispute, Support Case      | Trust/Support                       |
| `STATE-EARN-001`    | earning, transfer, payout          | Ledger/Finance                      |
| `STATE-TRUST-001`   | moderation and appeal              | Trust & Safety                      |
| `STATE-DEMO-001`    | demo workspace                     | Demo controller                     |

Projection state (search, analytics, realtime) is not lifecycle authority and may be rebuilt/reconciled from events.
