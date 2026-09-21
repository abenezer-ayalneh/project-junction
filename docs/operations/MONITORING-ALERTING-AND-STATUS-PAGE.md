# Monitoring, Alerting, and Status Page

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-096`, `DEC-120`, `DEC-123`, `DEC-124`, `DEC-137`

The target uses scrubbed structured logs, metrics, traces, uptime checks, and a public portfolio status surface as derived technical defaults. Sentry and Better Stack are planned provider candidates, not configured services. Telemetry must not contain secrets, raw credentials, full payment payloads, or unbounded personal content.

| Signal                       | Alert condition                               | Initial responder       | Linked runbook       |
| ---------------------------- | --------------------------------------------- | ----------------------- | -------------------- |
| API/public demo availability | error budget burn or failed health checks     | Platform Owner          | `RUN-001`            |
| migration/deployment         | failed rollout/health check                   | Platform Owner          | `RUN-001`, `RUN-002` |
| backup/restore               | missed backup or failed integrity check       | Platform Owner/Finance  | `RUN-003`            |
| provider/webhook             | sustained failure, backlog, signature errors  | Finance or Support lane | `RUN-005`, `RUN-006` |
| financial reconciliation     | unmatched provider/ledger/payout item         | Finance                 | `RUN-007`            |
| media security               | quarantine failure/unsafe publication attempt | Trust & Safety          | `RUN-009`            |
| security                     | suspected compromise/data disclosure          | Platform Owner          | `RUN-013`            |
| demo cleanup                 | expired workspace not purged                  | Platform Owner          | `RUN-012`            |

Status messaging describes observed impact, workaround, scope, and next update time without speculative root cause or exposing security-sensitive detail.
