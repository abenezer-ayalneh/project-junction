# Provider Contract and Failure Testing

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-025`, `DEC-066`, `DEC-077`, `DEC-098`, `DEC-099`, `DEC-124`, `DEC-139`

Every provider has a deterministic local fake, a contract fixture set, a sandbox plan, an outage mode, reconciliation steps, and a replacement seam. Planned provider calls must be tested for unavailable, slow, malformed, unauthorized, duplicate, replayed, delayed, and out-of-order responses.

| Capability     | Local substitute                 | Sandbox assertion                                     | Safe failure                                                    |
| -------------- | -------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| Payment        | FakePayment                      | Stripe sandbox intent/webhook verification            | no confirmed Purchase without verified authoritative completion |
| Meeting        | DemoMeet                         | Google Meet narrow-scope flow in private staging only | Booking remains valid; show pending/retry support path          |
| Email/SMS/push | captured outbox                  | provider receipt/webhook contract                     | record notification state; do not imply delivery                |
| Maps           | deterministic geocoder/tile stub | bounded MapTiler contract                             | manual address/landmark remains usable                          |
| Media          | local quarantine fixture         | signed upload/process contract                        | media stays quarantined/unpublished                             |
| Identity/KYB   | synthetic fixture                | private sandbox only                                  | application remains pending; no false verification              |

A provider test cannot transmit production personal data or money. Provider documentation and price/limit claims require a dated `REF-*` entry and a refresh trigger in the research register.
