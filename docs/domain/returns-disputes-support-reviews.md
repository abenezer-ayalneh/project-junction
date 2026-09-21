# Returns, Disputes, Support, and Reviews

> **Status:** Planned aftercare and trust behavior; no case-management system exists.

## Policy templates and snapshots

The Platform defines bounded cancellation/return policy templates. A Vendor selects an allowed template, and each purchased Product line or Booking receives an immutable snapshot. Later policy edits do not change an existing Customer’s terms. `[DEC-030]`

The planning session did not confirm exact day/hour thresholds, refund percentages, eligible change-of-mind conditions, amendment counts, or evidence deadlines. Values previously introduced by the assistant must remain proposed until the User confirms them.

## Goods Return Case

Release 1 includes a complete goods return workflow. `[DEC-031]`

A Return Case must connect:

- affected Purchase/Vendor Order line and quantity;
- Customer, Vendor, fulfillment Location, and policy snapshot;
- reason and structured evidence;
- eligibility decision;
- return logistics responsibility/instructions;
- receipt and inspection/disposition;
- refund decision/provider status;
- stock movements;
- earning freeze/release/reversal; and
- optional formal Dispute.

Vendor fault includes wrong, damaged, or not-as-described goods under the confirmed reason-based model. Vendor pays return logistics and original delivery when the full fulfillment is affected. Customer pays logistics for an eligible change-of-mind return. `[DEC-146]`

The exact fault window, change-of-mind window, restocking, and exchange rules were not confirmed and must not be asserted as decisions.

## Booking cancellation and no-show aftercare

Booking cancellation/amendment eligibility uses the purchased policy snapshot. `[DEC-030]`

No-show requires Staff report/evidence and a Customer contest window. The final policy-based outcome determines refund and earnings. `[DEC-035]`

Completion/no-show is not made irreversible solely because one operational actor clicked a status; the evidence-backed contest/dispute path remains available. `[DEC-035, DEC-036, DEC-039]`

## Affected-value isolation

A return or dispute identifies exact Product quantity or Booking. It freezes only the affected earning amount and preserves unrelated Purchase components. `[DEC-038]`

All financial corrections use refunds plus immutable ledger reversals/new postings. Stock correction uses new movements. `[DEC-049, DEC-105, DEC-140]`

## Formal Dispute

Platform mediation receives structured Customer, Vendor, Staff, fulfillment, provider, message, and policy evidence as permitted by scope. An authorized agent decides:

- full refund;
- partial refund; or
- no refund. `[DEC-039]`

Every decision records actor/authority, affected components/value, evidence considered, policy snapshot, reason, time, appeal/finality state where applicable, and resulting commands. It never edits original evidence or postings. `[DEC-039, DEC-140]`

The exact Platform role names, approval thresholds, and appeal deadlines were not confirmed.

## Support boundary

Transaction-scoped messages may handle questions and resolution work. `[DEC-064]`

The previous assistant plan introduced a separate `SupportCase` versus `Dispute` authority distinction, but it was not part of the confirmed 152-decision ledger. Treat a dedicated Support Case model as **proposed**. Regardless of final naming, ordinary conversation must not trigger an unaudited refund; financial mediation must use the formal evidence/audit controls in DEC-039.

## Verified reviews

A Customer becomes review-eligible only after the specific Product line or Booking completes. `[DEC-040]`

Review dimensions separate:

- Product/Service quality; and
- Vendor experience. `[DEC-040]`

Staff-specific feedback remains private. Public reputation attaches to the Service/Listing and Vendor, not an individual Staff rating. `[DEC-041]`

Text and media are moderated. Reports may create a human moderation case and audited appeal. `[DEC-040, DEC-063]`

The chat did not confirm edit windows, version visibility, Vendor public-response limits, or exact rating scale. These remain proposed product details.

## Evidence and privacy

Evidence is private by default, scoped to affected case/actors/authorized Platform operators, scanned under the media boundary, and retained according to a documented schedule. `[DEC-088, DEC-129]`

Deletion requests pseudonymize retained legal/audit/security/financial evidence rather than breaking case or ledger integrity. `[DEC-060]`

## Acceptance criteria

- a Case cannot target another Customer, Vendor, workspace, line, quantity, or Booking;
- selected policy version remains stable after Vendor policy changes; `[DEC-030]`
- Vendor-fault versus change-of-mind logistics follow DEC-146;
- only affected earnings freeze; `[DEC-038]`
- mediation supports exactly full/partial/no-refund economic outcomes and is immutable/audited; `[DEC-039]`
- accepted return reconciles refund, ledger, stock disposition, evidence, and notifications;
- only completion creates Review entitlement; `[DEC-040]`
- public review data never exposes private Staff feedback; `[DEC-041]`
- moderation and appeal preserve original content/evidence versions; `[DEC-063]`
- retry cannot duplicate refund, movement, posting, or entitlement; and
- deletion/pseudonymization preserves financial and case integrity. `[DEC-060, DEC-140]`
