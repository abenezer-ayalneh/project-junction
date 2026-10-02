# Phase 00 — Platform Foundation

**Target status:** Specified — Not Executed — Not Verified. **Local status:** Accepted synthetic foundation on 2026-09-23; real private-staging transition in progress and not accepted.
**Objective:** establish the future system’s safe, traceable foundation before any market capability.  
**Owner:** platform foundation / architecture  
**Entry:** documentation baseline accepted. **Exit:** `TST-P00-001`–`TST-P00-005` regression evidence plus a verified private-staging run of real account, email, MFA, adult-identity, reviewer, webhook, outbox, and revocation paths. Phase 06 retains the public-release gates.
**Decision coverage:** `DEC-067`–`DEC-073`, `DEC-107`, `DEC-117`–`DEC-125`, `DEC-129`, `DEC-153`

## Included / excluded

Includes target Nx modular-monolith boundaries, Next/Nest/worker contracts, identity/access context, API/event conventions, database ownership, auth/session topology, outbox/inbox, observability baseline, and design system foundation. The current exit also includes Better Auth accounts, Resend delivery, Didit sandbox age checks, real reviewer grants, and deployment to a private staging origin with invited test users. Public onboarding, live payments, and commercial release remain outside this phase.

## Actors and journey

An invited user signs up through Better Auth, verifies email through Resend, completes MFA and the Didit sandbox age check, and gains only the capabilities justified by current provider state and a revocable membership or operator grant. A separate invited reviewer can approve or reject a Vendor application after recent MFA. Every accepted command remains traceable through audit, outbox, and reconciliation records. No Customer transaction exists yet.

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

`TST-P00-001`: stale role, cross-Vendor/Location/workspace ID substitution, replayed command, and WebSocket room attempt all fail without leakage. `TST-P00-002`: the historical synthetic demo boundary is independently purged and cannot be entered in staging. `TST-P00-003`: public contracts and compatible migration paths stay isolated from persistence types. `TST-P00-004`: outbox/webhook replay and retry create no duplicate business effect or false delivery receipt. `TST-P00-005`: a documentation/status review finds no unlabeled target claim or unlinked requirement. Phase 00 exit additionally requires private HTTPS staging evidence for real mailbox delivery, Better Auth login and recovery, recent MFA, Didit signed approval/rejection/status replay, reviewer grant and revocation, and safe denial with unchanged resource, audit, and outbox state. Native apps, live payments, and commercial access are deferred.

## Implementation evidence

See [Phase 00 durability evidence](../quality/PHASE-00-DURABILITY-EVIDENCE.md) for the dated, requirement-linked local regression record. That evidence does not prove the new private-staging exit or close Phase 06 release gates.

The [real-service transition tracker](../quality/PHASE-00-REAL-TRANSITION.md) records the subsequent private-staging work and its open acceptance gates. The local synthetic acceptance does not satisfy those gates.
