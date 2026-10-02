# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Technical hiring-team reviewers and future Project Junction developers/operators. Reviewers need to understand the platform boundary quickly; operators need an honest indication of the private-staging controls and live-service acceptance status.

## Product Purpose

Project Junction is an Ethiopia-first portfolio marketplace target for vendor-owned goods and fixed-duration services. This first surface explains the platform foundation before any market capability is exposed.

## Positioning

The product keeps an authoritative API, worker, and typed contracts separate while using real private-staging providers for account, identity, email, media, and durable state.

## Operating Context

The web application is one Next App Router client in an Nx workspace. The authoritative Nest API and worker are separate processes. Private staging uses PostgreSQL/PostGIS for durable state, Better Auth for account sessions, Resend for email, Didit sandbox for identity verification, and self-hosted MinIO for media.

## Capabilities and Constraints

- Server-derived `AccessContext`, idempotent commands, and outbox/inbox primitives are implemented as a Phase 00 foundation.
- Private staging supports invited account onboarding and provider-sandbox acceptance. It excludes live payments and public onboarding.
- Public contracts are Zod schemas and must not expose Prisma or provider types.
- English, WCAG 2.2 AA foundations, Light, Dark, and System appearance choices, and low-connectivity-safe wording are required. System is the default; an explicit choice is browser-local and persists before sign-in.

## Evidence on Hand

The Phase 00 requirement and acceptance documents are in `../../docs/requirements/` and `../../docs/quality/`. This surface has no customer assets, testimonials, commercial metrics, or live operational proof.

## Product Principles

- Make authority, isolation, and provider readiness explicit.
- Treat screenshots and UI as insufficient evidence for backend or provider claims.
- Keep market capability out of the platform-foundation surface.
- Prefer bounded, independently testable milestones.

## Accessibility & Inclusion

WCAG 2.2 AA is a release criterion. Preserve semantic landmarks, keyboard focus, a skip link, the Light/Dark/System appearance choice, and readable English copy.
