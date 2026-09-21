# Phase 00 durability evidence — 2026-09-21

Status: local synthetic foundation implemented; full Phase 00 acceptance remains open.

## Scope and reproduction

This evidence concerns the Phase 00 continuation of the in-memory prototype. PostgreSQL 18/PostGIS runs in the project Compose service on loopback port 55432. The image requires AMD64 emulation on this ARM Mac. No external provider, real identity, public deployment, or commerce is involved. No Git repository/commit exists in this workspace.

Use Node 24 and pnpm 10.32.1. Install dependencies with `pnpm install`, then run:

```sh
pnpm env:local:up
# Create .env from .env.example only if no local .env already exists.
# Export its local settings into the current shell without printing them.
set -a
. ./.env
set +a
pnpm db:generate
pnpm db:migrate:local
pnpm check
pnpm test:integration
pnpm dev
```

`FOUNDATION_STORAGE=postgresql` selects durable synthetic storage and requires `DATABASE_URL`. Without that mode, existing unit-test doubles remain available and health labels them accordingly. Durable mode never seeds the prototype's fixed session. Tests create scoped, short-lived synthetic sessions explicitly. `SYNTHETIC_WEBHOOK_WORKSPACE_ID` must identify a synthetic workspace before the fake callback route is accepted. The static fake signature is a test seam, not provider signature verification.

`test:integration` runs through Nx, builds the API/worker, creates a uniquely named disposable schema in a loopback database, applies the migration chain twice, executes PostgreSQL tests and the cross-process smoke, then drops only its schema in `finally`. Use the project's synthetic database. It requires schema/extension creation privileges. No shared schema is reset or truncated. Logs must not contain environment values, tokens, or provider payloads.

## Requirement-to-evidence boundary

| Requirement / acceptance       | Implemented evidence                                                                                                                             | Still open                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| REQ-P00-IAM-001 / TST-P00-001  | Fresh database session/membership lookup; expiry/revocation/role and workspace/Vendor/Location substitution denial                               | Full identity topology, WebSocket room authorization and wider resource IDOR surfaces                            |
| REQ-P00-IAM-002                | Verified synthetic fixture required by durable derivation                                                                                        | Adult verification, MFA/recent-auth policy enforcement, public browsing and Staff/User linking                   |
| REQ-P00-API-001 / TST-P00-003  | Zod contracts, scoped replay/conflict handling, HTTP error envelopes, no persistence types in public contracts                                   | OpenAPI generation and compatibility gate                                                                        |
| REQ-P00-DATA-001               | Prisma CRUD, transactional audit/outbox/idempotency, clean migration/repeated deployment, injected outbox failure rolls back audit/outcome       | Upgrade from a populated supported release, mixed-version rollback, lock/load measurements and restore rehearsal |
| REQ-P00-EVT-001 / TST-P00-004  | Concurrent inbox dedupe, multi-worker claims, lease/token fencing, retry backoff, crash exhaustion, dead letters, deduplicated synthetic receipt | Real adapters, authenticated callbacks, timeout/reconciliation workflow and external-effect idempotency          |
| REQ-P00-DEMO-001 / TST-P00-002 | 24-hour expiry, 100-active-workspace local quota, expired access denial, workspace-owned data purge preserving other workspaces                  | No-signup persona switching, complete per-persona quotas and identity lifecycle cleanup                          |
| TST-P00-005                    | Entry/status/evidence/traceability updated to distinguish local implementation from target specifications                                        | Full documentation claim audit and ASVS/WCAG/release-gate review                                                 |

## Persistence and audited SQL lane

`libs/platform-core/src/lib/postgres-foundation.ts` owns the prototype persistence boundary. Public contracts do not import generated Prisma types. The client is generated under `libs/platform-core/generated/prisma`; Nx generation precedes builds/typechecks. API builds keep this library external so generated runtime assets resolve at their package location.

Raw SQL is limited to parameterized identity/workspace locks, provider/quota advisory locks, and outbox claim/recovery. Prisma handles CRUD. Workspace row locks serialize commands and purge within one workspace; this is deliberately conservative and requires throughput measurement before wider use. Session, User and membership locks prevent revocation racing an accepted command. Provider identity has a transaction-level advisory lock plus a unique constraint. Hash collisions serialize unrelated callbacks but cannot bypass unique identity checks.

Outbox selection uses `FOR UPDATE SKIP LOCKED`; claims have fresh fencing tokens, a 30-second lease and a three-attempt budget. Failures back off exponentially. Expired final attempts move to `dead_letter`; operators can inspect durable state. Completion atomically writes a unique synthetic receipt and acknowledges the claim. A stale worker cannot acknowledge a reclaimed token, including when the worker name is reused. This demonstrates database-only consumer effects; external side effects still need their own idempotent adapter.

The additive second migration retains prior columns and expands Session, IdempotencyRecord, ProviderInboxEvent and OutboxEvent, plus OutboxReceipt and a claim index. It performs no data backfill or destructive contraction. Roll back application code while retaining the added schema; do not drop columns or erase the database to undo a deployment. Existing initial-migration schema/type/index alignment and complete Prisma drift checks remain part of the broader compatibility gate.

Demo purge removes workspace sessions, memberships, locations, vendors, idempotency, inbox, outbox, receipts and audit records. A minimal workspace/expiry tombstone remains. Users are not workspace-owned and are not blindly deleted; demo persona/identity lifecycle needs its own ownership model before the full demo requirement can close.

## Verification record

- [Workspace checks](./evidence/phase-00-check-2026-09-21.txt): docs/contracts checks, all five projects lint/typecheck/test; 11 unit tests passed, no lint errors or warnings. All 18 Nx tasks executed without cache hits on the final run.
- [Database and runtime checks](./evidence/phase-00-integration-2026-09-21.txt): two migrations applied, second deployment a no-op; eight PostgreSQL scenarios passed; built API health/denial/replay/conflict and separate worker delivery passed. The database target is uncached; four prerequisite build/generation tasks used valid Nx cache results.
- API webpack compilation succeeded; worker build succeeded. The web was not changed or re-inspected in a browser during this continuation; prior visual evidence is not presented as fresh.

These establish only the scenarios above, not a public-release approval.

[Source checksums](./evidence/phase-00-source-2026-09-21.sha256) identify the tested persistence and integration source in this uncommitted workspace.
