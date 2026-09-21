# RUN-008 — Search Rebuild

**Status:** Specified — Not Executed — Not Verified  
**Target owner:** Platform Owner with the Catalog/Discovery owner  
**Trigger:** Search projection corruption, unacceptable lag, mapping/version change, detected isolation leak, or a planned projection rebuild.

## Safeguards

- PostgreSQL/domain source records remain authoritative. Keep safe browse/detail paths available in degraded mode rather than treating search as source of truth.
- Record the index alias/version, source high-water cursor, environment/workspace scope, affected projections, and reason before rebuilding. Do not rebuild from analytics, caches, or public-demo traffic.
- Build a new versioned index alongside the current index. Do not delete the prior known-good index until the declared rollback window and validation result are recorded.

## Target procedure

1. Contain unsafe search behavior: remove stale/unsafe search exposure if required and announce degraded discovery while preserving authoritative detail pages and supported filters.
2. Capture the source cursor and rebuild from approved canonical Vendor/listing/publication/moderation, price, availability, and workspace-scope records into a new isolated index version.
3. Apply source events that occurred after the initial cursor, preserving idempotency and per-source ordering. Do not let a rebuild publish a Listing or media item that the authoritative state has withdrawn.
4. Validate representative and adversarial fixtures: Vendor/location/workspace visibility, published versus moderated content, category constraints, price/availability freshness, ranking behavior, pagination, and no cross-environment results.
5. Atomically route the alias to the validated index, monitor cursor lag/query failure/empty-result anomalies, and retain the previous index for the planned rollback interval.

## Rollback, recovery, and escalation

- If validation or post-swap monitoring fails, route the alias back to the retained validated index and keep source browse/detail behavior available. Do not repair records in the search index by inventing source state.
- Persistent source-event backlog or replay failure follows [RUN-006](STUCK-HOLDS-JOBS-AND-OUTBOX.md). A suspected cross-workspace/Vendor disclosure follows [RUN-013](SECURITY-INCIDENT-AND-DATA-BREACH.md).
- Escalate when source cursor integrity, scope filtering, publication/moderation truth, or alias atomicity cannot be demonstrated.

## Verification and evidence

Record `EVD-OPS-*` evidence with old/new index versions, source cursors, environment scope, fixture results, alias transition time, post-swap health/lag, rollback result if used, and final disposition. Preserve only sanitized ranking/search fixtures in evidence.

## Related normative documents

- [Search, realtime, and analytics](../../architecture/SEARCH-REALTIME-AND-ANALYTICS.md)
- [Vendor storefront, catalog, and discovery](../../domain/VENDOR-STOREFRONT-CATALOG-AND-DISCOVERY.md)
- [Search/realtime event contracts](../../interfaces/EVENT-CATALOG.md)
