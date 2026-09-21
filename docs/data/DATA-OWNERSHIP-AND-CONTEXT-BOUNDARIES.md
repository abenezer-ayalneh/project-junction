# Data Ownership and Context Boundaries

> **Document status:** specified
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-081`–`DEC-085`, `DEC-129`, `DEC-140`](../governance/DECISION-REGISTER.md)
> **Normative owner:** persistence ownership and database access rules

## Authority

Junction uses one PostgreSQL database and migration history with strict logical ownership [DEC-085]. Every table is assigned to one bounded context in the [canonical data model](CANONICAL-DATA-MODEL.md). A context may read another context through a documented contract or projection; it may not write another context's tables.

Prisma 7 is the ordinary persistence layer. Audited, parameterized SQL is restricted to locks, advisory locks, `SKIP LOCKED`, PostGIS operations, reconciliation aggregates, and unsupported database capabilities [DEC-084]. Prisma models and provider records never become domain or public API types.

## Repository rules

- Tenant-owned repository methods require `AccessContext` plus explicit workspace/Vendor/Location scope where relevant.
- An unscoped lookup by caller-controlled ID is prohibited outside a system-only adapter with documented guard.
- Reads include the same publication/suspension/deletion scope used by writes.
- Background jobs load scope from durable internal records; queue payloads do not confer authority.
- Optimistic version checks protect editable configuration. Explicit row/advisory locks protect reservations and financial uniqueness.
- Data access creates auditable business events for sensitive reads/exports where policy requires it.

## Transaction boundaries

Owned state and outbox events commit atomically. Provider calls occur after commit. Checkout alone coordinates the cross-context atomic reservation invariant through audited repository operations, while Inventory and Scheduling remain owners of their records.

Financial transactions must balance before commit. Historical postings, stock movements, policy snapshots, evidence, and audit entries are append-only or corrected by linked reversal/supersession.

## Primary isolation control

Typed AccessContext and scoped repositories are the primary tenancy defense [DEC-129]. Pervasive PostgreSQL RLS is not selected. This increases the importance of:

- import constraints against direct Prisma use outside persistence libraries;
- a reviewed query inventory;
- adversarial ID-substitution and cross-scope integration tests;
- search, export, object-store, notification, and WebSocket isolation tests;
- fail-closed context construction.

## Related documents

- [Backend context architecture](../architecture/BACKEND-CONTEXT-AND-DATA-ARCHITECTURE.md)
- [Migration and compatibility strategy](MIGRATION-AND-COMPATIBILITY-STRATEGY.md)
