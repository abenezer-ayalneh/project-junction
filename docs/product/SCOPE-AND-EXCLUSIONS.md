# Scope and Exclusions

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** product scope boundaries  
**Decision coverage:** `DEC-006`–`DEC-009`, `DEC-013`, `DEC-015`, `DEC-020`, `DEC-026`, `DEC-027`, `DEC-045`–`DEC-047`, `DEC-056`, `DEC-059`, `DEC-134`, `DEC-135`, `DEC-147`, `DEC-149`, `DEC-161`, `DEC-166`, `DEC-167`

## Included at first public portfolio release

- B2C business Vendors with structured hybrid storefronts.
- Low-risk, fixed-price Products (simple/variant) and fixed-duration, fixed-price Services/options/add-ons.
- Multi-Vendor goods and Bookings in a single Customer Cart/Checkout; up to five independent Booking intents.
- Pickup and Vendor-managed delivery; in-person and online appointments.
- Returns, refunds, disputes, Support Cases, reviews, moderation, notifications, financial operations, and demo operations.

## Excluded or deferred

| Capability                                                                       | Boundary                                                                    |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| C2C, rentals, quote jobs, negotiation/auctions                                   | excluded; marketplace and pricing model changes                             |
| home service, group classes/seats, recurring series                              | excluded; capacity is Staff-only and one Customer party                     |
| shared rooms/equipment, staff-specific price/duration/buffer differences         | excluded from Release 1                                                     |
| controlled/medical/financial/legal/adult/weapons/alcohol/regulated/digital goods | prohibited                                                                  |
| native apps, AI identity, loyalty/wallet/escrow, cash on delivery                | deferred or excluded until new decision/gating                              |
| fleet, carrier integration, dispatch, route/GPS tracking                         | excluded; Vendors manage delivery milestones/proof                          |
| public Q&A, general inbox, live video, appointment recording/transcription       | excluded; private offering inquiries and scoped messages/Support Cases only |
| tax calculation or Ethiopian tax-invoice claims                                  | excluded from portfolio system                                              |

The full deferred list and re-entry requirements are in [Deferred Capability Backlog](../future/DEFERRED-CAPABILITY-BACKLOG.md).
