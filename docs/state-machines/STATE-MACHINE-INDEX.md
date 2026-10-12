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

Local `P02-C10` delivery progress starts at dispatch (`out_for_delivery`, attempt 1). First evidenced failure enters `delivery_failed` with a fixed 48-hour deadline. One Customer-confirmed correction inside the paid zone enters `out_for_delivery`, attempt 2, without changing that deadline or paid snapshots. Verified handoff enters `delivered`; second failure or deadline expiry enters `inspection_pending`. Only complete quantity inspection and atomic stock/refund allocation enter `inspection_completed`. Five rejected primary proofs lock code/QR while controlled fallback remains available. Generic fulfillment reads derive delivery state and authoritative time from this progress record.

Local Phase 04 C02 advisory quote status is derived from immutable snapshot and current Cart revision/time: `expired` at `now >= expiresAt`, otherwise `stale` when the Cart revision changed, otherwise `conflicts` when current evaluation recorded a conflict, otherwise `ready`. This is quote review status, not `STATE-CHK-001` hold authority; readiness grants no resource guarantee. A quote is never rewritten or renewed by replay, and a changed Cart requires explicit fresh quoting. Unavailable or repriced components block coordinated readiness without committing unaffected components separately.
