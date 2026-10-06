# Documentation Status

## Current reality

Local development uses Better Auth email/password and Google accounts with fresh local data and Mailpit. The former synthetic persona/workspace flow is retired; its old acceptance records are historical evidence only. The current [Phase 00 local evidence](./quality/PHASE-00-LOCAL-ACCEPTANCE-EVIDENCE.md) records served signup/verification, recovery endpoint/revocation evidence, user-confirmed reset-form submission, local authorization, durable publication, Redis delivery, replay acknowledgement, Google-only sign-in, and user-confirmed same-email linking and different-email separation. A same-address attempt briefly returned `invalid_code` but succeeded when retried once from a fresh account tab; the initial cause is unknown. On 2026-10-06, the real Better Auth callback handler passed a controlled-provider PostgreSQL probe preserving the User ID, Owner membership, locations, and catalog access; both email-verification gates and a fresh retry after a controlled `invalid_code` passed. The 2026-10-06 remaining-gate follow-up passed served multi-Owner/revoked-membership HTTP and gateway checks, all workspace lint/typecheck/unit targets, and the local Webpack web build. A live Google consent journey with an existing local Vendor account then preserved the same Junction User, Vendor membership, location scope, and no-reviewer-grant state. Private staging is suspended with its data/configuration preserved; target MinIO, independent accessibility, and non-demo retention gates remain open.

The Phase 01 Vendor supply/discovery API and PostgreSQL slice has integration and served-browser evidence. Earlier browser journeys exercised public catalog search, Vendor application and editing, scoped review, CSV operations, saved/followed state, recommendations, media moderation, and publication using disposable fixtures. Those fixture-backed journeys remain historical regression evidence and do not describe the current local account flow. The first Phase 02 inventory-ledger seam is locally verified with PostgreSQL and the built API; checkout, fulfillment, returns, customer availability, and the Phase 02 exit remain unimplemented. See [current Phase 00 local evidence](./quality/PHASE-00-LOCAL-ACCEPTANCE-EVIDENCE.md), [historical Phase 01 fixture evidence](./quality/PHASE-01-ACCEPTANCE-EVIDENCE.md), and [Phase 02 goods commerce](./requirements/PHASE-02-GOODS-COMMERCE.md#local-implementation-notes). Better Auth, Resend, Didit Sandbox, and MinIO adapters are implemented for private staging, but no live provider flow, VPS deployment, commerce, or public service has been accepted.

## Claim labels

- **Specified** — accepted target behavior or procedure documented from the conversation.
- **Derived default** — a safe technical default proposed for later review; it is not represented as a User-originated decision.
- **Not executed** — no command, provider action, provisioning, migration, or deployment has been performed.
- **Not verified** — no runtime, security, accessibility, performance, recovery, or provider evidence exists yet.
- **Requires future validation** — a future commercial claim that depends on current provider, legal, regulatory, tax, or market evidence.

## Environments

| Environment                           | Status                                       | Permitted reality                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local development                     | Phase 00 complete for documented local scope | Fresh local PostgreSQL accounts, Mailpit, user-confirmed reset-form submission, Google-only sign-in, same-email linking, different-email separation, and live Google consent with pre-existing Vendor access. Controlled-provider callback/membership preservation and both verification gates passed integration on 2026-10-06. The earlier `invalid_code` cause remains unverified. |
| Private staging                       | Suspended and preserved                      | Junction services/routes are stopped; data/configuration remain retained for pre-release restoration.                                                                                                                                                                                                                                                                                 |
| Portfolio production/demo             | Specified only                               | No public demo or deployment exists yet.                                                                                                                                                                                                                                                                                                                                              |
| Future Dire Dawa commercial operation | Unapproved                                   | Requires the gates in `docs/future/`.                                                                                                                                                                                                                                                                                                                                                 |

## Documentation-authoring baseline

| Authoring phase                                             | Result                                                                                                      |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| A — preserve and inventory                                  | Complete: the parked venture is separately preserved; entry/status/manifest/ledger exist.                   |
| B — normalize decisions and language                        | Complete: decision register, source classifications, context glossaries, traceability, and ADRs exist.      |
| C — product and phased requirements                         | Complete: product suite, phase requirements, release gates, and acceptance mapping exist.                   |
| D — domain, data, interfaces, architecture                  | Complete as specification: policies, invariants, states, data, APIs, events, and target architecture exist. |
| E — environments, deployment, security, quality, operations | Specifications complete; local Phase 00 execution is separately tracked in the evidence record.             |
| F — demo and future commercialization                       | Complete: synthetic demo and separately gated Dire Dawa packages exist.                                     |
| G — audit and baseline                                      | Complete: static coverage results are recorded in [Coverage Audit 0.1](./governance/COVERAGE-AUDIT-0.1.md). |

## Non-negotiable boundary

This documentation does not authorize live money movement, customer data collection, KYB, Vendor recruitment, payment aggregation, tax claims, or a commercial pilot.
