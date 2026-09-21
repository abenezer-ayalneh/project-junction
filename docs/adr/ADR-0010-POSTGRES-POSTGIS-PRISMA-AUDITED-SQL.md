# ADR-0010: PostgreSQL/PostGIS with Prisma and Audited SQL

**Status:** Accepted target architecture; not implemented  
**Decision:** `DEC-079`, `DEC-084`–`DEC-085`, `DEC-095`, `DEC-121`, `DEC-128`  
**Date:** 2026-08-27

PostgreSQL/PostGIS is the transactional/geospatial source of truth. Prisma is the planned general data-access tool; reviewed audited SQL is permitted where geospatial, locking, or ledger correctness needs explicit control. This balances productivity with visibility of correctness-critical queries.
