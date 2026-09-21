# Threat Model

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** security threats and mitigations  
**Decision coverage:** `DEC-060`, `DEC-063`–`DEC-067`, `DEC-086`, `DEC-117`, `DEC-118`, `DEC-124`, `DEC-153`, `DEC-170`

## Assets and trust boundaries

The target system protects account sessions, scoped access grants, Vendor and Staff data, stock/Booking availability, order evidence, media, support/dispute evidence, ledger records, provider credentials, backups, demo workspaces, and audit logs. A browser, API, WebSocket gateway, worker, database, object storage, search index, providers, and operations console are separate trust boundaries. PostgreSQL is the authority for transactional truth; search, realtime, analytics, and provider callbacks are derived or external inputs.

## Principal threats and required controls

| Threat                                 | Consequence                                        | Required controls                                                                                                                                     | Evidence later                       |
| -------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Account takeover/session fixation      | Unauthorized money, support, or Vendor actions     | OIDC/passwordless policy, short-lived session rotation, device/session revocation, CSRF/origin checks, rate limits, audit trail (`CTL-001`–`CTL-006`) | Auth, session, and abuse tests       |
| Cross-workspace or cross-Vendor access | Exposure or unauthorized changes                   | Server-derived `AccessContext`, deny-by-default queries, location scoping, IDOR tests (`CTL-010`–`CTL-014`)                                           | authorization matrix and tests       |
| Checkout replay/concurrency            | Duplicate purchase, oversell, double booking       | idempotency keys, serializable/conditional holds, expiry jobs, immutable records (`CTL-020`–`CTL-024`)                                                | concurrency test evidence            |
| Payment/webhook forgery                | Incorrect ledger or entitlement                    | signature verification, inbox deduplication, provider reconciliation, reversal-only correction (`CTL-030`–`CTL-035`)                                  | contract and reconciliation evidence |
| Privileged insider misuse              | Unauthorized refund, payout, suspension, or export | role separation, risk-tiered maker-checker, immutable audit log, reason/evidence requirements (`CTL-040`–`CTL-045`)                                   | approval/audit tests                 |
| Unsafe media or provider input         | malware, SSRF, prompt/script injection, data loss  | quarantine, MIME and content validation, signed scoped URLs, outbound allowlist, provider response validation (`CTL-050`–`CTL-056`)                   | upload/provider tests                |
| Demo abuse/data leakage                | public access to durable or real data              | synthetic-only namespace, quotas, fixed 24-hour expiry, no production credentials, purge verification (`CTL-060`–`CTL-065`)                           | demo isolation tests                 |
| Backup/secret compromise               | irrecoverable or broad disclosure                  | encrypted backups, least privilege, SOPS+age target, rotation and restore exercises (`CTL-070`–`CTL-074`)                                             | rotation/restore evidence            |

## Security posture and exclusions

The target is OWASP ASVS 5.0 Level 2 applicability, not certification. Real identity documents, live payments, KYB, tax filings, and commercial operations are excluded. Any future Ethiopian legality or provider suitability assertion remains `REQUIRES-FUTURE-VALIDATION` and belongs in [future validation](../future/REGULATORY-PAYMENT-TAX-KYB-AND-INVOICING-VALIDATION.md).
