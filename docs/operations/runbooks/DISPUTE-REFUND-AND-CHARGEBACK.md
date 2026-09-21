# RUN-011 — Dispute, Refund, and Chargeback

**Status:** Specified — Not Executed — Not Verified  
**Target owner:** Support/Trust case owner with Finance approval at the applicable risk tier  
**Trigger:** A Customer requests a return/refund, opens a dispute, contests a Booking/no-show outcome, or a payment provider reports a chargeback-like event.

## Safeguards

- Open an in-app Support Case and link only the relevant component: Purchase, VendorOrder, fulfillment, Booking, return/dispute, policy snapshot, evidence, provider reference, and ledger entries.
- Apply the snapshotted policy rather than a later policy value: goods change-of-mind/fault rules, failed delivery/pickup rules, or Flexible/Standard Booking cancellation/amendment/no-show rules. A Product exchange is always a return/refund followed by a new Purchase.
- Preserve evidence, communications, provider inbox/payloads, and financial state. Protect affected earnings/payout eligibility when necessary but do not hold unrelated funds.
- No historical ledger edits, unreviewed discretionary refund, manufactured provider outcome, or unilateral high-risk action. Customer/Vendor communications stay factual and respect case visibility.

## Target procedure

1. Classify the request or provider event and confirm the identity/authority of the actor. Identify the applicable policy snapshot, time boundary, component value, fulfillment/attendance evidence, and existing case history.
2. Collect and preserve only necessary evidence: handoff/delivery proof, pickup status, service attendance/no-show evidence, communications, listing/service snapshot, and provider reference. Give the other affected party the policy-defined opportunity to respond or contest.
3. Determine eligibility and outcome—full, partial, or no refund; return/inspection; cancellation/amendment consequence; or chargeback response—using the declared state-machine and policy path.
4. Obtain the required approval, issue the approved domain transition and any provider/ledger compensation, and update earning/payout eligibility only for the affected component.
5. Reconcile provider and ledger state, send permitted outcome communications, preserve an audit trail, and close only when the case, money, and customer-facing state agree.

## Rollback, recovery, and escalation

- Correct a mistaken outcome through an approved compensating/refund/reversal event or case reopening; do not overwrite previous money or case history.
- For an external payment mismatch, missed provider deadline, or payout collision, invoke [RUN-007](PAYMENT-LEDGER-AND-PAYOUT-MISMATCH.md). For provider downtime, use [RUN-005](PROVIDER-OUTAGE.md). Suspected fraud, account takeover, or data disclosure goes to [RUN-013](SECURITY-INCIDENT-AND-DATA-BREACH.md).
- Escalate to independent Finance/Trust review when the risk tier requires dual control, the evidence conflicts, an appeal is involved, a chargeback-like event could affect other commitments, or future legal/regulatory interpretation is needed.

## Verification and evidence

Create restricted `EVD-OPS-*` evidence with case/component ID, snapshotted policy, eligibility calculation, evidence inventory, notices, approvals, state/event IDs, provider/ledger reconciliation, earning/payout treatment, and final outcome. Future execution must demonstrate `TST-P05-001`, `TST-P05-004`, and relevant goods/Booking acceptance scenarios.

## Related normative documents

- [Policy catalog and snapshots](../../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
- [Return, dispute, and support case state](../../state-machines/RETURN-DISPUTE-AND-SUPPORT-CASE.md)
- [Reconciliation and financial operations](../RECONCILIATION-AND-FINANCIAL-OPERATIONS.md)
