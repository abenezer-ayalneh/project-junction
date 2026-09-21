# Demo Isolation Architecture

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-107`, `DEC-109`, `DEC-129`, `DEC-139`, `DEC-168`–`DEC-173`, `DEC-177`, `DEC-178`

Public demo entry creates/uses a synthetic `DemoWorkspace` after abuse check without reviewer signup. All database, object, cache, queue, search, telemetry and realtime identities contain an environment/workspace boundary; session/context can access only selected synthetic persona data. All roles may be shown safely, while global/high-risk outcomes are simulated or unavailable.

No production/staging/commercial credentials, account data, provider identity, media, or background work flows into the demo. Fixed 24-hour expiry revokes session and enqueues idempotent purge across all stores. Quotas bound storage/media/jobs/provider substitutes. Safe persona switching means issue a fresh limited context, not one omnipotent browser token.

Demo failure is handled by `RUN-012`; environment separation/no-data-promotion is invariant `INV-DEMO-001`.
