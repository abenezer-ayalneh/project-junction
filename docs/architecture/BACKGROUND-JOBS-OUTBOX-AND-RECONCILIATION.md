# Background Jobs, Outbox, and Reconciliation

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-073`, `DEC-083`, `DEC-086`, `DEC-087`, `DEC-101`, `DEC-105`, `DEC-124`

Authoritative state change and a minimal outbox event commit in one database transaction. A worker claims events with stable identity, invokes idempotent consumers, records attempt/result, and sends exhausted work to observable dead-letter/reconciliation queue. Jobs cover hold expiry, provider reconciliation, notifications, media, meeting provision, search/analytics projection, earning release, payouts, exports, and demo purge.

Provider calls occur after commit. A callback enters a durable inbox, is signature verified/deduplicated, maps to internal operation and triggers reconciliation; it cannot bypass policy/ledger/aggregate guards. Retry uses exponential/backoff budget and stable causation/idempotency identity. A job result is never assumed successful only because it was queued. Rebuilding a projection or replaying an event must be safe and cannot generate new financial/Customer commitments.

Operational failure follows `RUN-005`, `RUN-006`, and `RUN-007`; source truth remains PostgreSQL.
