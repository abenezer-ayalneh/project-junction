# RUN-003 — Backup, PITR, and Clean-Host Rebuild

**Status:** Specified — Not Executed — Not Verified  
**Target owner:** Platform Owner, with Finance checking any recovery point that can omit post-point financial effects  
**Trigger:** A scheduled recovery drill, authoritative data/host loss or corruption, or an approved point-in-time recovery decision.

**Target objective:** PostgreSQL RPO of 15 minutes and total-host RTO of four hours. These are targets, not achieved service levels, until future drill evidence exists.

## Safeguards

- Declare the recovery scope and select a target time before modifying the damaged service. Preserve the damaged host/database, sanitized logs, and backup metadata as evidence.
- Fence the old writer before any restored service can accept writes. Do not overwrite the damaged source merely to make recovery easier.
- Use an isolated clean recovery environment until validation completes. Demo, staging, portfolio-production, and future commercial data must remain separate; demo data is never promoted.
- Require distinct approval for a recovery point that can discard valid post-point data, and document expected data loss before cutover.

## Target procedure

1. Verify backup repository availability, encryption/recovery material access, media-copy scope, target timestamp, migration history, and compatible application artifact without exposing recovered data publicly.
2. Rebuild the target host from the documented source of truth, using isolated network access and least-privilege replacement credentials. Restore the authoritative database to the approved point and required immutable media/configuration references.
3. Validate integrity before opening traffic: schema head, migration history, row/count/checksum controls, committed references before the recovery point, policy snapshots, and balanced ledger postings.
4. Rebuild non-authoritative Redis/BullMQ, search, realtime, and analytics projections from authoritative state/events. Replay only safe, idempotent outbox work after checking for provider effects around the recovery boundary.
5. Reconcile provider callbacks, pending Checkouts, Purchase/Order/Booking commitments, refunds, earnings, and payout eligibility. Do not infer a missing provider result as success.
6. Run critical synthetic journeys, verify origin/health/monitoring/backup heartbeats, then perform a controlled cutover only when all declared acceptance conditions pass.

## Rollback, recovery, and escalation

- If validation fails, keep the restored environment isolated, retain the old writer fenced, and select an earlier recovery point or a reviewed repair path. Do not expose an unverified restore.
- A recovered host may be taken out of service before cutover; do not attempt a data-destructive "rollback" of the recovery. Any post-point financial/provider mismatch follows [RUN-007](PAYMENT-LEDGER-AND-PAYOUT-MISMATCH.md); exposure or compromise follows [RUN-013](SECURITY-INCIDENT-AND-DATA-BREACH.md).
- Escalate immediately if recovery material, media, provider callback verification, ledger balance, or environment isolation cannot be proven.

## Verification and evidence

Create restricted `EVD-OPS-*` evidence with incident/drill ID, selected recovery point, backup/restore integrity result, restored scope, achieved RPO/RTO, missing data assessment, reconciliation result, clean-host validation, cutover decision, approvals, and remediation owner. Future drills must provide the evidence required by `TST-P06-002`.

## Related normative documents

- [Backup, restore, and disaster recovery](../../deployment/BACKUP-RESTORE-AND-DISASTER-RECOVERY.md)
- [Environment separation](../../deployment/ENVIRONMENT-SEPARATION.md)
- [Money and double-entry ledger](../../data/MONEY-AND-DOUBLE-ENTRY-LEDGER.md)
