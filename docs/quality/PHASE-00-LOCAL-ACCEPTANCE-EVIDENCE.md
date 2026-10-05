# Phase 00 local acceptance evidence

**Recorded:** 2026-10-05  
**Scope:** loopback-only local development  
**Status:** substantial local acceptance recorded; the password-reset form, Google sign-in, same-email linking, and different-email non-linking are user-confirmed. Membership and permission preservation across the Google linking cases was not independently inspected. This record is not public-release readiness.

This evidence uses a fresh local PostgreSQL database, local Redis, MinIO, ClamAV, and loopback-only Mailpit. It names no secrets, passwords, one-time links, cookie values, provider credentials, or personal accounts. The disposable accounts and catalog data exist only in the local database.

## Auth, policy, and local account evidence

| Evidence                                | Result                                                                                                                                                                                                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Served email signup and verification    | Passed. A fresh account was created at `http://localhost:3000/account`; Mailpit received the verification message; the browser reached the verified-account confirmation; the account then signed in and signed out.                                                                      |
| Password recovery endpoint              | Passed — 2026-10-05. A fresh disposable `example.test` account completed email verification and recovery through the local Better Auth endpoints and Mailpit. Reset submission succeeded; both pre-reset sessions were revoked, the old password was rejected, and the replacement password created a valid session. No account identifier, password, token, or cookie was retained. The user reports completing the final served reset-form submission on 2026-10-05; a separate browser success screen was not retained. |
| Sign-out, revoked, and expired sessions | Passed. Browser sign-out returned the account view to anonymous state. A disposable local Junction session revoked in PostgreSQL and a disposable expired Better Auth session each received `403 ACCESS_DENIED` from the protected local access-context endpoint.                         |
| Identity/MFA deferral                   | Passed. The bridged local User record is `unverified` with a null adult-verification timestamp and a null MFA timestamp. An authenticated local request to the identity-session endpoint returned `403` with the documented public-release deferral before a Didit adapter could be used. |
| Reviewer authority                      | Passed. The local reviewer CLI granted review capability only to a verified-email account with a live session and no Vendor membership. A subsequent revoke removed the capability and left zero active reviewer grants and zero active Vendor memberships.                               |
| Owner scope and cross-Vendor denial     | Passed. A local Owner selected its own Vendor and returned to Customer scope. Selecting a foreign Vendor returned `403`; before/after audit and outbox counts were unchanged.                                                                                                             |
| Retry/idempotency                       | Passed. Repeating a local listing-create request with the same idempotency key returned the original listing with `replayed: true`; the database gained exactly one listing.                                                                                                              |

The temporary local policy therefore remains narrow: valid sessions, verified email, ownership/membership, explicit reviewer grants, revocation, audit, and idempotency stay effective. It does not manufacture adult verification or MFA state.

## Durable publication and realtime evidence

A separate local Owner application was approved by the separately granted reviewer. The Owner created and submitted a product listing; the reviewer approved it. The resulting `ListingPublished` outbox record reached `delivered` with one attempt and one durable receipt. The local Redis stream `junction:local:domain-events` contained the delivered event.

The realtime check used an authenticated local Socket.IO client and exercised the actual API gateway:

1. It joined the workspace room, acknowledged its empty baseline cursor, and disconnected.
2. While disconnected, the local reviewer published the disposable listing.
3. On reconnect, server-owned replay included `ListingPublished`.
4. The client acknowledged the returned cursor; a further reconnect replayed no duplicate events, and the session retained a durable replay cursor.

This proves the local PostgreSQL outbox → worker → Redis stream/live notification → authenticated replay/acknowledgement path. It does not prove any remote ingress or provider behavior.

## Operational and automated evidence

- Local Compose dependencies started on loopback; the API health endpoint reported `runtimeMode: "local"` and PostgreSQL storage. Mailpit, PostgreSQL, Redis, MinIO, ClamAV, and the application processes were available. Mailpit published SMTP only at `127.0.0.1:1025`. The worker emitted healthy `worker.heartbeat` records.
- The retained local Compose volumes are `project-junction-local_junction_postgres`, `project-junction-local_junction_redis`, `project-junction-local_junction_minio`, `project-junction-local_junction_clamav`, and `project-junction-local_junction_meilisearch`.
- Local migrations applied all 22 Prisma migrations and the two Better Auth migrations to the fresh database. The local MinIO initialization bucket was created successfully.
- `pnpm nx run platform-core:typecheck`, `pnpm nx run platform-core:test`, `pnpm nx run api:test`, and the Nx multi-project typecheck for platform core, API, worker, and web passed.
- `pnpm nx run platform-core:test-integration` passed using an isolated disposable local PostgreSQL schema. It included migration restart, Better Auth MFA boundary, compatibility, populated-upgrade, restore rehearsal, workspace-lock measurement, durable-event/replay, and integration coverage. The temporary schemas were removed by the runner.
- Phase 00 follow-up on 2026-10-05: `pnpm docs:check` passed; `pnpm nx run platform-core:test` reported 18 passing tests from the Nx cache; `pnpm nx run web:test` passed 5 tests; and `pnpm nx run web:typecheck` passed. The served page identifies itself as `Junction | Local development`. The user reports completing the served reset-form submission.
- `NEXT_PUBLIC_JUNCTION_RUNTIME_MODE=local pnpm nx run web:build` did not complete: `next/font` could not fetch Geist from `fonts.googleapis.com` in the restricted network. No production web build is claimed; rerun when that font resource is available locally or network access is allowed.

## Remaining local and release gates

| Gate                                                                                     | State                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Console client, browser consent, callback, and same-email/different-email linking | Basic Google sign-in passed per user confirmation — 2026-10-05. Read-only Console inspection confirmed the authorized JavaScript origin `http://localhost:3000`, exact redirect `http://localhost:3000/api/auth/callback/google`, and External/Testing audience. Test users are listed. The first selected-account attempt returned `/api/auth/error?error=invalid_code`; the user later confirmed a fresh Google login created a new Google-only account. A reverse-order email/password signup using that same address returned Better Auth's generic duplicate-signup response; exact-address Mailpit search found no message, as expected for an existing User. Later, the user followed the correct order with an unused invited Google identity: email/password signup, Mailpit verification, then Google sign-in using the same address. The user confirmed that this worked, so same-email linking is passed by user report. The user also confirmed the different-email non-linking case worked. Membership/permission preservation was not independently checked in database records. Do not store credentials, cookies, tokens, account addresses, or raw inbox exports in evidence. |
| Served reset-form submission                                                              | Completed per user confirmation — 2026-10-05. The local recovery request reached Mailpit and endpoint/session-revocation behavior passed; the user reports submitting the served password-entry form. No separate browser success screen was retained. |
| Public release                                                                           | Deferred. Restore and accept MFA enrollment/challenge/adverse paths, Didit approval/decline/replay/reconciliation/revocation, deployment ingress, off-host encrypted backup/recovery, capacity, and provider failure checks. |
| Staging restoration                                                                      | Deferred. Staging is preserved and suspended. This local record does not authorize contacting or restarting it.                                                                                                              |

The staged MFA and Didit code and regression coverage remain preserved. Local acceptance must never be represented as public-release or provider acceptance.
