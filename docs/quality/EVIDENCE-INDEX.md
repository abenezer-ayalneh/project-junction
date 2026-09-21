# Evidence Index

**Status:** Local synthetic Phase 00 evidence recorded.  
**System claim:** Partial local implementation; release gates remain open.

This future index records proof rather than treating specifications as proof.

| Evidence class                | ID format      | Required metadata                                                              |
| ----------------------------- | -------------- | ------------------------------------------------------------------------------ |
| Requirement/acceptance result | `EVD-REQ-###`  | requirement, test, version, environment, date, outcome, artifact checksum/link |
| Security review               | `EVD-SEC-###`  | control/ASVS item, reviewer, scope, findings, disposition                      |
| Provider contract             | `EVD-PRV-###`  | adapter, sandbox version, scenario, sanitized trace, reconciliation result     |
| Performance/reliability       | `EVD-PERF-###` | load profile, metrics, environment, thresholds, outcome                        |
| Recovery/runbook drill        | `EVD-OPS-###`  | runbook, RPO/RTO result, operator, incident-safe artifact                      |
| Portfolio claim               | `EVD-CLM-###`  | public claim, supporting evidence, date, expiry/revalidation trigger           |

`EVD-REQ-P00-20260921`: [local durability checks and limitations](./PHASE-00-DURABILITY-EVIDENCE.md). Future evidence must never contain real secrets, raw payment data, identity documents, or unredacted personal data.
