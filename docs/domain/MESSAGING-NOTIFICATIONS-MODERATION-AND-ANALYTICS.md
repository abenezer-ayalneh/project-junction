# Messaging, Notifications, Moderation, and Analytics

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** engagement, content trust, telemetry behavior  
**Decision coverage:** `DEC-051`, `DEC-052`, `DEC-063`–`DEC-065`, `DEC-105`, `DEC-122`, `DEC-123`, `DEC-162`, `DEC-167`, `DEC-174`, `DEC-176`

Messaging is scoped to a private offering or transaction and supports permitted attachment/block/report/moderation/retention behavior. It is not a general inbox or public Q&A. Notifications may use in-app, email, Web Push/VAPID, and optional transactional SMS; delivery is asynchronous/idempotent and never reverses a committed Purchase/Booking. Notification history distinguishes attempted, accepted by provider, and confirmed information where available; it never falsely says “read.”

Moderation receives listing/media/review/message reports and uses evidence, policy, risk tier, reason, scope, appeal, audit, and restricted suspension. It does not make legal judgments or autonomous irreversible financial decisions. Public media/video requires accessibility metadata and quarantine.

Analytics is a minimized first-party typed PostgreSQL projection for Vendor operations/funnel and Platform health. It excludes session replay, fingerprinting, third-party behavioral analytics, and cross-Vendor visibility. Personalization is explicit opt-in. Search/realtime/analytics events are projections and must be rebuildable from transactional truth.
