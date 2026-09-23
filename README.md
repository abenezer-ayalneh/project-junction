# Project Junction

Project Junction is a documentation-first specification for a portfolio-grade marketplace that combines physical goods with fixed-duration appointments. It is intended to demonstrate production-minded product design and engineering decisions; it now includes a local synthetic Phase 00 foundation and Phase 01 Vendor supply/discovery slice. It is not a live marketplace or an Ethiopian payment operation.

## Current status

**Phase 00 is partially implemented and Phase 01 is locally implemented in the synthetic PostgreSQL runtime.** The Nx web/API/worker workspace has synthetic in-memory and PostgreSQL paths. Local durability evidence and remaining acceptance gaps are recorded in [Phase 00 evidence](./docs/quality/PHASE-00-DURABILITY-EVIDENCE.md) and the [Phase 01 requirements](./docs/requirements/PHASE-01-VENDOR-SUPPLY-AND-DISCOVERY.md). No public deployment, real provider integration, live money movement or real identity verification exists.

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

The documentation describes a future portfolio system. Phase 00 and the local synthetic Phase 01 supply/discovery slice are implemented; later market capabilities remain outside this work. Operational procedures use the label **Specified — Not Executed — Not Verified** until a future implementation and evidence pass prove them.

## API local tooling

The API serves OpenAPI/Swagger documentation at `/v1/docs`. Configure browser access with the
comma-separated `CORS_ALLOWED_ORIGINS` variable (local defaults are listed in `.env.example`);
do not use a wildcard when credentials are enabled. It applies Helmet, a global rate limit, JSON
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
