# Application, Upload, and Provider Security

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-047`, `DEC-098`, `DEC-099`, `DEC-123`, `DEC-124`, `DEC-175`, `DEC-176`

## Vendor application and verification

Self-service Vendor applications enter a private pre-approval workspace. Only approved Vendor membership enables publication or customer-facing operations. Identity/KYB is sandbox-only in the portfolio system; public demo verification is synthetic. Application data is purpose-limited, access-controlled, retained per [data policy](../data/DATA-CLASSIFICATION-RETENTION-EXPORT-AND-DELETION.md), and never presented as real regulatory proof.

## Media pipeline

Uploads are accepted only through scoped, short-lived intents. The target pipeline stores an object in quarantine, verifies signature/size/MIME plus content type, strips or blocks unsafe metadata where applicable, transforms only bounded image/video variants, runs an antimalware/content review boundary, and publishes immutable versioned media only after acceptance. Direct public write access, SVG/HTML active content, unbounded decompression, arbitrary remote fetches, and provider credentials in client code are forbidden. Public short videos require captions or an explicit no-speech declaration with description.

## Provider boundary

Every provider adapter validates outbound scope and inbound response shape; logs only correlation identifiers and scrubbed metadata. Webhooks require raw-body signature verification, timestamp/replay checks, durable inbox deduplication, ordered reconciliation, and a manual recovery path. Provider outage must queue or visibly fail safely—never invent payment, booking, delivery, or verification success. See [provider contracts](../architecture/PROVIDER-INTEGRATION-CONTRACTS.md) and [provider outage runbook](../operations/runbooks/PROVIDER-OUTAGE.md).
