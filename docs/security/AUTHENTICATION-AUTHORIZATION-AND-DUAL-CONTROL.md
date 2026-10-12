# Authentication, Authorization, and Dual Control

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** access security and privileged-action control  
**Decision coverage:** `DEC-010`, `DEC-053`, `DEC-107`, `DEC-117`, `DEC-118`, `DEC-162`, `DEC-163`

## Authentication

Public browse requires no account. Local development uses verified email/password or Google authentication and retains server-derived authorization, membership, grant, revocation, and audit controls. Adult identity verification and MFA are deliberately deferred from local development and are mandatory pre-public-release gates; email or Google verification never substitutes for them. A Customer may supply optional attendee details for a minor only; the adult remains the contracting account holder. Authentication failures are generic, rate limited, audited, and never disclose account existence beyond a deliberately selected recovery flow.

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

## Local goods cancellation authority — 2026-10-12

`P02-C08` derives exact expiring Order cancellation authorities in server AccessContext from separate `GoodsCancellationGrant` rows. Platform Finance cancellation/read is function- and Order-scoped; catalog review or generic foundation capability grants no finance authority. Self-purchase and same-Vendor membership conflicts are rejected, including new conflicts after grant issuance; revocation/expiry are live checks. A local loopback operator CLI provides explicit provenance, reason, expiry and grant/revoke audit without a public self-grant API. Its default hour (maximum configured 24 hours) is a derived local operational limit. Vendor Owner cancellation requires current assigned Vendor/Location membership. Explicit restricted-Vendor derivation permits existing Order resolution/context switching only; ordinary publication/stock/new commitment derivation still denies restricted Vendors. All proportional cancellations record reviewRequired and post-action review work; risk-tier review processing remains an open Phase 05/finance gate, and MFA remains a mandatory non-local release condition. See [P02-C08 evidence](../requirements/PHASE-02-GOODS-COMMERCE.md#p02-c08--partial-cancellation-and-refund-allocation--2026-10-12).
