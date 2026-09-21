# Local Development Setup

> **Document status:** specified procedure
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-079`–`DEC-088`, `DEC-107`, `DEC-115`, `DEC-121`, `DEC-129`](../governance/DECISION-REGISTER.md)
> **Normative owner:** intended local bootstrap procedure

The commands below are **DERIVED-PLAN-DEFAULT placeholders** for the future repository. They must be reconciled with the actual root scripts before anyone runs them. Documentation creation has not executed them.

## Preconditions

1. Meet [local prerequisites](LOCAL-DEVELOPMENT-PREREQUISITES.md).
2. Obtain the future Junction repository through its documented Git route.
3. Confirm the repository status/branch and read its root instructions.
4. Use only synthetic local data and local/test provider credentials.

## Target bootstrap procedure

**Procedure status: Specified — Not Executed — Not Verified.**

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm env:local:up
pnpm db:migrate:local
pnpm seed:local
pnpm dev
```

The future scripts must perform these effects without hidden global dependencies:

- Start PostgreSQL 18/PostGIS, Redis, Meilisearch, local S3-compatible storage, and development sinks through Compose.
- Create a Junction-only local database and buckets.
- Apply the single migration stream.
- Seed deterministic synthetic Vendors, Locations, Products, Services, Staff, inventory, schedules, roles, policy variants, and demo scenarios.
- Start web, API, and worker with readable health/port output.

## Synthetic personas and local evidence

The future seed profile must expose clearly named, non-real fixtures for a public browser, Customer, pending Vendor, approved Vendor Owner, Vendor Staff, and restricted Platform Staff. Credentials, magic links, and personal data are intentionally not documented here; the initialized repository must generate or disclose only safe local values through its seed output.

Every local journey records the selected synthetic persona, workspace/Vendor/Location scope, adapter mode, and a safe correlation identifier. A successful page load is insufficient evidence for checkout, Booking, authorization, provider callback, ledger, or reconciliation behavior.

## Target validation

**Validation status: Specified — Not Executed — Not Verified.**

Future setup is successful only when:

- Web, API readiness, worker heartbeat, PostgreSQL, Redis, Meilisearch, and object store are healthy.
- The generated client matches the current OpenAPI artifact.
- A public browse works without auth; a protected route rejects an unauthenticated request.
- A synthetic persona is visibly labeled and cannot cross workspaces.
- Outbox-to-worker and search projection smoke events complete.
- Local captures show no real email, SMS, payment, meeting, or KYB operation.

## Target shutdown and reset

**Procedure status: Specified — Not Executed — Not Verified.**

The future repository should offer non-destructive shutdown and an explicitly named destructive local reset, for example:

```sh
pnpm env:local:down
pnpm env:local:reset
```

The reset must print exact Junction-only volumes/databases/buckets it will delete and require explicit confirmation unless CI mode is unmistakable. It must never target broad Docker, home, or workspace data.

## Related documents

- [Configuration, secrets, and seed data](CONFIGURATION-SECRETS-AND-SEED-DATA.md)
- [Local services, ports, and dependencies](LOCAL-SERVICES-PORTS-AND-DEPENDENCIES.md)
- [Provider sandbox and fake adapters](PROVIDER-SANDBOX-AND-FAKE-ADAPTERS.md)
- [Developer workflows and troubleshooting](DEVELOPER-WORKFLOWS-AND-TROUBLESHOOTING.md)
