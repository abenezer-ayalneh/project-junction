# RUN-007 — Payment, Ledger, and Payout Mismatch

**Status:** Specified — Not Executed — Not Verified  
**Target owner:** Finance, with Support/Trust context as needed and distinct approval at the applicable risk tier  
**Trigger:** An unmatched payment, refund, transfer, payout, fee, rounding, webhook, earning-release, or ledger exception is detected.

## Safeguards

- Open a scoped reconciliation case and freeze only affected earning/payout eligibility. Do not freeze unrelated Vendor funds or valid commitments merely to simplify investigation.
- Preserve the external provider reference/payload, verified webhook inbox record, Checkout/Purchase/VendorOrder/Booking state, policy snapshot, earnings state, and immutable ledger postings.
- Never edit/delete historical postings, mark unknown funds settled, release an affected payout to clear a queue, or manufacture a provider result. The permitted correction path is a reviewed domain transition and/or compensating posting.
- Keep Customer and Vendor messages factual, scoped, and separate from an unverified finding. Ordinary processor/dispute fees remain Junction cost under `POL-FIN-003`; this is not a basis to alter a Vendor's historical earning.

## Target procedure

1. Identify the exception type and affected value/component: incoming payment, refund, transfer, payout, fee/rounding, duplicate/stale callback, hold/payment race, or post-recovery discrepancy.
2. Compare authoritative provider records against the signed/verified inbox, Checkout/Booking commitment, Purchase/VendorOrder state, ledger postings, earning availability, and previous reconciliation evidence. Preserve the full correlation chain.
3. Determine whether the difference is timing, duplicate delivery, missing external confirmation, a policy/state issue, or an actual financial discrepancy. Do not let a projection or notification override the authoritative result.
4. Obtain the maker/checker approval required by the risk tier. Apply the approved refund, reversal, compensating posting, payout hold/release, or case outcome through the declared state and ledger contracts.
5. Reconcile the new authoritative result, notify the affected parties with the decision/outcome allowed by the case, and retain the exception until all required balances and external statuses agree.

## Rollback, recovery, and escalation

- An erroneous operational action is corrected with an approved compensating event/posting and clear case evidence; it is never silently overwritten. Product exchange remains return/refund followed by a new Purchase.
- Provider ambiguity or outage invokes [RUN-005](PROVIDER-OUTAGE.md); stuck webhook/job processing invokes [RUN-006](STUCK-HOLDS-JOBS-AND-OUTBOX.md); a point-in-time-recovery boundary invokes [RUN-003](BACKUP-PITR-AND-CLEAN-HOST-REBUILD.md).
- Escalate to the Platform Owner, Finance checker, and affected owner when funds could leave the system, a payout has already completed, a chargeback-like event has a deadline, dual control cannot be achieved, or the case suggests fraud/security compromise.

## Verification and evidence

Create restricted `EVD-OPS-*` evidence with case ID, affected component/value (without unnecessary personal data), provider and inbox references, pre/post ledger balance, policy/state/approval basis, compensating action if any, payout status, communication record, and exception closure. Future proof must include `TST-P05-004` and `TST-P04-003` where applicable.

## Related normative documents

- [Payments, ledger, promotions, and payouts](../../domain/PAYMENTS-LEDGER-PROMOTIONS-AND-PAYOUTS.md)
- [Money and double-entry ledger](../../data/MONEY-AND-DOUBLE-ENTRY-LEDGER.md)
- [Reconciliation and financial operations](../RECONCILIATION-AND-FINANCIAL-OPERATIONS.md)
