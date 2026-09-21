# Data Ownership and Persistence

> Status: **Specified — Not Executed — Not Verified**

## Authority model

One PostgreSQL 18/PostGIS database and one ordered migration history are authoritative for Junction domain facts. Logical bounded-context ownership remains strict even though contexts share the physical database. Redis, BullMQ, Meilisearch, object storage indexes, provider dashboards, browser caches, and analytics projections are derived or external records.

Decision provenance: [Decision Register](../governance/DECISION-REGISTER.md), covering one database/migration stream, Prisma 7, audited SQL for locking/PostGIS, context ownership, immutable ledgers, typed AccessContext, and the decision not to use pervasive RLS.

## Ownership rules

- Every table has exactly one owning context documented in the [canonical data model](../data/canonical-data-model.md).
- Only the owning context writes its tables. Other contexts use a documented query view, application contract, or event projection.
- Prisma models are persistence details. They cannot appear in domain services, public DTOs, generated clients, or event contracts.
- Repository methods require the relevant `AccessContext`, Vendor, workspace, and/or Location scope. An unscoped “find by ID” method is prohibited for tenant-owned data.
- Raw SQL is allowed only in an audited persistence lane for row/advisory locks, `SKIP LOCKED`, PostGIS operations, aggregate reconciliation, and capabilities Prisma cannot express safely.
- All SQL is parameterized; query text, intent, ownership, index expectations, and concurrency tests are documented.

## Transaction rules

- Business invariants and their outbox messages commit in the same database transaction.
- Provider network calls occur after commit through idempotent worker jobs.
- Checkout reservations use deterministic lock ordering and an all-or-nothing transaction across eligible Product quantities and Booking capacity.
- Financial postings are balanced before commit; an unbalanced transaction is rejected.
- Corrections append reversal and replacement postings rather than updating historical financial rows.
- Policy, price, address, fulfillment, commission, and relevant offering terms are snapshotted when the transaction requires future reproducibility.

## Identity and key conventions

- Domain identifiers use PostgreSQL UUIDv7.
- Monetary values use integer minor units plus ISO 4217 currency.
- Instants are stored in UTC; schedules additionally retain IANA time zone semantics.
- Phone numbers use E.164 when normalized; addresses remain structured and retain Customer-supplied landmark/instruction text plus map pin.
- Geospatial values use PostGIS SRID 4326.
- Mutable records use optimistic version fields where concurrent edits are possible; reservations and financial operations use explicit locking/idempotency instead of optimistic retries alone.

## Isolation verification

The primary isolation control is typed application context plus scoped repositories, not broad database RLS. Future evidence must include adversarial tests for workspace, Vendor, Location, role, object-ID substitution, generated export, object-key, search-result, notification, and WebSocket-room leakage. Background jobs must reconstruct a validated system context from a durable reference rather than accepting arbitrary caller-provided grants.

## Related documents

- [Canonical data model](../data/canonical-data-model.md)
- [Migration and compatibility strategy](../data/migration-and-compatibility-strategy.md)
- [API conventions](../interfaces/api-conventions.md)
