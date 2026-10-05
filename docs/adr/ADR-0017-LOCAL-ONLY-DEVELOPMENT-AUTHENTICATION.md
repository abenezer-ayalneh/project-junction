# ADR-0017: Local-only development authentication

**Status:** Accepted for the current development interval  
**Decision:** `DEC-190`  
**Date:** 2026-10-05

Development uses an explicit local runtime with a fresh local database, email/password verification and recovery through Mailpit, and Google OAuth. Google can link only an identity with the same verified email to an already verified local account. Role authority continues to come from revocable memberships and explicit reviewer grants.

MFA and Didit identity verification remain implemented for the deployment runtime but are deferred from local screens, enforcement, endpoints, and worker reconciliation. Local identity records stay adult-unverified, and no MFA or identity timestamps are manufactured. The staging environment is suspended with its data and configuration retained; branch-push image publication is disabled.

This trade-off keeps early development local and reversible while preserving the future strict path. Before public release, the deployment runtime must restore and pass MFA, Didit adverse/replay/reconciliation, recovery, deployment, capacity, and backup/recovery acceptance. Local evidence cannot close those gates.
