# Runbook Index

**Status:** Specified — Not Executed — Not Verified  
**System claim:** these are prospective procedures; no command or recovery action has been executed.

| ID        | Runbook                                                                                  | Trigger                                            |
| --------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `RUN-001` | [Deploy and rollback](./runbooks/DEPLOY-AND-ROLLBACK.md)                                 | failed or unsafe deployment                        |
| `RUN-002` | [Migration failure](./runbooks/MIGRATION-FAILURE.md)                                     | schema/data migration error                        |
| `RUN-003` | [Backup, PITR, clean-host rebuild](./runbooks/BACKUP-PITR-AND-CLEAN-HOST-REBUILD.md)     | lost/corrupt host or data                          |
| `RUN-004` | [Secret rotation](./runbooks/SECRET-ROTATION.md)                                         | exposure, planned rotation, staff change           |
| `RUN-005` | [Provider outage](./runbooks/PROVIDER-OUTAGE.md)                                         | payment/meeting/message/map/media provider failure |
| `RUN-006` | [Stuck holds, jobs, and outbox](./runbooks/STUCK-HOLDS-JOBS-AND-OUTBOX.md)               | expiry/backlog/retry anomaly                       |
| `RUN-007` | [Payment, ledger, and payout mismatch](./runbooks/PAYMENT-LEDGER-AND-PAYOUT-MISMATCH.md) | financial reconciliation exception                 |
| `RUN-008` | [Search rebuild](./runbooks/SEARCH-REBUILD.md)                                           | corrupt/stale search projection                    |
| `RUN-009` | [Media quarantine failure](./runbooks/MEDIA-QUARANTINE-FAILURE.md)                       | unsafe/media processing issue                      |
| `RUN-010` | [Vendor suspension and appeal](./runbooks/VENDOR-SUSPENSION-AND-APPEAL.md)               | safety/compliance enforcement                      |
| `RUN-011` | [Dispute, refund, and chargeback](./runbooks/DISPUTE-REFUND-AND-CHARGEBACK.md)           | customer financial dispute                         |
| `RUN-012` | [Demo purge failure](./runbooks/DEMO-PURGE-FAILURE.md)                                   | 24-hour demo expiry breach                         |
| `RUN-013` | [Security incident and data breach](./runbooks/SECURITY-INCIDENT-AND-DATA-BREACH.md)     | suspected compromise/disclosure                    |

Every future run must create `EVD-OPS-*` evidence and record deviations; operators must not improvise destructive actions outside declared authority.
