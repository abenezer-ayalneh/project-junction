# Staging Deployment

> **Document status:** specified procedure
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-066`, `DEC-073`–`DEC-077`, `DEC-093`, `DEC-098`–`DEC-105`, `DEC-110`, `DEC-139`](../governance/DECISION-REGISTER.md)
> **Normative owner:** private staging environment

## Purpose and boundary

Staging is a private, production-shaped, resource-limited Compose project on the same VPS as portfolio production [DEC-093]. It verifies deployment, migrations, provider contracts, MFA/privileged workflows, media, monitoring, and recovery with synthetic data. It is not a second public demo and never accepts real Customer/Vendor/KYB/payment data.

Staging has separate database, Redis, Meilisearch, R2 bucket/namespace, domains, networks, secrets, cookie names, provider credentials/webhooks, OAuth client, and Sentry/Better Stack projects.

Private ingress must require the selected operator/reviewer access control. A staging hostname/routing rule, provider webhook, object key, cookie, telemetry event, or backup is never reused as a portfolio-production substitute; only an accepted immutable release artifact may be promoted.

## Provider mode

- Stripe sandbox/Connect and synthetic connected accounts.
- Google Meet test accounts connected by assigned synthetic Staff; no Calendar write/sync [DEC-099–DEC-101].
- Sumsub private sandbox only, without real documents [DEC-066].
- Resend test/staging route and allowlisted one-way AfroMessage transactional templates [DEC-073–DEC-074].
- Restricted staging MapTiler key and separate R2 objects.

## Target deployment procedure

**Procedure status: Specified — Not Executed — Not Verified.**

1. Confirm approved signed image digests, release manifest, migration head, and staging compatibility.
2. Confirm staging backup/snapshot strategy, available disk/memory, and production resource headroom.
3. Decrypt staging-only secrets on host and render/validate configuration without printing values.
4. Acquire the staging migration lock and apply expand-compatible migrations.
5. Start PostgreSQL/Redis/search readiness, then API/worker/web in controlled order.
6. Verify public denial/private access policy, TLS, cookie separation, and no production secret/domain/object reference.
7. Run synthetic smoke suites: auth/MFA, Vendor roles, mixed checkout, payment/webhook, pickup/delivery, Location/online Booking, outbox/search/realtime, media, refund/reconciliation, demo expiry.
8. Confirm Sentry release association, uptime checks, worker/backup heartbeats, and alert routing.
9. Record evidence and either approve the exact digest for production or roll staging back.

### Future operator command contract

The future repository/host procedure should expose a restricted, digest-only interface resembling:

```sh
pnpm ops:release:preflight -- --environment=staging --release=sha256:<digest>
pnpm ops:release:deploy -- --environment=staging --release=sha256:<digest>
pnpm ops:release:verify -- --environment=staging --release=sha256:<digest>
```

These are **DERIVED-PLAN-DEFAULT** command names, not scripts that exist or have been executed. The host-side implementation may invoke Compose only from an approved deployment directory with host-rendered file secrets. It must refuse arbitrary image tags, inline secrets, a portfolio database/bucket/provider project, or a release manifest whose digest/schema/environment do not agree.

## Acceptance

Staging is healthy only when every service reports expected build/schema/environment identity, callbacks map to staging objects, no synthetic email/SMS escapes allowlists, Google Meet tokens remain server encrypted, resource limits do not threaten production, and all release gates pass.

The evidence packet must also prove negative boundaries: direct public access is denied, portfolio cookies/origins/secrets are absent, provider events are labeled staging, and a failed sandbox scenario does not move an authoritative state transition without verified reconciliation.

## Failure response

Do not fix staging by reusing portfolio secrets or databases. Roll back the application if schema-compatible; otherwise apply the pre-reviewed forward repair. A failed provider test remains provider-specific evidence and does not justify marking the adapter verified.

## Related documents

- [Environment matrix](../environments/ENVIRONMENT-MATRIX.md)
- [CI/CD and release promotion](CI-CD-AND-RELEASE-PROMOTION.md)
- [Secrets, TLS, and origin security](SECRETS-TLS-AND-ORIGIN-SECURITY.md)
