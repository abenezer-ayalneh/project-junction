# RUN-001 — Deploy and Rollback

**Status:** Specified — Not Executed — Not Verified  
**Target owner:** Platform Owner, with a named release approver and rollback owner  
**Trigger:** A planned staging or portfolio-production release, or a release whose safety/availability signal requires containment.

## Safeguards

- Treat this as a prospective procedure only. No target deployment, artifact, environment, or rollback has been executed or verified.
- Promote only an immutable, reviewed artifact that passed the applicable [release gate](../../requirements/PHASE-AND-RELEASE-GATES.md), staging evidence, and [promotion contract](../../deployment/CI-CD-AND-RELEASE-PROMOTION.md).
- Record the current artifact digest, schema head, feature configuration, health, active incidents, and recent backup/WAL health before changing anything. The real-runtime schema cutover removes retired demo tables, so recovery uses the protected pre-migration backup rather than an application-binary downgrade.
- Name the operator, approver, change window, communications owner, and stop condition. Do not combine a release with an unreviewed policy, data-repair, or financial correction.
- Keep the portfolio environment synthetic and isolated; a release must not promote demo data or imply commercial operation.

## Target procedure

1. Create a change record containing the target artifact, migration package, expected capability change, dependencies, and planned verification journeys.
2. Confirm the target environment, origin/TLS controls, secret scope, capacity headroom, and migration lock. Halt if the release is not backward-compatible with the currently deployed schema.
3. Apply only the reviewed, expand-compatible migration path and deploy the exact artifact in the documented dependency order. Keep prior compatible artifact information available for an application rollback.
4. Require readiness from the authoritative data store, API, worker/outbox relay, web surface, search projection, object boundary, monitoring, and backup heartbeat before exposing the change.
5. Run safe synthetic smoke journeys for access isolation, goods/Booking commitment, provider callback handling, and no-side-effect public-demo behavior. Observe error rate, latency, queue lag, reconciliation exceptions, and cleanup health through the defined soak period.
6. Either close the change with evidence or stop promotion. A failed gate is a release failure, not an invitation to bypass the gate.

## Rollback, recovery, and escalation

- For an application-only fault while the expanded schema remains compatible, contain the feature or return to the prior approved artifact. Verify the restored artifact against the same health and smoke checks.
- For a migration failure, preserve the migration state and follow [RUN-002](MIGRATION-FAILURE.md). For corruption or an unavoidable restore decision, follow [RUN-003](BACKUP-PITR-AND-CLEAN-HOST-REBUILD.md).
- Never use deployment rollback to erase a provider effect, ledger posting, Order, Booking, or valid post-release data. Financial consequences follow [RUN-007](PAYMENT-LEDGER-AND-PAYOUT-MISMATCH.md); a suspected compromise follows [RUN-013](SECURITY-INCIDENT-AND-DATA-BREACH.md).
- Escalate when migration compatibility is unknown, required readiness cannot be established, customer-visible effects cannot be contained, or a rollback would discard valid writes.

## Verification and evidence

Record a new `EVD-OPS-*` entry with release/previous artifact IDs, schema state, approvers, timestamps, health and smoke results, alert/metric observations, any rollback, affected scope, and final disposition. The future release must also retain the acceptance evidence required by `TST-P06-005` in the [phase acceptance catalog](../../quality/PHASE-ACCEPTANCE-CATALOG.md).

## Related normative documents

- [Portfolio-production deployment](../../deployment/PORTFOLIO-PRODUCTION-DEPLOYMENT.md)
- [Database migrations, rollout, and rollback](../../deployment/DATABASE-MIGRATIONS-ROLLOUT-AND-ROLLBACK.md)
- [Monitoring, alerting, and status page](../MONITORING-ALERTING-AND-STATUS-PAGE.md)
