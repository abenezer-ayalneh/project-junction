# RUN-009 — Media Quarantine Failure

**Status:** Specified — Not Executed — Not Verified  
**Target owner:** Trust & Safety with Platform Owner support  
**Trigger:** Quarantine/scan/transform failure, unsafe object promotion, signed-media access anomaly, prohibited content finding, or a media-provider security signal.

## Safeguards

- Stop promotion of newly affected media and scope the exact object/version, workspace/environment, uploader, Listing/review context, public visibility, and signed-access window.
- Preserve forensic metadata, scan/transform results, access audit facts, moderation state, and source reference. Do not delete material evidence, expose it for inspection, or promote an unverified replacement.
- Reduce public access only as far as needed to contain the object. If unsafe content may have been public, revoke relevant signed access and retain a restricted incident record.

## Target procedure

1. Classify the failure as ingestion validation, malware/content scan, transform/resource exhaustion, metadata/active-content finding, storage/access control, provider response, or moderation decision.
2. Fence the affected media version in quarantine and block publication/republication. Identify all derived variants and public links without making an unsupported claim about historical viewing.
3. Inspect the configured pipeline boundary and reprocess only a safely scoped copy after the cause is understood. A replacement must pass the same bounded validation, transform, scan, caption/no-speech, and review gates before publication.
4. If a public item is unsafe, remove public access, notify the appropriate Trust/Support operation lane, open the required case, and apply the documented moderation/appeal lifecycle.
5. Verify that the Listing/media lifecycle accurately reflects the final state and that no stale search/cache/realtime projection exposes the blocked version.

## Rollback, recovery, and escalation

- Do not "roll back" by republishing a suspected object. A known-safe immutable prior version may be restored only through the declared media/lifecycle review path and with evidence.
- Invoke [RUN-013](SECURITY-INCIDENT-AND-DATA-BREACH.md) for suspected unauthorized access or disclosure; invoke [RUN-005](PROVIDER-OUTAGE.md) for a provider-side processing failure; invoke [RUN-008](SEARCH-REBUILD.md) if stale projection exposure persists.
- Escalate to Trust & Safety for policy/moderation decisions and to the Platform Owner if system-wide quarantine or signed-access controls cannot be trusted.

## Verification and evidence

Create restricted `EVD-OPS-*` evidence with object/version identifiers, scope, access containment result, scan/transform/review results, derivative/projection check, moderation/appeal case linkage, and final lifecycle state. A future drill must support `TST-P01-004` and applicable `CTL-050`–`CTL-056` evidence.

## Related normative documents

- [Application, upload, and provider security](../../security/APPLICATION-UPLOAD-AND-PROVIDER-SECURITY.md)
- [Media storage and processing](../../architecture/MEDIA-STORAGE-AND-PROCESSING.md)
- [Vendor, listing, and media state](../../state-machines/VENDOR-LISTING-AND-MEDIA.md)
