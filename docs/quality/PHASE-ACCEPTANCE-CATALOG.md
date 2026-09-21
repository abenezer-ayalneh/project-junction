# Phase Acceptance Catalog

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** acceptance scenario identifiers  
**Decision coverage:** `DEC-005`, `DEC-138`, `DEC-157`–`DEC-160`

| ID            | Phase | Scenario                                                                                                                         | Required future evidence                         |
| ------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `TST-P00-001` | 00    | scoped access prevents a stale Vendor membership from reading a Location                                                         | API/DB authorization result                      |
| `TST-P00-002` | 00    | an expired synthetic workspace is independently purged without affecting any other environment                                   | purge trace + isolation inspection               |
| `TST-P00-003` | 00    | a versioned public API contract and compatible migration path reject persistence-type leakage and incompatible change            | contract/migration report                        |
| `TST-P00-004` | 00    | an outbox/webhook replay, timeout, and retry create no duplicate business effect and reconcile to durable truth                  | inbox/outbox trace + reconciliation result       |
| `TST-P00-005` | 00    | documentation/status review finds every target claim labeled and every requirement linked to acceptance evidence                 | signed coverage-audit record                     |
| `TST-P01-001` | 01    | approved Vendor publishes a reviewed listing, and prohibited category is blocked                                                 | E2E + audit event                                |
| `TST-P01-002` | 01    | a listing revision/risk review is rejected or returned without publishing stale/unsafe content                                   | E2E + moderation/audit event                     |
| `TST-P01-003` | 01    | CSV dry-run/commit replay is idempotent and produces row-level error/preview evidence                                            | import trace + export comparison                 |
| `TST-P01-004` | 01    | public video stays quarantined until safe processing and caption/no-speech validation complete                                   | media trace + accessibility result               |
| `TST-P02-001` | 02    | two concurrent checkouts cannot oversell a variant/location quantity                                                             | concurrency trace + stock ledger                 |
| `TST-P02-002` | 02    | pickup/delivery group snapshots price, zone, proof, and pickup grace                                                             | E2E + event/ledger records                       |
| `TST-P02-003` | 02    | partial cancellation, 7/14/30 return eligibility, delivery retry, and product earnings release preserve affected-value isolation | policy/state/ledger trace                        |
| `TST-P03-001` | 03    | concurrent booking intents cannot double-book named/any-qualified Staff                                                          | concurrency trace                                |
| `TST-P03-002` | 03    | Flexible/Standard cancellation and amendment preserve policy snapshots and correct money                                         | policy and ledger test                           |
| `TST-P03-003` | 03    | meeting provisioning failure compensates safely and attendance/no-show remains contestable                                       | provider/state/ledger trace                      |
| `TST-P04-001` | 04    | one Purchase atomically creates mixed-Vendor goods Orders and up to five independent Bookings                                    | E2E + idempotency replay                         |
| `TST-P04-002` | 04    | webhook duplicate/out-of-order delivery cannot imbalance the ledger                                                              | inbox/reconciliation trace                       |
| `TST-P04-003` | 04    | promotion allocation, commission, earnings window, and idempotent weekly payout use snapshotted values                           | calculation + ledger/payout trace                |
| `TST-P05-001` | 05    | return/dispute/support/moderation action preserves evidence and obeys dual control                                               | E2E + audit record                               |
| `TST-P05-002` | 05    | personalisation remains off without explicit opt-in                                                                              | privacy test                                     |
| `TST-P05-003` | 05    | restricted Vendor suspension, review entitlement, private inquiry, and notification rules preserve open obligations and scope    | E2E + audit/notification trace                   |
| `TST-P05-004` | 05    | provider/inbox/Purchase/ledger/payout mismatch opens a reconciled exception rather than editing financial history                | reconciliation case + compensating-posting trace |
| `TST-P06-001` | 06    | public demo role switch is synthetic, isolated, quota-bound, and purged at 24 hours                                              | E2E + purge report                               |
| `TST-P06-002` | 06    | restore a clean host to declared RPO/RTO without data promotion                                                                  | recovery drill                                   |
| `TST-P06-003` | 06    | the published 100-user/10-checkout-minute portfolio envelope and relevant saturation metrics meet declared thresholds            | load report + metric export                      |
| `TST-P06-004` | 06    | public flows meet WCAG/pseudo-locale/low-connectivity behavior without unsafe offline mutation                                   | accessibility + network test evidence            |
| `TST-P06-005` | 06    | release/rollback, environment separation, ASVS applicability, and truthful public claims satisfy the public-release gate         | release-gate record + security/claim evidence    |

## Requirement-to-scenario mapping

This table is the authoritative test association. Each requirement's phase file owns its product wording; a future execution records the linked `EVD-*` class shown in the scenario row above.

| Requirement         | Acceptance scenario(s)       |
| ------------------- | ---------------------------- |
| `REQ-P00-IAM-001`   | `TST-P00-001`                |
| `REQ-P00-IAM-002`   | `TST-P00-001`                |
| `REQ-P00-API-001`   | `TST-P00-001`, `TST-P00-003` |
| `REQ-P00-DATA-001`  | `TST-P00-003`                |
| `REQ-P00-EVT-001`   | `TST-P00-004`                |
| `REQ-P00-DEMO-001`  | `TST-P00-002`                |
| `REQ-P00-NFR-001`   | `TST-P00-005`                |
| `REQ-P00-NFR-002`   | `TST-P00-001`                |
| `REQ-P00-NFR-003`   | `TST-P00-004`                |
| `REQ-P00-NFR-004`   | `TST-P04-002`                |
| `REQ-P00-NFR-005`   | `TST-P06-004`                |
| `REQ-P00-NFR-006`   | `TST-P06-004`                |
| `REQ-P00-NFR-007`   | `TST-P06-005`                |
| `REQ-P00-NFR-008`   | `TST-P06-003`                |
| `REQ-P00-NFR-009`   | `TST-P06-002`                |
| `REQ-P00-NFR-010`   | `TST-P00-002`, `TST-P06-001` |
| `REQ-P01-VND-001`   | `TST-P01-001`                |
| `REQ-P01-CAT-001`   | `TST-P01-001`                |
| `REQ-P01-CAT-002`   | `TST-P01-002`                |
| `REQ-P01-CSV-001`   | `TST-P01-003`                |
| `REQ-P01-DSC-001`   | `TST-P01-001`                |
| `REQ-P01-MEDIA-001` | `TST-P01-004`                |
| `REQ-P02-INV-001`   | `TST-P02-001`                |
| `REQ-P02-CHK-001`   | `TST-P02-001`                |
| `REQ-P02-ORD-001`   | `TST-P02-003`                |
| `REQ-P02-FUL-001`   | `TST-P02-002`                |
| `REQ-P02-FUL-002`   | `TST-P02-002`, `TST-P02-003` |
| `REQ-P02-POL-001`   | `TST-P02-002`                |
| `REQ-P02-RET-001`   | `TST-P02-003`                |
| `REQ-P03-SCH-001`   | `TST-P03-001`                |
| `REQ-P03-HOLD-001`  | `TST-P03-001`                |
| `REQ-P03-BKG-001`   | `TST-P03-002`                |
| `REQ-P03-BKG-002`   | `TST-P03-002`                |
| `REQ-P03-BKG-003`   | `TST-P03-002`                |
| `REQ-P03-POL-001`   | `TST-P03-002`                |
| `REQ-P03-MTG-001`   | `TST-P03-003`                |
| `REQ-P03-ATT-001`   | `TST-P03-003`                |
| `REQ-P04-CHK-001`   | `TST-P04-001`                |
| `REQ-P04-CHK-002`   | `TST-P04-001`, `TST-P04-002` |
| `REQ-P04-PUR-001`   | `TST-P04-001`                |
| `REQ-P04-FIN-001`   | `TST-P04-002`                |
| `REQ-P04-FIN-002`   | `TST-P04-002`                |
| `REQ-P04-PRM-001`   | `TST-P04-003`                |
| `REQ-P04-PYO-001`   | `TST-P04-003`                |
| `REQ-P05-CASE-001`  | `TST-P05-001`                |
| `REQ-P05-RET-001`   | `TST-P02-003`, `TST-P05-001` |
| `REQ-P05-TRUST-001` | `TST-P05-001`, `TST-P05-003` |
| `REQ-P05-REV-001`   | `TST-P05-003`                |
| `REQ-P05-ENG-001`   | `TST-P05-002`, `TST-P05-003` |
| `REQ-P05-PRV-001`   | `TST-P05-002`                |
| `REQ-P05-OPS-001`   | `TST-P05-004`                |
| `REQ-P06-DEM-001`   | `TST-P06-001`                |
| `REQ-P06-DEM-002`   | `TST-P06-001`                |
| `REQ-P06-REL-001`   | `TST-P06-005`                |
| `REQ-P06-SEC-001`   | `TST-P06-005`                |
| `REQ-P06-REL-002`   | `TST-P06-005`                |
| `REQ-P06-DR-001`    | `TST-P06-002`, `TST-P06-005` |

No `REQ-P##-*` may be added without a row here and a future evidence class.
