# Staging Deployment

> **Document status:** specified procedure
> **System claim:** **Ingress, core data, malware scanner, and application deployment verified — provider acceptance pending**
> **Decision coverage:** [`DEC-066`, `DEC-073`–`DEC-077`, `DEC-093`, `DEC-098`–`DEC-105`, `DEC-110`, `DEC-139`](../governance/DECISION-REGISTER.md)
> **Normative owner:** private staging environment

## Purpose and boundary

Staging is a private, production-shaped, resource-limited deployment on the existing VPS [DEC-093]. Phase 00 now requires real sign-up, email delivery, MFA, and identity-provider sandbox exchanges with invited test users. The previous synthetic-only acceptance is historical regression evidence; it cannot satisfy this gate. Staging must not accept live payments or public onboarding.

Staging has separate database, Redis, Meilisearch, a self-hosted MinIO bucket/namespace, domains, networks, secrets, cookie names, provider credentials/webhooks, OAuth client, and Sentry/Better Stack projects.

Private ingress uses the [staging Caddy site block](../../ops/staging/Caddyfile): HTTPS and HTTP Basic authentication protect the web app, API, and realtime endpoint. The exact `POST /v1/identity/didit-webhook` route bypasses Basic authentication so Didit can deliver its signed callback; the API reconciles that session before changing state. Use `staging-junction.abenezer-ayalneh.dev` as `STAGING_HOSTNAME` and `https://staging-junction.abenezer-ayalneh.dev` as `BETTER_AUTH_URL`. Set `STAGING_MINIO_HOSTNAME` to a separate staging subdomain that resolves to the VPS; Caddy terminates its HTTPS S3 endpoint and forwards only to MinIO’s loopback port. The browser API stays on the same origin at `/v1`. The password and hash stay in `/home/deploy/.config/project-junction-staging/` on the VPS; retrieve the password through SSH, never from the repository. Keep every upstream port closed externally.

On 2026-09-28, SSH to `deploy@13.140.141.170` confirmed Docker Compose v5.4.0, active Caddy v2.6.2, 75 GiB available disk, and 8.4 GiB available memory. Caddy imports `/etc/caddy/sites/*.caddy`; loopback ports 3000–3004 were occupied by existing services. Reserve `STAGING_WEB_HOST_PORT=3005` and `STAGING_API_HOST_PORT=3006`, subject to a fresh port check immediately before deployment. These observations do not establish safe resource headroom under peak load.

Cloudflare's `1.1.1.1` resolver returned `13.140.141.170` for the staging hostname. The rendered site was installed at `/etc/caddy/sites/junction-staging.caddy` after site validation; the full imported Caddy configuration validated and Caddy reloaded successfully. A fresh HTTPS request returned `401` with TLS verification result `0` from that VPS address, proving certificate delivery and unauthenticated denial. Authenticated upstream routing, the Didit callback, and the MinIO hostname remain unverified because the application services are not deployed.

The API and worker refuse staging startup without PostgreSQL, Better Auth, Resend, Didit, the self-hosted HTTPS MinIO origin, and a configured ClamAV scanner. MinIO owns a separate staging bucket, persistent volume, scoped application credentials, server-level browser CORS limited to the staging origin, and an S3 hostname routed only through Caddy over a dedicated proxy network. ClamAV joins the internal backend and outbound egress networks so its signature updater can reach the official database service; it has no published host port. The API and worker wait for its health check and MinIO initialization before starting. During Didit sandbox rehearsal, leave `DIDIT_AGE_18_WORKFLOW_CONFIRMED` unset: adult grants stay disabled and the API health endpoint stays unready. Set it to `true` only after verifying that the configured workflow enforces age 18 or older and its signed callback and reconciliation path work.

Set `REALTIME_REDIS_FANOUT=enabled` and point `REDIS_URL` at the isolated staging Redis service. The checked-in local Redis fixture URL is rejected in staging. Verify that Redis is reachable before accepting realtime traffic; configuration checks alone do not establish availability.

The worker uses the same isolated Redis service for `junction:staging:domain-events` and its event-ID identity hash. The append script also publishes to `junction:staging:domain-events-live`; API instances subscribe and send public catalog invalidations only to their locally connected, currently authorized sockets. Its ACL must permit authenticated `EVAL`, stream writes, hash reads/writes, and pub/sub, as well as Socket.IO fanout commands. The Compose service uses append-only persistence with `appendfsync always` so a stream append is synced before Redis replies; measure the resulting write latency and disk growth on the VPS. The stream has no automatic trimming or downstream consumer for private catalog effects yet. Back up the Redis volume, monitor its length, and do not treat an outbox receipt as proof of a completed downstream action.

After rendering the protected staging environment on the host, run the bundled preflight as described below. It rejects missing provider configuration, a mismatched hostname, non-staging web settings, public API/web upstreams, non-digest images, and absent Basic authentication. It prints no secret values. A pass means only that configuration has the required shape; it does not prove DNS, provider credentials, resource isolation, or live acceptance.

A staging hostname/routing rule, provider webhook, object key, cookie, telemetry event, or backup is never reused as a portfolio-production substitute; only an accepted immutable release artifact may be promoted.

## Executable staging bundle

The [application image](../../ops/staging/Dockerfile) builds the web, API, and worker without provider secrets. The [staging Compose file](../../ops/staging/compose.yaml) runs that same immutable image digest for all three processes and for one-shot migrations. PostgreSQL, Redis, ClamAV, and MinIO use digest-pinned images and private volumes; MinIO initialization uses the server image's included `mc` client. Caddy is the only public process; web, API, and MinIO bind their upstream ports to host loopback. The API container listens on all container interfaces only because its host-published port is loopback-bound. The API registers no synthetic controller in any runtime mode, and the bundle contains no local Mailpit, synthetic seed, or fake provider service.

The [core-only Compose file](../../ops/staging/compose.core.yaml) can start PostgreSQL, Redis, ClamAV, and the isolated MinIO bucket before provider credentials exist; its one-shot initializer creates the bucket, application user, and least-privilege policy; MinIO itself enforces the restricted global CORS origin. On 2026-09-28 it was installed on the VPS with pinned PostGIS/PostgreSQL 18, Redis 7, and ClamAV 1.5.4 digests, respective limits of 1 CPU/768 MB, 0.25 CPU/256 MB, and 1 CPU/4 GiB, and no published host ports. The first attempted migration exposed that plain PostgreSQL 16 lacked both PostGIS and `uuidv7()`. The empty database was moved to a fresh PostgreSQL 18 volume; the unused failed volume was removed after verification. The health check now requires `uuidv7()` and PostGIS. All 19 Prisma and two Better Auth migrations applied through temporary SSH tunnels, and database records confirmed their completion with zero auth users. The latest Prisma migration changes the adult-verification default from `legacy_verified_compat` to `unverified`; a direct schema query confirmed the new default. Redis accepted authenticated `PING` and stream-script commands; the probe key was removed. ClamAV updated signatures through its egress network and became healthy; a ClamD INSTREAM probe returned `OK` for clean bytes and `Eicar-Test-Signature FOUND` for the harmless EICAR test string. At idle, its container used about 952 MiB of the 4 GiB limit, with 7.6 GiB host memory available; these snapshots do not establish peak headroom. Backups, provider delivery, API/web/worker operation, and peak-load headroom remain unaccepted. The host's `core.env` is owner-only and holds image references, limits, service names, and secret-file paths, with no provider credentials. The [PostGIS image documentation](https://github.com/postgis/docker-postgis) specifies the PostgreSQL 18 volume mount at `/var/lib/postgresql`, which both Compose files use. [ClamAV recommends 4 GiB of RAM for its Docker image](https://docs.clamav.net/manual/Installing/Docker.html).

An initial PostgreSQL custom-format dump was written to the VPS's protected `backups/` directory (directory mode `0700`, dump mode `0600`). A fresh temporary database restored from it with `pg_restore --exit-on-error`; the source and restore each had 44 public tables, 18 completed Prisma migrations, two Better Auth migrations, and zero auth users. The temporary database was removed afterward. This proves that this empty staging schema can be restored from that dump. It is not an accepted backup system: the copy is on the same VPS, has no off-host retention or encryption arrangement, and Redis and future object data are not covered. Configure an off-host destination and rehearse recovery of all durable stores before staging accepts users or content.

After the adult-default migration, a second protected dump restored into a fresh temporary database. Source and restore each had 44 public tables, 19 completed Prisma migrations, two Better Auth migrations, zero auth users, and the `unverified` column default. The temporary database was removed. This refreshes the local restore evidence but does not close the off-host backup gate.

The web container runs a [startup check](../../tools/staging-web-preflight.mjs) before Next.js starts. It rejects missing Better Auth or Resend configuration, local API or database endpoints, inherited synthetic secrets, and a non-staging build/runtime mode. A passing check validates configuration only; account sign-up and real email delivery still require live acceptance.

Set the non-secret variables in `.env.example` through the host's protected deployment environment. Each `STAGING_*_FILE` points to a separate host-protected file that Compose mounts under `/run/secrets`; the container entrypoint exports those values only to the application process. `STAGING_DATABASE_URL_FILE` must target the `postgres` service and `STAGING_REDIS_URL_FILE` the `redis` service. Keep the installed Caddy Basic-auth hash synchronized if the password changes. Application image digests, provider credentials, and provider secret paths are still pending.

Run `python3 ops/staging/prepare-core-secrets.py /home/deploy/.config/project-junction-staging` once on the VPS to generate the distinct PostgreSQL password/URL, Redis ACL/URL, and Better Auth secret. The generated files live in `core-secrets/`; the script refuses an implicit rotation. This was executed on 2026-09-28. Set `STAGING_DB_NAME=junction_staging`, `STAGING_DB_USER=junction_app`, and the matching `STAGING_DATABASE_URL_FILE`, `STAGING_POSTGRES_PASSWORD_FILE`, `STAGING_REDIS_URL_FILE`, `STAGING_REDIS_ACL_FILE`, and `STAGING_BETTER_AUTH_SECRET_FILE` paths to those files. The Basic-auth hash file is at `/home/deploy/.config/project-junction-staging/basic-auth-hash`.

Keep the host configuration directory and its `core-secrets/` child at mode `0700`. File-backed Docker Compose secrets retain source-file permissions inside containers: mode `0600` made the Redis ACL unreadable to its non-root process. The Compose-mounted files therefore need mode `0644` within the protected host directory; the Basic-auth password remains `0600` and is never mounted. A temporary isolated Redis Compose probe verified the mounted ACL, authentication, `EVAL`, `XADD`, and `PUBLISH`, then was removed. This does not prove the full staging service or provider journeys.

Once each external provider credential exists, enter it on the VPS with `ssh -t deploy@13.140.141.170`, then run `python3 /home/deploy/project-junction-staging/ops/staging/install-provider-secret.py /home/deploy/.config/project-junction-staging SECRET_NAME`. Run it separately for `resend-api-key`, `didit-api-key`, and `didit-webhook-secret`. The terminal prompt hides the value; the script refuses to overwrite an installed key. It stores Compose-readable files under the owner-only `provider-secrets/` directory. Point `STAGING_RESEND_API_KEY_FILE`, `STAGING_DIDIT_API_KEY_FILE`, and `STAGING_DIDIT_WEBHOOK_SECRET_FILE` to those files. Run `python3 ops/staging/prepare-minio-secrets.py /home/deploy/.config/project-junction-staging` once to generate MinIO root and scoped media credentials without entering them through a terminal. Point the `STAGING_MINIO_*_FILE` and `STAGING_MEDIA_S3_*_FILE` values to that protected `minio-secrets/` directory. Never put values in the repository, shell command arguments, or chat.

For Resend, verify a staging sending domain and its displayed DNS records, then create a sending-only key scoped to that domain; set `RESEND_FROM_EMAIL` to an address on the verified domain. For Didit, create a separate Sandbox application and age-18 workflow, configure `vendor_data` as the Junction user ID, and register `https://staging-junction.abenezer-ayalneh.dev/v1/identity/didit-webhook` with its V2 signing secret. Keep `DIDIT_AGE_18_WORKFLOW_CONFIRMED` unset until the workflow rule and signed callback/reconciliation behavior are inspected. Set `STAGING_MINIO_BUCKET` and `STAGING_MINIO_HOSTNAME`, then pin `STAGING_MINIO_IMAGE`; the Compose initializer uses that image's included `mc` client to create the bucket, least-privilege S3 policy, and application credentials. Verify each provider with a real staging request before accepting the service. See [Resend domains](https://resend.com/changelog/new-domains-workflow), [Didit integration options](https://help.didit.me/integration/integration-options), and [MinIO root credentials](https://docs.min.io/aistor/reference/aistor-server/settings/root-credentials/).

Set every `STAGING_*_CPUS` and `STAGING_*_MEMORY` value from measured spare capacity on the shared VPS before rendering Compose. All long-running services and one-shot tools have CPU, memory, and process-count limits; Compose refuses a missing limit. Account for the sum of concurrent limits, PostgreSQL/ClamAV startup peaks, existing portfolio services, backups, and host headroom. The core services are running within their individual limits, but the complete deployment budget cannot be accepted until application services and peak workload are measured.

Once the host release manifest, backups, and image digests have been reviewed, the restricted host procedure can run these commands from the approved deployment directory:

```sh
cosign verify "$STAGING_APP_IMAGE" \
  --certificate-identity=https://github.com/abenezer-ayalneh/project-junction/.github/workflows/publish-staging-image.yml@refs/heads/codex/phase-00-real-staging \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com
docker compose -f ops/staging/compose.yaml config --quiet
docker compose -f ops/staging/compose.yaml run --rm preflight
docker compose -f ops/staging/compose.yaml up -d postgres redis clamav minio minio-init
docker compose -f ops/staging/compose.yaml run --rm migrate
docker compose -f ops/staging/compose.yaml up -d api worker web
```

These commands are not a deployment approval or evidence of a VPS run. The image build is a local artifact check until the release pipeline publishes and signs a digest. The host procedure must still verify Caddy/TLS, provider delivery, migrations, backup freshness, resource headroom, and the real Phase 00 journeys before accepting staging.

The [staging image workflow](../../.github/workflows/publish-staging-image.yml) publishes on pushes to the exact `codex/phase-00-real-staging` branch and also supports manual runs from `main` after the workflow is merged. GitHub requires a manually dispatched workflow file to exist on the default branch, so branch pushes provide the pre-merge image path. The workflow waits for a passing GitGuardian check on its exact commit and fails closed if that check fails or never arrives. It then builds the Linux AMD64 application image, publishes a commit-tagged image to GHCR, adds BuildKit provenance and an SBOM, attests its digest, then signs and verifies that digest with GitHub OIDC. The job summary prints the immutable `ghcr.io/...@sha256:...` reference to put in `STAGING_APP_IMAGE`. It does not deploy to the VPS or read staging provider secrets. The host must verify the digest against the exact workflow branch identity that produced it before pulling; use the branch identity above for the draft staging image and `refs/heads/main` only for a later main image. No published workflow run has been accepted as staging evidence yet.

If GHCR keeps the package private, give the VPS a read-only package credential through its protected secret store and log in before verification and Compose pull. The workflow's write-capable `GITHUB_TOKEN` is only for publishing from GitHub Actions and must not be copied to the VPS.

## Current deployment record — 2026-09-30

The API, worker, and web containers run the signed immutable application image `ghcr.io/abenezer-ayalneh/project-junction@sha256:fc92e08d82ce215189f2e9ca687cf8d852d148b6e41dbf28d44ce7a1920c9957`. GitHub Actions built, attested, signed, and verified this digest before host deployment. The VPS pulled that exact digest, ran the configuration preflight, applied Prisma migration `20260929000000_retire_synthetic_schema`, and recreated all three application services.

The staging database has no `demo_workspaces`, `demo_personas`, or `synthetic_external_effects` relations. Its `sessions.user_id` column is required, `sessions.demo_persona_id` is absent, and the real-workspace, adult-verification-state, and inventory-user-actor constraints are validated. The 12 required host-protected Compose secret files were verified present and nonempty without printing their paths or contents. A direct forged-session request was denied with `403`; unauthenticated web access was denied with `401`; anonymous MinIO access was denied with `403`.

The host health endpoint remains deliberately unready until `DIDIT_AGE_18_WORKFLOW_CONFIRMED=true` is set after a real age-18 workflow and signed callback reconciliation are inspected. Deployment records do not substitute for real Resend, Better Auth MFA, Didit, or MinIO acceptance journeys.

Run `docker compose --env-file /home/deploy/.config/project-junction-staging/core.env -f ops/staging/compose.yaml run --rm minio-verify` on the VPS to exercise the scoped application credential through a presigned upload, download, and deletion. The verifier refuses local endpoints, creates a unique staging-only object, confirms that deletion makes the signed URL return `404`, and cleans up even on failure. It prints no credentials or object key.

## Provider mode

- Phase 00 uses real Better Auth sessions, Resend delivery, Didit Sandbox checks, and a self-hosted MinIO bucket with invited staging accounts. No synthetic provider account or local mail/object-store substitute satisfies acceptance.
- Stripe, AfroMessage, Google Meet, and MapTiler are later-phase provider integrations. Their sandbox accounts and restricted keys must be verified when those phases are brought to real staging; synthetic connected accounts and Staff fixtures do not satisfy those gates.

## Target deployment procedure

**Procedure status: Specified — Not Executed — Not Verified.**

1. Confirm approved signed image digests, release manifest, migration head, and staging compatibility.
2. Confirm staging backup/snapshot strategy, available disk/memory, and production resource headroom.
3. Decrypt staging-only secrets on host and render/validate configuration without printing values.
4. Acquire the staging migration lock and apply expand-compatible migrations.
5. Start PostgreSQL/Redis/search readiness, then API/worker/web in controlled order.
6. Verify public denial/private access policy, TLS, cookie separation, and no production secret/domain/object reference.
7. Run real Phase 00 smoke flows with invited accounts: Resend delivery, Better Auth verification/recovery/MFA, authenticated API and realtime, Didit sandbox approval, rejection, status replay, and MinIO signed upload/download. Exercise later-phase provider sandbox flows as their real adapters become available; synthetic suites remain regression checks only.
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
