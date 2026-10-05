# Phase 00 local manual acceptance

**Status:** local acceptance evidence recorded; reset-form submission, Google sign-in, same-email linking, and different-email non-linking are user-confirmed  
**Decision:** [`DEC-190`](../governance/DECISION-REGISTER.md#dec-190)  
**Supersedes:** the 2026-10-05 private-staging runbook as the current development checklist. Historical staging evidence remains in [the transition record](PHASE-00-REAL-TRANSITION.md).

Use fresh local accounts and the local Compose services. Record the date, commit, account aliases, sanitized request/event IDs, expected/actual result, and evidence location. Do not put passwords, OAuth tokens, cookies, provider keys, recovery links, raw inbox exports, or personal data in the repository or chat. The current dated results are in [the local evidence record](PHASE-00-LOCAL-ACCEPTANCE-EVIDENCE.md).

## Local identity and session cases

| Case                                  | Required result                                                                                                                                                                     | Status                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Email signup and verification         | A new local email/password account receives a Mailpit message and verifies through the browser. The User is authenticated only through a valid session.                             | Passed locally — 2026-10-05                                 |
| Password recovery                     | Mailpit receives the reset email; the served form submits the reset; prior sessions are revoked and only the replacement password authenticates.                                      | Endpoint and revocation passed locally — 2026-10-05; user reports served form submitted — 2026-10-05 |
| Google consent, callback, and linking | Confirm the existing client is for local development, correct its callback, finish test-mode consent, and verify same-email linking plus different-email non-linking. | Basic Google sign-in, same-email linking in the correct order, and different-email non-linking passed per user confirmation. Membership/permission preservation was not independently verified against database records. |
| Sign-out, expiration, and revocation  | Sign-out, an expired session, and a revoked session each deny protected REST and realtime access without resource/audit/outbox business effects.                                    | Passed locally — 2026-10-05                                 |
| Identity deferral                     | Local Users remain `unverified` for adult identity, MFA timestamps remain unset, and local browser/API/worker activity makes no Didit request.                                      | Passed locally — 2026-10-05                                 |

## Local authorization cases

| Case                   | Required result                                                                                                                                                                        | Status                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Owner scope switching  | An account with multiple real local Owner memberships can select an allowed membership and return to Customer scope. A foreign Vendor ID and revoked membership deny safely.           | Passed locally for own/Customer/foreign scope — 2026-10-05; multi-Owner and revoked-membership variants remain covered by integration |
| Reviewer grant/revoke  | The local operator grants/revokes only a verified-email account with a valid session and no active Vendor membership. Grant/revoke audits exist; revoke denies an open review session. | Passed locally — 2026-10-05                                                                                                           |
| Cross-Vendor denial    | An Owner cannot read or mutate another Vendor's resources. Compare the affected resource, audit rows, and outbox rows before/after the denied request.                                 | Passed locally — 2026-10-05                                                                                                           |
| No automatic authority | Google linking and reviewer grants preserve the User/memberships; neither creates Vendor ownership or self-approves a Vendor application.                                              | Reviewer portion passed locally — 2026-10-05; same- and different-email flows passed by user report, but membership/permission preservation was not independently checked |

## Durable-event and operations cases

| Case                                | Required result                                                                                                                                                                                     | Status                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Local publication/live delivery     | A real local listing publication emits one `ListingPublished` event through PostgreSQL outbox, Redis, API, and an authenticated observer.                                                           | Passed locally — 2026-10-05 |
| Missed-event replay/acknowledgement | Disconnect an observer for an authorized change, reconnect the same valid session, and verify server-owned replay/cursor acknowledgement.                                                           | Passed locally — 2026-10-05 |
| Retry/idempotency                   | Replay an authorized command and delivery retry; business effects remain singular even if a transport delivery repeats.                                                                             | Passed locally — 2026-10-05 |
| Recovery and operational baseline   | Record a local backup/restore rehearsal, dependency health, worker heartbeat, and the exact local volumes. This is local evidence only; off-host deployment recovery remains a public-release gate. | Passed locally — 2026-10-05 |

Run relevant Nx tests and the documentation check on the candidate revision before marking any row passed. A served browser journey is required for email and Google cases; source tests do not substitute for it.

## Deferred pre-public-release milestone

Before public release, restore the strict deployment runtime and complete: MFA enrollment/challenge failure, backup-code and recent-auth behavior; Didit approval/decline, signed callback retry/replay, delayed callback reconciliation, supersession, and revocation; deployment ingress, off-host encrypted backup/recovery, capacity, and provider failure paths. These cases are deferred, not passed or removed.
