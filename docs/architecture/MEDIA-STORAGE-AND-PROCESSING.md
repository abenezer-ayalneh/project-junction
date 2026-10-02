# Media Storage and Processing

> **Document status:** specified
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-088`, `DEC-094`, `DEC-175`–`DEC-176`](../governance/DECISION-REGISTER.md)
> **Normative owner:** media architecture and processing safety

## Storage boundary

Self-hosted MinIO is the staging application media store. PostgreSQL owns media identity, workspace/Vendor/resource scope, uploader, state, checksum, rendition metadata, accessibility data, moderation decision, and retention class. MinIO keys are immutable and separated into quarantine, private, and public namespaces. Backblaze B2 is a separate encrypted backup destination, not a public-media origin [DEC-094].

## Processing architecture

Clients upload directly to a short-lived signed quarantine grant through the private HTTPS MinIO origin. The grant uses HTTP PUT. A worker verifies size/checksum/signature bytes, scans with a malware engine, strips metadata, safely re-encodes images, probes/transcodes video under resource limits, and generates approved renditions/posters. Publication links only a processed, moderated rendition; moving or merely renaming an untrusted upload is forbidden.

Release 1 includes short public video [DEC-175]. Any meaningful spoken/audio content requires timed captions; silent media requires a no-speech declaration and text description [DEC-176]. The first byte, duration, dimension, codec, and rendition profile was accepted on 2026-09-24 in the media limit registry.

The [media limit registry](./MEDIA-LIMIT-REGISTRY.md) contains the accepted first profile. The local synthetic path now covers direct upload, checksum-sealed quarantine, ClamAV scanning, bounded FFmpeg transcode, private preview, scoped moderation, and publication-gated API delivery. Expired pending uploads and expired demo workspace media have tested object cleanup. The worker runs an hourly-grace orphan sweep every ten minutes, checking PostgreSQL references before deletion and recording candidate/deleted audit entries. A real staging MinIO deployment and independent accessibility verification remain open.

Private messages/support evidence may use a narrower allowlist and private signed downloads. Active document content is not trusted or rendered inline merely because scanning succeeded.

## Lifecycle and deletion

Media states are proposed as `pending_upload`, `quarantined`, `processing`, `needs_moderation`, `approved`, `rejected`, and `deleted`. Original evidence and decisions remain immutable for the applicable retention class; public replacement creates a new key/version. Demo expiry triggers database, rendition, quarantine, analytics, and provider-object cleanup. Orphan sweeps are durable and auditable.

The local Phase 01 cleanup policy removes expired uncompleted upload objects, purges all media objects tied to an expired demo workspace, and removes unreferenced managed objects only after a one-hour grace period with candidate/deletion audit entries. A rejected media record remains private and retains its referenced source and processed objects. Non-demo rejected media has no automatic age-based deletion until the versioned retention registry assigns its owner, basis, duration, trigger, backup behavior, and deletion action; this boundary prevents an invented retention period from destroying moderation evidence.

## Failure behavior

Unsupported, corrupt, infected, mismatched, timed-out, moderation-rejected, or accessibility-incomplete media remains private and blocks publication. Processing retries are idempotent. MinIO outage does not lose authoritative workflow state. A CDN or signed-URL failure degrades media delivery without authorizing alternate access.

## Related documents

- [Media interface contract](../interfaces/MEDIA-UPLOAD-AND-PROCESSING-CONTRACTS.md)
- [Data classification and retention](../data/DATA-CLASSIFICATION-RETENTION-EXPORT-AND-DELETION.md)
- [Backup, restore, and disaster recovery](../deployment/BACKUP-RESTORE-AND-DISASTER-RECOVERY.md)
