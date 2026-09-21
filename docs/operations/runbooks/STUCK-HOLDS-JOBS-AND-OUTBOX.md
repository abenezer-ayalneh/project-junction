# RUN-006 — Stuck Holds, Jobs, and Outbox

**Status:** Specified — Not Executed — Not Verified  
**Target owner:** Platform Owner with the owning Inventory, Checkout, Booking, or background-work context  
**Trigger:** A hold exceeds its declared expiry, a job retries/exhausts unexpectedly, an outbox event is delayed, or a projection/callback backlog violates its target.

## Safeguards

- Classify the affected aggregate and environment first. Preserve authoritative Checkout/Booking/Inventory state, hold expiry, idempotency key, outbox record, worker lease, job attempts, and provider correlation.
- Do not delete queue records, manually mutate stock/slot counts, force a hold closed in the database, or re-run work while another worker may still own it.
- Projection state is rebuildable; an Order, Booking, payment, ledger posting, hold, or policy snapshot is not. Respect per-aggregate ordering and concurrency guards.

## Target procedure

1. Determine whether the condition is an expired hold, live-but-slow worker, failed/retry-exhausted job, stuck outbox relay, duplicate event, provider wait, or stale projection. Record the canonical aggregate version and current state-machine transition.
2. Check worker lease/heartbeat and idempotency ownership before retrying. If an active owner exists, avoid concurrent execution; if no owner exists, perform only the declared idempotent retry/replay path.
3. Release or expire a goods/slot hold only through its state-machine transition and emitted event. Preserve the original Checkout/Booking result rather than silently reopening or re-pricing it.
4. Replay committed outbox work with its original identifiers, rebuild search/realtime/analytics projections from source when appropriate, and retain dead-letter evidence until resolution.
5. Reconcile downstream provider response, notification state, financial effect, and user-visible aggregate state before closing the incident.

## Rollback, recovery, and escalation

- If a retry could duplicate money, fulfillment, Booking allocation, or external communication, stop and escalate rather than guessing. Financial effects go to [RUN-007](PAYMENT-LEDGER-AND-PAYOUT-MISMATCH.md); provider uncertainty goes to [RUN-005](PROVIDER-OUTAGE.md).
- Do not reverse a committed authoritative transition through database repair. Use the documented compensation/state transition or open the linked case.
- Escalate to the Platform Owner and owning context when lease ownership, aggregate ordering, state guard, or provider result is uncertain.

## Verification and evidence

Record `EVD-OPS-*` evidence with aggregate/job/outbox IDs, before/after state/version, lease/retry evidence, state transition/event IDs, projection rebuild/cursor result, affected provider/financial reconciliation, and final customer-visible outcome. Future proof must include `TST-P00-004` and the relevant concurrency scenario.

## Related normative documents

- [Background jobs, outbox, and reconciliation](../../architecture/BACKGROUND-JOBS-OUTBOX-AND-RECONCILIATION.md)
- [Inventory, hold, checkout, and payment state](../../state-machines/INVENTORY-HOLD-CHECKOUT-AND-PAYMENT.md)
- [Booking, meeting, amendment, and attendance state](../../state-machines/BOOKING-MEETING-AMENDMENT-AND-ATTENDANCE.md)
