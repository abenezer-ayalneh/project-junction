# Project Junction — Portfolio Demo Specification

> **Status:** Planned behavior; no demo workspace system exists yet.

## Objective

The public demo must let a technical reviewer inspect realistic marketplace behavior safely, without confusing demo authority with real authentication, KYB, money movement, Vendor approval, or Ethiopian production readiness.

## Workspace isolation

Each no-signup demo session will receive an isolated, synthetic workspace with:

- seeded Customer, Vendor, Staff, and Platform personas;
- visibly labeled role switching, separate from real Better Auth sessions and MFA;
- quotas for expensive/provider-backed operations;
- an explicit expiry and automated cleanup;
- a workspace-scoped `AccessContext` on every read, write, background job, event, and WebSocket subscription; and
- adversarial tests proving that IDs from another workspace cannot be read, changed, subscribed to, exported, or attached to provider operations. `[DEC-107, DEC-129]`

The exact expiry duration and quota numbers were not confirmed in the grilling session and must remain configurable requirements rather than invented constants.

## Synthetic data

Demo content will use fictional Vendors, Staff, Customers, Locations, Products, Services, Orders, Bookings, returns, disputes, reviews, messages, ledger entries, and analytics. Dire Dawa-oriented examples are contextual seed data, not market validation or representations of real businesses. `[DEC-011, DEC-109]`

No real identity document or registry query is allowed in the public demo. Sumsub KYB is restricted to a separately controlled private sandbox demonstration. `[DEC-066]`

## Provider behavior

- **Payments:** quota-limited real Stripe sandbox operations may run against shared synthetic connected accounts. Every provider object receives workspace/test metadata and becomes eligible for cleanup/reconciliation. Turnstile and application rate limits protect creation endpoints. `[DEC-076, DEC-077, DEC-108]`
- **Payouts and transfers:** displayed as sandbox/simulated behavior; no claim of Ethiopian fund holding or Vendor payout. `[DEC-025, DEC-077]`
- **Online meetings:** DemoMeet supplies public deterministic join behavior. Real Google Meet is demonstrated only in private staging or through contract/evidence artifacts until OAuth review permits more. `[DEC-139]`
- **Email:** a deterministic demo sink prevents messages from reaching real recipients. `[DEC-073]`
- **SMS:** a deterministic Demo SMS provider shows attempted messages without sending them. AfroMessage remains private staging only. `[DEC-074]`
- **KYB:** synthetic state transitions only; never accept actual documents. `[DEC-066]`

## Reviewer journeys

A reviewer must be able to inspect, without manual database intervention:

1. public Product and Service discovery;
2. anonymous Cart creation and sign-in-style demo merge;
3. Vendor catalog, stock, Staff, schedule, and Storefront operations;
4. goods checkout, pickup, delivery, cancellation, return, refund, and review;
5. appointment discovery, selection, payment, amendment, completion, no-show, and dispute;
6. mixed multi-Vendor Purchase decomposition;
7. ledger postings, earnings availability, transfers, payout statements, and reconciliation;
8. support, moderation, appeals, messages, notifications, and data export/deletion; and
9. selected failure paths such as expired holds, provider retry, insufficient stock, slot conflict, late webhook, and frozen earnings.

Only journeys belonging to a completed public slice may be exposed. Unfinished controls, routes, and claims remain hidden behind feature flags. `[DEC-005, DEC-138]`

## Separation from real accounts

Demo persona switching must never create a real authenticated User, bypass authorization in a real workspace, or permit access to real Vendor/Platform sessions. Real accounts use Better Auth, secure revocable cookies, and the agreed MFA/recent-auth rules. `[DEC-069–DEC-071, DEC-107]`

## Cleanup acceptance

Workspace expiry must remove or anonymize workspace-owned business data and revoke active demo access while preserving only the minimum operational records required to prove cleanup and prevent abuse. Provider objects that cannot be immediately deleted must remain tagged, inaccessible to future demo workspaces, and reconciled by a cleanup job. `[DEC-060, DEC-108]`

The portfolio/demo environment will never be promoted to a future Dire Dawa environment, and neither data nor synthetic verification state will migrate. `[DEC-109]`
