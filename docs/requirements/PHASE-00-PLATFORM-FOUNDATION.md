# Phase 00 — Platform Foundation

**Status:** Partially implemented — local synthetic durability evidence; full acceptance open  
**Objective:** establish the future system’s safe, traceable foundation before any market capability.  
**Owner:** platform foundation / architecture  
**Entry:** documentation baseline accepted. **Exit:** `TST-P00-001` and release-gate evidence ready.  
**Decision coverage:** `DEC-067`–`DEC-073`, `DEC-107`, `DEC-117`–`DEC-125`, `DEC-129`, `DEC-153`

## Included / excluded

Includes target Nx modular-monolith boundaries, Next/Nest/worker contracts, identity/access context, provider abstraction, API/event conventions, database ownership, auth/session topology, outbox/inbox, test/demonstration isolation, observability baseline, and design system foundation. Excludes publicly usable commerce, real provider accounts, real identities, deployments, and public release.

## Actors and journey

Future developer/operator creates a strictly scoped synthetic actor, performs an authorized command with an idempotency key, receives typed outcome/error, and can trace it through audit/event/reconciliation boundaries. No Customer transaction exists yet.

## Functional requirements

- `REQ-P00-IAM-001`: derive `AccessContext` from revocable session, membership, active role, optional Location, and workspace—not client claims.
- `REQ-P00-IAM-002`: support verified adult accounts, public browsing, MFA/recent-auth for specified privileged roles/actions, and optional Staff/User linkage.
- `REQ-P00-API-001`: define versioned REST/OpenAPI/Zod public contracts and canonical errors/idempotency conventions.
- `REQ-P00-DATA-001`: establish context ownership, transactional PostgreSQL truth, audited SQL lane for locks, and migration compatibility strategy.
- `REQ-P00-EVT-001`: define transactional outbox, provider webhook inbox, worker retry/dead-letter/reconciliation behavior.
- `REQ-P00-DEMO-001`: require synthetic workspace boundary, no-signup role switching model, quotas, 24-hour expiry, and no data promotion.

## Affected definitions

`AccessContext`, `API-001`–`API-006`, `EVT-001`–`EVT-006`, `INV-ACCESS-001`, `STATE-DEMO-001`, target auth/session and outbox documents.

## Failure and quality rules

Expired/revoked/mismatched scope denies safely; duplicate command resolves to original outcome; provider timeout becomes pending/reconcile; offline mutation is blocked with a draft/retry explanation. ASVS mapping, audit logging, PII minimization, WCAG base primitives, health/trace/error signals, and role/IDOR tests are mandatory.

## Acceptance and deferrals

`TST-P00-001`: stale role, cross-Vendor/Location/workspace ID substitution, replayed command, and WebSocket room attempt all fail without leakage. `TST-P00-002`: synthetic demo boundary is independently purged. `TST-P00-003`: public contracts and compatible migration paths stay isolated from persistence types. `TST-P00-004`: outbox/webhook replay and retry create no duplicate business effect. `TST-P00-005`: a documentation/status review finds no unlabeled target claim or unlinked requirement. Native apps, live providers, and commercial access are deferred.

## Implementation evidence

See [Phase 00 durability evidence](../quality/PHASE-00-DURABILITY-EVIDENCE.md) for dated checks and explicit remaining gates. The requirement list above remains authoritative; database tests alone do not close Phase 00.
