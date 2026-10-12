# Evidence Index

**Status:** Current local Phase 00 account-flow evidence and historical fixture-backed Phase 01 evidence are recorded.
**System claim:** Phase 00 is accepted for its documented local account scope. Earlier Phase 01 fixture evidence is historical; target and public-release gates remain open.

This future index records proof rather than treating specifications as proof.

| Evidence class                | ID format      | Required metadata                                                              |
| ----------------------------- | -------------- | ------------------------------------------------------------------------------ |
| Requirement/acceptance result | `EVD-REQ-###`  | requirement, test, version, environment, date, outcome, artifact checksum/link |
| Security review               | `EVD-SEC-###`  | control/ASVS item, reviewer, scope, findings, disposition                      |
| Provider contract             | `EVD-PRV-###`  | adapter, sandbox version, scenario, sanitized trace, reconciliation result     |
| Performance/reliability       | `EVD-PERF-###` | load profile, metrics, environment, thresholds, outcome                        |
| Recovery/runbook drill        | `EVD-OPS-###`  | runbook, RPO/RTO result, operator, incident-safe artifact                      |
| Portfolio claim               | `EVD-CLM-###`  | public claim, supporting evidence, date, expiry/revalidation trigger           |

Current local Phase 00 account and platform evidence: [local acceptance record](./PHASE-00-LOCAL-ACCEPTANCE-EVIDENCE.md). Future evidence must never contain real secrets, raw payment data, identity documents, or unredacted personal data.

`EVD-REQ-P00-20260923`: [archived evidence for the retired local synthetic runtime](./PHASE-00-DURABILITY-EVIDENCE.md); retained for historical traceability only.

`EVD-REQ-P01-20260925`: [historical Phase 01 fixture evidence and open gates](./PHASE-01-ACCEPTANCE-EVIDENCE.md). This is not the current local development flow or a public release claim.

Phase 02 local requirement/scenario coverage and unresolved formal gates are consolidated in [Phase 02 local acceptance evidence](./PHASE-02-LOCAL-ACCEPTANCE-EVIDENCE.md), with fresh [C12 browser/verification artifacts](./evidence/phase-02-c12-2026-10-12/README.md). These local artifacts do not establish independent accessibility, live provider/ledger/earnings or formal phase exit.
