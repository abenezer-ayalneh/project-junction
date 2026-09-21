# Isolation, Quotas, Expiry, and Cleanup

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** demo data/control boundary  
**Decision coverage:** `DEC-107`, `DEC-109`, `DEC-172`, `DEC-177`, `DEC-178`

`INV-DEMO-001`: a demo workspace is synthetic-only, environment-scoped, and cannot read/write a non-demo namespace. `INV-DEMO-002`: its maximum lifetime is 24 hours from creation; expiry removes session access and initiates idempotent purge. `INV-DEMO-003`: its quota prevents abuse of provider substitutes, media, jobs, and storage, and quota failure is explicit rather than silently shared.

The future implementation must tag every database row, object key, search document, cache key, job, event, and telemetry field with an environment/workspace boundary. Cleanup deletes or tombstones workspace assets, cancels scheduled tasks, revokes signed links, purges caches/search projection, and produces a restricted completion record. Failure invokes `RUN-012`. Demo data is never promoted to staging, portfolio production, or a future commercial environment.
