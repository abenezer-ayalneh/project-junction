# Production Operating Model

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** post-deployment human operation  
**Decision coverage:** `DEC-003`, `DEC-004`, `DEC-105`–`DEC-107`, `DEC-117`, `DEC-118`, `DEC-120`–`DEC-124`, `DEC-153`, `DEC-162`, `DEC-163`, `DEC-169`, `DEC-170`

The portfolio-production target is operated as a small, evidence-driven system rather than an unattended demo. It has distinct Support, Vendor Operations, Trust & Safety, Finance, Analyst, and Platform Owner capabilities. One human may hold several roles in a portfolio context, but a high-risk action must still follow the required distinct maker/checker approval or be blocked.

| Operating lane    | Owns                                                           | Cannot silently do                                          |
| ----------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| Support           | Support Cases, customer communication, safe account assistance | financial correction, suspension, ledger editing            |
| Vendor Operations | applications, onboarding, catalog/fulfillment enablement       | override trust/finance controls                             |
| Trust & Safety    | moderation, restrictions, appeals                              | unreviewed permanent action or ledger adjustment            |
| Finance           | reconciliation, refund/payout workflow, exceptions             | mutate historical postings or self-approve high-risk action |
| Platform Owner    | configuration/release/incident accountability                  | erase audit history or bypass immutable records             |

All operations produce a case/event/audit trail with actor, time, reason, evidence references, affected aggregate, approval tier, and customer/Vendor communication state. There is no live commercial operation in this phase. The target operating model must be revalidated before any Dire Dawa pilot.
