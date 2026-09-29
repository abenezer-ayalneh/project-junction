# Provider Integration Contracts

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** adapter boundaries and replacement conditions  
**Decision coverage:** `DEC-025`, `DEC-066`, `DEC-074`–`DEC-078`, `DEC-088`, `DEC-094`–`DEC-100`, `DEC-122`, `DEC-139`, `DEC-155`, `DEC-179`

| Capability      | Target adapter                         | Local/demo substitute            | Required boundary                                          |
| --------------- | -------------------------------------- | -------------------------------- | ---------------------------------------------------------- |
| payments/ledger | Stripe sandbox; later Chapa adapter    | FakePayment                      | verified webhook/inbox/reconciliation; no commercial claim |
| identity/KYB    | Didit Sandbox                          | synthetic verification fixture   | signed session callback and reconciliation                 |
| online meeting  | Google Meet REST in private staging    | DemoMeet                         | assigned Staff connection; no Calendar write/sync          |
| email/SMS/push  | Resend/AfroMessage/Web Push candidates | captured outbox                  | delivery state/consent/minimal payload                     |
| maps            | MapTiler candidate                     | deterministic manual/map fixture | PostGIS/address snapshot authority                         |
| media           | self-hosted MinIO                      | local quarantine fixture         | scoped signed intent/quarantine/processing                 |
| backup          | B2 candidate                           | test backup fixture              | encrypted offsite restore drills                           |
| telemetry       | Sentry/Better Stack candidates         | local sanitized sink             | scrubbed errors/metrics/status                             |

Each adapter needs interface, capability/limit/cost source, sandbox plan, fake, credential boundary, health/outage mode, webhook/inbox behavior, retry/reconciliation, delete/export implications, and replacement test before use. The US$25/month third-party service ceiling excluding VPS/domain applies to portfolio selection; it is not a commercial forecast.
