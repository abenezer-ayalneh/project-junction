# Phase 03 local acceptance evidence

**Recorded:** 2026-10-12. **Scope:** `P03-C01` only, complete locally. Formal phase exit remains open.

Phase 00–01 entry dependencies have recorded local evidence; existing independent accessibility, retention, target storage/recovery and provider gates remain separate. All development and verification ran on the user's local machine, with disposable PostgreSQL schemas on loopback and a built API bound to loopback. No staging, remote acceptance testing or deployment was used.

## Verified behavior

The [PostgreSQL scenarios](../../libs/platform-core/src/lib/service-definitions.integration.ts) prove fixed Option/add-on terms, uniform buffers, eligible modes/Locations and Option-specific Staff qualification; durable configuration read through another repository; private Staff participating without public identity; atomic scope failures; concurrent expected-version updates; idempotency/reuse conflicts; consent/withdrawal/rename; self versus Owner consent authority; active membership links without new permissions; publication/Product exclusion; and rejection of excluded resource/group/recurring/home/Staff-override models.

The [built HTTP smoke](../../tools/check-service-definitions.mjs) uses disposable Better Auth user/session fixtures and an actual signed session cookie. It proves Staff create/link/list/self-read, configuration/read/replay, 400/403/409 responses, published anonymous definitions, private identity filtering, linked-Staff consent and withdrawal, and restricted Vendor visibility. Fixtures are cleaned by the integration runner; no credentials are retained in evidence.

## Verification

| Check                                                                                                                     | Result                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `FOUNDATION_TEST_NAME="Phase 03 Service definitions" pnpm nx run platform-core:test-integration` with local `.env` loaded | 11 scenarios pass; unrelated integration scenarios deliberately not selected; built Service HTTP smoke passes |
| `pnpm nx run-many -t lint,typecheck,test --projects=contracts,platform-core,api,worker,web --parallel=3`                  | All five projects pass; one existing worker test skipped; API OpenAPI snapshot passes                         |
| API/worker builds through integration dependencies                                                                        | Pass; six existing API optional dependency/source-map warnings                                                |
| `pnpm db:compat:check` with local `.env` loaded                                                                           | 34 migrations apply; Prisma schema has no difference                                                          |
| `pnpm db:upgrade:check` with local `.env` loaded                                                                          | Populated supported-foundation upgrade passes; no schema difference                                           |
| `pnpm db:migrate:local` after asserting loopback hostname                                                                 | Pending local development migrations applied through C01                                                      |
| OpenAPI additive comparison                                                                                               | Existing paths and component schemas unchanged                                                                |
| `pnpm docs:check` and `pnpm contracts:check`                                                                              | Pass                                                                                                          |

[Machine-readable verification record](./evidence/phase-03-c01-2026-10-12/verification.json).

## Remaining scope and gates

Public `anyStaffEligible` is qualification eligibility only. Hours, exceptions, breaks, lead time, horizon, timezone and existing allocation filtering belong to C02. C03–C11 own holds, UI, Booking/payment/policies/meeting/attendance proof. No double-booking, provider integration, screen-reader or phase exit acceptance is claimed here. Stable definition IDs are retained within versioned configuration; JSON Staff/Location references rely on transactional API validation rather than database foreign keys. No browser UI was changed or tested in C01.

**Next:** `P03-C02` — Authoritative slot calculation. The request ends after this chunk.
