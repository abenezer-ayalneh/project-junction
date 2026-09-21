# RUN-002 — Migration Failure

**Status:** Specified — Not Executed — Not Verified  
**Target owner:** Platform Owner with the owning context and database reviewer  
**Trigger:** A schema/data migration errors, times out, exceeds its lock/capacity expectation, or leaves application behavior uncertain.

## Safeguards

- This is an unexecuted target procedure. Do not manually edit production rows, mark a failed migration successful, or bypass the environment migration lock.
- Stop further promotion, preserve the release/migration identifier and sanitized logs, and record the exact observed schema head before attempting recovery.
- Fence only the unsafe capability with maintenance or read-only behavior when that can be done without violating commitments. Keep unrelated safe capabilities available where possible.
- Treat the database, migration history, committed outbox records, Orders, Bookings, payments, and ledger as evidence. Do not use a restore as a routine release rollback.

## Target procedure

1. Classify the condition: not started, transaction rolled back, schema expanded but application unhealthy, partial/backfill failure, or suspected data corruption. Confirm this from authoritative migration metadata rather than dashboard inference.
2. Preserve the environment lock and prevent a second migration or competing backfill. Capture affected context, table/index/constraint, lock and disk/WAL signals, and versioned artifact information.
3. Validate whether the failed operation was atomic and whether pre- and post-migration application versions remain compatible. Run only reviewed structural and invariant checks appropriate to the incident scope.
4. Select the preapproved path: resume a bounded idempotent backfill, deploy the compatible prior artifact, apply a reviewed forward repair, or leave the capability contained pending investigation. Contract changes remain a separate later release.
5. Reconcile all committed external/domain effects around the event boundary: outbox/job delivery, provider callbacks, payment/ledger state, Purchase/Order fulfillment, and Booking commitments.
6. Reopen the capability only after the schema head, application compatibility, projections, queues, and affected critical journeys pass their declared checks.

## Rollback, recovery, and escalation

- Application artifact rollback is allowed only while the expanded schema is demonstrably compatible. Do not run an unreviewed down migration or reverse data mutation.
- If corruption, material data loss, or loss of the authoritative database is suspected, freeze unsafe writes and invoke [RUN-003](BACKUP-PITR-AND-CLEAN-HOST-REBUILD.md). If a financial or provider inconsistency appears, invoke [RUN-007](PAYMENT-LEDGER-AND-PAYOUT-MISMATCH.md).
- Escalate to the Platform Owner and owning context when lock behavior, data transformation state, or compatibility is not provable; escalate to [RUN-013](SECURITY-INCIDENT-AND-DATA-BREACH.md) if the failure may involve unauthorized change or disclosure.

## Verification and evidence

Create `EVD-OPS-*` evidence containing incident/migration IDs, pre/post schema heads, artifact IDs, lock duration, affected aggregates, invariant results, reconciliation result, rollback/repair decision, approvals, and residual risk. Future evidence must satisfy the migration/release portion of `TST-P06-005`.

## Related normative documents

- [Migration and compatibility strategy](../../data/MIGRATION-AND-COMPATIBILITY-STRATEGY.md)
- [Database migrations, rollout, and rollback](../../deployment/DATABASE-MIGRATIONS-ROLLOUT-AND-ROLLBACK.md)
- [Cross-context invariants](../../domain/CROSS-CONTEXT-INVARIANTS.md)
