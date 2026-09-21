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

## Quality and acceptance

`TST-P06-001` demo isolation/purge, `TST-P06-002` clean-host RPO/RTO, `TST-P06-003` 100-user/10-checkout-minute capacity, `TST-P06-004` WCAG/pseudo-locale/low-connectivity, `TST-P06-005` release/rollback/ASVS gate. All require `EVD-*` results. Any missing proof blocks public claim/release; it does not lower the bar. Commercial research/pilot begins only under future gates.
