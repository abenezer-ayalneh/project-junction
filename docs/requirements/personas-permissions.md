# Project Junction — Personas and Permission Requirements

> **Status:** Planned authorization model. No roles or policies are implemented.

## Identity model

A `User` is a real authenticated identity. One User may simultaneously be a Customer and hold memberships in multiple Vendors. Vendor authorization is therefore derived from the active Vendor membership and optional Location scope, never from a global “vendor user” flag. `[DEC-010, DEC-067]`

A public-demo `Persona` is synthetic authority inside one expiring demo workspace. It is not a User, does not produce a real Better Auth session, and cannot be used outside its workspace. `[DEC-107, DEC-129]`

A `Staff` record is a Vendor scheduling/fulfillment profile. It may be associated with an authenticated User when that person needs operational access. Public Staff visibility is opt-in; hidden Staff remains eligible for “any qualified Staff” allocation. `[DEC-019, DEC-150]`

## Customer persona

Public visitors may browse. A verified Customer account is required before checkout. `[DEC-053]`

Authenticated Customer capabilities include:

- manage profile, optional phone, structured addresses, communication preferences, and consent;
- manage Cart, saved items/searches/Services, followed Vendors, and explicitly saved payment methods;
- reserve stock/appointments and pay;
- view Purchases, Vendor Orders, fulfillment, Bookings, receipts, refunds, and disputes;
- provide handoff/completion evidence and contest no-show/completion outcomes;
- request amendments, cancellations, returns, support, export, and deletion; and
- review only completed Product lines or Bookings. `[DEC-032–DEC-041, DEC-051, DEC-054, DEC-060, DEC-068, DEC-151]`

Customer authority never permits changing Vendor operations, selecting a different workspace, reading internal Staff feedback, or creating an unverified review.

## Vendor roles

Confirmed preset roles are: `[DEC-067]`

| Role          | Intended authority                                                                                                          | Explicit boundary                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Owner         | Vendor identity, memberships, Locations, policies, provider connections, and full Vendor oversight.                         | Mandatory MFA/recent auth; cannot bypass Platform suspension or alter immutable histories. |
| Manager       | Broad day-to-day operations within assigned Vendor/Locations.                                                               | Cannot assume Owner-only identity/security authority.                                      |
| Catalog       | Storefront, Listings, variants, media, taxonomy, import/export, publication submissions.                                    | No fulfillment, schedule, payout, or membership authority unless separately granted.       |
| Fulfillment   | Stock movements, Order preparation, pickup/delivery milestones, handoff evidence, permitted exceptional cancellation.       | No catalog pricing, Staff schedule, or finance configuration.                              |
| Scheduler     | Services, Staff qualification, hours/exceptions, Bookings, amendments, meeting provisioning, completion/no-show operations. | No Product stock or Vendor finance control.                                                |
| Service Staff | Own assigned work, limited Customer/Booking context, completion/no-show evidence, and permitted availability management.    | No broad Vendor data, other Staff finance, or policy configuration.                        |
| Finance       | Statements, ledger views, refunds/returns/disputes in granted workflow, provider onboarding status, and payout visibility.  | No arbitrary wallet withdrawal or ledger-row mutation. Mandatory MFA/recent auth.          |

Location scoping narrows a role; it never expands it. A member with several roles receives their union only inside the active Vendor and allowed Locations.

## Platform operations

The session confirmed that Platform roles exist, use least privilege, and require MFA, but did **not** confirm an exact Platform role-name list. Implementation documentation must therefore define capabilities before naming final roles. `[DEC-069]`

Required Platform capability groups are:

- Vendor verification/review, remediation, suspension, and appeal;
- catalog/media/moderation review and appeal;
- Customer/Vendor support;
- formal dispute and refund adjudication;
- payment reconciliation, ledger/transfer/payout oversight, and audited exception handling;
- marketplace policy, commission override, and campaign configuration;
- analytics/status/audit access; and
- Platform security and role administration.

No Platform operator may edit immutable stock, evidence, audit, or ledger history. Corrections create new audited facts. `[DEC-039, DEC-049, DEC-140]`

## Authentication assurance

- Real sign-in: verified email/password and Google; optional phone. `[DEC-068]`
- Mandatory MFA: Vendor Owner, Vendor Finance, and all Platform roles. `[DEC-069]`
- Permitted MFA mechanisms: TOTP or passkey plus controlled recovery, as confirmed in the session. `[DEC-069]`
- Sensitive actions require recent authentication. Saved-payment-method removal is explicitly included. `[DEC-069, DEC-151]`
- Browser sessions use secure revocable cookies validated by Nest; local-storage bearer sessions are forbidden. `[DEC-071]`

## Authorization invariants

1. Every protected request has one typed `AccessContext` identifying real User or demo Persona, workspace, active Vendor, memberships, Location scope, and Platform grants. `[DEC-129]`
2. Repository methods requiring scoped data cannot be called without that context.
3. IDs are never authority. Every requested resource is re-scoped at the persistence boundary.
4. Background jobs, webhooks, exports, object keys, search documents, notifications, and WebSocket rooms preserve the same ownership dimensions.
5. REST is authoritative after any realtime gap. `[DEC-072, DEC-124]`
6. Demo persona switching is visibly different from authentication and cannot grant real authority. `[DEC-107]`
7. Suspension/restriction rules must preserve only the minimum access needed to resolve existing Customer obligations; the precise Vendor lifecycle remains a documented open design unless separately confirmed.

## Required authorization tests

- cross-workspace, cross-Vendor, cross-Location, and cross-Customer ID substitution;
- membership removal and session revocation;
- Location-scope intersection across multi-role membership;
- background job or webhook referencing a resource in the wrong scope;
- search result/object URL/WebSocket notification leakage;
- hidden Staff visibility versus allocation eligibility;
- Customer access to Staff-private feedback;
- demo Persona attempting a real auth endpoint or provider object; and
- role escalation, recent-auth expiry, MFA recovery, and saved-payment-method removal.
