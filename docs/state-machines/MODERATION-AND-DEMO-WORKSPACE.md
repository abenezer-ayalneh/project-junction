# Moderation and Demo Workspace State Machines

**Status:** Specified — Not Executed — Not Verified

## `STATE-TRUST-001` — Moderation/enforcement

| From → to                               | Actor                                                   | Guard                                                               | Side effect                                                                      | Timeout/terminal/recovery                                                                 |
| --------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Reported/Signaled → Triaged             | authorized Trust/automation queue                       | report is in scope and minimally classified; automation only queues | assign risk/owner, preserve evidence, audit                                      | stale/duplicate report is linked/no-op; no automatic irreversible action                  |
| Triaged → NoAction                      | Trust reviewer                                          | evidence/policy supports no action                                  | record reason and safe notification where appropriate                            | terminal unless new report/evidence opens a fresh review                                  |
| Triaged → Warning                       | Trust reviewer                                          | proportionate policy breach with lower risk                         | notify, record corrective expectation/audit                                      | expiry/follow-up is scheduled; escalation requires new review                             |
| Triaged → Restricted                    | authorized Trust role                                   | policy/risk/evidence and required approval tier                     | block new commitments, preserve necessary records/open obligations, notify/audit | appeal may modify/reinstate; no ledger alteration                                         |
| Triaged → Suspended                     | authorized Trust role + distinct checker when high risk | serious/repeated breach with evidence/approval                      | suspend scoped capabilities, preserve evidence/open obligations, notify/audit    | appeal/reinstatement route; no automatic permanent financial outcome                      |
| Warning/Restricted/Suspended → Appealed | affected scoped actor                                   | appeal window/evidence rule                                         | preserve appeal evidence and assign independent review where required            | expired/invalid appeal receives reason, no history edit                                   |
| Appealed → Upheld/Modified/Reinstated   | authorized reviewer + required checker                  | appeal evidence and policy complete                                 | audit decision, adjust only prospective scope, notify parties                    | terminal subject to documented new evidence/review; no automatic irreversible enforcement |

Every decision has actor, policy, scope, evidence, reason, notification and audit. Restricted state blocks new commitments but retains necessary record/open-obligation access. No transition directly alters a ledger record.

## `STATE-DEMO-001` — Demo workspace

| From → to                  | Actor               | Guard                           | Side effect                                 | Timeout/terminal/recovery                     |
| -------------------------- | ------------------- | ------------------------------- | ------------------------------------------- | --------------------------------------------- |
| Requested → Provisioning   | reviewer/demo entry | abuse/Turnstile check and quota | synthetic namespace/personas                | failed provision cleans partial work          |
| Provisioning → Active      | demo controller     | isolated synthetic resources    | scoped session/access event                 | max 24-hour expiry clock                      |
| Active → Expired           | clock               | fixed 24 hours elapsed          | revoke access, enqueue purge                | no extension by default                       |
| Expired → Purging → Purged | cleanup worker      | all tagged resources found      | delete/tombstone DB/media/search/cache/jobs | retry idempotently; failure invokes `RUN-012` |

Role switching reissues scoped synthetic context; it does not grant simultaneously broad global authority. No state permits promotion to staging/portfolio production/future commercial data.
