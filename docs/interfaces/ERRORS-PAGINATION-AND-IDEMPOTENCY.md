# Errors, Pagination, and Idempotency

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** retry and collection semantics

## Errors

Error envelope: `code`, safe `message`, `requestId`, optional field issues, retryability category, and documented `details` safe for caller scope. Examples: `AUTH_REQUIRED`, `ACCESS_DENIED`, `STALE_VERSION`, `INVALID_STATE`, `UNAVAILABLE`, `HOLD_EXPIRED`, `AVAILABILITY_CHANGED`, `PAYMENT_PENDING_RECONCILIATION`, `IDEMPOTENCY_CONFLICT`, `RATE_LIMITED`. Provider/raw database details never cross the boundary.

## Pagination

Collections use opaque cursor + limit + stable sort. Response reports `nextCursor`, snapshot/filter context, and no total unless a bounded/safe count is justified. Cursor is scoped to access context/filter/sort; reuse across Vendor/workspace fails safely.

## Idempotency

An `Idempotency-Key` binds method, canonical request hash, actor/scope, and target command. Same key + same semantic request returns stored outcome; same key + different semantic request returns conflict. Keys have documented retention and survive transient worker/provider retries. A pending uncertain provider operation returns reconciliation state rather than an unsafe retry. The idempotency record links the effective aggregate/event/ledger action and is audit-visible.
