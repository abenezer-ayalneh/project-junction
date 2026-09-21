# RUN-012 — Demo Purge Failure

**Status:** Specified — Not Executed — Not Verified  
**Target owner:** Platform Owner and Demo controller owner  
**Trigger:** A no-signup demo workspace reaches its 24-hour lifetime and cleanup does not complete, cleanup reporting is incomplete, or scoped data remains accessible after expiry.

## Safeguards

- This is a prospective control: no demo workspace or purge job currently exists. A future incident must immediately fence the expired workspace/session and revoke its public access links/tokens.
- Record the workspace ID, expiry time, environment boundary, creation metadata, cleanup job/event IDs, quota usage, and every expected namespace before retrying. Do not allow the workspace to be extended merely to hide the failure.
- Demo data is synthetic-only and may never be promoted, converted into a real account, reused as a commercial record, or copied to staging/portfolio production/future commercial environments.

## Target procedure

1. Disable expired access and stop new actions for the specific workspace while leaving other isolated workspaces unaffected.
2. Inventory its scoped database rows, object keys/versions, signed links, search documents, cache keys, jobs, events, notification/provider substitute objects, and telemetry references subject to approved retention.
3. Re-run the declared idempotent cleanup/tombstone workflow with the original workspace scope. Cancel scheduled work, revoke signed links, purge derived projections/caches, and retain only the restricted completion/tombstone evidence required by the retention model.
4. Independently verify that every scoped storage/projection/job/access surface no longer accepts access and that no cross-workspace or non-demo record was selected.
5. Identify the failed cleanup stage, repair the future cleanup design/monitoring before closing, and do not re-enable the expired workspace.

## Rollback, recovery, and escalation

- There is no user-data restoration or promotion path for an expired demo workspace. If a purge retry is unsafe, preserve only minimal restricted evidence, keep access fenced, and escalate for a reviewed repair.
- Invoke [RUN-013](SECURITY-INCIDENT-AND-DATA-BREACH.md) if non-synthetic data, an unauthorized audience, cross-workspace access, or disclosure is suspected. Invoke [RUN-006](STUCK-HOLDS-JOBS-AND-OUTBOX.md) if a durable cleanup job/outbox failure is the cause.
- Escalate if any scoped surface cannot be enumerated, the 24-hour enforcement boundary is not provable, or storage/provider cleanup semantics are uncertain.

## Verification and evidence

Create restricted `EVD-OPS-*` evidence with workspace ID, expiry/fence times, scoped namespaces checked, cleanup event/job results, deletion/tombstone evidence, residual-access test, root cause, corrective action, and final disposition. Future proof must satisfy `TST-P00-002` and `TST-P06-001`.

## Related normative documents

- [Isolation, quotas, expiry, and cleanup](../../demo/ISOLATION-QUOTAS-EXPIRY-AND-CLEANUP.md)
- [Demo isolation architecture](../../architecture/DEMO-ISOLATION-ARCHITECTURE.md)
- [Moderation and demo workspace state](../../state-machines/MODERATION-AND-DEMO-WORKSPACE.md)
