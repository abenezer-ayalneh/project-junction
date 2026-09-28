# Staging Deployment

> **Document status:** specified procedure
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-066`, `DEC-073`–`DEC-077`, `DEC-093`, `DEC-098`–`DEC-105`, `DEC-110`, `DEC-139`](../governance/DECISION-REGISTER.md)
> **Normative owner:** private staging environment

## Purpose and boundary

Staging is a private, production-shaped, resource-limited deployment on the existing VPS [DEC-093]. Phase 00 now requires real sign-up, email delivery, MFA, and identity-provider sandbox exchanges with invited test users. The previous synthetic-only acceptance is historical regression evidence; it cannot satisfy this gate. Staging must not accept live payments or public onboarding.

Staging has separate database, Redis, Meilisearch, R2 bucket/namespace, domains, networks, secrets, cookie names, provider credentials/webhooks, OAuth client, and Sentry/Better Stack projects.

Private ingress uses the [staging Caddy site block](../../ops/staging/Caddyfile): HTTPS and HTTP Basic authentication protect the web app, API, and realtime endpoint. The exact `POST /v1/identity/sumsub-webhook` route bypasses Basic authentication so Sumsub can deliver callbacks; the API must verify the signed digest and reconcile the applicant before changing state. Use `staging-junction.abenezer-ayalneh.dev` as `STAGING_HOSTNAME` and `https://staging-junction.abenezer-ayalneh.dev` as `BETTER_AUTH_URL`. The browser API stays on the same origin at `/v1`; a separate API hostname is unnecessary for Phase 00. Set `STAGING_BASIC_AUTH_USER`, `STAGING_BASIC_AUTH_HASH`, `STAGING_API_UPSTREAM`, and `STAGING_WEB_UPSTREAM` in the host's protected Caddy environment. Generate the password hash with `caddy hash-password`; never store the plaintext password or hash in the repository. Bind the upstreams to loopback and keep their ports closed externally. DNS and the host site configuration are pending.

On 2026-09-28, read-only SSH to `deploy@13.140.141.170` confirmed Docker Compose v5.4.0, active Caddy v2.6.2, 75 GiB available disk, and 8.4 GiB available memory. Caddy imports `/etc/caddy/sites/*.caddy`; loopback ports 3000–3004 were occupied by existing services. Reserve `STAGING_WEB_HOST_PORT=3005` and `STAGING_API_HOST_PORT=3006`, subject to a fresh port check immediately before deployment. The staging DNS name did not resolve on that date. These observations do not establish safe resource headroom under peak load.

Cloudflare's `1.1.1.1` resolver returned the VPS address for the staging hostname on the next check, while TLS still failed because the staging Caddy site was not installed. The site file was adapted successfully with the VPS Caddy v2.6.2 after using its supported `basicauth` directive. DNS propagation, the imported full Caddy configuration, certificate issuance, Basic authentication, and upstream routing remain unverified.

The API and worker refuse staging startup without PostgreSQL, Better Auth, Resend, Sumsub, HTTPS object storage, and a configured ClamAV scanner. Give staging a separate object-store bucket and credentials; the local MinIO fixture endpoint is rejected. The scanner may run on the VPS loopback interface, but it must be a running service before media processing is exercised. During Sumsub sandbox rehearsal, leave `SUMSUB_AGE_18_LEVEL_CONFIRMED` unset: adult grants stay disabled and the API health endpoint stays unready. Set it to `true` only after verifying that the configured level enforces age 18 or older and its signed callback and reconciliation path work.

Set `REALTIME_REDIS_FANOUT=enabled` and point `REDIS_URL` at the isolated staging Redis service. The checked-in local Redis fixture URL is rejected in staging. Verify that Redis is reachable before accepting realtime traffic; configuration checks alone do not establish availability.

After rendering the protected staging environment on the host, run the bundled preflight as described below. It rejects missing provider configuration, a mismatched hostname, non-staging web settings, public API/web upstreams, non-digest images, and absent Basic authentication. It prints no secret values. A pass means only that configuration has the required shape; it does not prove DNS, provider credentials, resource isolation, or live acceptance.

A staging hostname/routing rule, provider webhook, object key, cookie, telemetry event, or backup is never reused as a portfolio-production substitute; only an accepted immutable release artifact may be promoted.

## Executable staging bundle

The [application image](../../ops/staging/Dockerfile) builds the web, API, and worker without provider secrets. The [staging Compose file](../../ops/staging/compose.yaml) runs that same immutable image digest for all three processes and for one-shot migrations. PostgreSQL, Redis, and ClamAV use separate digest-pinned images and private volumes. Only web and API ports are published, bound to host loopback for the Caddy upstreams. The API container listens on all container interfaces only because its host-published port is loopback-bound. No local Mailpit, MinIO, synthetic seed, or fake provider service is in this bundle.

The web container runs a [startup check](../../tools/staging-web-preflight.mjs) before Next.js starts. It rejects missing Better Auth or Resend configuration, local API or database endpoints, inherited synthetic secrets, and a non-staging build/runtime mode. A passing check validates configuration only; account sign-up and real email delivery still require live acceptance.

Set the non-secret variables in `.env.example` through the host's protected deployment environment. Each `STAGING_*_FILE` points to a separate host-protected file that Compose mounts under `/run/secrets`; the container entrypoint exports those values only to the application process. `STAGING_DATABASE_URL_FILE` must target the `postgres` service and `STAGING_REDIS_URL_FILE` the `redis` service. Configure the Redis ACL file and matching URL credentials, and use a distinct staging PostgreSQL password. Keep the Caddy Basic-auth hash file and Caddy host environment synchronized. The exact paths, hostname, image digests, credentials, and ports are still pending.

Set every `STAGING_*_CPUS` and `STAGING_*_MEMORY` value from measured spare capacity on the shared VPS before rendering Compose. All long-running services and one-shot tools have CPU, memory, and process-count limits; Compose refuses a missing limit. Account for the sum of concurrent limits, PostgreSQL/ClamAV startup peaks, existing portfolio services, backups, and host headroom. No budget can be accepted until the actual VPS capacity and workload are measured.

Once the host release manifest, backups, and image digests have been reviewed, the restricted host procedure can run these commands from the approved deployment directory:

```sh
cosign verify "$STAGING_APP_IMAGE" \
  --certificate-identity=https://github.com/abenezer-ayalneh/project-junction/.github/workflows/publish-staging-image.yml@refs/heads/main \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com
docker compose -f ops/staging/compose.yaml config --quiet
docker compose -f ops/staging/compose.yaml run --rm preflight
docker compose -f ops/staging/compose.yaml up -d postgres redis clamav
docker compose -f ops/staging/compose.yaml run --rm migrate
docker compose -f ops/staging/compose.yaml up -d api worker web
```

These commands are not a deployment approval or evidence of a VPS run. The image build is a local artifact check until the release pipeline publishes and signs a digest. The host procedure must still verify Caddy/TLS, provider delivery, migrations, backup freshness, resource headroom, and the real Phase 00 journeys before accepting staging.

The manual [staging image workflow](../../.github/workflows/publish-staging-image.yml) is restricted to `main`. It builds the Linux AMD64 application image, publishes a commit-tagged image to GHCR, adds BuildKit provenance and an SBOM, attests its digest, then signs and verifies that digest with GitHub OIDC. The job summary prints the immutable `ghcr.io/...@sha256:...` reference to put in `STAGING_APP_IMAGE`. It does not deploy to the VPS or read staging provider secrets. No published workflow run has been accepted as staging evidence yet; the host must verify the digest and signing identity before pulling it.

If GHCR keeps the package private, give the VPS a read-only package credential through its protected secret store and log in before verification and Compose pull. The workflow's write-capable `GITHUB_TOKEN` is only for publishing from GitHub Actions and must not be copied to the VPS.

## Provider mode

- Stripe sandbox/Connect and synthetic connected accounts.
- Google Meet test accounts connected by assigned synthetic Staff; no Calendar write/sync [DEC-099–DEC-101].
- Sumsub private sandbox with a configured age-18 level and invited test users [DEC-066]. Do not grant adult capabilities until the provider's level rule and signed callback/reconciliation path are proven.
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
7. Run real Phase 00 smoke flows with invited accounts: Resend delivery, Better Auth verification/recovery/MFA, authenticated API and realtime, and Sumsub sandbox approval, rejection, reset, and replay. Exercise later-phase provider sandbox flows as their real adapters become available; synthetic suites remain regression checks only.
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

Staging is healthy only when every service reports expected build/schema/environment identity, callbacks map to staging objects, real staging email reaches invited mailboxes, Google Meet tokens remain server encrypted, resource limits do not threaten production, and all release gates pass.

The evidence packet must also prove negative boundaries: direct public access is denied, portfolio cookies/origins/secrets are absent, provider events are labeled staging, and a failed sandbox scenario does not move an authoritative state transition without verified reconciliation.

## Failure response

Do not fix staging by reusing portfolio secrets or databases. Roll back the application if schema-compatible; otherwise apply the pre-reviewed forward repair. A failed provider test remains provider-specific evidence and does not justify marking the adapter verified.

## Related documents

- [Environment matrix](../environments/ENVIRONMENT-MATRIX.md)
- [CI/CD and release promotion](CI-CD-AND-RELEASE-PROMOTION.md)
- [Secrets, TLS, and origin security](SECRETS-TLS-AND-ORIGIN-SECURITY.md)
