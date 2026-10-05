# Environment Matrix

> **Document status:** specified
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-077`, `DEC-089`–`DEC-111`, `DEC-139`, `DEC-172`, `DEC-177`–`DEC-179`](../governance/DECISION-REGISTER.md)
> **Normative owner:** environment separation and provider mode

## Environment classes

| Concern      | Local development                                      | CI/test                               | Private staging                                             | Portfolio production                                       | Future Dire Dawa commercial                           |
| ------------ | ------------------------------------------------------ | ------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| Purpose      | Developer iteration                                    | Deterministic verification            | Production-shape integration and private provider contracts | Public synthetic portfolio demo                            | Not approved; gates only                              |
| Data         | Synthetic local fixtures                               | Disposable synthetic fixtures         | Synthetic/test identities only                              | Synthetic expiring workspaces                              | Must start in separate environment; no data promotion |
| Identity     | Better Auth email/password and Google with fresh local accounts; MFA/Didit deferred | Deterministic sessions/fakes | Suspended; retained for pre-release strict auth verification | Real reviewer accounts plus visibly separate demo personas | Revalidated commercial identity/KYB                   |
| Payment      | Deterministic gateway; opt-in Stripe sandbox contracts | Fake plus isolated provider contracts | Stripe sandbox/Connect                                      | Quota-limited Stripe sandbox                               | Stripe/Chapa contracts and law revalidated            |
| Meetings     | DemoMeet                                               | DemoMeet contract fake                | Google Meet test accounts                                   | DemoMeet [DEC-139]                                         | Revalidated provider                                  |
| Email        | Mailpit SMTP/inbox on loopback                         | In-memory/capturing sink              | Suspended; retained Resend configuration                    | Resend production project with synthetic content           | Separate commercial project                           |
| SMS          | Deterministic sink                                     | Deterministic sink                    | Allowlisted one-way AfroMessage                             | Deterministic sink                                         | Revalidated provider/consent                          |
| Maps         | Fixtures/manual pin                                    | Fixtures                              | Restricted MapTiler staging key                             | Restricted MapTiler production key                         | Separate key/billing                                  |
| Media        | Local S3-compatible service                            | Disposable object service             | Separate self-hosted MinIO bucket/prefix and credentials    | Separate self-hosted MinIO bucket/prefix and credentials   | Separate account/bucket                               |
| Database     | Local container                                        | Disposable PostgreSQL/PostGIS         | Separate staging DB on same VPS                             | Separate portfolio DB                                      | Separate host/account; never restore portfolio data   |
| Redis/search | Local containers                                       | Disposable services                   | Separate resource-limited services                          | Dedicated portfolio services                               | Fresh commercial services                             |
| Telemetry    | Console/local collector                                | Test artifacts                        | Separate Sentry/Better Stack projects                       | Production Sentry/Better Stack/status page                 | Separate projects                                     |
| Secrets      | Local ignored file/secrets                             | CI test-only values                   | SOPS+age host decryption                                    | SOPS+age host decryption                                   | New root of trust                                     |
| Lifespan     | Persistent developer state, resettable                 | Per run                               | Long-lived but synthetic                                    | Long-lived platform; workspaces expire after 24h           | Not created                                           |

## Isolation invariants

- No environment shares a database, Redis namespace, search index, object namespace, webhook secret, OAuth client, provider mode, cookie name/domain, encryption key, or public hostname with another environment.
- Staging and portfolio production may share one host only as isolated Compose projects with separate networks and resource limits [DEC-093].
- CI never receives portfolio application secrets [DEC-110].
- Portfolio data is permanently ineligible for promotion to a future commercial environment [DEC-109].
- Provider dashboards and webhook metadata must identify the environment and reject cross-mode objects.

## Allowed movement and access

| Item                                                       | Local → CI              | CI → staging                  | Staging → portfolio production          | Any environment → future commercial        |
| ---------------------------------------------------------- | ----------------------- | ----------------------------- | --------------------------------------- | ------------------------------------------ |
| Reviewed source/requirements                               | review only             | reviewed commit only          | only through immutable release artifact | separately reviewed source only            |
| Container image / release manifest                         | build evidence only     | exact signed digest           | same accepted digest; no rebuild        | new commercial release process after gates |
| Schema/migration                                           | clean-install test only | compatible migration evidence | compatible migration with rollback plan | revalidated commercial migration plan      |
| Synthetic data, sessions, provider objects, media, backups | never                   | never                         | never                                   | never                                      |
| Secrets, keys, webhook/OAuth clients, telemetry            | never                   | never                         | never                                   | never                                      |

Private staging access is suspended as of 2026-10-05: Junction routes return `503` and its services are stopped while volumes and protected configuration remain preserved. When restored for pre-public-release work, it is limited to approved operators/reviewers and is not a public preview site. Portfolio production is public only as a clearly synthetic, quota-limited demo. Future commercial access, domains, accounts, and records are intentionally outside this environment matrix until its launch gates are accepted.

## Status language

Every environment is currently **Specified — Not Executed — Not Verified**. “Production” elsewhere always means portfolio production unless explicitly labeled future commercial. Documentation must not use “live” to describe sandbox payments, DemoMeet, synthetic KYB, or demo SMS.

## Related documents

- [Local development setup](LOCAL-DEVELOPMENT-SETUP.md)
- [Staging deployment](../deployment/STAGING-DEPLOYMENT.md)
- [Portfolio production deployment](../deployment/PORTFOLIO-PRODUCTION-DEPLOYMENT.md)
