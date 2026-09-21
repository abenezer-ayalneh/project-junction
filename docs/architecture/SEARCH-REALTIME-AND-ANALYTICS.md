# Search, Realtime, and Analytics

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-042`, `DEC-043`, `DEC-051`, `DEC-052`, `DEC-072`, `DEC-123`, `DEC-124`

Meilisearch is the target discovery projection for public published Products/Services and safe typed filters. PostgreSQL remains the truth for price, availability, visibility and authorization; checkout always revalidates. Projections are versioned/rebuildable, show staleness safely, and fail to authoritative browse/detail fallback when appropriate.

Socket.IO emits small scoped notifications/events with cursors. It is a best-effort hint; REST refetch reconciles gaps. Authenticated rooms use the same `AccessContext` boundary as REST; redis fanout may distribute events but cannot grant scope.

Analytics is a first-party typed PostgreSQL projection with minimized operational/funnel facts. It supports scoped Vendor analytics/CSV and Platform health, but excludes session replay, fingerprinting, third-party behavioral analytics, and raw cross-Vendor/Customer exposure. Explainable recommendation rules use only permitted, opt-in signals.
