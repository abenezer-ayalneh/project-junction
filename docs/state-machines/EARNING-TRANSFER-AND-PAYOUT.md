# Earning, Transfer, and Payout State Machines

**Status:** Specified — Not Executed — Not Verified

## `STATE-EARN-001`

| From → to                         | Actor                   | Guard                                                              | Side effect                                 | Timeout/terminal/recovery                               |
| --------------------------------- | ----------------------- | ------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------- |
| Pending → Available               | policy worker           | Product 7/14 window or Booking 48-hour contest complete; no freeze | `EVT-EARNING-AVAILABLE`                     | late dispute can freeze affected available/future value |
| Pending/Available → Frozen        | case/Finance authority  | affected Return/Dispute/chargeback                                 | exclusion from payout                       | release/refund/reverse through case                     |
| Available → Batched               | payout worker           | eligible balance, minimum, schedule, not frozen                    | PayoutBatch/transfer command                | idempotent batch identity                               |
| Batched → TransferPending → Paid  | provider/reconciliation | verified transfer/payout outcome                                   | statements/ledger event                     | unknown/outage stays reconcile                          |
| TransferPending → Failed/Reversed | provider/Finance        | verified outcome                                                   | compensation/negative payable as applicable | retry only stable operation id                          |

Payout is no arbitrary wallet withdrawal. Chargeback principal defaults to Vendor economic balance; approved Platform override retains audit. Ordinary processor/dispute fees are Junction cost. No transition edits a ledger posting.
