# Authentication, Authorization, and Dual Control

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** access security and privileged-action control  
**Decision coverage:** `DEC-010`, `DEC-053`, `DEC-107`, `DEC-117`, `DEC-118`, `DEC-162`, `DEC-163`

## Authentication

Public browse requires no account. Checkout, saved actions, Support Cases, Vendor work, and Platform operations require a verified adult User account. A Customer may supply optional attendee details for a minor only; the adult remains the contracting account holder. The planned Better Auth topology and providers are architectural defaults, not live configuration. Authentication failures are generic, rate limited, audited, and never disclose account existence beyond a deliberately selected recovery flow.

## Authorization contract

Every authoritative API and WebSocket operation derives an `AccessContext` server-side from session, active role, Vendor membership, optional Location scope, and immutable request metadata. Client-provided Vendor, role, or location claims are never authority. The decision point must deny unknown permissions, use ownership-aware queries, and write an audit event for privileged mutation.

| Actor family          | Permitted authority                                                | Explicit restrictions                            |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------------ |
| Customer              | own profile, Cart, Purchase, Booking, return/dispute/support cases | cannot operate Vendor or Platform records        |
| Vendor member         | assigned Vendor and optional Location operations                   | cannot see another Vendor or Platform ledger     |
| Staff profile         | assigned schedule/service delivery actions; may have no User login | no finance or broad catalog authority by default |
| Platform Support      | scoped Support Cases and customer assistance                       | no unilateral financial correction or suspension |
| Platform Trust/Safety | moderation, restricted suspension, appeal workflow                 | high-risk action may require second approval     |
| Platform Finance      | refund/payout/reconciliation work                                  | no unapproved payout or destructive ledger edit  |
| Platform Owner        | exceptional configuration/emergency authority                      | still audited; not a bypass for immutable ledger |

## Dual control

`POL-ACCESS-001` requires maker-checker control by risk tier. Low-risk support edits are single-actor and audited. Medium-risk actions (high-value refund, Vendor restriction, data export) require a reason and post-action review. High-risk actions (payout release/override, permanent suspension, bulk export, secret recovery) require a distinct approver, evidence, expiry, and a denial path. No actor may approve their own pending action. Emergency access has a short TTL and triggers retrospective review.
