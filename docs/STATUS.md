# Documentation Status

## Current reality

The local synthetic Phase 01 Vendor supply/discovery milestone is accepted against its [requirement-linked evidence](./quality/PHASE-01-ACCEPTANCE-EVIDENCE.md). It is regression evidence while Phase 00 transitions to [real private staging](./quality/PHASE-00-REAL-TRANSITION.md). Target R2, independent accessibility, and non-demo retention gates remain open.

Project Junction has an accepted local synthetic Phase 00 foundation and a Phase 01 Vendor supply/discovery API and PostgreSQL slice with local evidence. Public catalog search and storefront navigation have been exercised in a served local browser with temporary synthetic data. The synthetic Vendor workspace supports application, private catalog read, draft creation, review submission, and CSV preview/commit/export; private catalog read and draft creation were browser-verified, and CSV preview, commit, and row-error feedback were browser-verified with a disposable fixture. Storefront editing, versioned rejected-listing revision, and public unpublish reversal were browser-verified with a disposable fixture. A scoped Platform review page was browser-verified for application and listing approval through public discovery. Customer save/follow controls, persisted opt-in, and explained recommendations were also browser-verified with a disposable fixture. The accepted media profile has local signed upload, sealed quarantine, ClamAV scan, FFmpeg transform, scoped moderation, and publication-gated delivery evidence. Served browser journeys verified Vendor upload, reviewer preview/approval, silent and captioned public playback, keyboard video use, narrow viewport captions, and unpublish revocation. Expired upload, demo workspace, and orphan-object cleanup have tested local paths. Independent accessibility review and non-demo retention policy remain open. The first Phase 02 inventory-ledger seam is locally verified in the synthetic PostgreSQL and built API runtime; checkout, fulfillment, returns, customer availability, and the Phase 02 exit remain unimplemented. See [Phase 00 acceptance evidence](./quality/PHASE-00-DURABILITY-EVIDENCE.md), [Phase 01 local evidence](./requirements/PHASE-01-VENDOR-SUPPLY-AND-DISCOVERY.md#local-implementation-evidence), and [Phase 02 goods commerce](./requirements/PHASE-02-GOODS-COMMERCE.md#local-implementation-notes). Better Auth, Resend, and Sumsub sandbox adapters are implemented for private staging, but no live provider flow, VPS deployment, commerce, or public service has been accepted.

## Claim labels

- **Specified** — accepted target behavior or procedure documented from the conversation.
- **Derived default** — a safe technical default proposed for later review; it is not represented as a User-originated decision.
- **Not executed** — no command, provider action, provisioning, migration, or deployment has been performed.
- **Not verified** — no runtime, security, accessibility, performance, recovery, or provider evidence exists yet.
- **Requires future validation** — a future commercial claim that depends on current provider, legal, regulatory, tax, or market evidence.

## Environments

| Environment                           | Status                                     | Permitted reality                                                                                       |
| ------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Local development                     | Partially implemented and locally verified | Synthetic applications, PostgreSQL integration tests, and Git history.                                  |
| Private staging                       | Implementation in progress                 | Real-service code exists; provider accounts, isolated infrastructure, and deployment remain unverified. |
| Portfolio production/demo             | Specified only                             | No public demo or deployment exists yet.                                                                |
| Future Dire Dawa commercial operation | Unapproved                                 | Requires the gates in `docs/future/`.                                                                   |

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
