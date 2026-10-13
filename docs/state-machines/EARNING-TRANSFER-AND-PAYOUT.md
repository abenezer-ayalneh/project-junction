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

## Local P04-C08 implementation — 2026-10-13

One mixed allocation is an earning lot; its append-only revisions carry a conserved integer-minor-unit partition, allowing unaffected units to be available while claimed units remain frozen. Sources are immutable original funding plus additive capture, recorded handoff/attendance, ReturnCase states, Booking contest and acknowledged refund ledger facts. Pending refunds occupy a separate unavailable partition until completion; refund completion does not deduct twice. Original line policy anchors goods availability. Booking no-show retains the locally verified Phase 03 finalization + 48-hour delay. Closed no-refund goods cases restore affected pending/available value according to the unchanged deadline.

`EarningAvailabilityChanged` carries allocation ID/version in the actual seller workspace; no private any-Staff data or browser financial authority is added. Changed revisions, audit and outbox are atomic with existing commerce actions; replay/current worker/read recovery adds no duplicate revision. Raw revision inserts must match the source-derived classification at the server observation time; version gaps, unchanged append, update/delete/truncate and forged balances fail. Policy-worker observations are monotonic per allocation. `GET /v1/vendor/earnings` is scoped/no-store and claims no transfer. C09 owns Batched/Transfer/Paid; formal case decisions remain in the owning case context. [C08 evidence](../quality/PHASE-04-LOCAL-ACCEPTANCE-EVIDENCE.md#p04-c08--earning-release-and-scoped-freezes--2026-10-13).
