# Local Services, Ports, and Dependencies

> **Document status:** specified procedure
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-079`–`DEC-088`, `DEC-121`, `DEC-129`](../governance/DECISION-REGISTER.md)
> **Normative owner:** intended local dependency, port, and health-check contract

No repository, container, service, port, network, or health check has been created or run. The values below are default targets for a future Junction repository, not evidence that a local runtime exists.

## Intended service map

| Target service               | Planned local port | Intended health signal                                                  | Dependency role                             | Exposure rule                                             |
| ---------------------------- | -----------------: | ----------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------- |
| Next PWA                     |               3000 | browser/public-response smoke                                           | presentation and client cache only          | browser loopback only                                     |
| Nest API                     |               3001 | readiness confirms authoritative dependencies without returning secrets | authoritative commands and queries          | browser loopback only                                     |
| Worker                       |               none | authenticated heartbeat with queue/outbox lag                           | asynchronous work                           | no listener or browser route                              |
| PostgreSQL/PostGIS           |               5432 | SQL connection plus expected extension/schema head                      | transactional and spatial truth             | Docker network; optional loopback diagnostic mapping only |
| Redis                        |               6379 | ping plus queue connectivity                                            | BullMQ, fanout, cache; never business truth | Docker network; optional loopback diagnostic mapping only |
| Meilisearch                  |               7700 | index status and expected projection revision                           | rebuildable search projection               | Docker network; optional loopback diagnostic mapping only |
| local mail capture           |               8025 | captured test-inbox response                                            | deterministic email observation             | browser loopback only; never a relay                      |
| local object/quarantine fake |               9000 | scoped fixture/bucket check                                             | synthetic media adapter only                | Docker network or loopback only                           |

Target tool baseline is Node 24 LTS, repository-pinned pnpm, Compose v2, PostgreSQL 18 with PostGIS, Redis compatible with the selected BullMQ version, Meilisearch compatible with the selected adapter, Git, and a supported browser. Exact image tags, package versions, and host-port overrides are **DERIVED-PLAN-DEFAULTS** to be pinned and verified when a repository exists.

## Port and network rules

- A local conflict is resolved through documented Junction configuration; developers must not stop, rebind, or delete an unrelated process.
- Data services default to private Compose networks. A loopback diagnostic mapping is optional and must never bind them to a LAN or Internet-facing address.
- Only the browser-facing web/API and local capture UI may have default host mappings. The worker, queues, and provider fakes have no public route.
- Health checks report dependency identity/status, not credentials, provider payloads, User data, or synthetic-password material.
- Local services use synthetic data only. A real payment, meeting, email/SMS delivery, identity document, production key, or production database endpoint is prohibited.

## Future command interface

**Procedure status: Specified — Not Executed — Not Verified.**

The future root scripts should offer a narrow, observable interface such as:

```sh
pnpm env:local:up
pnpm env:local:status
pnpm env:local:logs -- <service>
pnpm env:local:down
```

These are planned command names, not commands that exist or have been run. `status` should show service identity, configured host port where applicable, readiness, and safe log pointers. `logs` must redact configuration/credentials. Any future destructive reset remains separate from this interface and must enumerate only Junction-owned targets before confirmation.

## Dependency readiness order

The target bootstrap waits for PostgreSQL/PostGIS, Redis, Meilisearch, object fixture, and notification capture before API/worker; web starts only after it can identify its API origin. The API readiness endpoint must distinguish an unavailable projection from unavailable authoritative storage. A worker heartbeat proves neither a successful provider delivery nor a balanced financial operation; those require their own synthetic scenarios and reconciliation evidence.

## Related documents

- [Local development setup](LOCAL-DEVELOPMENT-SETUP.md)
- [Configuration, secrets, and seed data](CONFIGURATION-SECRETS-AND-SEED-DATA.md)
- [Provider sandbox and fake adapters](PROVIDER-SANDBOX-AND-FAKE-ADAPTERS.md)
