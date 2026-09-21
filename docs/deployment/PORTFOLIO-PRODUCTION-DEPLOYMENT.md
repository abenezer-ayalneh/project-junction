# Portfolio Production Deployment

> **Document status:** specified procedure
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-077`, `DEC-089`–`DEC-097`, `DEC-107`–`DEC-111`, `DEC-136`–`DEC-139`, `DEC-157`–`DEC-160`, `DEC-172`, `DEC-177`–`DEC-179`](../governance/DECISION-REGISTER.md)
> **Normative owner:** public portfolio environment deployment

## Meaning of production

This is a hardened public portfolio demonstration. It uses synthetic Vendors/Customers, Stripe sandbox operations, DemoMeet, deterministic SMS, and synthetic verification. It must not be marketed as live Ethiopian commerce, settlement, escrow, tax invoicing, KYB, or service-provider operation.

## Preconditions

**Procedure status: Specified — Not Executed — Not Verified.**

- Exact signed images passed the private staging release gate.
- The release includes mixed multi-Vendor goods and Bookings, pickup and Vendor delivery, and Location/online appointment journeys [DEC-157–DEC-160].
- Authorization, accessibility, ASVS, concurrency/load, financial correctness, provider failure, demo isolation/expiry, rollback, and recovery evidence is accepted.
- Backup/WAL and media-copy freshness are healthy; restore evidence is within schedule.
- SLO error budget permits release; provider and host capacity checks pass.
- Feature flags expose only production-complete behavior.

## Target deployment procedure

**Procedure status: Specified — Not Executed — Not Verified.**

1. Announce/record the change and capture current release/digest/schema/health.
2. Validate portfolio-only host secrets and exact release manifest.
3. Acquire the production migration lock and apply reviewed expand-compatible migrations.
4. Replace worker/API/web containers with pinned digests in the documented order.
5. Require readiness for PostgreSQL/PostGIS, Redis, Meilisearch, API, worker, web, object access, outbox relay, and backup heartbeat.
6. Run synthetic smoke journeys without crossing public quotas or creating real communications.
7. Verify Cloudflare-to-origin, Full Strict TLS, direct-origin denial, WAF/rate limits, session/cookie scope, Sentry release, and Better Stack checks.
8. Observe error rate, latency, queue lag, reconciliation, disk/memory, and demo cleanup through the defined soak window.
9. Record evidence and close the release; otherwise execute rollback/forward repair.

### Future operator command contract

**Procedure status: Specified — Not Executed — Not Verified.**

The future deployment interface should require the release manifest rather than a branch, tag, or hand-selected container image:

```sh
pnpm ops:release:preflight -- --environment=portfolio --release=sha256:<digest>
pnpm ops:release:deploy -- --environment=portfolio --release=sha256:<digest>
pnpm ops:release:verify -- --environment=portfolio --release=sha256:<digest>
```

These are **DERIVED-PLAN-DEFAULT** command shapes, not existing scripts. A valid invocation includes an accepted staging evidence reference, schema head/compatibility statement, prior signed digest for rollback, configuration version, approval identity, and target-environment assertion. It must reject mutable tags, manual production rebuilds, direct database edits, inline secret values, and any commercial-environment target.

## Public-demo controls

Each no-signup workspace is isolated, quota-limited, visibly synthetic, and expires after 24 hours [DEC-107, DEC-177]. Persona switching is never represented as real authentication. Sandbox provider objects carry workspace metadata and cleanup ownership. Turnstile/rate limits and server quotas constrain payment/object creation. No data is promoted to a future environment [DEC-109].

## Rollback

Application rollback selects the previous signed digest only while the expanded schema remains backward-compatible. Feature flags can contain a complete but impaired feature. A database restore is reserved for disaster recovery because it would discard subsequent valid writes. Financial/provider effects are reconciled/compensated, never erased by deployment rollback.

Release closeout records the exact digest, source revision, schema head, configuration version, migration lock, operator/approval, start/end time, evidence links, feature state, observed regressions, and recovery decision. It is an audit record, not proof that this target has ever been deployed.

## Related documents

- [Production system description](../architecture/PRODUCTION-SYSTEM-DESCRIPTION.md)
- [Database rollout and rollback](DATABASE-MIGRATIONS-ROLLOUT-AND-ROLLBACK.md)
- [Backup and disaster recovery](BACKUP-RESTORE-AND-DISASTER-RECOVERY.md)
