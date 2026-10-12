# Phase 06 — Hardening and Public Release

**Status:** Specified — Not Executed — Not Verified  
**Objective:** release the complete synthetic portfolio experience only after evidence, not partial feature claims.  
**Owner:** release governance, security, quality, and operations  
**Entry:** Phase 00–05 exit evidence. **Exit:** public portfolio release gate passed.  
**Decision coverage:** `DEC-061`, `DEC-062`, `DEC-089`–`DEC-097`, `DEC-109`–`DEC-111`, `DEC-120`, `DEC-124`, `DEC-136`, `DEC-137`, `DEC-139`, `DEC-153`, `DEC-157`–`DEC-160`, `DEC-168`–`DEC-179`

## Included / excluded

Includes separate staging/portfolio production target, private promotion gate, no-signup synthetic demo, all role personas, 24-hour expiry/purge, ASVS 5.0 Level 2 applicability, performance/SLO/recovery evidence, accessible/low-connectivity proof, deployment/release/rollback runbooks, and portfolio claims/evidence. Excludes commercial Dire Dawa launch, real user data, live payments/KYB, unvalidated providers, and SLA claims.

## Actors and proof journey

A release operator promotes a previously evidenced artifact from private staging through the planned gate without promoting data, secrets, or provider identities. A no-signup reviewer enters an isolated synthetic workspace and switches only among scoped personas to exercise the complete goods-and-Bookings contract. Platform operations observe errors, reconciliation, and cleanup; a failure triggers the appropriate prospective runbook and blocks the public claim until recovery evidence exists. No role or demo action makes a future Dire Dawa commercial launch implicit.

## Functional requirements

- `REQ-P06-DEM-001`: a no-signup workspace may expose all roles only through scoped synthetic personas and global/high-risk actions are unavailable/simulated.
- `REQ-P06-DEM-002`: workspace expires at 24 hours, is quota-bound, cleans database/media/search/jobs/cache, and proves purge.
- `REQ-P06-REL-001`: public release proves full goods+Bookings/mixed cart/pickup+delivery/in-person+online/support/trust/finance/ops contract.
- `REQ-P06-SEC-001`: release maps applicable ASVS L2/control evidence and blocks critical/high unresolved issues absent documented accepted risk.
- `REQ-P06-REL-002`: staging and portfolio production remain isolated; artifact promotion is controlled, data/secret/provider identity promotion is forbidden.
- `REQ-P06-DR-001`: release requires deployment/rollback, backup/PITR, clean-host restore, provider outage, queue/outbox, search/media/security incident runbook drills.

`REQ-P06-UX-001`: the complete supported marketplace journey meets the [Marketplace UI/UX specification](../product/MARKETPLACE-UI-UX-SPECIFICATION.md) across narrow/wide viewports, Light/Dark/System themes, zoom/pseudo-localization, keyboard/screen-reader operation, missing content, reduced motion, and low-connectivity recovery (`DEC-191`–`DEC-193`; `TST-P06-006`, existing `TST-P06-004`). Acceptance uses served local interfaces plus authoritative contract/state evidence; screenshots cannot prove transactions or provider behavior. This addition remains **Specified — Not Executed — Not Verified**.

## Quality and acceptance

`TST-P06-001` demo isolation/purge, `TST-P06-002` clean-host RPO/RTO, `TST-P06-003` 100-user/10-checkout-minute capacity, `TST-P06-004` WCAG/pseudo-locale/low-connectivity, `TST-P06-005` release/rollback/ASVS gate. All require `EVD-*` results. Any missing proof blocks public claim/release; it does not lower the bar. Commercial research/pilot begins only under future gates.

## Implementation chunks

**Plan updated:** 2026-10-12. Chunk boundaries are derived planning defaults; existing requirements, policies and phase gates remain authoritative. Follow the [single-chunk workflow](./MULTIPHASE-REQUIREMENTS.md#single-chunk-workflow). Complete one chunk per request, in the order below, after its dependencies are ready. Each chunk includes relevant contracts/state/events, scoped authority, implementation, local verification and documentation updates.

**First chunk:** `P06-C01`, subject to this phase’s entry dependencies. All chunks below are planned and unverified; completing a chunk does not accept the phase exit.

| Chunk                                                 | Status  | Scope and requirement coverage                                                                                                            | Dependency                | Completion evidence                                                                                                                                                          |
| ----------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P06-C01` — Synthetic demo personas and isolation     | Pending | No-signup isolated synthetic workspace with scoped role switching and simulated global/high-risk actions. (REQ-P06-DEM-001)               | Phase 00–05 exit evidence | Cross-workspace leakage, role escalation and absence of real data/provider identities.                                                                                       |
| `P06-C02` — Demo quotas, expiry and purge             | Pending | 24-hour expiry and quota controls across database/media/search/jobs/cache. (REQ-P06-DEM-002)                                              | `P06-C01`                 | Expiry/retry/concurrency, partial cleanup recovery and complete purge evidence; TST-P06-001.                                                                                 |
| `P06-C03` — Complete marketplace journey proof        | Pending | Local end-to-end goods/Bookings, mixed Cart, pickup/delivery, in-person/online and support/trust/finance/ops. (REQ-P06-REL-001)           | `P06-C02`                 | Revalidate phase evidence and adverse paths; missing requirements block complete-experience claims.                                                                          |
| `P06-C04` — Accessibility and responsive recovery     | Pending | Narrow/wide layouts, themes, zoom, pseudo-localization, keyboard/screen reader, reduced motion and low connectivity. (REQ-P06-UX-001)     | `P06-C03`                 | Served local matrix with authoritative state evidence, including independent review gaps; TST-P06-004/006.                                                                   |
| `P06-C05` — Security and identity release controls    | Pending | Applicable ASVS 5.0 L2 evidence and public-release MFA/adult verification restoration with adverse-provider paths. (REQ-P06-SEC-001)      | `P06-C04`                 | Local security/control tests and unresolved critical/high risk review; record unavailable live-provider evidence.                                                            |
| `P06-C06` — Capacity and observability proof          | Pending | Local performance/SLO/error/reconciliation monitoring under defined load and failure conditions. (REQ-P06-REL-001)                        | `P06-C05`                 | 100-user/10-checkout-minute capacity, saturation/backpressure and observability evidence; TST-P06-003.                                                                       |
| `P06-C07` — Recovery and incident runbook drills      | Pending | Local deployment/rollback, backup/PITR, clean-host restore, provider outage, queue/outbox, search/media/security drills. (REQ-P06-DR-001) | `P06-C06`                 | Local isolated restore/rebuild, measured RPO/RTO and failure/recovery evidence; TST-P06-002/005; report unavailable local checks.                                            |
| `P06-C08` — Promotion isolation and release readiness | Pending | Prepare artifact/rollback and staging/production separation plans with no data/secret/provider identity promotion. (REQ-P06-REL-002)      | `P06-C07`                 | Local configuration/artifact review, gate records, truthful portfolio claims and remaining target-only evidence; no deployment authorization.                                |
| `P06-C09` — Final gate review and authorized release  | Pending | Review all phase evidence, exceptions and public claims; identify external release checks separately. (All Phase 06 requirements)         | `P06-C08`                 | TST-P06-001–006 and EVD records; keep blocked gates open. Remote checks/staging deployment require an explicit user request; public publication requires user authorization. |

**Tracking:** when a chunk finishes, update its status and add dated local implementation/evidence notes in this document, update relevant linked contracts/policies/acceptance documents, and set the next chunk in this document and [Documentation Status](../STATUS.md). If blocked, record the missing dependency and retain this chunk as next; do not silently advance.
