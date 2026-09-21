# Performance, Reliability, and SLO

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-004`, `DEC-062`, `DEC-123`, `DEC-136`, `DEC-137`

The initial portfolio capacity envelope is 100 active users, 10 completed checkouts/minute, 10,000 Products, 2,000 Services, and 100 Vendors. The planning target is 99.5% monthly availability for the portfolio production/demo experience, not a commercial SLA. Measurement excludes planned, user-visible maintenance only when a future operating policy says so.

Future release evidence must measure p95 public browse/search, authenticated dashboard, Checkout quote, hold, payment confirmation, WebSocket reconnect, background-job delay, search-projection freshness, error rate, and saturation. Performance tests must include realistic mixed-Vendor carts, five Booking intents, media constraints, cold cache, slow connection, and failure/retry paths. Alerts use customer impact and error-budget burn, not only host CPU.
