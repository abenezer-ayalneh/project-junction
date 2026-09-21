# Developer Workflows and Troubleshooting

> **Document status:** specified procedure
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-004`–`DEC-005`, `DEC-079`–`DEC-088`, `DEC-116`, `DEC-121`, `DEC-138`, `DEC-157`–`DEC-160`](../governance/DECISION-REGISTER.md)
> **Normative owner:** intended development-loop behavior

## Target daily workflow

**Procedure status: Specified — Not Executed — Not Verified.**

1. Pull/rebase according to the future trunk policy and inspect the working tree.
2. Start or health-check local dependencies.
3. Regenerate contracts only through the repository task; inspect generated diffs.
4. Work within one bounded context and update its requirements/ADR/contracts when behavior changes.
5. Run affected lint, type, unit, integration, authorization, and contract checks.
6. Exercise the changed journey in a synthetic persona.
7. Inspect exact diff and update traceability/evidence before review.

Proposed future task names include `pnpm check`, `pnpm test:affected`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm contracts:check`, and `pnpm docs:check`. They are **DERIVED-PLAN-DEFAULTS**, not existing commands.

## Common diagnostic order

**Procedure status: Specified — Not Executed — Not Verified.**

1. Confirm exact runtime/package-manager versions and lockfile state.
2. Check Compose service health and allocated disk/memory.
3. Check API readiness, worker heartbeat, queue lag, and database migration head.
4. Check whether failure belongs to authoritative PostgreSQL state or a derived Redis/search/realtime view.
5. Correlate request, outbox, job, provider, inbox, and reconciliation IDs.
6. Reproduce with a minimal synthetic workspace and preserve non-secret evidence.

## Failure guide

| Symptom                 | First checks                                                           | Safe response                                                    |
| ----------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Generated client drift  | OpenAPI diff, Zod operation IDs, codegen version                       | Regenerate through task; never hand-edit generated output        |
| Search missing/stale    | Outbox status, index worker, publication eligibility                   | Replay/rebuild projection; do not patch index as truth           |
| Job repeats             | Stable job ID, local uniqueness, provider idempotency, attempt history | Fix idempotency/reconcile; do not delete evidence                |
| Payment “stuck”         | Provider mode, webhook inbox, retrieval/reconciliation                 | Leave pending until verified; never force success from UI return |
| Stock/slot conflict     | Hold expiry, lock order, reservation owner/version                     | Re-run authoritative quote/hold; do not adjust balances directly |
| Cross-role denial       | AccessContext, workspace/Vendor/Location grant, recent auth            | Fix policy/test; never bypass with unscoped repository access    |
| Media never publishes   | quarantine, checksum/type, scan/transcode/moderation/caption           | Retry idempotently or reject safely                              |
| Hydration/live mismatch | Server/client boundary, query hydration, event cursor                  | REST refetch; realtime remains advisory                          |

## Escalation rule

If resolving a local issue would require real provider credentials, destructive shared data changes, production access, or weakening an invariant, stop and use the relevant deployment/security/runbook review. Local convenience never broadens authorization.

## Related documents

- [Local development setup](LOCAL-DEVELOPMENT-SETUP.md)
- [Background jobs](../architecture/BACKGROUND-JOBS-OUTBOX-AND-RECONCILIATION.md)
