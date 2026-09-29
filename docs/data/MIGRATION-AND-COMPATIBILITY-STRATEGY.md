# Migration and Compatibility Strategy

> **Document status:** specified
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-084`–`DEC-085`, `DEC-092`, `DEC-109`, `DEC-121`](../governance/DECISION-REGISTER.md)
> **Normative owner:** future schema and contract evolution

## Database migrations

Prisma owns one ordered migration history for the shared PostgreSQL database. Audited SQL may be embedded when required for PostGIS, constraints, indexes, UUIDv7, locks, triggers, or safe backfills. A migration names the owning context and includes forward behavior, compatibility window, data/backfill impact, lock risk, observability, verification, and recovery.

Production migrations use a deployment lock and expand/contract sequence [DEC-092]:

1. Expand with backward-compatible schema.
2. Deploy code capable of old and new representations.
3. Backfill in bounded, restartable, observable batches.
4. Switch reads/writes and verify.
5. Contract only after the rollback window ends and a verified protected backup is available. Migration `20260929000000_retire_synthetic_schema` is that cutover for the former demo and local-effect tables.

Destructive DDL, table rewrites, unbounded backfills, and long blocking locks require a rehearsal and explicit maintenance decision. Application rollback cannot assume a contracted schema can be restored automatically.

## API/event/job compatibility

- OpenAPI compatibility checks reject unapproved breaking changes.
- Event and job payloads include schema versions; durable consumers can process all versions still present in queues/outbox/replay windows.
- A renamed/removed state or enum value requires reader compatibility and data migration before writers stop producing the old value.
- Saved snapshots and ledger history remain readable indefinitely even when current policy/catalog structures evolve.
- Provider adapter changes preserve internal ports and reconcile in-flight objects created under the prior adapter version.

## Environment sequence

Migration code is reviewed and tested on disposable databases, then CI, then staging with production-like data shape but synthetic content. Backup and restore readiness is checked before portfolio production. Future Dire Dawa data is never copied from or promoted out of the portfolio environment [DEC-109].

## Rollback decision

Prefer application-image rollback when schema remains compatible. If a forward data repair is safer than down migration, document and execute that repair. Restoring the database is a disaster-recovery action and cannot be used casually to undo a release because it discards valid concurrent writes.

## Evidence required later

Clean install, upgrade from each supported release, interrupted/restarted backfill, old/new mixed-version behavior, rollback, index/lock timing, backup restore, and event/job compatibility must be demonstrated before a migration is promoted.

## Related documents

- [CI/CD and release promotion](../deployment/CI-CD-AND-RELEASE-PROMOTION.md)
- [Migrations, rollout, and rollback](../deployment/DATABASE-MIGRATIONS-ROLLOUT-AND-ROLLBACK.md)
