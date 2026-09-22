# Project Junction — Non-Functional Requirements

> **Status:** Planned quality targets; none has current evidence.

## Accessibility and inclusive experience

| ID              | Requirement                                                                                                                                                                                                        | Source           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| JCT-NFR-ACC-001 | All public, Customer, Vendor, Staff, and Platform workflows MUST meet WCAG 2.2 AA.                                                                                                                                 | DEC-061          |
| JCT-NFR-ACC-002 | Accessibility MUST include keyboard, focus, semantics, contrast, zoom/reflow, screen-reader announcements, error identification, reduced motion, captions/alternatives for media, and accessible realtime updates. | DEC-061          |
| JCT-NFR-ACC-003 | Stock shadcn/ui primitives and Lucide icons MAY support accessibility but MUST NOT replace end-to-end manual verification.                                                                                         | DEC-117, DEC-118 |

## Localization and time

- The complete initial experience MUST be available in English. `[DEC-012]`
- UI and contracts MUST be internationalization-ready and pseudo-locale tested. `[DEC-012]`
- Real translations MUST require human review before publication. `[DEC-012]`
- Initial locale context uses ETB and `Africa/Addis_Ababa`; stored times MUST preserve UTC truth plus the relevant IANA time-zone context. `[DEC-011]`

## Low connectivity and performance

- PWA shell and safe public content SHOULD remain usable from cache. `[DEC-062]`
- Images/video SHOULD be served through size-appropriate optimized renditions. `[DEC-062, DEC-088]`
- Long-form Vendor/Customer drafts SHOULD survive transient connection loss. `[DEC-062]`
- Safe retries MUST be idempotent. Availability, holds, payment, inventory, booking allocation, completion, and other authoritative mutations MUST require live confirmation. `[DEC-062, DEC-083]`
- The system MUST be tested at 100 concurrent active users, 10 completed checkouts/minute, 10,000 Products, 2,000 Services, and 100 Vendors. `[DEC-136]`

## Correctness under concurrency

- No SKU oversell or backorder. `[DEC-018]`
- No Staff double-booking. `[DEC-019]`
- Atomic all-or-nothing checkout hold for all selected components. `[DEC-125]`
- No duplicate charge, refund, stock movement, ledger posting, transfer, payout, notification, import commit, or provider provisioning after retry/replay. `[DEC-048, DEC-073, DEC-083, DEC-086, DEC-101, DEC-105, DEC-140, DEC-144]`
- Every financial transaction balances; every correction reverses rather than mutates. `[DEC-140]`

## Availability and recovery

- Measure a 99.5% monthly internal availability objective; it is not a contractual SLA. `[DEC-137]`
- Publish Better Stack status and incident information appropriate for the portfolio environment. `[DEC-096, DEC-137]`
- Pause releases when the defined error budget is exhausted. `[DEC-137]`
- Target 15-minute PostgreSQL RPO and four-hour total-host RTO. `[DEC-111]`
- Verify database point-in-time recovery monthly and clean-host rebuild quarterly. `[DEC-111]`
- A single-host outage is an accepted infrastructure limitation and must be disclosed rather than hidden. `[DEC-090]`

## Security and privacy

- Use least privilege, MFA/recent-auth, revocable sessions, workspace/Vendor/Location scoping, signed/verified provider callbacks where available, rate limits, upload quarantine, and immutable audit. `[DEC-067, DEC-069, DEC-071, DEC-083, DEC-088, DEC-097, DEC-129]`
- The exact formal security-verification level was not confirmed and MUST remain an open documentation decision.
- Secrets MUST NOT be committed, exposed to the browser, embedded in images, or provided to CI when host-side SOPS/age decryption is sufficient. `[DEC-110]`
- Analytics MUST avoid session replay, fingerprinting, and third-party behavioral tracking. `[DEC-123]`
- Data deletion MUST pseudonymize retained legal/audit/security/financial history. `[DEC-060]`

## Operability

- PostgreSQL is authoritative; Redis/BullMQ and Meilisearch MUST be rebuildable/replayable without business-data loss. `[DEC-086, DEC-087]`
- REST is authoritative after a realtime gap; Socket.IO clients MUST reconcile using ordered cursors. `[DEC-072, DEC-124]`
- Provider operations MUST use durable outbox/inbox, idempotency, retry, dead-letter visibility, and reconciliation. `[DEC-073, DEC-074, DEC-083, DEC-086, DEC-105]`
- Sentry MUST cover application errors/releases/source maps/sampled performance; Better Stack MUST cover external endpoints, heartbeats, incidents, and status. Sensitive data MUST be scrubbed. `[DEC-096]`

## Portability and future adaptability

- Vendor/payment/meeting/email/SMS/map/media integrations MUST sit behind explicit contracts so that portfolio adapters can be replaced without rewriting domain policies. `[DEC-025, DEC-075, DEC-078, DEC-098]`
- Domain data MUST own normalized addresses, pins, polygons, provider references, and media metadata rather than treating raw external payloads as canonical. `[DEC-088, DEC-095]`
- The modular monolith MUST preserve bounded-context ownership and avoid leaking Prisma types into public contracts. `[DEC-081, DEC-082, DEC-084, DEC-085, DEC-120]`
