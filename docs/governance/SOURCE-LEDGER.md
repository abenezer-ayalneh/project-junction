# Conversation Source Ledger

**Document status:** accepted baseline  
**System claim:** documentation provenance only; it does not define product behavior  
**Normative owner:** source classification

## Method

This ledger preserves the complete Project Junction decision conversation as stable source IDs. Each direct selection is normalized into the corresponding `DEC-*` entry in [Decision Register](./DECISION-REGISTER.md), where the actual decision wording and normative home live. A later direct selection may revise an existing decision rather than create a new `DEC-*` number. A range means every individual four-digit source identifier in that range is present and has the stated classification; it is not a single aggregated source. Thus `SRC-CHAT-0001` through `SRC-CHAT-0189`, plus later `SRC-CHAT-0195`, are individually classified without duplicating decision sentences.

The [Source Ledger Appendix](./SOURCE-LEDGER-APPENDIX.md) contains the one-row-per-source chronological proof, including all direct and non-decision source entries. This file remains the readable grouped overview.

Assistant questions, alternatives, and recommendations are retained only when they affected how a choice is interpreted; they are never upgraded into User decisions. The parked venture’s historical conversation is intentionally outside this ledger.

## Direct-selection source map

| Source ID(s)                                         | Conversation subject                                                                               | Classification   | Normalized result                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------- |
| `SRC-CHAT-0001`–`0015`                               | vision, audience, scope, geography, PWA, AI, staged portfolio posture                              | `USER-CONFIRMED` | `DEC-001`–`DEC-015`                                                             |
| `SRC-CHAT-0016`–`0055`                               | storefront/catalog, locations/stock, goods/service shape, fulfillment, discovery                   | `USER-CONFIRMED` | `DEC-016`–`DEC-055`                                                             |
| `SRC-CHAT-0056`–`0065`                               | receipt/tax boundary, promotions, returns/disputes, privacy, accessibility, messaging              | `USER-CONFIRMED` | `DEC-056`–`DEC-065`                                                             |
| `SRC-CHAT-0066`–`0088`                               | Vendor verification, identity/auth, provider/security, money, persistence, media                   | `USER-CONFIRMED` | `DEC-066`–`DEC-088`                                                             |
| `SRC-CHAT-0089`–`0111`                               | VPS/deployment/recovery, maps, observability, online meetings, demo/provider boundaries            | `USER-CONFIRMED` | `DEC-089`–`DEC-111`                                                             |
| `SRC-CHAT-0112`–`0116`, `0119`–`0125`, `0127`–`0129` | repository/license/docs, API/runtime/realtime, isolation                                           | `USER-CONFIRMED` | `DEC-112`–`DEC-116`, `DEC-119`–`DEC-125`, `DEC-127`–`DEC-129`                   |
| `SRC-CHAT-0117`, `0118`, `0126`, `0130`              | earlier visual and Storefront styling selections                                                   | `SUPERSEDED`     | replaced by `SRC-CHAT-0195`; current `DEC-117`, `DEC-118`, `DEC-126`, `DEC-130` |
| `SRC-CHAT-0131`–`0137`                               | fulfillment, private slice, capacity/reliability goals                                             | `USER-CONFIRMED` | `DEC-131`–`DEC-137`                                                             |
| `SRC-CHAT-0138`                                      | earlier goods-pickup-only first-public idea                                                        | `SUPERSEDED`     | `DEC-138`; replaced by `DEC-157`–`DEC-160`                                      |
| `SRC-CHAT-0139`–`0152`                               | demo/scheduling/finance/promotions/availability rules                                              | `USER-CONFIRMED` | `DEC-139`–`DEC-152`                                                             |
| `SRC-CHAT-0153`–`0155`                               | ASVS Level 2 and contractual seller/payment-merchant clarification                                 | `USER-CONFIRMED` | `DEC-153`–`DEC-155`                                                             |
| `SRC-CHAT-0156`–`0163`                               | staff-only capacity, broad first-public release, onboarding, delivery, fee policy                  | `USER-CONFIRMED` | `DEC-156`–`DEC-163`                                                             |
| `SRC-CHAT-0164`–`0170`                               | Staff identity, waitlist, exchange, inquiry, Support Case, Platform controls                       | `USER-CONFIRMED` | `DEC-164`–`DEC-170`                                                             |
| `SRC-CHAT-0171`–`0178`                               | adult account, demo lifetime/access, suspension, opt-in personalization, public media              | `USER-CONFIRMED` | `DEC-171`–`DEC-178`                                                             |
| `SRC-CHAT-0179`–`0189`                               | budget, seed set, substitution, five Booking limit, exact post-purchase rules                      | `USER-CONFIRMED` | `DEC-179`–`DEC-189`                                                             |
| `SRC-CHAT-0195`                                      | stock shadcn/ui neutral design grammar, icon baseline, color modes, brand use, Storefront identity | `USER-CONFIRMED` | `DEC-117`, `DEC-118`, `DEC-126`, `DEC-130`                                      |

## Non-decision and constraint sources

| Source ID       | Conversation material                                                                                                                 | Classification               | Treatment                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `SRC-CHAT-0190` | User required a complete versioned documentation baseline and explicitly prohibited implementation/external operations in this phase. | `CONSTRAINT`                 | Status, README, requirements and Manifest enforce it.                                            |
| `SRC-CHAT-0191` | Assistant-proposed implementation details such as exact scanner/tool/limit choices not explicitly selected by User.                   | `DERIVED-PLAN-DEFAULT`       | Labeled as derived in applicable architecture/security/environment docs; not `DEC-*` User facts. |
| `SRC-CHAT-0192` | External provider, law, pricing, availability, and regulatory assertions.                                                             | `EXTERNAL-CONSTRAINT`        | Require dated `REF-*`, drift risk, and refresh trigger.                                          |
| `SRC-CHAT-0193` | Claims about potential Dire Dawa commercial operation.                                                                                | `REQUIRES-FUTURE-VALIDATION` | Future package/gates; no portfolio inference.                                                    |
| `SRC-CHAT-0194` | Later-capability questions whose answer changes business or commercial scope.                                                         | `DEFERRED`                   | Kept in assumptions/future backlog; no disguised implementation decision.                        |

## Completeness statement

- Direct selection sources classified: `SRC-CHAT-0001`–`SRC-CHAT-0189`, plus `SRC-CHAT-0195` = 190.
- Constraint/derived/external/future sources classified: `SRC-CHAT-0190`–`SRC-CHAT-0194` = 5.
- Unclassified source entries: **0**.
- Superseded source selections—`SRC-CHAT-0117`, `0118`, `0126`, `0130`, and `0138`—remain visible rather than overwritten.

Trace from source to future evidence through [Traceability Matrix](./TRACEABILITY-MATRIX.md). No accepted decision is permitted to exist only in this ledger or its appendix.
