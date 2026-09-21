# Project Junction — Project Charter

> **Status:** Planned product definition. Project Junction has not been implemented or deployed.
>
> **Provenance:** `DEC-xxx` identifiers refer to decisions confirmed during the Project Junction grilling session. This document records target behavior; it does not claim current capability.

## Purpose

Project Junction is a portfolio-first, business-to-consumer marketplace for physical Products and fixed-duration Services. It is intended to demonstrate the breadth of a large marketplace while implementing every capability that is publicly claimed to production depth. “AliExpress-level” therefore means **breadth of marketplace capability, not AliExpress traffic, catalog volume, logistics reach, staffing, or regulatory coverage**. `[DEC-002, DEC-004]`

The primary audience is technical hiring teams. The product, source repository, operational evidence, and documentation should let a reviewer examine difficult engineering problems—not merely polished screens. `[DEC-003]`

This is a solo, milestone-driven project with no artificial completion date. Scope expands only in complete, verifiable slices. `[DEC-005, DEC-014]`

## Product thesis

One adaptive marketplace can serve:

- Customers buying physical goods and booking appointments;
- business Vendors selling Products, Services, or both from a structured Storefront;
- Vendor Staff operating catalog, inventory, fulfillment, schedules, finance, and service delivery; and
- Platform operators handling support, trust, finance, moderation, and marketplace configuration.

Release 1 is B2C. Vendors are businesses; Customer-to-Customer selling is excluded. A Vendor Storefront may be hybrid, and one User identity may be both a Customer and a member of multiple Vendors. `[DEC-006–DEC-010]`

Services are known-price, fixed-duration appointments. Quote-based work, rentals, home visits, group-seat classes, and recurring appointment series are outside the first release. `[DEC-007, DEC-020, DEC-045, DEC-134, DEC-135]`

## Portfolio and geographic posture

Project Junction is separate from the parked verified-social-checkout venture. The parked venture must remain preserved as an independent decision record; no assumptions, approvals, or readiness claims transfer between the two concepts. `[DEC-001, DEC-114]`

The portfolio product is Ethiopia-first and globally adaptable:

- synthetic Dire Dawa-oriented content and scenarios;
- ETB display and `Africa/Addis_Ababa` as the initial time zone;
- Ethiopian phone and address conventions;
- domain models that do not hard-code a single future country; and
- no claim of cross-border commerce or validated Dire Dawa demand. `[DEC-011]`

The public demo and any future real Dire Dawa system are permanently separate environments. Demo data is never promoted into a real environment. A future city launch requires new market, legal, payment, tax, privacy, KYB, operations, and unit-economics validation. `[DEC-001, DEC-109]`

## Experience principles

- Responsive, mobile-first, installable PWA; native applications are deferred. `[DEC-013]`
- Complete English experience with internationalization infrastructure and pseudo-locale testing. Real translations are published only after human review. `[DEC-012]`
- WCAG 2.2 AA is a product requirement, not a late visual audit. `[DEC-061]`
- Low-connectivity behavior is designed explicitly, while money and availability mutations continue to require a live authoritative connection. `[DEC-062]`
- The visual language is a neutral global marketplace: cool neutrals, blue/indigo, restrained promotional color, and light/dark/system themes. Dire Dawa context comes from honest seed content and imagery, not ornamental cultural motifs. `[DEC-126]`

## Product-integrity principles

- Never advertise unimplemented functionality.
- Never imply that sandbox payment, simulated payout, synthetic verification, or demo meeting behavior proves Ethiopian production operability. `[DEC-025, DEC-066, DEC-077, DEC-139]`
- Recommendations are explainable rules. Project Junction does not pretend that deterministic ranking is machine learning. `[DEC-043]`
- AI is deferred. If introduced later, it is bounded assistance rather than the product’s identity or an autonomous authority. `[DEC-015]`
- PostgreSQL-held business truth, immutable financial and stock records, evidence-backed decisions, and explicit reconciliation are core product behaviors. `[DEC-049, DEC-086, DEC-140]`

## Repository and documentation posture

- Codename: **Project Junction**; package namespace: `@junction/*`. `[DEC-115]`
- The repository is intended to be public on GitHub. `[DEC-112]`
- No open-source license is granted during the portfolio phase. A clear copyright/reuse notice is required; issues may be accepted, but external code contributions are not. `[DEC-113]`
- Documentation in Git is authoritative. Decisions, requirements, context language, policies, ADRs, runbooks, and evidence must evolve with the system. `[DEC-116]`

## Current outcome

The current work product is documentation only. No application scaffold, database, Project Junction provider configuration, infrastructure, or production environment is created by adopting this charter.
