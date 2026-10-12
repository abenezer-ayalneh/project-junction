# Phase 03 local acceptance evidence

**Recorded:** 2026-10-12. **Scope:** `P03-C01`–`P03-C03`, complete locally. Formal phase exit remains open.

Phase 00–01 entry dependencies have recorded local evidence; existing independent accessibility, retention, target storage/recovery and provider gates remain separate. All development and verification ran on the user's local machine, with disposable PostgreSQL schemas on loopback and a built API bound to loopback. No staging, remote acceptance testing or deployment was used.

## P03-C01 — Service definitions — 2026-10-12

### Verified behavior

The [PostgreSQL scenarios](../../libs/platform-core/src/lib/service-definitions.integration.ts) prove fixed Option/add-on terms, uniform buffers, eligible modes/Locations and Option-specific Staff qualification; durable configuration read through another repository; private Staff participating without public identity; atomic scope failures; concurrent expected-version updates; idempotency/reuse conflicts; consent/withdrawal/rename; self versus Owner consent authority; active membership links without new permissions; publication/Product exclusion; and rejection of excluded resource/group/recurring/home/Staff-override models.

The [built HTTP smoke](../../tools/check-service-definitions.mjs) uses disposable Better Auth user/session fixtures and an actual signed session cookie. It proves Staff create/link/list/self-read, configuration/read/replay, 400/403/409 responses, published anonymous definitions, private identity filtering, linked-Staff consent and withdrawal, and restricted Vendor visibility. Fixtures are cleaned by the integration runner; no credentials are retained in evidence.

### Verification

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

### C01 remaining scope at completion

Public `anyStaffEligible` is qualification eligibility only. Hours, exceptions, breaks, lead time, horizon, timezone and existing allocation filtering belong to C02. C03–C11 own holds, UI, Booking/payment/policies/meeting/attendance proof. No double-booking, provider integration, screen-reader or phase exit acceptance is claimed here. Stable definition IDs are retained within versioned configuration; JSON Staff/Location references rely on transactional API validation rather than database foreign keys. No browser UI was changed or tested in C01.

**Next at C01 completion:** `P03-C02`; subsequently completed below.

## P03-C02 — Authoritative slot calculation — 2026-10-12

**Complete locally.** Scope is `REQ-P03-SCH-001` current availability calculation, with C01 qualifications. Actual atomic holds/no-double-booking and paid Booking lifecycles remain separate gates.

### Verified behavior

[Slot/contract unit scenarios](../../libs/platform-core/src/lib/slot-calculation.spec.ts) cover half-open hours, both buffers, combined Staff/Location breaks, date replacements/closures, exact lead/horizon, occupied bounds/adjacency, private any-Staff union, non-hour timezone offsets, spring gap/fall repeated instants, overnight/local-date exceptions, invalid calendars/queries and complete seven-day/five-minute output for 100 qualified Staff. Duration is elapsed time; no nonexistent wall-clock time is converted into a slot.

[PostgreSQL scenarios](../../libs/platform-core/src/lib/service-scheduling.integration.ts) prove current Option/add-on price/duration/buffers, consent-aware named/private any Staff, active/expired/terminal holds and booked occupancy, cross-mode blocking, changed calendars/qualification/rules, online versus closed Locations, differing calendar timezones, replay/key conflicts, concurrent expected-version edits, cross-Vendor/partial Location scope, linked-Staff own authority, audited local Scheduler CLI enable/disable/revocation without commercial authority, unconfigured/invalid reads and absence of read-created allocations. Controlled allocation rows supply occupancy evidence only; no customer hold or paid Booking is created by C02.

[Built HTTP smoke](../../tools/check-service-scheduling.mjs) exercises actual signed Better Auth cookie authentication against a loopback API process and disposable identities. It proves schedule/rules GET/PUT/replay/conflict/validation/anonymous denial, anonymous no-store slot reads with current terms/buffers, named consent/private any Staff, occupied Booking/hold fixtures, online separation, changed date closure and no read-created reservation. C01 definition HTTP smoke and its PostgreSQL suite also pass unchanged.

### Verification

| Check                                                                                                                                                 | Result                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `FOUNDATION_TEST_NAME="Phase 03 (authoritative scheduling\|Service definitions)" pnpm nx run platform-core:test-integration` with local `.env` loaded | 24 scenarios pass: 13 C02 plus 11 C01; both built loopback HTTP smokes pass; 108 unrelated integration scenarios not selected |
| `pnpm nx run-many -t lint,typecheck,test --projects=contracts,platform-core,api,worker,web --parallel=3`                                              | All five projects pass; 77 unit tests and one snapshot pass; one existing worker test skipped                                 |
| API/worker builds through integration dependencies                                                                                                    | Pass; six existing API optional dependency/source-map warnings                                                                |
| `pnpm db:compat:check` and `pnpm db:upgrade:check` with local `.env` loaded                                                                           | 35-migration compatibility and populated supported-foundation upgrade pass; no Prisma schema difference                       |
| `pnpm db:migrate:local` after asserting loopback hostname                                                                                             | C02 additive migration applied locally                                                                                        |
| OpenAPI additive comparison                                                                                                                           | Existing endpoint/component schema contracts unchanged                                                                        |
| `pnpm docs:check`, `pnpm contracts:check`, `git diff --check`                                                                                         | Pass                                                                                                                          |

[Machine-readable C02 verification record](./evidence/phase-03-c02-2026-10-12/verification.json). Evidence contains artifact checksums and outcomes, not credentials or raw identity data.

### Remaining scope and derived boundaries

Minute precision, at most seven elapsed days per read, local-grid alignment, split overnight windows, whole-day replacing exceptions and an inclusive elapsed-day horizon are derived implementation semantics. Lead/horizon/grid values are explicitly configured per Service with no inferred default calendar. Legacy/unconfigured resources gain no availability automatically. Calendar JSON references depend on live Vendor/Location validation; Staff occupancy has an actual Staff foreign key.

Slot reads use a consistent snapshot and are advisory: a later hold must revalidate. C02 has no public allocation writer and no atomic exclusion guarantee. C03–C11 retain hold, UI, payment/Booking, policy/amendment, meeting/attendance and phase acceptance work. Formal `TST-P03-001` no-double-booking and `TST-P03-002`–`004`, read-only iCal phase coverage, independent accessibility, provider and other release gates remain open. No browser UI was changed or tested, and no remote development/check/deployment occurred.

**Next at C02 completion:** `P03-C03`; subsequently completed below.

## P03-C03 — Atomic named/any-Staff holds — 2026-10-12

**Complete locally.** Scope is `REQ-P03-HOLD-001` atomic Staff hold/allocation, using C01–C02 prerequisites. This supplies local `TST-P03-001` concurrency/expiry/rollback evidence, with formal phase/lifecycle acceptance still open.

### Verified behavior

[PostgreSQL scenarios](../../libs/platform-core/src/lib/booking-holds.integration.ts) prove exactly one full buffered allocation, fifteen-minute expiry and immutable accepted terms; competing named/any Customers and distinct any-Staff allocations; private identity filtering; simultaneous idempotent retries and changed payload rejection; cross-Service/Location/mode conflicts and adjacency; exact expiry/no renewal, release/worker races; revoked-session/identity and restricted-Vendor recovery; other Customer denial; current calendar/qualification/consent and commercial/rule/grid revalidation; database overlap rejection and independent bypass insertion races; terminal immutability; and injected late create/release rollback. The hold alone creates no payment or paid Booking.

[Built HTTP smoke](../../tools/check-booking-holds.mjs) uses signed Better Auth cookies and disposable identities for adult Customer hold/read/release, privacy, current fixed terms, replay/conflict/invalid/anonymous denial, cross-mode occupancy, stale versions, concurrent last-Staff competition and expired read/release recovery. The same probe spawns the actual built worker against loopback PostgreSQL/Redis; a due fixture hold and its allocation become expired without a Customer session. All three C01–C03 HTTP smokes and prior qualification/calendar PostgreSQL suites pass.

### Verification

| Check                                                                                                                                                                       | Result                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FOUNDATION_TEST_NAME="Phase 03 (atomic Booking holds\|authoritative scheduling\|Service definitions)" pnpm nx run platform-core:test-integration` with local `.env` loaded | 42 scenarios pass: 18 C03 + 13 C02 + 11 C01; three HTTP smokes and actual built worker expiry pass; 108 unrelated integration scenarios not selected |
| `pnpm nx run-many -t lint,typecheck,test --projects=contracts,platform-core,api,worker,web --parallel=3`                                                                    | All five projects pass; 77 unit tests and one snapshot pass; one existing worker test skipped                                                        |
| API/worker builds through integration dependencies                                                                                                                          | Pass; six existing optional dependency/source-map API warnings                                                                                       |
| `pnpm db:compat:check` and `pnpm db:upgrade:check` with local `.env` loaded                                                                                                 | 36-migration compatibility and populated supported-foundation upgrade pass; no Prisma schema difference                                              |
| `pnpm db:migrate:local` after asserting loopback hostname                                                                                                                   | C03 additive migration applied locally                                                                                                               |
| OpenAPI additive comparison                                                                                                                                                 | Existing paths/component schemas unchanged                                                                                                           |
| `pnpm docs:check`, `pnpm contracts:check`, `git diff --check`                                                                                                               | Pass                                                                                                                                                 |

[Machine-readable verification record](./evidence/phase-03-c03-2026-10-12/verification.json). The overlap guard follows [PostgreSQL 18 range exclusions](https://www.postgresql.org/docs/18/rangetypes.html) with [UUID support in btree_gist](https://www.postgresql.org/docs/18/btree-gist.html). The extension lives in `public` to preserve operator classes across disposable schema cleanup. Evidence retains checksums/outcomes rather than credentials, raw provider data or identity records.

### Limits and next chunk

C03 holds one appointment intent and freezes uncommitted selection/commercial terms; C05 owns policy/timing snapshots and paid Booking confirmation. Creation replay is historical acceptance, not a renewed holding-state promise; current read supplies release/expiry. Any-Staff assignment is deterministic within the private transaction, with no fairness/throughput claim. The shared goods/appointment capacity lock is a derived local concurrency strategy; it does not implement Phase 04 mixed checkout. Read-only iCal, waitlists, UI/Booking/payment/provider lifecycles and independent/formal phase gates remain open. No browser UI, remote development/testing or deployment was performed.

**Next:** `P03-C04` — Service selection and Booking intent UI. Stop after C03.
