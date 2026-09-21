# ADR-0014: Separate Staging and Portfolio Production on a Hardened VPS Target

**Status:** Accepted target architecture; not provisioned  
**Decision:** `DEC-089`–`DEC-097`, `DEC-110`–`DEC-111`  
**Date:** 2026-08-27

The target uses separate staging and public portfolio-production environments, Docker Compose/Caddy/Cloudflare/GHCR planning, encrypted offsite backups, and tested rollback/restore. It favors cost discipline and operational learnability over multi-region scale. A future commercial environment is not either of these environments.
