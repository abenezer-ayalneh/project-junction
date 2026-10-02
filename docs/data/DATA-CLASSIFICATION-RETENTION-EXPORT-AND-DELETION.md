# Data Classification, Retention, Export, and Deletion

> **Document status:** specified
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-060`, `DEC-064`, `DEC-066`, `DEC-073`–`DEC-074`, `DEC-107`–`DEC-110`, `DEC-123`, `DEC-151`, `DEC-172`, `DEC-174`, `DEC-177`](../governance/DECISION-REGISTER.md)
> **Normative owner:** target data handling; exact non-demo retention periods require future legal validation

## Classes

| Class                   | Examples                                                                            | Baseline handling                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Public                  | Published Listings, public Storefront/Staff profiles with consent, approved reviews | CDN/search permitted; versioned moderation/deletion                           |
| Internal                | Configuration, aggregate analytics, operational status                              | Authenticated least privilege; no public indexing                             |
| Personal                | User profile, contact, address, Booking attendee, preferences                       | Purpose-limited, encrypted in transit/at rest, export/delete workflow         |
| Sensitive operational   | Customer pin/instructions, messages, evidence, support records, Staff schedule      | Narrow role/case access; telemetry redaction; private object storage          |
| Authentication/security | Session references, MFA/recovery data, audit and security events                    | Strongest access, recent-auth controls, append-only audit where applicable    |
| Financial               | Provider references, ledger, refunds, statements, disputes                          | Immutable/audited; no raw card storage; retention/legal validation            |
| Verification            | KYB references/results                                                              | Private staging only; public demo synthetic; no real documents publicly       |
| Synthetic demo          | Persona, Listings, Orders, Bookings, provider test references                       | Isolated, quota-limited, expires and purges after 24 hours [DEC-107, DEC-177] |

## Minimization

Collect only data needed for the documented workflow. Store provider identifiers and safe display metadata rather than raw payment credentials [DEC-151]. First-party analytics excludes session replay, fingerprinting, third-party behavioral tracking, and raw message/evidence content [DEC-123]. Logs, traces, errors, queue payloads, and search documents receive their own field allowlists.

## Export

A verified User can request a self-service export [DEC-060]. The export is assembled asynchronously, scoped to the requester, encrypted or delivered through short-lived authenticated download, includes a manifest and generated time, and expires. It covers profile, memberships/Staff relationship as permitted, addresses, Purchases, Bookings, reviews, messages/support, preferences, and relevant audit/account records without exposing other Users' private data or Platform security logic.

## Deletion

Deletion revokes sessions and provider links, stops optional processing, removes or anonymizes public/profile content, cleans derived search/analytics/notification/media copies, and pseudonymizes retained legal/audit/security/financial facts [DEC-060]. It cannot rewrite balanced ledger history or another party's legitimate transaction record. The UI must explain what is deleted, pseudonymized, retained, and why.

Demo workspace expiry is stricter: Junction-owned records, MinIO objects, search/analytics projections, notifications, and safe-to-delete sandbox provider objects are purged after the 24-hour TTL; cleanup failures remain visible and retry until reconciled.

## Retention registry

Exact retention durations for real-account Orders, messages, support, evidence, security logs, exports, and provider data were not selected in the conversation. They are `REQUIRES-FUTURE-VALIDATION`, not silent defaults. Before implementation, a versioned registry must assign owner, purpose, legal/business basis, duration, trigger, deletion/pseudonymization action, backup behavior, and derived-store propagation for every record class.

## Related documents

- [Canonical data model](CANONICAL-DATA-MODEL.md)
- [Media architecture](../architecture/MEDIA-STORAGE-AND-PROCESSING.md)
- [Environment matrix](../environments/ENVIRONMENT-MATRIX.md)
