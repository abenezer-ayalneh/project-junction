# Documentation Manifest

**Baseline:** `0.1.0` — documentation-only.  
**Global target-system status:** **Specified — Not Executed — Not Verified** unless a row says `Governance`, `Parked`, `Deferred`, or `Requires future validation`.

This is the authoritative inventory. `Owner` means normative owner, not a person. `Deps` names the principal documents/inputs, not an implementation dependency. Required files omitted from this manifest are a documentation defect.

## Repository and governance

| Document                                                  | Status     | Purpose                                | Owner               | Deps                            |
| --------------------------------------------------------- | ---------- | -------------------------------------- | ------------------- | ------------------------------- |
| `README.md`                                               | Baseline   | entry, boundary, navigation            | repository entry    | Manifest, Status                |
| `CONTEXT-MAP.md`                                          | Baseline   | bounded-context map                    | context map         | eight glossaries                |
| `docs/INDEX.md`                                           | Baseline   | reader navigation                      | index               | Manifest                        |
| `docs/STATUS.md`                                          | Baseline   | current-vs-target claim rules          | governance          | Decision Register               |
| `docs/MANIFEST.md`                                        | Baseline   | complete inventory                     | governance          | all documents                   |
| `docs/CHANGELOG.md`                                       | Baseline   | version history                        | governance          | baseline/audits                 |
| `docs/governance/SOURCE-LEDGER.md`                        | Governance | chat-source inventory                  | provenance          | task conversation               |
| `docs/governance/SOURCE-LEDGER-APPENDIX.md`               | Governance | individual chat-source chronology      | provenance          | Source Ledger/Decision Register |
| `docs/governance/DECISION-REGISTER.md`                    | Governance | normalized decisions                   | provenance          | Source Ledger                   |
| `docs/governance/TRACEABILITY-MATRIX.md`                  | Governance | source-to-evidence mapping             | governance          | decisions/requirements          |
| `docs/governance/ASSUMPTIONS-RISKS-AND-OPEN-QUESTIONS.md` | Governance | non-decisions and risks                | governance          | decisions/research              |
| `docs/governance/REJECTED-DEFERRED-AND-SUPERSEDED.md`     | Governance | explicit non-adopted/superseded record | governance          | Decision Register               |
| `docs/governance/DOCUMENTATION-CONVENTIONS.md`            | Governance | authority/ID/writing rules             | governance          | Manifest                        |
| `docs/governance/AUTHORITATIVE-SOURCE-REGISTER.md`        | Governance | external-source registry               | research governance | `REF-*`                         |
| `docs/governance/COVERAGE-AUDIT-0.1.md`                   | Baseline   | static completeness and boundary audit | governance          | Manifest/ledger/requirements    |
| `docs/ventures/verified-social-checkout-parked.md`        | Parked     | byte-preserved separate venture record | parked venture      | none                            |

## Product and experience

| Document                                                  | Status  | Purpose                           | Owner        | Deps                   |
| --------------------------------------------------------- | ------- | --------------------------------- | ------------ | ---------------------- |
| `docs/product/PRODUCT-DESCRIPTION.md`                     | S/NE/NV | product/actor experience          | product      | decisions, scope       |
| `docs/product/VISION-OUTCOMES-AND-SUCCESS.md`             | S/NE/NV | portfolio vision and success      | product      | claims/evidence        |
| `docs/product/AUDIENCE-PERSONAS-AND-JOBS.md`              | S/NE/NV | audience and jobs                 | product      | role model             |
| `docs/product/ROLES-PERMISSIONS-AND-RESPONSIBILITIES.md`  | S/NE/NV | product role responsibilities     | product      | access/security        |
| `docs/product/SCOPE-AND-EXCLUSIONS.md`                    | S/NE/NV | inclusion/exclusion boundary      | product      | deferred backlog       |
| `docs/product/FEATURE-CATALOG.md`                         | S/NE/NV | public capability inventory       | product      | requirements           |
| `docs/product/END-TO-END-USER-JOURNEYS.md`                | S/NE/NV | Customer/Vendor/Platform journeys | product      | policies/states        |
| `docs/product/PORTFOLIO-POSITIONING-AND-CLAIMS.md`        | S/NE/NV | truthful public positioning       | product      | evidence/demo          |
| `docs/product/UX-DESIGN-SYSTEM-AND-RESPONSIVENESS.md`     | S/NE/NV | target UX/design basis            | product UX   | accessibility/frontend |
| `docs/product/ACCESSIBILITY-I18N-AND-LOW-CONNECTIVITY.md` | S/NE/NV | inclusive/connectedness behavior  | product UX   | quality/security       |
| `docs/product/SEED-CATEGORIES-AND-SYNTHETIC-CONTENT.md`   | S/NE/NV | synthetic seed boundary           | product/demo | future research        |

## Requirements

| Document                                                        | Status  | Purpose                       | Owner              | Deps                  |
| --------------------------------------------------------------- | ------- | ----------------------------- | ------------------ | --------------------- |
| `docs/requirements/MULTIPHASE-REQUIREMENTS.md`                  | S/NE/NV | master delivery contract      | requirements       | phase docs/gates      |
| `docs/requirements/CROSS-PHASE-NONFUNCTIONAL-REQUIREMENTS.md`   | S/NE/NV | cross-phase quality           | requirements       | security/quality      |
| `docs/requirements/PHASE-00-PLATFORM-FOUNDATION.md`             | S/NE/NV | foundation requirements       | Phase 00           | contexts/interfaces   |
| `docs/requirements/PHASE-01-VENDOR-SUPPLY-AND-DISCOVERY.md`     | S/NE/NV | Vendor/discovery requirements | Phase 01           | catalog/domain        |
| `docs/requirements/PHASE-02-GOODS-COMMERCE.md`                  | S/NE/NV | goods requirements            | Phase 02           | fulfillment/policy    |
| `docs/requirements/PHASE-03-SERVICES-AND-BOOKINGS.md`           | S/NE/NV | Booking requirements          | Phase 03           | scheduling/policy     |
| `docs/requirements/PHASE-04-UNIFIED-COMMERCE-AND-FINANCE.md`    | S/NE/NV | mixed checkout/finance        | Phase 04           | ledger/interfaces     |
| `docs/requirements/PHASE-05-TRUST-OPERATIONS-AND-ENGAGEMENT.md` | S/NE/NV | trust/ops/engagement          | Phase 05           | policy/operations     |
| `docs/requirements/PHASE-06-HARDENING-AND-PUBLIC-RELEASE.md`    | S/NE/NV | hardening/public release      | Phase 06           | security/quality/demo |
| `docs/requirements/PHASE-AND-RELEASE-GATES.md`                  | S/NE/NV | phase/public/commercial gates | release governance | all phase evidence    |

## Context glossaries

| Document                                                   | Status  | Purpose                           | Owner            | Deps                    |
| ---------------------------------------------------------- | ------- | --------------------------------- | ---------------- | ----------------------- |
| `docs/contexts/identity-access-and-vendors/CONTEXT.md`     | S/NE/NV | canonical identity/Vendor terms   | context glossary | roles                   |
| `docs/contexts/catalog-inventory-and-locations/CONTEXT.md` | S/NE/NV | canonical catalog/location terms  | context glossary | catalog/location domain |
| `docs/contexts/scheduling-and-booking/CONTEXT.md`          | S/NE/NV | canonical scheduling terms        | context glossary | Booking domain          |
| `docs/contexts/cart-and-checkout/CONTEXT.md`               | S/NE/NV | canonical Cart/Checkout terms     | context glossary | Checkout domain         |
| `docs/contexts/ordering-and-fulfillment/CONTEXT.md`        | S/NE/NV | canonical Order/fulfillment terms | context glossary | fulfillment domain      |
| `docs/contexts/payments-ledger-and-payout/CONTEXT.md`      | S/NE/NV | canonical finance terms           | context glossary | ledger domain           |
| `docs/contexts/trust-support-and-moderation/CONTEXT.md`    | S/NE/NV | canonical case/trust terms        | context glossary | trust domain            |
| `docs/contexts/discovery-engagement-and-demo/CONTEXT.md`   | S/NE/NV | canonical projection/demo terms   | context glossary | engagement/demo         |

## Domain and policy

| Document                                                          | Status  | Purpose                       | Owner               | Deps                    |
| ----------------------------------------------------------------- | ------- | ----------------------------- | ------------------- | ----------------------- |
| `docs/domain/ACTORS-AGGREGATES-AND-OWNERSHIP.md`                  | S/NE/NV | aggregate authority           | domain              | context map             |
| `docs/domain/CROSS-CONTEXT-INVARIANTS.md`                         | S/NE/NV | global correctness invariants | domain              | state/data              |
| `docs/domain/VENDOR-STOREFRONT-CATALOG-AND-DISCOVERY.md`          | S/NE/NV | supply/catalog/discovery      | catalog context     | policy/media            |
| `docs/domain/LOCATIONS-INVENTORY-AND-FULFILLMENT.md`              | S/NE/NV | stock/location/handoff        | fulfillment context | policy/geospatial       |
| `docs/domain/SERVICES-SCHEDULING-AND-BOOKINGS.md`                 | S/NE/NV | service allocation/attendance | booking context     | policy/meeting          |
| `docs/domain/CART-CHECKOUT-PURCHASE-AND-ORDERS.md`                | S/NE/NV | Cart/Purchase orchestration   | checkout context    | finance/states          |
| `docs/domain/PAYMENTS-LEDGER-PROMOTIONS-AND-PAYOUTS.md`           | S/NE/NV | financial behavior            | payments/ledger     | ledger/interfaces       |
| `docs/domain/RETURNS-DISPUTES-SUPPORT-AND-REVIEWS.md`             | S/NE/NV | post-purchase cases           | trust context       | policy/states           |
| `docs/domain/MESSAGING-NOTIFICATIONS-MODERATION-AND-ANALYTICS.md` | S/NE/NV | engagement/trust projections  | engagement context  | provider/privacy        |
| `docs/domain/POLICY-CATALOG-AND-SNAPSHOTS.md`                     | S/NE/NV | exact business policies       | policy catalog      | decisions/states/ledger |

## State, data, and interfaces

| Document                                                          | Status  | Purpose                            | Owner             | Deps                    |
| ----------------------------------------------------------------- | ------- | ---------------------------------- | ----------------- | ----------------------- |
| `docs/state-machines/STATE-MACHINE-INDEX.md`                      | S/NE/NV | lifecycle index                    | domain lifecycle  | all machines            |
| `docs/state-machines/VENDOR-LISTING-AND-MEDIA.md`                 | S/NE/NV | supply/media transitions           | catalog           | policy/events           |
| `docs/state-machines/INVENTORY-HOLD-CHECKOUT-AND-PAYMENT.md`      | S/NE/NV | inventory/hold/payment transitions | checkout/payments | ledger/events           |
| `docs/state-machines/PURCHASE-ORDER-AND-FULFILLMENT.md`           | S/NE/NV | Order/fulfillment transitions      | ordering          | policy/events           |
| `docs/state-machines/BOOKING-MEETING-AMENDMENT-AND-ATTENDANCE.md` | S/NE/NV | Booking lifecycle                  | booking           | policy/providers        |
| `docs/state-machines/RETURN-DISPUTE-AND-SUPPORT-CASE.md`          | S/NE/NV | case transitions                   | trust/support     | policy/ledger           |
| `docs/state-machines/EARNING-TRANSFER-AND-PAYOUT.md`              | S/NE/NV | earning/payout transitions         | finance           | ledger/reconciliation   |
| `docs/state-machines/MODERATION-AND-DEMO-WORKSPACE.md`            | S/NE/NV | moderation/demo transitions        | trust/demo        | operations              |
| `docs/data/CANONICAL-DATA-MODEL.md`                               | S/NE/NV | target entities/relationships      | data              | domain/interfaces       |
| `docs/data/DATA-OWNERSHIP-AND-CONTEXT-BOUNDARIES.md`              | S/NE/NV | persistence ownership              | data              | architecture            |
| `docs/data/MONEY-AND-DOUBLE-ENTRY-LEDGER.md`                      | S/NE/NV | financial truth                    | ledger            | policy/providers        |
| `docs/data/LOCATION-ADDRESS-AND-GEOSPATIAL-MODEL.md`              | S/NE/NV | spatial/address semantics          | data              | map architecture        |
| `docs/data/DATA-CLASSIFICATION-RETENTION-EXPORT-AND-DELETION.md`  | S/NE/NV | privacy lifecycle                  | data/privacy      | security/future law     |
| `docs/data/MIGRATION-AND-COMPATIBILITY-STRATEGY.md`               | S/NE/NV | schema evolution                   | data              | deployment/recovery     |
| `docs/interfaces/API-CONVENTIONS.md`                              | S/NE/NV | REST/OpenAPI convention            | interfaces        | access/data             |
| `docs/interfaces/API-CAPABILITY-CATALOG.md`                       | S/NE/NV | API inventory                      | interfaces        | domain/requirements     |
| `docs/interfaces/CANONICAL-PUBLIC-TYPES.md`                       | S/NE/NV | transport vocabulary               | interfaces        | data/domain             |
| `docs/interfaces/ERRORS-PAGINATION-AND-IDEMPOTENCY.md`            | S/NE/NV | retry/collection contract          | interfaces        | Checkout/events         |
| `docs/interfaces/EVENT-CATALOG.md`                                | S/NE/NV | event contracts                    | interfaces        | outbox/context          |
| `docs/interfaces/WEBHOOK-CONTRACTS.md`                            | S/NE/NV | provider callback boundary         | interfaces        | provider/reconciliation |
| `docs/interfaces/REALTIME-CONTRACTS.md`                           | S/NE/NV | WebSocket contract                 | interfaces        | access/projections      |
| `docs/interfaces/MEDIA-UPLOAD-AND-PROCESSING-CONTRACTS.md`        | S/NE/NV | upload/process contract            | interfaces        | media/security          |

## Architecture, environments, and deployment

| Document                                                         | Status  | Purpose                      | Owner        | Deps                  |
| ---------------------------------------------------------------- | ------- | ---------------------------- | ------------ | --------------------- |
| `docs/architecture/TARGET-SYSTEM-DESCRIPTION.md`                 | S/NE/NV | overall target system        | architecture | component model       |
| `docs/architecture/PRODUCTION-SYSTEM-DESCRIPTION.md`             | S/NE/NV | deployed portfolio target    | architecture | deployment/operations |
| `docs/architecture/COMPONENT-AND-DEPENDENCY-MODEL.md`            | S/NE/NV | component boundaries         | architecture | context/data          |
| `docs/architecture/FRONTEND-ARCHITECTURE.md`                     | S/NE/NV | Next PWA design              | architecture | UX/API                |
| `docs/architecture/BACKEND-CONTEXT-AND-DATA-ARCHITECTURE.md`     | S/NE/NV | Nest/context/data design     | architecture | data/domain           |
| `docs/architecture/BACKGROUND-JOBS-OUTBOX-AND-RECONCILIATION.md` | S/NE/NV | async/recovery design        | architecture | events/providers      |
| `docs/architecture/SEARCH-REALTIME-AND-ANALYTICS.md`             | S/NE/NV | projections design           | architecture | events/privacy        |
| `docs/architecture/PROVIDER-INTEGRATION-CONTRACTS.md`            | S/NE/NV | adapter boundaries           | architecture | research/interfaces   |
| `docs/architecture/MEDIA-STORAGE-AND-PROCESSING.md`              | S/NE/NV | media design                 | architecture | security/interfaces   |
| `docs/architecture/MAPS-ADDRESSES-AND-POSTGIS.md`                | S/NE/NV | map/spatial design           | architecture | location model        |
| `docs/architecture/DEMO-ISOLATION-ARCHITECTURE.md`               | S/NE/NV | demo boundary design         | architecture | demo/security         |
| `docs/environments/ENVIRONMENT-MATRIX.md`                        | S/NE/NV | environment purpose matrix   | environments | deployment/demo       |
| `docs/environments/LOCAL-DEVELOPMENT-PREREQUISITES.md`           | S/NE/NV | intended local prerequisites | environments | tool research         |
| `docs/environments/LOCAL-DEVELOPMENT-SETUP.md`                   | S/NE/NV | intended local commands      | environments | prerequisites/config  |
| `docs/environments/LOCAL-SERVICES-PORTS-AND-DEPENDENCIES.md`     | S/NE/NV | local service plan           | environments | target architecture   |
| `docs/environments/CONFIGURATION-SECRETS-AND-SEED-DATA.md`       | S/NE/NV | config/seed rules            | environments | security/demo         |
| `docs/environments/PROVIDER-SANDBOX-AND-FAKE-ADAPTERS.md`        | S/NE/NV | fake/sandbox plan            | environments | provider contracts    |
| `docs/environments/DEVELOPER-WORKFLOWS-AND-TROUBLESHOOTING.md`   | S/NE/NV | prospective workflows        | environments | setup/runbooks        |
| `docs/deployment/INFRASTRUCTURE-AND-NETWORK-TOPOLOGY.md`         | S/NE/NV | VPS/network target           | deployment   | system description    |
| `docs/deployment/ENVIRONMENT-SEPARATION.md`                      | S/NE/NV | environment isolation        | deployment   | future/demo           |
| `docs/deployment/STAGING-DEPLOYMENT.md`                          | S/NE/NV | private staging procedure    | deployment   | CI/security           |
| `docs/deployment/PORTFOLIO-PRODUCTION-DEPLOYMENT.md`             | S/NE/NV | public portfolio procedure   | deployment   | gates/runbooks        |
| `docs/deployment/CI-CD-AND-RELEASE-PROMOTION.md`                 | S/NE/NV | target promotion design      | deployment   | gates/evidence        |
| `docs/deployment/SECRETS-TLS-AND-ORIGIN-SECURITY.md`             | S/NE/NV | secrets/origin target        | deployment   | security/source refs  |
| `docs/deployment/DATABASE-MIGRATIONS-ROLLOUT-AND-ROLLBACK.md`    | S/NE/NV | data rollout target          | deployment   | migration/runbooks    |
| `docs/deployment/BACKUP-RESTORE-AND-DISASTER-RECOVERY.md`        | S/NE/NV | recovery target              | deployment   | operations/quality    |
| `docs/deployment/CAPACITY-COST-AND-SCALING.md`                   | S/NE/NV | capacity/cost target         | deployment   | research/SLO          |

## Security, quality, and operations

| Document                                                         | Status   | Purpose                  | Owner      | Deps                |
| ---------------------------------------------------------------- | -------- | ------------------------ | ---------- | ------------------- |
| `docs/security/THREAT-MODEL.md`                                  | S/NE/NV  | threat/control intent    | security   | architecture/data   |
| `docs/security/ASVS-5-LEVEL-2-MATRIX.md`                         | S/NE/NV  | ASVS mapping             | security   | source/evidence     |
| `docs/security/AUTHENTICATION-AUTHORIZATION-AND-DUAL-CONTROL.md` | S/NE/NV  | access/approval control  | security   | role model          |
| `docs/security/WORKSPACE-VENDOR-AND-LOCATION-ISOLATION.md`       | S/NE/NV  | scope isolation          | security   | AccessContext/data  |
| `docs/security/PHASE-00-RESOURCE-ID-INVENTORY.md`                | Evidence | implemented ID scope map | security   | Phase 00 evidence   |
| `docs/security/APPLICATION-UPLOAD-AND-PROVIDER-SECURITY.md`      | S/NE/NV  | provider/upload controls | security   | media/adapters      |
| `docs/security/PRIVACY-DATA-SUBJECT-RIGHTS-AND-RETENTION.md`     | S/NE/NV  | privacy control          | security   | data/future law     |
| `docs/security/ABUSE-MODERATION-AND-APPEALS.md`                  | S/NE/NV  | abuse/enforcement        | security   | trust policy        |
| `docs/security/SECURITY-VERIFICATION-AND-RELEASE-GATES.md`       | S/NE/NV  | security release proof   | security   | quality/gates       |
| `docs/quality/TEST-STRATEGY.md`                                  | S/NE/NV  | verification strategy    | quality    | requirements        |
| `docs/quality/PHASE-ACCEPTANCE-CATALOG.md`                       | S/NE/NV  | scenario index           | quality    | phase requirements  |
| `docs/quality/CONCURRENCY-AND-FINANCIAL-CORRECTNESS.md`          | S/NE/NV  | correctness test intent  | quality    | states/ledger       |
| `docs/quality/PROVIDER-CONTRACT-AND-FAILURE-TESTING.md`          | S/NE/NV  | provider test plan       | quality    | provider contracts  |
| `docs/quality/ACCESSIBILITY-I18N-AND-LOW-CONNECTIVITY.md`        | S/NE/NV  | inclusive quality proof  | quality    | product UX          |
| `docs/quality/PERFORMANCE-RELIABILITY-AND-SLO.md`                | S/NE/NV  | performance/SLO target   | quality    | deployment          |
| `docs/quality/DEPLOYMENT-AND-RECOVERY-TESTING.md`                | S/NE/NV  | recovery proof           | quality    | runbooks            |
| `docs/quality/EVIDENCE-INDEX.md`                                 | Baseline | evidence schema/index    | quality    | all `EVD-*`         |
| `docs/operations/PRODUCTION-OPERATING-MODEL.md`                  | S/NE/NV  | human operations         | operations | roles/runbooks      |
| `docs/operations/MONITORING-ALERTING-AND-STATUS-PAGE.md`         | S/NE/NV  | observability/status     | operations | deployment/runbooks |
| `docs/operations/RECONCILIATION-AND-FINANCIAL-OPERATIONS.md`     | S/NE/NV  | finance operations       | operations | ledger/policy       |
| `docs/operations/SUPPORT-TRUST-FINANCE-AND-VENDOR-OPERATIONS.md` | S/NE/NV  | operating lanes          | operations | cases/policy        |
| `docs/operations/RUNBOOK-INDEX.md`                               | S/NE/NV  | runbook index            | operations | runbooks            |

## Runbooks

| Document                                                         | Status  | Purpose                      | Owner               | Deps                  |
| ---------------------------------------------------------------- | ------- | ---------------------------- | ------------------- | --------------------- |
| `docs/operations/runbooks/DEPLOY-AND-ROLLBACK.md`                | S/NE/NV | `RUN-001` deploy rollback    | operations          | deployment            |
| `docs/operations/runbooks/MIGRATION-FAILURE.md`                  | S/NE/NV | `RUN-002` migration recovery | operations          | migration             |
| `docs/operations/runbooks/BACKUP-PITR-AND-CLEAN-HOST-REBUILD.md` | S/NE/NV | `RUN-003` restore            | operations          | DR                    |
| `docs/operations/runbooks/SECRET-ROTATION.md`                    | S/NE/NV | `RUN-004` rotation           | security/operations | secrets               |
| `docs/operations/runbooks/PROVIDER-OUTAGE.md`                    | S/NE/NV | `RUN-005` outage             | operations          | provider contracts    |
| `docs/operations/runbooks/STUCK-HOLDS-JOBS-AND-OUTBOX.md`        | S/NE/NV | `RUN-006` async recovery     | operations          | states/outbox         |
| `docs/operations/runbooks/PAYMENT-LEDGER-AND-PAYOUT-MISMATCH.md` | S/NE/NV | `RUN-007` finance mismatch   | finance             | ledger/reconciliation |
| `docs/operations/runbooks/SEARCH-REBUILD.md`                     | S/NE/NV | `RUN-008` projection rebuild | operations          | search/events         |
| `docs/operations/runbooks/MEDIA-QUARANTINE-FAILURE.md`           | S/NE/NV | `RUN-009` media response     | security            | media                 |
| `docs/operations/runbooks/VENDOR-SUSPENSION-AND-APPEAL.md`       | S/NE/NV | `RUN-010` enforcement        | trust               | policy/cases          |
| `docs/operations/runbooks/DISPUTE-REFUND-AND-CHARGEBACK.md`      | S/NE/NV | `RUN-011` finance case       | finance/trust       | ledger/policy         |
| `docs/operations/runbooks/DEMO-PURGE-FAILURE.md`                 | S/NE/NV | `RUN-012` demo cleanup       | operations          | demo isolation        |
| `docs/operations/runbooks/SECURITY-INCIDENT-AND-DATA-BREACH.md`  | S/NE/NV | `RUN-013` incident           | security            | privacy/recovery      |

## Demo, research, future, and ADRs

| Document                                                             | Status               | Purpose                   | Owner                | Deps                                  |
| -------------------------------------------------------------------- | -------------------- | ------------------------- | -------------------- | ------------------------------------- |
| `docs/demo/PUBLIC-DEMO-DESCRIPTION.md`                               | S/NE/NV              | demo promise              | demo                 | claims/isolation                      |
| `docs/demo/PERSONA-AND-ROLE-SWITCHING-MATRIX.md`                     | S/NE/NV              | safe roles                | demo                 | access model                          |
| `docs/demo/SYNTHETIC-SCENARIOS-AND-REVIEWER-GUIDE.md`                | S/NE/NV              | reviewer journeys         | demo                 | requirements/evidence                 |
| `docs/demo/ISOLATION-QUOTAS-EXPIRY-AND-CLEANUP.md`                   | S/NE/NV              | demo boundary             | demo                 | architecture/runbook                  |
| `docs/demo/SANDBOX-PAYMENTS-AND-PROVIDER-SUBSTITUTES.md`             | S/NE/NV              | fake/sandbox disclosure   | demo                 | provider contracts                    |
| `docs/demo/PORTFOLIO-CLAIMS-AND-EVIDENCE.md`                         | S/NE/NV              | claim rules               | demo                 | Evidence Index                        |
| `docs/research/AUTHORITATIVE-SOURCE-REGISTER.md`                     | Research             | dated/refreshed refs      | research             | external sources                      |
| `docs/research/PROVIDER-CAPABILITY-COST-AND-LIMITATION-REGISTER.md`  | Research             | provider/cost matrix      | research             | `REF-*`                               |
| `docs/future/DEFERRED-CAPABILITY-BACKLOG.md`                         | Deferred             | re-entry backlog          | future               | scope                                 |
| `docs/future/DIRE-DAWA-RESEARCH-PLAN.md`                             | Future validation    | market research plan      | future               | source register                       |
| `docs/future/DIRE-DAWA-COMMERCIAL-LAUNCH-GATES.md`                   | Unapproved           | commercial gates          | future               | all future docs                       |
| `docs/future/REGULATORY-PAYMENT-TAX-KYB-AND-INVOICING-VALIDATION.md` | Future validation    | legal/payment validation  | future               | authoritative sources                 |
| `docs/future/VENDOR-DEMAND-LOGISTICS-AND-UNIT-ECONOMICS.md`          | Future validation    | economics/demand research | future               | research plan                         |
| `docs/future/BOUNDED-PILOT-AND-GO-NO-GO.md`                          | Future authorization | pilot gate                | future               | commercial gates                      |
| `docs/future/ENVIRONMENT-SEPARATION-AND-NO-DATA-PROMOTION.md`        | S/NE/NV              | commercial boundary       | future               | deployment/demo                       |
| `docs/adr/ADR-0001-SEPARATE-PARKED-VENTURE.md`                       | Accepted ADR         | venture separation        | architecture/product | `DEC-001`                             |
| `docs/adr/ADR-0002-PORTFOLIO-FIRST-EVIDENCE-POSTURE.md`              | Accepted ADR         | evidence posture          | product              | `DEC-003/004`                         |
| `docs/adr/ADR-0003-MODULAR-MONOLITH-AND-WORKER.md`                   | Accepted ADR         | module/worker choice      | architecture         | `DEC-080–082`                         |
| `docs/adr/ADR-0004-ORDERING-AND-BOOKING-SEPARATION.md`               | Accepted ADR         | aggregate split           | domain               | `DEC-019/082`                         |
| `docs/adr/ADR-0005-ONE-NEXT-CLIENT-AUTHORITATIVE-NEST-API.md`        | Accepted ADR         | web/API topology          | architecture         | `DEC-079/119/127`                     |
| `docs/adr/ADR-0006-TYPED-ACCESS-CONTEXT.md`                          | Accepted ADR         | access topology           | security             | `DEC-010/071/129`                     |
| `docs/adr/ADR-0007-ATOMIC-MIXED-CHECKOUT-AND-HOLDS.md`               | Accepted ADR         | atomic Cart               | checkout             | `DEC-018/019/022/023/125/157/158/182` |
| `docs/adr/ADR-0008-PROVIDER-NEUTRAL-SANDBOX-PAYMENTS.md`             | Accepted ADR         | payment boundary          | payments             | `DEC-025/075/077/103/154/155`         |
| `docs/adr/ADR-0009-IMMUTABLE-DOUBLE-ENTRY-LEDGER.md`                 | Accepted ADR         | ledger choice             | finance              | `DEC-038/140/187/188`                 |
| `docs/adr/ADR-0010-POSTGRES-POSTGIS-PRISMA-AUDITED-SQL.md`           | Accepted ADR         | data access               | architecture         | `DEC-079/084/085/095/121/128`         |
| `docs/adr/ADR-0011-OUTBOX-REBUILDABLE-PROJECTIONS.md`                | Accepted ADR         | asynchronous design       | architecture         | `DEC-081/086/087/123/124`             |
| `docs/adr/ADR-0012-SYNTHETIC-PUBLIC-DEMO-ISOLATION.md`               | Accepted ADR         | demo boundary             | demo                 | `DEC-107/109/139/172/177/178`         |
| `docs/adr/ADR-0013-MEDIA-QUARANTINE.md`                              | Accepted ADR         | media safety              | security             | `DEC-047/088/175/176`                 |
| `docs/adr/ADR-0014-VPS-STAGING-PORTFOLIO-RECOVERY-MODEL.md`          | Accepted ADR         | deploy topology           | deployment           | `DEC-089–097/110/111`                 |
| `docs/adr/ADR-0015-ASVS-L2-SECURITY-TARGET.md`                       | Accepted ADR         | security target           | security             | `DEC-153`                             |
| `docs/adr/ADR-0016-PUBLIC-REPOSITORY-NO-OPEN-SOURCE-LICENSE.md`      | Accepted ADR         | public posture            | governance           | `DEC-112/113`                         |

## Legacy working papers (non-normative)

The following documents were normalization working papers produced during this documentation pass. They are retained for history but have **no normative force**; consult the uppercase-file suite above. `docs/architecture/data-ownership-and-persistence.md`; `docs/contexts/context-map.md`; `docs/contexts/cross-context-contracts.md`; `docs/contexts/glossary.md`; `docs/contexts/invariants.md`; `docs/domain/catalog-discovery-storefronts.md`; `docs/domain/checkout-orders.md`; `docs/domain/identity-vendors.md`; `docs/domain/inventory-locations-fulfillment.md`; `docs/domain/messaging-notifications-moderation.md`; `docs/domain/payments-ledger-payouts.md`; `docs/domain/pricing-promotions-receipts.md`; `docs/domain/privacy-data-lifecycle.md`; `docs/domain/returns-disputes-support-reviews.md`; `docs/domain/services-bookings.md`; `docs/product/portfolio-demo.md`; `docs/product/production-description.md`; `docs/product/project-charter.md`; `docs/product/release-roadmap.md`; `docs/requirements/journeys-acceptance.md`; `docs/requirements/multiphase-requirements.md`; `docs/requirements/non-functional-requirements.md`; `docs/requirements/personas-permissions.md`; and `docs/requirements/scope-exclusions.md`.
