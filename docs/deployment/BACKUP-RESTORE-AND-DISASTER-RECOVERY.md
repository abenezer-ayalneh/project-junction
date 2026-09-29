# Backup, Restore, and Disaster Recovery

> **Document status:** specified procedure
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-090`, `DEC-094`, `DEC-111`](../governance/DECISION-REGISTER.md)
> **Normative owner:** portfolio backup and recovery targets

## Targets and scope

The PostgreSQL recovery-point objective is 15 minutes and the total-host recovery-time objective is four hours [DEC-111]. These are unverified targets until timed drills pass. pgBackRest sends encrypted full/incremental backups and continuous WAL to a separate Backblaze B2 account/bucket with Object Lock. Required MinIO media versions are copied through an encrypted offsite copy path. Better Stack monitors backup/archival heartbeats.

Backups must cover PostgreSQL, required MinIO media versions, deployment manifests/digests, migration history, Caddy/Compose configuration, encrypted secret sources, and enough infrastructure documentation to rebuild. Redis, BullMQ, and Meilisearch are rebuilt from PostgreSQL and do not require authoritative backup.

## Target backup validation

**Procedure status: Specified — Not Executed — Not Verified.**

- Monitor last successful full/incremental backup, WAL archive age, repository integrity, retention/Object Lock, encryption-key recoverability, media-copy lag, capacity, and failed-file count.
- Keep backup credentials and age recovery material independent of the app host/account.
- Alert before the 15-minute RPO is breached; an alert acknowledgment is not a successful backup.

Exact backup cadence and retention generations beyond continuous WAL/RPO are **DERIVED-PLAN-DEFAULTS** requiring capacity and legal review.

## Future backup and recovery interface

**Procedure status: Specified — Not Executed — Not Verified.**

The future operational interface should distinguish observation from recovery and never accept a secret as a command argument:

```sh
pnpm ops:backup:status -- --environment=<staging|portfolio>
pnpm ops:recovery:plan -- --environment=<staging|portfolio> --target-time=<UTC timestamp>
pnpm ops:recovery:drill -- --environment=<staging|portfolio> --target-time=<UTC timestamp>
```

These are **DERIVED-PLAN-DEFAULT** command shapes, not existing scripts. `plan` must show an isolated target, restore point, expected data-loss interval, key/material prerequisites, affected provider reconciliation window, and named approvers before it can invoke a restore. A real incident restore follows the dedicated runbook and never uses a future commercial target or overwrites the damaged writer before fencing.

## Monthly target PITR drill

**Procedure status: Specified — Not Executed — Not Verified.**

1. Select a known target time and isolated restore environment.
2. Restore base/incremental backups and replay WAL to target.
3. Start compatible application digest without external side effects.
4. Verify schema head, row/count/checksum controls, latest committed business references before target, ledger balance, media references, and absence of after-target transactions.
5. Record achieved RPO/RTO, gaps, operator steps, and remediation; destroy the isolated restored secrets/data safely.

## Quarterly clean-host rebuild

**Procedure status: Specified — Not Executed — Not Verified.**

Provision a clean target, restore configuration/secrets through the recovery path, pull signed images by digest, restore PostgreSQL and media access/copies, rebuild Redis queues and Meilisearch, rotate endpoints/DNS as required, verify provider callbacks, and complete synthetic critical journeys. Measure from incident declaration to service readiness against four hours.

## Disaster principles

- Do not overwrite the damaged host/database before preserving evidence.
- Fence the old writer before promoting restored service.
- Reconcile provider operations occurring around the recovery point.
- Status communications distinguish data loss, degraded projections, and provider uncertainty.
- A drill that omits keys, media, provider callbacks, queue recovery, or reconciliation does not verify total-host RTO.

## Related documents

- [Infrastructure topology](INFRASTRUCTURE-AND-NETWORK-TOPOLOGY.md)
- [Portfolio production deployment](PORTFOLIO-PRODUCTION-DEPLOYMENT.md)
