# Media Upload and Processing Contracts

**Status:** Specified — Not Executed — Not Verified

**Local implementation status:** A Vendor-scoped signed PUT intent, checksum-sealed completion, ClamAV scan, bounded FFmpeg transform, private reviewer preview, moderation decision, and publication-gated delivery are implemented with a local S3-compatible bucket. PostgreSQL and object-store integration checks cover ownership, replay, expiry, checksum, EICAR rejection, processing, stale moderation decisions, and public access revocation. Target R2, operational cleanup, and independent accessibility checks remain open.

1. Authorized actor requests scoped upload intent for owned resource and declared media purpose.
2. API returns short-lived quarantine-only signed upload contract with allowed size/type/checksum constraints; it grants no public access.
3. Client uploads directly to quarantine and reports immutable object/checksum reference.
4. Worker validates/antimalware scans/processes bounded renditions/accessibility metadata, emitting status events.
5. Only approved/moderated asset version can be linked to public resource; rejected/expired/demo assets remain inaccessible or are purged.

Every operation is idempotent and scope-bound. The contract handles upload interruption, duplicate completion, checksum mismatch, processor outage, unsafe content, caption/no-speech requirement, deletion/retention hold, and signed URL expiry. No client supplies public storage key, changes resource ownership, or bypasses moderation/quarantine.
