# Verified Social Checkout Venture — Parked

**Status:** PARKED  
**Decision date:** 26 August 2026  
**Review cadence:** Event-triggered only; there is no scheduled build or launch.

## Decision

Do **not** build an MVP, accept customer funds, open a customer-fund account, or operate an escrow service. Preserve the opportunity as a documented concept only.

The potential differentiation remains:

- merchant-owned storefront links;
- transparent, field-level verification;
- protected payment through an appropriately licensed provider; and
- seller-managed delivery.

No product work resumes unless every re-entry gate below has passed with current evidence.

## Why it is parked

The central promise—delivery-contingent payment protection—cannot responsibly be implemented with the presently documented provider and regulatory evidence.

- [Zemen GEBEYA](https://www.ethiotelecom.et/zemengebeya/) already offers verified commerce and describes a Telebirr escrow flow.
- [Chapa's split-payment documentation](https://docs.chapa.global/docs/v1/integrations/split-payment) covers settlement splits, while its public material does not document delivery-contingent holds.
- [Awrari's public API documentation](https://api.awrari.com/api/docs) advertises an escrow-oriented beta, but does not publicly establish a named licensed custodian or end-to-end provider money movement.
- The [NBE National Digital Payment Strategy 2026–2030 draft](https://nbe.gov.et/wp-content/uploads/2025/12/NATIONAL_DIGITAL_PAYMENT_STRATEGY_2026-2030_Draft_Document.pdf) identifies escrow as a framework gap and records no payment-system operators offering it under the baseline framework.

This is a product and operating decision, not legal advice. Any future restart requires Ethiopian legal counsel and written regulatory/provider evidence.

## Locked scope while parked

The following are explicitly out of scope:

- APIs, apps, MVPs, checkout pages, wallets, escrow accounts, payment collection, or payment aggregation;
- holding, directing, or settling customer funds;
- representing the venture as a payment, escrow, verification, logistics, or marketplace operator;
- merchant recruitment, customer acquisition, or a live pilot; and
- self-operated escrow, unless NBE explicitly authorizes both the entity and operating model.

Documentation, non-operational market research, and re-entry due diligence are allowed.

## Re-entry gates

All six gates must pass. One failed, incomplete, stale, or contradictory gate keeps the venture parked.

| Gate                       | Required current evidence                                                                                                                                                                           | Pass condition                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1. Regulatory basis        | An NBE-published escrow framework, or written NBE confirmation addressing the proposed structure                                                                                                    | The intended provider arrangement and transaction sequence are explicitly permitted.                                   |
| 2. Licensed provider       | A named entity on the [NBE payment-instrument issuer and system-operator register](https://nbe.gov.et/payment-instrument-issuers-system-operators/), plus a signed contract and service description | It contractually offers conditional hold, release, refund, merchant settlement, and signed notifications.              |
| 3. Production-like sandbox | Dated sandbox test record from that provider                                                                                                                                                        | The exact scenarios below pass without manual, undocumented fund handling.                                             |
| 4. Legal opinion           | Written opinion from qualified Ethiopian counsel                                                                                                                                                    | The marketplace does not perform unauthorized custody, payment processing, merchant acquiring, or payment aggregation. |
| 5. Competitive refresh     | Fresh, dated market research and direct product evidence                                                                                                                                            | The merchant-owned, no-install social-checkout gap still exists and is meaningful.                                     |
| 6. Unit economics          | Provider price sheet, merchant subscription model, and merchant willingness-to-pay evidence                                                                                                         | A real subscription price covers the model without permanent transaction subsidies.                                    |

### Required sandbox scenarios

The named provider must demonstrate, in a documented production-like sandbox:

1. Acceptance followed by payment-authorisation expiry or non-payment.
2. Conditional hold after a successful payment.
3. Buyer delivery confirmation using a handoff code.
4. Release only after the agreed confirmation or review-window rule.
5. A review-window timeout and its documented outcome.
6. A buyer dispute before release, including the evidence trail and resolution authority.
7. Full and partial refunds where contractually supported.
8. Failed or delayed merchant settlement, reconciliation, and signed status notifications.

Sandbox success is evidence only; it does not authorize a live pilot until the other five gates pass.

## Preserved pilot design

If—and only if—every re-entry gate passes, restart from this bounded pilot:

- Recruit 10–15 Addis social-commerce merchants directly.
- Complete manual identity, location, and legal-registration verification.
- Create merchant-first, co-branded web storefronts with 10–20 assisted listings each.
- Use merchant-shared tracked links, seller-managed delivery, and buyer handoff codes.
- Run a six-week measured trial, then publish one real subscription price.
- Continue only when merchants voluntarily pay after seeing attributable protected orders.

The pilot must use the licensed provider’s approved transaction flow. It must never create an independent custody, wallet, or escrow layer.

## Re-entry protocol

1. Refresh every source and market claim; do not rely on the 26 August 2026 evidence snapshot.
2. Assemble one dated evidence packet against all six gates.
3. Obtain the regulatory and legal conclusions before any live money movement or merchant recruitment.
4. Run the required sandbox scenarios with the contracted licensed provider.
5. Reassess the competitive gap and subscription economics from current evidence.
6. Record an explicit **GO** or **REMAIN PARKED** decision. A GO decision starts the preserved pilot; any other outcome leaves this document’s status unchanged.

## Evidence snapshot

All evidence and conclusions in this record are dated **26 August 2026**. They must be refreshed before reconsideration.

| Source                                                                                                                                     | What it was used to assess                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [NBE license register](https://nbe.gov.et/payment-instrument-issuers-system-operators/)                                                    | Whether a proposed payment/escrow partner is visibly listed by the regulator.                 |
| [NBE payment strategy draft](https://nbe.gov.et/wp-content/uploads/2025/12/NATIONAL_DIGITAL_PAYMENT_STRATEGY_2026-2030_Draft_Document.pdf) | Published treatment of escrow and the regulatory baseline.                                    |
| [Zemen GEBEYA](https://www.ethiotelecom.et/zemengebeya/)                                                                                   | Existing verified-commerce and stated escrow-market benchmark.                                |
| [Chapa split payments](https://docs.chapa.global/docs/v1/integrations/split-payment)                                                       | Publicly documented payment-splitting capability.                                             |
| [Chapa webhooks](https://docs.chapa.global/docs/v2/integrations/webhooks)                                                                  | Publicly documented payment, refund, and payout notification capability.                      |
| [Awrari API documentation](https://api.awrari.com/api/docs)                                                                                | Publicly visible beta escrow-oriented interface and limitations requiring provider diligence. |

---

Changing this file from **PARKED** to active requires an explicit decision after the full re-entry protocol is complete.
