# Database Migrations, Rollout, and Rollback

> **Document status:** specified procedure
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-084`–`DEC-085`, `DEC-092`, `DEC-111`](../governance/DECISION-REGISTER.md)
> **Normative owner:** operational application of schema changes

## Release migration package

Each release identifies the migration head, owning context, forward SQL/Prisma migration, backward-compatibility window, expected locks and duration, disk/WAL growth, backfill worker, verification query, and rollback/forward-repair decision. Audited parameterized SQL covers PostGIS and concurrency features not safely expressed through Prisma [DEC-084].

## Future migration operator interface

**Procedure status: Specified — Not Executed — Not Verified.**

The future tooling should separate planning, execution, and verification, for example:

```sh
pnpm ops:migration:plan -- --environment=<staging|portfolio> --release=sha256:<digest>
pnpm ops:migration:apply -- --environment=<staging|portfolio> --release=sha256:<digest>
pnpm ops:migration:verify -- --environment=<staging|portfolio> --release=sha256:<digest>
```

These are **DERIVED-PLAN-DEFAULT** command shapes, not existing migration scripts. They must require the environment migration lock, compare the expected and actual schema head, retain a safe audit record, and reject a direct connection string or arbitrary SQL supplied by a CI/user command. The approved migration package—not an operator’s ad hoc database command—is the only release input.

## Target preflight

**Procedure status: Specified — Not Executed — Not Verified.**

1. Prove clean creation and upgrade from the currently deployed schema in CI and staging.
2. Inspect query plan/lock behavior on production-shaped synthetic volume.
3. Confirm application versions compatible with pre- and post-migration schema.
4. Verify recent backup, continuous WAL, restore heartbeat, disk headroom, and no conflicting operation.
5. Select an explicit migration/maintenance window and acquire the environment migration lock.

## Target rollout

**Procedure status: Specified — Not Executed — Not Verified.**

1. Apply expand-only schema changes.
2. Run post-migration structural and invariant checks.
3. Deploy dual-compatible application images.
4. Execute bounded idempotent backfill with progress, throttle, pause, and restart support.
5. Compare old/new representations and observe error, latency, locks, replication/WAL, queues, and disk.
6. Switch reads/writes behind a server feature/config gate.
7. Contract only in a later independently approved release.

## Failure and rollback

If migration has not changed data, release the lock and use the reviewed down/repair path only when proven safe. If expanded schema is compatible, roll back the application digest. If data has been transformed, prefer a reviewed forward repair or reverse backfill. Never restore the whole production database merely to undo an application release; restore is reserved for data-loss/corruption incidents and follows the DR runbook.

Provider operations, ledger postings, Orders, and Bookings completed during a deployment are reconciled and preserved. Rollback cannot make external effects disappear.

## Related documents

- [Migration and compatibility strategy](../data/MIGRATION-AND-COMPATIBILITY-STRATEGY.md)
- [CI/CD and release promotion](CI-CD-AND-RELEASE-PROMOTION.md)
- [Backup and disaster recovery](BACKUP-RESTORE-AND-DISASTER-RECOVERY.md)
