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

## Phase 03 local Service definition prerequisite — 2026-10-12

[P03-C01 local evidence](./PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md) and [verification record](./evidence/phase-03-c01-2026-10-12/verification.json) record fixed Service Options/add-ons, Vendor Location/online eligibility, Staff qualification and private versus consented identity. Local PostgreSQL/HTTP, migration and workspace checks pass. This is partial `REQ-P03-SCH-001` coverage; no slot/allocation/Booking/provider or formal phase acceptance is claimed. Next is C02.

## Phase 03 local authoritative availability — 2026-10-12

[P03-C02 local evidence](./PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c02--authoritative-slot-calculation--2026-10-12) and [verification record](./evidence/phase-03-c02-2026-10-12/verification.json) record timezone-aware hours/date exceptions/breaks, duration/buffers, lead/horizon, current qualification/mode and controlled allocation filtering. Unit, PostgreSQL/HTTP, audited Scheduler CLI, migration and workspace checks pass. Atomic hold/no-double-booking, paid Booking, provider, UI and formal phase acceptance remain open. Next is C03.

## Phase 03 local atomic Staff reservation — 2026-10-12

[C03 local evidence](./PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c03--atomic-namedany-staff-holds--2026-10-12) and [verification record](./evidence/phase-03-c03-2026-10-12/verification.json) record local no-double-booking allocation/concurrency, private any-Staff, current revalidation, fixed deadline, release/worker expiry, retry and rollback proof. PostgreSQL/HTTP, actual worker, migration and workspace checks pass. UI, paid Booking/policies/providers, mixed checkout and formal phase exit remain open. Next is C04.

## Phase 03 C04 — 2026-10-12

[C04 local evidence](./PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c04--service-selection-and-booking-intent-ui--2026-10-12) and [verification record](./evidence/phase-03-c04-2026-10-12/verification.json) record exact selection, timezone, real slot-loss/read/offline recovery, unreserved Cart intent edit/remove and local browser captures/review. Workspace, PostgreSQL/HTTP, actual worker and web build checks pass. Paid lifecycle and formal acceptance remain open. Next is C05.

## Phase 03 C05 — 2026-10-12

[C05 local evidence](./PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c05--paid-booking-confirmation--2026-10-12) and [verification record](./evidence/phase-03-c05-2026-10-12/verification.json) record controlled payment, once-only confirmed allocation, immutable snapshots/attendee, late-success compensation and durable recovery. Local PostgreSQL/HTTP/worker, workspace and migration checks pass. C06 cancellation and later lifecycle/formal gates remain open.

## Phase 03 C06 — 2026-10-12

[C06 local evidence](./PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c06--cancellation-policy-and-refunds--2026-10-12) records purchased cancellation policy, full Vendor refunds, exact boundaries, replay/races, authority and rollback. [Verification](./evidence/phase-03-c06-2026-10-12/verification.json) records local PostgreSQL/HTTP/worker, workspace and 38-migration checks. C07 and later lifecycle/formal gates remain open.
