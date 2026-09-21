# RUN-005 — Provider Outage

**Status:** Specified — Not Executed — Not Verified  
**Target owner:** Platform Owner with the affected provider/capability owner  
**Trigger:** Confirmed provider status event, sustained failed/error responses, invalid callback burst, or internal telemetry indicating a provider dependency is unavailable or unsafe.

## Safeguards

- Establish provider, capability, environment, time window, correlation IDs, affected aggregates, and whether the issue is externally confirmed or only internally observed. Do not disclose a cause as confirmed before evidence exists.
- Preserve provider callbacks, webhook inbox records, job attempts, and authoritative domain state. Never synthesize payment, meeting, message delivery, map/geocode, identity, or media-processing success.
- Activate only the documented safe degradation for the affected adapter. Keep Checkout/payment state unconfirmed when confirmation is absent; preserve Booking/support access; keep unsafe media quarantined.

## Target procedure

1. Open an incident record and classify the affected adapter: payment, meeting, notification, maps/address, identity/verification, media, storage, or another documented provider contract.
2. Contain unsafe retries and user-visible claims. Queue durable notification intent without claiming delivery; prevent duplicate payment attempts; retain Booking state without fabricating a meeting link; preserve address input when map enrichment is unavailable.
3. Apply bounded, idempotent retries with the original correlation/idempotency information only where the contract permits. Route dead-lettered work for review rather than deleting it.
4. Communicate the observed impact and safe alternative to the affected operation lane and, where appropriate, affected users. Keep messages factual and do not promise provider recovery times.
5. After recovery, reconcile callbacks and source state, replay safe work in order, inspect duplicates/out-of-order delivery, and close the incident only when the backlog and customer-facing state are understood.

## Rollback, recovery, and escalation

- Remove a degradation only after the provider contract and internal verification both show safe recovery. If the provider remains ambiguous, keep the relevant action pending rather than creating a compensating duplicate.
- Invoke [RUN-007](PAYMENT-LEDGER-AND-PAYOUT-MISMATCH.md) for any payment, refund, earning, or payout discrepancy; invoke [RUN-006](STUCK-HOLDS-JOBS-AND-OUTBOX.md) for persistent queue/hold effects; invoke [RUN-013](SECURITY-INCIDENT-AND-DATA-BREACH.md) for signature, credential, or disclosure concerns.
- Escalate to the provider's documented support path with sanitized correlation IDs and the minimum necessary metadata. A replacement provider remains a planned abstraction decision, not an incident-time improvisation.

## Verification and evidence

Create `EVD-OPS-*` and, when applicable, `EVD-PRV-*` evidence with provider/capability, environment, incident window, correlation IDs, degraded behavior, retry/replay result, callback reconciliation, user impact, and final disposition. Future exercises must cover the corresponding provider-failure scenarios in the [quality strategy](../../quality/PROVIDER-CONTRACT-AND-FAILURE-TESTING.md).

## Related normative documents

- [Provider integration contracts](../../architecture/PROVIDER-INTEGRATION-CONTRACTS.md)
- [Webhook contracts](../../interfaces/WEBHOOK-CONTRACTS.md)
- [Provider sandbox and fake adapters](../../environments/PROVIDER-SANDBOX-AND-FAKE-ADAPTERS.md)
