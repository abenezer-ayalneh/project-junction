# Project Junction

Project Junction is a marketplace project for physical goods and fixed-duration appointments. Phase 00 is being moved from local synthetic proof to private staging with real account and provider integrations. It is not yet a live marketplace or an Ethiopian payment operation.

## Current status

**Phase 00 real-service transition is in progress.** The staging code uses Better Auth, Resend, Didit Sandbox, PostgreSQL, Redis fanout, and self-hosted MinIO. It has not been deployed to the VPS or accepted through live provider flows. The earlier synthetic Phase 00 and Phase 01 evidence remains local regression evidence only; see the [real transition tracker](./docs/quality/PHASE-00-REAL-TRANSITION.md) and [Phase 01 evidence](./docs/quality/PHASE-01-ACCEPTANCE-EVIDENCE.md). No public deployment, live money movement, or verified real identity flow is claimed.

The intended system is Ethiopia-first and globally adaptable: it uses synthetic Dire Dawa context, ETB, Ethiopian address/phone conventions, and `Africa/Addis_Ababa` as its initial configuration. It makes no claim of cross-border support, lawful Ethiopian payment operations, tax compliance, or commercial readiness.

## Start here

- [Documentation index](./docs/INDEX.md)
- [Current status and claim rules](./docs/STATUS.md)
- [Documentation manifest](./docs/MANIFEST.md)
- [Baseline coverage audit](./docs/governance/COVERAGE-AUDIT-0.1.md)
- [Decision register](./docs/governance/DECISION-REGISTER.md)
- [Multiphase requirements](./docs/requirements/MULTIPHASE-REQUIREMENTS.md)
- [Target production system](./docs/architecture/PRODUCTION-SYSTEM-DESCRIPTION.md)
- [Future Dire Dawa gates](./docs/future/DIRE-DAWA-COMMERCIAL-LAUNCH-GATES.md)

## Scope boundary

The documentation describes the target system and the evidence gates for each environment. Local synthetic fixtures remain available for regression tests; staging startup requires the real-service configuration. Later market capabilities and operational procedures remain unverified until their own implementation and evidence pass.

## API local tooling

The API serves OpenAPI/Swagger documentation at `/v1/docs`. In staging, CORS allows only the
HTTPS origin in `BETTER_AUTH_URL`, and the served contract omits synthetic routes. Use
[.env.example](./.env.example) as the fail-closed staging configuration template;
[.env.integration.example](./.env.integration.example) contains local test fixtures only. Do not
use a wildcard when credentials are enabled. The API applies Helmet, a global rate limit, JSON
Winston logging, and a global exception filter at startup.

Prettier, ESLint, Conventional Commit linting, and root-level Husky hooks are configured for the
workspace. Once this checkout is a Git repository, `pnpm install` activates the hooks: every
commit runs `pretty-quick --staged`, while every commit message is checked by Commitlint.

## Separate parked venture

The earlier merchant-owned social-checkout concept remains parked, is not Project Junction, and must not be revived implicitly. Its original decision record is preserved verbatim at [verified-social-checkout-parked.md](./docs/ventures/verified-social-checkout-parked.md).

## Documentation conventions

- Markdown in this repository is the target source of truth.
- `CONTEXT.md` files define domain language only.
- Requirements, policies, APIs, state machines, and operations have separate authoritative owners.
- Decision provenance is tracked in the governance documents; assistant-derived defaults are never represented as User-confirmed choices.
- The planned future package namespace is `@junction/*`; current local packages use `contracts` and `platform-core`.
