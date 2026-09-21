# Component and Dependency Model

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-079`–`DEC-087`, `DEC-117`–`DEC-125`

| Component          | Responsibility                                      | Allowed dependencies                           | Prohibited authority                      |
| ------------------ | --------------------------------------------------- | ---------------------------------------------- | ----------------------------------------- |
| Next PWA           | public/customer/vendor/staff/platform presentation  | generated API SDK, query cache, realtime hints | business truth/privileged decision        |
| Nest API           | commands, queries, authz, transaction orchestration | contexts, persistence adapters, outbox         | direct provider result as final truth     |
| Context module     | aggregate rules and commands                        | own repositories, documented contracts/events  | another context’s table writes            |
| Worker             | durable asynchronous jobs/retry/reconciliation      | outbox/event contracts, provider adapters      | unaudited scope / direct business edits   |
| PostgreSQL/PostGIS | authoritative transactional and spatial data        | audited migration/access path                  | public query interface                    |
| Redis/BullMQ       | queue/fanout/cache coordination                     | worker/realtime                                | financial/commerce source of truth        |
| Meilisearch        | discovery projection                                | published source events                        | pricing/availability/authorization source |
| Provider adapter   | isolated transport/auth/retry mapping               | provider SDK/HTTP and domain contract          | domain policy/ledger ownership            |

Module boundaries are enforced by future Nx rules and review. Zod/OpenAPI public types remain independent of Prisma/provider types. Prisma 7 is planned for ordinary persistence, with audited parameterized SQL limited to locks, PostGIS, outbox claim, and other documented escape hatches.
