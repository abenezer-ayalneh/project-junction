# Local Services, Ports, and Dependencies

> **Document status:** implemented local Compose contract
> **Decision coverage:** [`DEC-190`](../governance/DECISION-REGISTER.md#dec-190)
> **Normative owner:** local dependency and loopback contract

| Service | Loopback port | Role | Persistent state |
| --- | ---: | --- | --- |
| Next web | 3000 | local browser and Better Auth callback origin | source/build cache only |
| Nest API | 3001 | authenticated API and realtime endpoint | none |
| PostgreSQL/PostGIS | 55432 | authoritative local database | `junction_postgres` |
| Redis | 6379 | local event fanout/replay transport | `junction_redis` |
| Meilisearch | 7700 | local projection/search | `junction_meilisearch` |
| Mailpit web | 8025 | local email inbox viewer | captured mail is disposable |
| Mailpit SMTP | 1025 | verification/recovery SMTP receiver | loopback only |
| MinIO API/console | 59000/59001 | local media object store | `junction_minio` |
| ClamAV | 13310 | local malware scan adapter | `junction_clamav` |

All published Compose ports are explicitly loopback-bound. The worker has no listener. Redis storage is persistent across normal `down`/`up`; `pnpm env:local:reset` removes Junction's local volumes when a fresh local database/accounts set is required.

Local email is delivered by SMTP to Mailpit, never to a public recipient. Local users use verified email/password or Google OAuth; Didit must not be called and MFA must not be enforced in this runtime. The configuration validator rejects non-loopback PostgreSQL/Redis and any origin other than `http://localhost:3000`.
