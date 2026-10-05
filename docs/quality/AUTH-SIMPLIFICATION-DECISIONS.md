# Local authentication and staging suspension decision record

**Date:** 2026-10-05  
**Status:** accepted for current local development  
**Decision:** [`DEC-190`](../governance/DECISION-REGISTER.md#dec-190)  
**Related ADR:** [ADR-0017](../adr/ADR-0017-LOCAL-ONLY-DEVELOPMENT-AUTHENTICATION.md)

## Decisions and rationale

1. Active development uses a fresh, isolated local database and fresh local accounts. It does not import staging data, use staging credentials, or treat private staging as a development dependency. This keeps early work reversible and prevents accidental mutation of provider-backed state.
2. Local sign-in supports email/password with verification and recovery, plus Google OAuth. Development mail is delivered to loopback-only Mailpit. Google is configured only from ignored local configuration.
3. A Google identity can link to an existing User only when Google reports the same verified email and the existing local account has already verified that email. Linking preserves the User, memberships, permissions, and audits; it never grants a role.
4. Local MFA enrollment/challenge, recent-MFA enforcement, Didit screens, Didit endpoints, and worker reconciliation are deferred. Local Users remain adult-unverified and receive no fabricated MFA or identity timestamps. Session validation, email verification, ownership, membership, explicit reviewer grants, revocation, audit, and idempotency remain required.
5. The local reviewer tool grants or revokes an explicit reviewer grant only after verified email and a valid local session. It refuses active Vendor membership and cannot self-approve a Vendor application.
6. Private staging is suspended. Junction application containers are stopped, the Junction Caddy routes return `503`, and automatic branch-push image publication is disabled. Junction volumes, protected configuration, backups, and provider records remain preserved for later manual restoration. Unrelated portfolio services were verified healthy during suspension.
7. Before any public release, MFA and Didit must be restored and accepted with their adverse-path, callback/reconciliation, recovery, deployment, backup/recovery, and capacity gates. Local acceptance is not public-release readiness.

## Implementation and acceptance status

The repository implements the explicit `local` runtime, loopback dependency checks, Mailpit SMTP delivery, local Google configuration, controlled account-linking policy, local reviewer grant/revoke command, and the local-policy boundary. It retains the strict staging configuration path and the MFA/Didit code and tests for later restoration. The user reports completing the final served password-reset form on 2026-10-05; endpoint/session-revocation behavior was independently verified locally.

Google Console registration is present; its localhost origin, exact Better Auth callback, and External/Testing audience were confirmed read-only on 2026-10-05. Test users are listed. The first selected-account attempt returned `/api/auth/error?error=invalid_code`; a fresh Google-only account login later passed per user report. The reverse-order email/password signup used that same address and correctly produced Better Auth's generic duplicate response without sending another email. The user then followed the correct order with an unused Google tester—email/password signup, Mailpit verification, then Google sign-in—and confirmed that same-email linking worked. The user also confirmed the different-email non-linking case worked. Membership/permission preservation was not independently checked against database records. See the [dated local evidence](PHASE-00-LOCAL-ACCEPTANCE-EVIDENCE.md) for the observed history and remaining checks.
