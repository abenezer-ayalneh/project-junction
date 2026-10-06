# Phase 00 — Platform Foundation

**Target status:** Specified — Not Executed — Not Verified. **Local status:** Complete for the documented local-development scope on 2026-10-06. Advanced verification remains a pre-public-release gate.
**Objective:** establish the future system’s safe, traceable foundation before any market capability.  
**Owner:** platform foundation / architecture  
**Entry:** documentation baseline accepted. **Local exit:** completed on 2026-10-06 with `TST-P00-001`–`TST-P00-005`, local real-account/email/Google evidence, reviewer authorization, outbox, and revocation paths. **Public-release gate:** MFA, adult identity verification, provider webhook/reconciliation, deployment, recovery, and capacity acceptance. Phase 06 retains the public-release gates.
**Decision coverage:** `DEC-067`–`DEC-073`, `DEC-107`, `DEC-117`–`DEC-125`, `DEC-129`, `DEC-153`

## Included / excluded

Includes target Nx modular-monolith boundaries, Next/Nest/worker contracts, identity/access context, API/event conventions, database ownership, auth/session topology, outbox/inbox, observability baseline, and design system foundation. Current development uses local Better Auth accounts, Mailpit delivery, Google OAuth, and explicit reviewer grants. MFA, Didit sandbox age checks, private staging deployment, public onboarding, live payments, and commercial release are deferred.

## Actors and journey

A local user signs up through Better Auth, verifies email through Mailpit or signs in with Google, and gains only capabilities justified by a revocable membership or explicit operator grant. A separate local reviewer can approve or reject a Vendor application. Every accepted command remains traceable through audit, outbox, and reconciliation records. Before public release, that journey must add MFA and adult identity verification without weakening authorization. No Customer transaction exists yet.

## Functional requirements

- `REQ-P00-IAM-001`: derive `AccessContext` from revocable session, membership, active role, optional Location, and workspace—not client claims.
- `REQ-P00-IAM-002`: support verified adult accounts, public browsing, MFA/recent-auth for specified privileged roles/actions, and optional Staff/User linkage.
- `REQ-P00-API-001`: define versioned REST/OpenAPI/Zod public contracts and canonical errors/idempotency conventions.
- `REQ-P00-DATA-001`: establish context ownership, transactional PostgreSQL truth, audited SQL lane for locks, and migration compatibility strategy.
- `REQ-P00-EVT-001`: define transactional outbox, provider webhook inbox, worker retry/dead-letter/reconciliation behavior.
- `REQ-P00-DEMO-001`: retire the legacy synthetic HTTP boundary. Test fixtures may exercise isolated repository behavior, but no runtime may register synthetic account creation, no-signup persona switching, fake callbacks, or promotion of demo records.

## Affected definitions

`AccessContext`, `API-001`–`API-006`, `EVT-001`–`EVT-006`, `INV-ACCESS-001`, `STATE-DEMO-001`, target auth/session and outbox documents.

## Failure and quality rules

Expired/revoked/mismatched scope denies safely; duplicate command resolves to original outcome; provider timeout becomes pending/reconcile; offline mutation is blocked with a draft/retry explanation. ASVS mapping, audit logging, PII minimization, WCAG base primitives, health/trace/error signals, and role/IDOR tests are mandatory.

## Acceptance and deferrals

`TST-P00-001`: stale role, cross-Vendor/Location/workspace ID substitution, replayed command, and WebSocket room attempt all fail without leakage. `TST-P00-002`: the historical synthetic demo boundary is independently purged and cannot be entered in local or deployment runtime. `TST-P00-003`: public contracts and compatible migration paths stay isolated from persistence types. `TST-P00-004`: outbox replay and retry create no duplicate business effect or false delivery receipt. `TST-P00-005`: a documentation/status review finds no unlabeled target claim or unlinked requirement. Local Phase 00 additionally requires Mailpit verification/recovery, Google configuration and callback evidence, reviewer grant/revocation, and safe denial with unchanged resource, audit, and outbox state. Pre-public-release acceptance requires MFA, Didit signed approval/rejection/status replay, provider reconciliation, deployment/recovery, and capacity evidence. Native apps, live payments, and commercial access are deferred.

## Implementation evidence

See [Phase 00 durability evidence](../quality/PHASE-00-DURABILITY-EVIDENCE.md) for the dated, requirement-linked local regression record. That evidence does not prove the new private-staging exit or close Phase 06 release gates.

The [real-service transition tracker](../quality/PHASE-00-REAL-TRANSITION.md) records the subsequent private-staging work and its open acceptance gates. The local synthetic acceptance does not satisfy those gates.
