# Documentation Status

## Current reality

Project Junction has a local synthetic Phase 00 foundation and Phase 01 Vendor supply/discovery slice: Nx Next/Nest/worker applications, public contracts, Prisma migrations, Compose PostgreSQL/PostGIS, and durable repositories. Phase 00 is not complete; Phase 01 is locally verified only. See [Phase 00 durability evidence and remaining gates](./quality/PHASE-00-DURABILITY-EVIDENCE.md) and [Phase 01 local evidence](./requirements/PHASE-01-VENDOR-SUPPLY-AND-DISCOVERY.md#local-implementation-evidence). No real provider integration, identity topology, VPS deployment, commerce or public service is claimed.

## Claim labels

- **Specified** — accepted target behavior or procedure documented from the conversation.
- **Derived default** — a safe technical default proposed for later review; it is not represented as a User-originated decision.
- **Not executed** — no command, provider action, provisioning, migration, or deployment has been performed.
- **Not verified** — no runtime, security, accessibility, performance, recovery, or provider evidence exists yet.
- **Requires future validation** — a future commercial claim that depends on current provider, legal, regulatory, tax, or market evidence.

## Environments

| Environment                           | Status                                     | Permitted reality                                                                     |
| ------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| Local development                     | Partially implemented and locally verified | Synthetic applications, PostgreSQL integration tests, and Git history.                |
| Private staging                       | Specified only                             | No Project Junction provider configuration, infrastructure, or deployment exists yet. |
| Portfolio production/demo             | Specified only                             | No public demo or deployment exists yet.                                              |
| Future Dire Dawa commercial operation | Unapproved                                 | Requires the gates in `docs/future/`.                                                 |

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
