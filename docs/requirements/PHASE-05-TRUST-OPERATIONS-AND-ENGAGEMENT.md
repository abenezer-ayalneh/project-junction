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

`REQ-P05-UX-001`: Purchase aftercare displays independent Order/Booking outcomes and only entitled support/cancellation/return/amendment/join/review actions; public reputation derives from eligible moderated reviews and personalization remains explicit opt-in (`DEC-191`, `DEC-193`; `TST-P05-005`). The [Marketplace UI/UX specification](../product/MARKETPLACE-UI-UX-SPECIFICATION.md) owns presentation details. This addition remains **Specified — Not Executed — Not Verified**.

## Objects/state/events

ReturnCase, Dispute, SupportCase, Review, ModerationCase, Appeal, Notification, Preference, AnalyticsEvent, ExportRequest, DeletionRequest. Uses `STATE-RET-001`, `STATE-TRUST-001`, `STATE-DEMO-001`; `EVT-CASE-*`, `EVT-REVIEW-*`, `EVT-MODERATION-*`, `EVT-NOTIFICATION-*`. Policies `POL-TRUST-*`, `POL-GOOD-*`, `POL-BKG-*`, `POL-FIN-*` apply.

## Failure/quality/acceptance

Missing evidence, duplicate provider result, privacy request conflict, failed notification, moderation appeal, suspension during open Orders/Bookings, and provider outage have explicit paths. Test `TST-P05-001` case/dual control, `TST-P05-002` personalization/rights, `TST-P05-003` suspension/review/inquiry scope, and `TST-P05-004` reconciliation mismatch. General social commerce, automated enforcement, and data promotion are deferred.

## Implementation chunks

**Plan updated:** 2026-10-12. Chunk boundaries are derived planning defaults; existing requirements, policies and phase gates remain authoritative. Follow the [single-chunk workflow](./MULTIPHASE-REQUIREMENTS.md#single-chunk-workflow). Complete one chunk per request, in the order below, after its dependencies are ready. Each chunk includes relevant contracts/state/events, scoped authority, implementation, local verification and documentation updates.

**First chunk:** `P05-C01`, subject to this phase’s entry dependencies. All chunks below are planned and unverified; completing a chunk does not accept the phase exit.

| Chunk                                              | Status  | Scope and requirement coverage                                                                                                                | Dependency                | Completion evidence                                                                                                     |
| -------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `P05-C01` — Scoped support cases and evidence      | Pending | Owned-component SupportCase/ReturnCase/Dispute intake, triage and communication with snapshots/audit. (REQ-P05-CASE-001)                      | Phase 01–04 exit evidence | Cross-owner/component denial, missing evidence and immutable case history.                                              |
| `P05-C02` — Return/refund and dispute operations   | Pending | Operational case handling over goods/Booking and finance primitives with scoped holds/refunds. (REQ-P05-RET-001, REQ-P05-CASE-001)            | `P05-C01`                 | 7/14/30-day goods policy, fresh-purchase exchange, repeated refund and unaffected value preservation.                   |
| `P05-C03` — Restricted suspension and appeal       | Pending | Trust restrictions block new commitments while preserving open obligations, records and appeal. (REQ-P05-TRUST-001)                           | `P05-C02`                 | Live suspension races, scoped authority and high-risk dual control; TST-P05-003.                                        |
| `P05-C04` — Verified reviews and moderation        | Pending | Completed-component entitlement, moderated/appealable public reviews and private Staff feedback. (REQ-P05-REV-001)                            | `P05-C03`                 | Ineligible/duplicate reviews, moderation visibility and appeal audit; no public Staff ratings.                          |
| `P05-C05` — Saved engagement and private inquiries | Pending | Complete wishlists, saved services/searches, follows/updates and offering-scoped private inquiries. (REQ-P05-ENG-001)                         | `P05-C04`                 | Preserve existing Phase 01 implementations; verify ownership, offering scope and absence of unscoped inbox/public Q&A.  |
| `P05-C06` — Notifications and delivery recovery    | Pending | Minimal transactional/opt-in notifications with retry, delivery state and customer-visible failure recovery. (REQ-P05-ENG-001)                | `P05-C05`                 | Duplicate/outbox/provider failures, preference enforcement and safe retry without repeated side effects.                |
| `P05-C07` — Opt-in personalization and analytics   | Pending | Explicit preference/withdrawal controls and first-party analytics; reconcile existing discovery behavior. (REQ-P05-ENG-001, REQ-P05-PRV-001)  | `P05-C06`                 | Opt-out/default/withdrawal boundaries and no behavioral surveillance; TST-P05-002.                                      |
| `P05-C08` — Export, deletion and pseudonymization  | Pending | Scoped rights workflow preserving minimum transaction/ledger/dispute/security integrity and adopted retention rules. (REQ-P05-PRV-001)        | `P05-C07`                 | Request conflicts/holds, authority, retries and retained/deleted evidence; governing-policy approval remains a gate.    |
| `P05-C09` — Finance operations and approvals       | Pending | Reconciliation exception investigation and risk-tiered approvals for refund/payout/compensating actions. (REQ-P05-OPS-001, REQ-P05-TRUST-001) | `P05-C08`                 | Role separation, recent authority, dual-control/replay and mismatch handling without history edits; TST-P05-001/004.    |
| `P05-C10` — Purchase aftercare and reputation UI   | Pending | Independent Order/Booking outcomes and entitled support/cancel/return/amend/join/review actions; eligible reputation. (REQ-P05-UX-001)        | `P05-C09`                 | Served local role/component scope, invalid action recovery and opt-in controls; TST-P05-005.                            |
| `P05-C11` — Trust and operations acceptance gate   | Pending | Assemble local case, privacy, suspension, engagement and financial-operations evidence. (All Phase 05 requirements)                           | `P05-C10`                 | TST-P05-001–005 and open-obligation/notification/provider-failure journeys; record unresolved retention/approval gates. |

**Tracking:** when a chunk finishes, update its status and add dated local implementation/evidence notes in this document, update relevant linked contracts/policies/acceptance documents, and set the next chunk in this document and [Documentation Status](../STATUS.md). If blocked, record the missing dependency and retain this chunk as next; do not silently advance.
