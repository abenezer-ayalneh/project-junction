# Phase and Release Gates

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** transition and public-release gate criteria  
**Decision coverage:** `DEC-004`, `DEC-005`, `DEC-106`, `DEC-138`, `DEC-153`, `DEC-157`–`DEC-160`

| Gate                     | Must be true                                                                                                                                                | Cannot be substituted by                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Phase exit               | phase `REQ-*` accepted; policies/invariants/API/state/event mapping; adverse/retry/concurrency/offline tests; required security/a11y/observability evidence | screenshots, happy-path demo, source review only |
| Finance-affecting exit   | balanced ledger/reconciliation, idempotent provider handling, approval/audit, compensation/recovery                                                         | editable balance or provider dashboard alone     |
| Public portfolio release | all Phase 00–06 requirements, complete goods+Bookings mixed contract, MFA, adult identity verification and adverse provider paths, staging/production/demo isolation, ASVS, recovery, capacity, portfolio-claims review | private slice, local email/Google evidence, or earlier `DEC-138` plan |
| Future commercial launch | every Dire Dawa legal/payment/tax/KYB/demand/logistics/economics/pilot gate                                                                                 | portfolio demo or sandbox proof                  |

Private milestones may prove a narrow slice as learning evidence, but may not be presented as the full public release. Gate decisions record version, reviewers, evidence IDs, exceptions, compensating plan, and next revalidation time. `DEC-138` stays marked `SUPERSEDED` and is never silently overwritten.
