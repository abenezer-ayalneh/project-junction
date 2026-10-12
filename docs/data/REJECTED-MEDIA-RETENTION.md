# Rejected media retention — rejected-media-v1

Owner: Platform Trust/media operations. Purpose: provide a bounded window for correcting or challenging a rejection while minimizing stored rejected content. This operational policy is a derived technical default selected for the Phase 01 implementation on 2026-10-09. It is not a statement of legal compliance; the governing jurisdiction and owner policy are still undecided. [The decision record](./REJECTED-MEDIA-RETENTION-DECISION.md) documents the rationale and approvals needed before real-account release.

The [governing retention policy draft](./GOVERNING-RETENTION-POLICY.md) proposes project-wide schedules and ownership, including retained metadata and journal expiry conditions. It remains unadopted and does not alter this implementation's duration, hold-release grace, deadlines or irreversible journal behavior.

## Duration and preservation

- Non-demo rejected images and videos retain their original upload, sealed source, rendition, and poster for **30 days from rejection**. The rejection event snapshots `rejectedAt`, `retentionDueAt`, and this policy version. Pending, quarantined, awaiting-moderation, and approved media are outside this deletion policy.
- A reviewer must place an **indefinite evidence hold** when content is needed for an appeal, support/security investigation, dispute, or legal preservation request. No held media is eligible for age-based deletion. Future case integrations must place this same hold before relying on media as evidence; a Listing reference alone is not an evidence hold.
- Only a reviewer with `platform:vendor:review` in the same workspace may place or release a hold, with the current media version, idempotency key, and a reason. Staging retains its required MFA gate. Releasing a hold grants **at least another 30 days from release**; it cannot shorten an existing later deadline. A purged record cannot be placed on hold or resurrect its files.
- Previously rejected records migrate onto a preservation hold (`Legacy rejected media: preservation review required`). Operators must review and explicitly release each hold; migration does not retroactively delete files.
- Once due, the worker deletes all referenced object keys, deduplicating shared rendition/poster keys. It keeps the rejected database record, checksum, size/type metadata, rejection/moderation decision, policy and timestamps, and audit trail. These retained records follow their own retention registry; this policy does not authorize deleting security/audit records.
- Derived/public delivery remains denied by the rejected state throughout retention and after deletion. Delete failures retain references and remain retryable. The durable deletion decision is irreversible once journaled. Hold changes are denied after that point, including when active-store deletion subsequently fails. A restore cannot revive an older hold or approval.

## Worker and failure handling

The worker sweeps every ten minutes, processing at most 25 due records per sweep. A PostgreSQL workspace lock serializes cleanup with moderation and hold changes; eligibility is reread under the lock. Success writes `media.retention-deleted` with policy, media ID, object count, and attempt number, clears object references, records the deletion timestamp, and increments the media version.

Failures write `media.retention-delete-failed`, retain object references and the rejection metadata, and retry after 5 minutes with exponential backoff capped at 24 hours. Retries continue until reconciled. DeleteObject is idempotent, allowing retries after partial object-store deletion or a database rollback. Worker `worker.media-retention` counts expose deleted/failed work without source content or object-store credentials.

## Holds and operations

`POST /v1/platform/media/:mediaId/retention-hold` uses the authenticated reviewer cookie and an `idempotency-key` header. Body:

```json
{ "expectedVersion": 2, "held": true, "reason": "Preserve for the active moderation appeal" }
```

To release, send `held: false` with the current version, a fresh key, and a release justification. Successful changes produce `media.retention-held` or `media.retention-hold-released` audit records. Replay of the same key/body returns the original result; conflicting key reuse is denied. Vendor/Customer and cross-workspace callers cannot manage holds.

Monitor repeated failure audits and worker failures. After restoring storage access, the next eligible worker sweep retries; do not clear object references manually to conceal failures. A preservation hold pauses future retries. No backdated deletion or forced override is part of this API.

## Backups and restore reconciliation

Before deleting any active object, the worker conditionally creates an immutable scope record in an independent private deletion-journal bucket. It records media/workspace IDs, policy, decision timestamp, and exact deduplicated keys; it stores no source bytes, captions, or moderation notes. If journal persistence fails or configuration is absent, cleanup fails and retries without deleting content. A retry cannot overwrite or expand the recorded scope. This intent survives a database transaction rollback and mandates deletion even if the active-store operation failed partway through.

Configure `MEDIA_DELETION_JOURNAL_BUCKET`. Local loopback MinIO may share the service and fixture credentials, using the separate `junction-deletion-journal-local` bucket. Non-loopback deployments require explicit `MEDIA_DELETION_JOURNAL_ENDPOINT`, `MEDIA_DELETION_JOURNAL_REGION`, `MEDIA_DELETION_JOURNAL_ACCESS_KEY_ID`, and `MEDIA_DELETION_JOURNAL_SECRET_ACCESS_KEY`, pointing to independently durable storage with separate access control. Confirm successful durable journal writes before enabling deletion. Never roll back, rotate away, or replace the journal with a database/media recovery point. Active/copy credentials need `s3:ListBucketVersions`, `s3:DeleteObjectVersion`, `s3:DeleteObject`, and `s3:GetObject` for the media bucket in addition to existing upload/list permissions. Journal writers need scoped `s3:PutObject`/`s3:GetObject`; restore/rotation readers also need scoped `s3:ListBucket`. Deny journal delete/overwrite to application credentials and do not grant governance-lock bypass. Its records must outlive every recoverable backup containing their keys; metadata retention needs the separate policy decision.

Executable local reconciliation targets:

```sh
# Export the local fixture environment; credentials remain in environment/config files.
pnpm nx run platform-core:media-backup-rotate
pnpm nx run platform-core:media-restore-reconcile
```

Rotation requires `MEDIA_BACKUP_BUCKET` distinct from both the active bucket and journal. Run it against each version-preserving, key-preserving media-copy generation before marking rotation complete. Pause writes/copy jobs to that generation while reconciling. It lists and removes every matching version and delete marker, including older versions and differently hashed historical renditions under the same media-ID prefix, then checks that reads fail. Errors (including Object Lock) cause a nonzero result; never report a locked generation as physically purged. Keep it unavailable for restoration without reconciliation, track the blocked expiry/retry, and rerun after lock expiry. Reconcile immediately after copying a generation and on every rotation; the job scheduler/provider integration is part of the future offsite backup system.

Restore requires fenced application/worker traffic, `MEDIA_RECOVERY_ISOLATED=1`, an explicit disposable PostgreSQL schema, and loopback endpoints. Restore a current independent journal before reconciliation, never only the journal snapshot from the old recovery point. Run reconciliation after media copy and database restore, before rebuilding public projections or opening any access. It purges all stored media versions and replays journal decisions into the restored database, forcing rejected state and clearing object references while preserving moderation metadata and adding `media.retention-restore-reconciled` audits. Replay is idempotent. Older holds/approvals cannot resurrect purged content. Records absent at the recovery point still have their copied keys purged. Missing or invalid journal entries and workspace mismatches fail closed.

Pre-journal deletions require a reviewed backfill from historical media inventories/backups: current database rows with cleared references cannot reconstruct their old keys. Restore reconciliation refuses already-purged rows without a journal entry. Do not claim complete backup deletion until that inventory is reconciled. Archived database dumps and immutable encrypted bundles are not rewritten by these targets: retain them under the approved archive lifecycle, then expire them, and always apply the current journal when unpacking media. The tools handle S3 copies preserving original object keys; other archive layouts require an explicit adapter before use.

The [media backup lifecycle controller](./MEDIA-BACKUP-LIFECYCLE.md) now implements opt-in scheduled encrypted generations, journal reconciliation, whole-generation/archive expiry, holds, durable retries after Object Lock expiry, and fenced media restoration for its registered formats. It requires an explicit policy and uses original recovery-point dates; it does not adopt the governing draft's proposed duration. Its local CLI requires loopback endpoints. Historical/opaque layouts and pgBackRest incremental/WAL dependencies need their own reviewed adapters.

All development and rehearsal are local. Remote/offsite pgBackRest/B2 provisioning and activation, provider verification, and total-host recovery remain open in the broader recovery specification; local tooling does not establish offsite readiness. See [RUN-003](../operations/runbooks/BACKUP-PITR-AND-CLEAN-HOST-REBUILD.md).
