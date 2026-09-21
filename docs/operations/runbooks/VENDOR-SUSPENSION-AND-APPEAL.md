# RUN-010 — Vendor Suspension and Appeal

**Status:** Specified — Not Executed — Not Verified  
**Target owner:** Trust & Safety, with Vendor Operations, Support, and Finance as case scope requires  
**Trigger:** A documented safety, policy, fraud, moderation, fulfillment, or account-risk concern requires a Vendor restriction, suspension, appeal, or reinstatement decision.

## Safeguards

- Open a trust case before enforcement, linking evidence, affected Vendor/workspace/Location, open Orders/Bookings, policy snapshot, risk tier, and permitted communication scope.
- Use the least restrictive action that protects Customers and the Platform. A restricted Vendor retains only access necessary to view records, cooperate with open commitments, and appeal; new customer-facing commitments are blocked as policy requires.
- Do not use suspension to change historical ledger records, suppress a lawful Customer remedy, or avoid a financial exception. High-risk/permanent action and high-risk reinstatement require distinct approval.

## Target procedure

1. Validate the case evidence and scope. Separate observed facts from allegations, determine urgency, and identify existing customer commitments and financial exposure.
2. Select the proportionate state transition—warning, restricted suspension, suspension, or another policy-defined action—and apply it through the declared Vendor/Trust state machine with reason/evidence/audit linkage.
3. Protect open Orders/Bookings: assign permitted operational follow-up, decide fulfillment/refund/support handling under the snapshotted policy, and invoke [RUN-007](PAYMENT-LEDGER-AND-PAYOUT-MISMATCH.md) only for actual financial exceptions.
4. Notify the Vendor with the permitted reason, effect, appeal method, record-access limits, and evidence deadline. Notify affected Customers only about their relevant commitment and remedy, not protected investigative facts.
5. Conduct an appeal review independently where feasible. Record uphold, modify, reinstate, or further-action rationale, required approvals, and any corrective follow-up.

## Rollback, recovery, and escalation

- Reverse or narrow an enforcement action only through the documented state transition after the required review; do not silently restore access or erase audit history.
- Escalate security/fraud indicators to [RUN-013](SECURITY-INCIDENT-AND-DATA-BREACH.md), unsafe media to [RUN-009](MEDIA-QUARANTINE-FAILURE.md), and unresolved customer/financial effects to the linked Support/Finance case and [RUN-007](PAYMENT-LEDGER-AND-PAYOUT-MISMATCH.md).
- Escalate whenever scope crosses Vendor workspaces, a permanent consequence is proposed, dual control is unavailable, an appeal alleges procedural unfairness, or a decision could create legal/regulatory obligations requiring future validation.

## Verification and evidence

Create restricted `EVD-OPS-*` evidence with case ID, policy/risk basis, action/state transition, approvers, affected open commitments, notices, appeal timeline/outcome, and customer-remedy result. Future execution must satisfy `TST-P05-003` and relevant `POL-TRUST-001` controls.

## Related normative documents

- [Abuse, moderation, and appeals](../../security/ABUSE-MODERATION-AND-APPEALS.md)
- [Returns, disputes, support, and reviews](../../domain/RETURNS-DISPUTES-SUPPORT-AND-REVIEWS.md)
- [Moderation and demo workspace state](../../state-machines/MODERATION-AND-DEMO-WORKSPACE.md)
