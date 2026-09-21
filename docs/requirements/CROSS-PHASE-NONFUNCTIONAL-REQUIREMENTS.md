# Cross-Phase Nonfunctional Requirements

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** cross-phase quality constraints  
**Decision coverage:** `DEC-011`, `DEC-012`, `DEC-060`–`DEC-062`, `DEC-086`, `DEC-111`, `DEC-123`, `DEC-136`, `DEC-137`, `DEC-153`

| ID                | Requirement                                                                                                                                                                    | Acceptance evidence                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `REQ-P00-NFR-001` | Each target statement labels planned/derived/validated status accurately; no doc claims implemented behavior.                                                                  | documentation audit                     |
| `REQ-P00-NFR-002` | All authoritative commands derive access server-side and enforce Customer/Vendor/Location/workspace isolation.                                                                 | `TST-P00-001`                           |
| `REQ-P00-NFR-003` | Retryable state/money/provider work uses idempotency, durable event/inbox records, timeout/retry/compensation/reconciliation paths.                                            | contract/failure tests                  |
| `REQ-P00-NFR-004` | Every financial event balances in immutable double-entry postings; stock/audit/evidence records are append-only or versioned.                                                  | `TST-P04-002`                           |
| `REQ-P00-NFR-005` | Target public flows meet WCAG 2.2 AA, English completeness, pseudo-localization, and accessible captions/no-speech media.                                                      | manual/automated accessibility evidence |
| `REQ-P00-NFR-006` | Low-connectivity mode preserves only safe caches/drafts/retries; availability/payment/mutations require live authority.                                                        | offline/reconnect tests                 |
| `REQ-P00-NFR-007` | Target security maps applicable controls to ASVS 5.0 Level 2 and Junction controls; secrets/PII are minimized/redacted.                                                        | security gate evidence                  |
| `REQ-P00-NFR-008` | Target portfolio capacity is 100 active users, 10 completed checkouts/minute, 10,000 Products, 2,000 Services, 100 Vendors; target SLO is 99.5% internal monthly availability. | performance/SLO evidence                |
| `REQ-P00-NFR-009` | Target recovery objective is RPO 15 minutes/RTO 4 hours; all drills verify rather than assume it.                                                                              | `TST-P06-002`                           |
| `REQ-P00-NFR-010` | Demo, staging, portfolio production, and future commercial data/credentials/infrastructure are segregated with no data promotion.                                              | isolation audit                         |
