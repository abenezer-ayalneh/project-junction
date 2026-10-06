# Production System Description

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** intended portfolio-production deployment behavior  
**Decision coverage:** `DEC-089`–`DEC-097`, `DEC-109`–`DEC-111`, `DEC-120`–`DEC-124`, `DEC-136`, `DEC-137`, `DEC-153`

The intended portfolio-production system is a public synthetic demo deployment, separate from private staging and future commercial Dire Dawa operation. It targets a hardened VPS with Docker Compose, Caddy, Cloudflare edge/DNS/TLS, PostgreSQL/PostGIS, Redis, Meilisearch, application/worker processes, MinIO media, encrypted B2 offsite backup, and scrubbed Sentry/Better Stack telemetry. GHCR/SOPS+age are intended deployment controls, not configured services.

It operates only synthetic data and sandbox/fake providers; no live money, real KYB, real Vendor recruitment, or commercial customer data. Target capacity is 100 active users, 10 checkout completions/minute, 10k Products, 2k Services, 100 Vendors. Target recovery is RPO 15 minutes/RTO 4 hours, and internal availability objective is 99.5% monthly—until future drill/measurement evidence exists, these are targets, not proven figures or a customer SLA.

See [Production Operating Model](../operations/PRODUCTION-OPERATING-MODEL.md) for human operations and [Portfolio Production Deployment](../deployment/PORTFOLIO-PRODUCTION-DEPLOYMENT.md) for prospective procedure.
