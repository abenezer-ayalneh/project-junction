# Phase 05 — Trust, Operations, and Engagement

**Status:** Specified — Not Executed — Not Verified  
**Objective:** complete the human and policy systems needed for accountable marketplace operation.  
**Owner:** trust, support, engagement, and finance-operations contexts  
**Entry:** Phase 01–04 exit evidence. **Exit:** scoped support/trust/finance operations and privacy proof.  
**Decision coverage:** `DEC-030`, `DEC-035`, `DEC-038`–`DEC-041`, `DEC-051`, `DEC-052`, `DEC-060`, `DEC-063`–`DEC-065`, `DEC-105`–`DEC-107`, `DEC-122`, `DEC-123`, `DEC-133`, `DEC-145`, `DEC-163`, `DEC-166`–`DEC-174`, `DEC-186`–`DEC-189`

## Included / excluded

Includes exact policy-snapshot aftercare, Support Cases, returns/refunds/disputes, verified reviews, private offering inquiries/scoped messaging, notifications, opt-in personalization, first-party analytics, data export/deletion, risk review, restricted suspension/appeal, Finance reconciliation and risk-tiered dual control. Excludes public Q&A/general inbox, unscoped staff ratings, behavioral surveillance, unapproved commercial operations.

## Actors and proof journey

A Customer or Vendor opens a SupportCase, ReturnCase, or Dispute only for a permitted component and supplies scoped evidence. Support can communicate and triage; Trust can moderate/restrict with appeal; Finance can reconcile/refund/payout under the required approval tier but cannot edit history. A completed Customer can post a moderated verified review, while a visitor can make only a private offering inquiry. The proof includes privacy opt-in/export/deletion, suspension during open obligations, duplicate provider result, financial mismatch, and customer-visible notification failure.

## Functional requirements

- `REQ-P05-CASE-001`: SupportCase, ReturnCase, Dispute and moderation cases are scoped to owned components/evidence and preserve policy snapshot/audit.
- `REQ-P05-RET-001`: goods uses 7/14/30 policy; Product exchange is return/refund then a fresh Purchase.
- `REQ-P05-TRUST-001`: restricted suspension preserves records/appeal/open obligations and blocks new commitments; high-risk enforcement uses dual control.
- `REQ-P05-REV-001`: review entitlement follows completed eligible component; Staff feedback stays private and public reviews are moderated/appealable.
- `REQ-P05-ENG-001`: wishlists, saved services/searches, follows/updates, private inquiries and minimal notifications are supported; personalization is explicit opt-in.
- `REQ-P05-PRV-001`: export/deletion/pseudonymization preserves minimum transaction, ledger, dispute, and security record integrity.
- `REQ-P05-OPS-001`: Finance reconciles provider/inbox/Purchase/ledger/payout and opens exceptions instead of editing records.

## Objects/state/events

ReturnCase, Dispute, SupportCase, Review, ModerationCase, Appeal, Notification, Preference, AnalyticsEvent, ExportRequest, DeletionRequest. Uses `STATE-RET-001`, `STATE-TRUST-001`, `STATE-DEMO-001`; `EVT-CASE-*`, `EVT-REVIEW-*`, `EVT-MODERATION-*`, `EVT-NOTIFICATION-*`. Policies `POL-TRUST-*`, `POL-GOOD-*`, `POL-BKG-*`, `POL-FIN-*` apply.

## Failure/quality/acceptance

Missing evidence, duplicate provider result, privacy request conflict, failed notification, moderation appeal, suspension during open Orders/Bookings, and provider outage have explicit paths. Test `TST-P05-001` case/dual control, `TST-P05-002` personalization/rights, `TST-P05-003` suspension/review/inquiry scope, and `TST-P05-004` reconciliation mismatch. General social commerce, automated enforcement, and data promotion are deferred.
