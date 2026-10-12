# Media Backup Lifecycle and Local Operations

> **Document status:** implemented locally; provider activation and policy adoption pending
> **System claim:** local scheduler, encrypted generations and expiry have synthetic integration evidence; offsite/provider deployment is not verified
> **Decision coverage:** existing `DEC-094`, `DEC-111`; configurable operational choices are derived defaults
> **Normative owner:** media backup generation format and controller operations; [rejected-media-v1](./REJECTED-MEDIA-RETENTION.md) owns deletion decisions
> **Owner:** Platform recovery/media operations · Updated: 2026-10-10 · Last rehearsal: 2026-10-10

## Purpose and boundary

The controller creates scheduled, encrypted media generations and expires their complete object/version scope. It reconciles newly journaled rejected-media decisions into retained media generations. A locked object remains a visible failed obligation and is retried after its lock expires. It never requests governance bypass or deletes the independent journal.

Supported generations are full media copies in the controller's key layout and streamed standalone bundles. Every media object is bounded to 64 MiB, exceeding the current Phase 01 upload limits; larger media objects fail instead of being silently omitted. Archive imports stream encryption through 8 MiB multipart uploads, up to the 10,000-part limit (just under 80 GiB including envelope overhead), and expire as a whole. The controller does not unpack/rewrite opaque bundles or manage pgBackRest's incremental/WAL dependencies. Existing pgBackRest repositories and arbitrary historical layouts need a reviewed adapter and original inventory; they cannot be relabeled as independently disposable bundles.

The SDK component accepts separate source and archive clients. The executable deliberately requires loopback PostgreSQL and storage endpoints for all commands under the repository's local-development policy. No remote service, provider lifecycle, application deployment or commercial readiness was established. This completes local implementation of the generation scheduler/expiry capability; the broader offsite infrastructure, RPO/RTO and release gates remain separate.

## Storage and safety model

Use four distinct buckets: active media, encrypted backups, backup catalog, and independent deletion journal. The optional recovery bucket must differ from all four. The catalog and journal must survive source/database/media recovery; do not rotate them with backup generations.

The catalog persists a generation before copying its first byte. It snapshots ID, original recovery-point timestamp, policy/version/approval reference, maximum lifetime, key ID, object count, hold, state, last error and retry time. State moves through `copying`, `ready` or `failed`, then irreversible `expiring` and verified `expired`. Failed/interrupted copies remain inventoried and expire. Unregistered scopes or invalid manifests stop the controller; they are not silently considered purged.

Objects live only under `media-backups-v1/<generation UUID>/`. Media ciphertext preserves the original relative object key under `media/`; bundles use `archive.enc`. AES-256-GCM uses a random nonce per object and authenticates the generation ID, source key and key ID. The media `JMB1` envelope stores nonce, tag and ciphertext; the streaming archive `JBA1` envelope stores nonce, ciphertext and final tag. A private 32-byte key file is separate from storage credentials. Keep every referenced key recoverable through the relevant generation lifetime and holds; changing the current key ID does not reencrypt or renew older generations.

Copies include only database-referenced media from non-demo workspaces, excluding incomplete uploads and already-purged rows. They exclude journaled keys before copying and reconcile the current journal again before marking a generation ready. Source reads use the listed ETag, so concurrent content replacement fails the generation. Missing referenced source bytes fail the generation. A private, conditionally created inventory records original keys and SHA-256; restore requires every non-deleted object and checks authenticated content against that inventory. The supported inventory has at most 50,000 objects and 16 MiB of manifest data; overflow fails instead of truncating. This is a media snapshot, not an atomic PostgreSQL/media recovery point or proof of total-host recovery.

All executable commands take the same PostgreSQL advisory lock for their archive endpoint/bucket/catalog scope. Only one controller may own that scope. Loss of the lock connection terminates the process; incomplete manifests survive restart. Direct SDK callers must provide equivalent serialization. External writers must not write controller-owned prefixes or renew a generation's deadline.

Expiry aborts all staged multipart uploads, removes all versions and delete markers within the exact generation prefix and verifies no recoverable versions or staged parts remain. Interrupted streams abort their upload; interrupted processes leave registered scope that a later sweep aborts. A restored external copy under an expired generation is purged again without renewing expiry. Holds retain a generation until explicitly released; release leaves the original deadline unchanged. Holds cannot reverse a generation already entering expiry. Requested/applied hold changes have separate conditional-create audit objects in the private catalog. A generation hold does not reverse an irreversible media deletion journal entry.

## Prerequisites

- Run every development, routine verification and acceptance rehearsal on the user's local machine. No staging/remote fallback or deployment is authorized by this runbook.
- Local PostgreSQL and MinIO must be running. Use disposable schemas/buckets for tests and keep application/recovery traffic fenced for restores.
- Supply an explicit policy JSON with `version`, `approvalReference`, `maxAgeDays`, `intervalSeconds`, `lockDays`, and `keyId`. Locks must not exceed maximum lifetime. The example uses one day and ten-minute scheduling for synthetic rehearsal only; it does not adopt the governing draft's 35-day proposal.
- Backup operations credentials need source read/list, archive read/write/version-list/version-delete and optional retention-setting permissions; catalog read/list/write; journal read/list. Application credentials must not administer backup generations or overwrite/delete the journal. Production identities must not have governance-bypass permission.
- Backups require versioned storage, with Object Lock enabled when configured. The catalog should retain administrative version history and restricted access. Verify bucket ACLs, key recoverability and lock semantics before any future activation.

## Procedure

### 1. Prepare local configuration

From the repository root, populate the local synthetic buckets:

```sh
docker compose run --rm minio-init
set -a
source .env.integration.example
source .env.media-backup.example
set +a
```

The init service creates the distinct versioned/lock-capable backup bucket and versioned catalog. It does not start the scheduler. The example's fixture credentials are valid only for local synthetic MinIO. If initialization fails, restore local storage availability; do not use a remote service.

Create a private key outside the repository once, or select an existing matching recovery key:

```sh
umask 077
mkdir -p "${HOME}/.config/project-junction"
export MEDIA_BACKUP_KEY_FILE="${HOME}/.config/project-junction/media-backup.key"
node --input-type=module -e 'import { randomBytes } from "node:crypto"; import { writeFileSync } from "node:fs"; writeFileSync(process.env.MEDIA_BACKUP_KEY_FILE, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 })'
```

The exclusive create refuses to overwrite an existing key. Reuse its path instead of regenerating it. Never put key bytes in an argument, log, commit, or manifest. Set `MEDIA_BACKUP_POLICY_FILE` to the reviewed local policy file; production periods remain unapproved.

### 2. Inspect and run one scheduled cycle

```sh
pnpm nx run platform-core:media-backup-status
pnpm nx run platform-core:media-backup-run
```

Status reports generation ID/kind/state, original date, expiry, held flag and failure/retry timing without source bytes, keys or hold text. A run sweeps existing generations, reconciles deletion decisions and creates a full media copy when the configured interval is due. A second run within that interval does not create another generation. A failed cycle exits nonzero, and unresolved records remain visible.

### 3. Run the scheduler

```sh
pnpm nx run platform-core:media-backup-watch
```

This is a continuous, noncached Nx target. It polls at the lesser of the configured copy interval and 60 seconds; individual failed records retry no earlier than their recorded next-attempt time. Heartbeats report `created`, `expired`, `reconciled`, `failed` and `held`. Catalog/journal outages produce retryable failure events. Alert on nonzero failures, missing heartbeats or stale successful generations; a heartbeat alone does not prove a healthy backup.

SIGINT/SIGTERM stops after the in-flight operation and releases the advisory lock. A lost lock connection stops immediately. A future process supervisor must restart failed controllers with the same durable catalog/journal and keys; no supervisor was installed or remote scheduler activated by this work.

### 4. Import a standalone archive for expiry

```sh
export MEDIA_BACKUP_ARCHIVE_FILE=/absolute/path/to/disposable-standalone-bundle
export MEDIA_BACKUP_ARCHIVE_CREATED_AT=2026-10-09T00:00:00Z
pnpm nx run platform-core:media-backup-import
```

Use the authoritative original recovery-point timestamp, not the file's copy time or mtime. The date must be valid and nonfuture. Import streams encryption of the standalone bundle, snapshots its existing age and returns an ID and expiry; it cannot renew the original lifetime. Ensure the bundle is standalone and its legal/source scope permits copying. No raw-content or secret log is emitted. The normal sweep expires its complete prefix, including older versions. An opaque archive cannot satisfy immediate selective erasure: restrict it pending approved expiry and always reconcile the current journal if an approved adapter later unpacks it.

### 5. Place or release a scoped generation hold

```sh
export MEDIA_BACKUP_GENERATION_ID=<generation-UUID-from-status>
export MEDIA_BACKUP_HOLD_REASON='Preserve the scoped evidence for case 123'
pnpm nx run platform-core:media-backup-hold

export MEDIA_BACKUP_HOLD_REASON='Case 123 resolved; preservation duty released'
pnpm nx run platform-core:media-backup-release
```

Replace the angle-bracket value before executing. Both actions require a justification, retain private requested/applied audit records, and leave the original expiry unchanged. A released overdue generation becomes eligible on the next cycle. If application-side evidence must be preserved, place its media hold before deletion is journaled; a backup hold alone is insufficient.

### 6. Restore a media generation into a fenced local bucket

Provision a separate private recovery bucket. Export `MEDIA_RECOVERY_ENDPOINT`, `MEDIA_RECOVERY_REGION`, its access key/secret, and `MEDIA_RECOVERY_BUCKET` through local environment configuration. All endpoints must be loopback.

```sh
export MEDIA_RECOVERY_ISOLATED=1
export MEDIA_BACKUP_GENERATION_ID=<ready-unexpired-media-generation-UUID>
pnpm nx run platform-core:media-backup-restore
```

Select the generation's matching key file/key ID in the policy configuration. The controller denies incomplete/expired generations, opaque bundles and active/journal/catalog/backup targets. It authenticates ciphertext, restores original media keys and replays the current journal into the whole recovery bucket before reporting success. The result explicitly says `readyForApplicationAccess: false`.

Keep the bucket private and application traffic fenced. Restore the associated database into an isolated schema, then use the existing `platform-core:media-restore-reconcile` target with the recovery bucket as `MEDIA_S3_BUCKET`, the current journal and `MEDIA_RECOVERY_ISOLATED=1`. Only after database reconciliation and the full recovery validation may an independently approved recovery process open access. This runbook does not perform cutover or prove a matching database recovery point.

## Verification

Use the dedicated disposable integration fixture rather than exercising expiry on useful backups:

```sh
set -a
source .env.integration.example
set +a
FOUNDATION_TEST_NAME='local media backup lifecycle' pnpm nx run platform-core:test-integration
```

The combined focused suite passed 10 scenarios on 2026-10-10 (44 unrelated scenarios skipped). The fixture verifies encrypted round-trip and authentication failure, missing source/ciphertext, source ownership/journal exclusion, schedule replay, historical versions, archive expiry, source/journal preservation, holds/release, real lock-expiry retry, catalog/journal failure, CLI mutual exclusion, and scheduler shutdown. A streamed archive larger than 64 MiB verifies multipart encryption and interruption cleanup. It removes its synthetic buckets, files and database schema. Only test teardown may bypass its own synthetic governance locks; operational code never does.

Check a generation's `expired` state only after version absence is verified. `failed`, `expiring` with a retry, a missing manifest, or inaccessible locked bytes cannot be reported as physical disposal. Catalog/audit/journal metadata have separate retention decisions; this controller does not garbage-collect them.

## Troubleshooting, recovery and escalation

| Symptom                                                  | Action                                                                                                                                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Another controller owns the scope                        | Inspect the local owning process; stop it gracefully before manual operations. Do not change lock identity to bypass serialization.                                                                                                         |
| Storage operation failed / `expiring`                    | Check version-delete/list rights, storage availability, retention dates and legal holds. Keep the generation inaccessible, let its recorded retry run, and verify status after actual lock expiry. Never grant bypass to make the job pass. |
| Unknown generation or invalid manifest                   | Stop automation and reconcile inventory with the recovery owner. Do not delete unknown objects or edit creation/expiry dates to hide a missing generation.                                                                                  |
| Missing journal or unreadable catalog                    | Restore the independent current control stores; never replace them with an older recovery point. Keep restores fenced.                                                                                                                      |
| Wrong key / ciphertext authentication failure            | Obtain the recorded key ID from independent recovery material; investigate corruption/tampering. Keep the partial recovery bucket private and discard/rebuild only its disposable scope.                                                    |
| Media exceeds 64 MiB or archive exceeds multipart limits | Use a separately reviewed adapter. A failed generation is not a valid substitute for a complete backup.                                                                                                                                     |
| Hold request has no applied audit                        | Treat the action as uncertain; inspect current manifest/versions before retrying. Do not infer that the hold was applied merely from its request audit.                                                                                     |

Stop the watcher to disable further work. Expiry and journaled deletions have no byte-level rollback; do not resurrect expired/deleted content from another copy. Config changes affect future generations; existing deadlines remain snapshotted. Escalate unrecoverable keys, overdue locks, policy conflicts or incomplete inventory to the named recovery/privacy owner in the adopted policy. Those names and approved periods remain pending; local synthetic evidence cannot substitute for approval.

See [RUN-003](../operations/runbooks/BACKUP-PITR-AND-CLEAN-HOST-REBUILD.md), the [governing policy draft](./GOVERNING-RETENTION-POLICY.md), and the [Phase 01 evidence](../quality/PHASE-01-ACCEPTANCE-EVIDENCE.md).
