# Capacity, Cost, and Scaling

> **Document status:** specified
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-091`, `DEC-096`, `DEC-136`–`DEC-137`, `DEC-179`](../governance/DECISION-REGISTER.md)
> **Normative owner:** portfolio capacity and external-service budget

## Target envelope

The portfolio must demonstrate 100 concurrent active users, 10 completed checkouts per minute, 10,000 Products, 2,000 Services, and 100 Vendors, including concurrency evidence against SKU oversell and Staff double-booking [DEC-136]. The initial host estimate is 4 vCPU, 8–16 GB RAM, and 160+ GB SSD/NVMe, finalized after measured load testing [DEC-091].

The service objective is 99.5% monthly measured availability, not an SLA. Exhausting the error budget pauses discretionary release [DEC-137]. External services target free tiers plus no more than US$25/month excluding VPS and domain [DEC-179]; current pricing must be revalidated before every subscription/deployment decision.

## Capacity model

Budget CPU, memory, disk, IOPS, network, and process limits separately for web/API, worker/media jobs, PostgreSQL/PostGIS, Redis/BullMQ, Meilisearch, Caddy, staging, backup/WAL, and operating-system headroom. Staging is throttled so a test cannot starve portfolio production.

Load models include public search/browse, Cart/availability, atomic checkout, provider callback bursts, Vendor operations, CSV imports, media transcode, notification fanout, search rebuild, demo expiry, backup/WAL, and Platform dashboards. Media transcode/import/search rebuild are queue-constrained and pauseable.

## Scaling order

Before adding infrastructure:

1. Measure slow queries, missing indexes, lock contention, N+1 calls, payload/cache behavior, queue lag, and media concurrency.
2. Protect critical paths with admission control, bounded page sizes, upload quotas, and worker priorities.
3. Tune service resource limits and PostgreSQL/Redis/Meilisearch configuration with evidence.
4. Resize the single VPS if the portfolio budget permits.
5. Treat multi-host/high-availability decomposition as a new ADR and commercial-readiness decision, not a hidden Release 1 requirement.

## Cost register

Track VPS, domain, MinIO disk/IOPS/egress, B2 storage/transactions, Sentry, Better Stack, MapTiler, Resend, Didit Sandbox usage, SMS staging tests, Stripe sandbox (normally non-billed but revalidate), Turnstile/Cloudflare features, and backup growth. For each, record current plan/tier, hard quota, alert threshold, overage behavior, owner, and fallback.

No subscription, tier selection, quota increase, or spend has been made by this documentation work. A source-backed cost review precedes each commitment and records retrieval date, currency/tax caveat, plan assumptions, expected usage, ceiling impact, cancellation path, and refresh trigger. The US$25 ceiling applies only to third-party services and excludes VPS/domain; it is a portfolio planning constraint, not a spend authorization or a commercial unit-economics model.

## Future capacity evidence interface

**Procedure status: Specified — Not Executed — Not Verified.**

Future tooling should create reproducible, synthetic reports through a command boundary such as:

```sh
pnpm ops:capacity:report -- --environment=staging --release=sha256:<digest>
pnpm ops:cost:review -- --environment=portfolio
```

These are **DERIVED-PLAN-DEFAULT** command shapes, not existing scripts. Reports must identify scenario, duration, dataset profile, service limits, p50/p95/p99/error measures, correctness checks, observed cost/quota inputs, and evidence location. They must not load-test public demo quotas, create real communications, or treat synthetic throughput as commercial demand evidence.

## Verification required later

Run reproducible load tests at and beyond the target envelope, record p50/p95/p99 and errors by journey, inspect lock/queue/disk/provider behavior, and prove correctness during contention. A throughput number without inventory/Booking/ledger correctness is not acceptance evidence.

## Related documents

- [Infrastructure topology](INFRASTRUCTURE-AND-NETWORK-TOPOLOGY.md)
- [Production system description](../architecture/PRODUCTION-SYSTEM-DESCRIPTION.md)
