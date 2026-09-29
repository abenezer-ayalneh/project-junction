# CI/CD and Release Promotion

> **Document status:** specified procedure
> **System claim:** **Manual staging image workflow implemented locally — publication and deployment not executed**
> **Decision coverage:** [`DEC-092`, `DEC-110`, `DEC-112`–`DEC-116`, `DEC-138`, `DEC-157`–`DEC-160`](../governance/DECISION-REGISTER.md)
> **Normative owner:** future build, artifact, and promotion pipeline

## Artifact contract

The [manual staging image workflow](../../.github/workflows/publish-staging-image.yml) builds the web, API, and worker into one application image from the reviewed `main` revision. It publishes to GHCR with a commit tag, emits BuildKit provenance and an SBOM, adds a GitHub artifact attestation, and signs and verifies the immutable digest with Cosign. This workflow has not run in GitHub Actions yet. Image scanning, a release manifest, staging deployment, and production promotion remain to be implemented. The same digest proven in staging must be promoted to portfolio production; production is not rebuilt from a branch.

The staging image workflow uses commit-pinned actions and a manual trigger on `main`; its first GHCR run and permissions still need verification.

## Future promotion interface

**Procedure status: Specified — Not Executed — Not Verified.**

The future pipeline must expose and preserve these inputs/outputs:

| Stage               | Required input                                    | Required output                                                           | Cannot do                                        |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------ |
| verify              | reviewed commit and lockfile                      | signed check/evidence result                                              | read staging/portfolio secrets                   |
| build               | verified commit                                   | immutable image digests, SBOM, source/build attestation, release manifest | publish a mutable production artifact            |
| staging             | exact manifest/digest and approved migration plan | staging evidence keyed to digest                                          | deploy an arbitrary branch or use portfolio data |
| portfolio promotion | accepted staging evidence, approval, same digest  | release/audit record and post-deploy evidence                             | rebuild, skip gates, or target future commercial |

The intended human-facing command boundary is a digest-only release operation, for example:

```sh
pnpm ops:release:preflight -- --environment=<staging|portfolio> --release=sha256:<digest>
pnpm ops:release:verify -- --environment=<staging|portfolio> --release=sha256:<digest>
```

These are **DERIVED-PLAN-DEFAULT** names, not present CI jobs or repository scripts. CI/host access must be scoped so a check failure, compromise, or malformed artifact cannot turn into arbitrary SSH, secret retrieval, or production command execution.

## Pull-request checks

**Procedure status: Specified — Not Executed — Not Verified.**

Required future checks include documentation/link/traceability validation, formatting/lint, TypeScript/type boundaries, unit/property tests, real-service integration tests, OpenAPI compatibility/codegen drift, authorization/isolation tests, migration clean-install/upgrade, image/dependency/secret scanning, and affected end-to-end checks. High-risk domains add concurrency and ledger-balance suites.

## Build and publish

**Procedure status: Specified — Not Executed — Not Verified.**

1. Resolve a reviewed commit and verify required checks.
2. Install from the pnpm lockfile without mutation.
3. Build each target with reproducible metadata.
4. Generate OpenAPI, SDK, migration manifest, documentation/evidence index, and SBOM artifacts.
5. Scan dependencies and images; fail on the accepted severity/policy threshold.
6. Sign images and attest source/build identity.
7. Push version and digest to GHCR.
8. Record the release manifest containing exact images, schema head, required config version, and rollback compatibility.

CI uses only test credentials and receives no application secrets [DEC-110]. Deployment connects to the host through a narrowly scoped mechanism; the host decrypts its own SOPS material.

## Staging promotion

**Procedure status: Specified — Not Executed — Not Verified.**

Deploy exact digests, acquire the environment migration lock, apply compatible migrations, restart in dependency-aware order, and run readiness plus real provider-sandbox journeys. Verify provider sandbox callbacks, outbox/worker, search, realtime, telemetry, and rollback compatibility. Failed gates stop promotion.

## Portfolio-production promotion

**Procedure status: Specified — Not Executed — Not Verified.**

Production requires explicit approval referencing the staging evidence and release manifest. Before deployment verify backup/WAL freshness, free disk, error budget, provider health, migration risk, feature-flag state, and rollback target. Apply expand-compatible migration, replace containers by digest, gate on health and synthetic smoke, then enable only complete server-enforced features.

The first public launch requires the later confirmed mixed goods-and-Bookings scope, both fulfillment modes, and both appointment modes [DEC-157–DEC-160]. The earlier goods-pickup-only public release [DEC-138] is superseded.

## Related documents

- [Database migrations, rollout, and rollback](DATABASE-MIGRATIONS-ROLLOUT-AND-ROLLBACK.md)
- [Staging deployment](STAGING-DEPLOYMENT.md)
- [Portfolio production deployment](PORTFOLIO-PRODUCTION-DEPLOYMENT.md)
