# Synthetic Scenarios and Reviewer Guide

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-004`, `DEC-157`–`DEC-161`, `DEC-166`, `DEC-168`–`DEC-182`

Suggested guided paths:

1. **Unified commerce:** Customer adds two Vendor Product groups plus up to five independent fixed-duration Booking intents, selects delivery/pickup and in-person/online modes, then completes a clearly simulated checkout.
2. **Correctness:** reviewer observes an expiring stock/Staff hold, idempotent retry fixture, Purchase split, policy snapshots, and immutable demo ledger.
3. **Operations:** Vendor prepares pickup/delivery milestones; Staff completes an appointment; Customer opens return/dispute/support; Platform role resolves it under approval constraints.
4. **Trust:** reviewer sees prohibited listing block, private offering inquiry, review moderation, restricted suspension, and appeal fixture.
5. **Resilience:** reviewer sees provider outage and reconciliation fixture, low-connectivity message/retry behavior, demo expiry and cleanup record.

The guide must label simulated outcomes and link each claim to `REQ-*`, `TST-*`, and, once implementation exists, `EVD-*`. A reviewer should never be required to expose personal data, sign up, connect an external account, or spend money.
