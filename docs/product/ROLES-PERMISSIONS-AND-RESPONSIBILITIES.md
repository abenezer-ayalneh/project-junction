# Roles, Permissions, and Responsibilities

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** product-facing role model; enforcement belongs in security/access documents  
**Decision coverage:** `DEC-010`, `DEC-053`, `DEC-067`, `DEC-107`, `DEC-117`, `DEC-118`, `DEC-162`–`DEC-164`, `DEC-169`

| Role family                                                             | Responsibilities                                                                | Limits                                                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Guest                                                                   | browse public catalog and storefronts                                           | no Cart-to-Purchase confirmation, saved/private data, or operations                        |
| Customer                                                                | own Cart, Purchase, Booking, address, support/return/dispute/review actions     | account verification required for checkout; no Vendor/Platform authority                   |
| Vendor Owner                                                            | business setup, members, policy choice, catalog, Locations, operation oversight | bounded to their Vendor; high-risk financial action can require approval                   |
| Vendor Manager/Catalog/Fulfillment/Scheduler/Service Staff/Finance      | assigned operational work                                                       | preset least-privilege capability and optional Location scope; no inferred admin privilege |
| Staff profile                                                           | service qualifications/availability/attendance                                  | may exist without a User account; cannot gain Vendor powers just by being Staff            |
| Platform Support/Vendor Operations/Trust & Safety/Finance/Analyst/Owner | case- or function-scoped marketplace work                                       | risk-tiered maker/checker rules; no self-approval of high-risk action                      |

Each authoritative operation uses a server-derived `AccessContext`. A Customer identity can coexist with memberships in multiple Vendors. A restricted/suspended Vendor retains only the access needed to view records, respond to cases, appeal, and resolve open commitments; it cannot create new customer-facing commitments.
