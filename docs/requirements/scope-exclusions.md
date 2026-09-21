# Project Junction — Scope, Boundaries, and Deferred Capabilities

> **Status:** Planned scope boundary. “Excluded” means the documentation and future implementation must not imply the capability exists.

## Included product families

- Physical goods sold by business Vendors. `[DEC-006, DEC-008]`
- Fixed-price, fixed-duration, one-off appointments at a Vendor Location or online. `[DEC-006, DEC-007, DEC-020, DEC-045, DEC-135]`
- Hybrid Vendor Storefronts containing Products and Services. `[DEC-009]`
- Multi-Vendor mixed Cart, one payment, decomposed Vendor Orders and Bookings. `[DEC-022–DEC-024]`
- Vendor-managed delivery and pickup. `[DEC-027]`
- Complete aftercare: cancellations, returns, refunds, disputes, reviews, support, messaging, earnings, and payout accounting. `[DEC-030, DEC-031, DEC-038–DEC-041, DEC-064, DEC-140–DEC-146]`

## Category boundary

Release 1 permits only low-risk categories. The following are excluded: `[DEC-046]`

- controlled goods;
- medical, financial, and legal services;
- adult goods/content/services;
- weapons;
- alcohol;
- other regulated categories until separately researched and approved; and
- digital goods.

Risk-based review remains required even inside allowed categories. `[DEC-047]`

## Commerce models excluded from Release 1

- Customer-to-Customer marketplace. `[DEC-008]`
- Shared canonical Product catalog. `[DEC-016]`
- Auctions, negotiated/quote-based jobs, variable-price services, and rentals. `[DEC-007, DEC-045]`
- Cross-border commerce claims. `[DEC-011]`
- Tax calculation or Ethiopian tax-invoice claims. `[DEC-056, DEC-057]`
- Cash wallet, stored promotional cash, arbitrary Vendor withdrawals, and escrow claims. `[DEC-025, DEC-059, DEC-144]`
- Subscription, listing, advertising, or other monetization beyond transaction commission. `[DEC-026]`
- Backorders and overselling. `[DEC-018]`
- Dedicated exchange state; a future exchange feature was not confirmed and must not be inferred from the return workflow.

## Fulfillment capabilities excluded

- Platform fleet, carrier network, Driver accounts, dispatching, routing, live GPS, and reservable delivery-window capacity. `[DEC-027]`
- Split fulfillment of one Vendor group across multiple Locations. `[DEC-131]`
- Treating pickup as a scheduled appointment. `[DEC-132]`

## Service capabilities excluded

- Home service. `[DEC-020]`
- Group classes, group-seat inventory, and multi-customer appointment capacity. `[DEC-134]`
- Recurring appointment series; rebooking a new one-off appointment remains allowed. `[DEC-135]`
- Room, chair, vehicle, equipment, or other shared-resource capacity in Release 1. Capacity is Staff-only. `[DEC-134]`
- Staff-specific Option price, duration, buffer, or add-on behavior. `[DEC-149]`
- Appointment recording and transcription. `[DEC-147]`
- Two-way external calendar synchronization in Release 1. `[DEC-050, DEC-099]`

## Social and communication exclusions

- General-purpose social network or unrestricted inbox. `[DEC-051, DEC-064]`
- Public Product/Service Q&A was not confirmed as a requirement and must not be implied.
- SMS marketing, two-way SMS chat, or SMS as an authoritative transaction channel. `[DEC-074]`
- Session replay, fingerprinting, or third-party behavioral analytics. `[DEC-123]`

## Client and localization exclusions

- Native iOS/Android applications in Release 1. `[DEC-013]`
- Unreviewed machine-published translations. `[DEC-012]`
- Decorative cultural motifs presented as local validation. `[DEC-126]`

## Provider and market claims excluded

- Real-document KYB in the public demo. `[DEC-066]`
- Claim that Smile ID provides Ethiopian KYB. `[DEC-066]`
- Claim that Stripe sandbox/Connect proves live Ethiopian payment, fund holding, transfer, or payout eligibility. `[DEC-025, DEC-077]`
- Public real-Google-Meet provisioning before the required OAuth posture; DemoMeet remains the public adapter. `[DEC-139]`
- Public production dependence on free OpenStreetMap tile or Nominatim endpoints. `[DEC-095]`
- Promotion of demo data/configuration into a future Dire Dawa system. `[DEC-109]`

## Explicitly deferred

- Native clients. `[DEC-013]`
- Bounded assistive AI. `[DEC-015]`
- Expiring non-cash loyalty points. `[DEC-059]`
- Two-way calendar sync. `[DEC-050]`
- Chapa after Stripe as its own production-complete adapter. `[DEC-075, DEC-078]`
- Additional regulated categories only after separate validation. `[DEC-046]`
- Future live Dire Dawa operation only after fresh feasibility and regulatory gates. `[DEC-001, DEC-011, DEC-109]`

## Not yet decided

The final documentation must keep these as open matters unless the User confirms them:

- exact return/cancellation policy durations and percentages;
- exact demo workspace lifetime and numeric quotas;
- exact Platform role names and maker-checker thresholds;
- exact delivery retry and pickup grace durations;
- exact media limits and attachment limits;
- public waitlist behavior;
- exact infrastructure/service budget; and
- the selected formal security verification level.
