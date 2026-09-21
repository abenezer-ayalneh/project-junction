# Environment Separation

> **Document status:** specified
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-089`, `DEC-093`, `DEC-097`, `DEC-109`–`DEC-110`, `DEC-139`](../governance/DECISION-REGISTER.md)
> **Normative owner:** deployment environment boundary and permitted promotion path

No Project Junction environment, DNS record, provider configuration, secret, Compose project, or infrastructure resource has been created. This document defines the target separation rule; it does not authorize provisioning or data movement.

| Environment               | Purpose                                       | Data/provider boundary                        | Promotion allowed                      |
| ------------------------- | --------------------------------------------- | --------------------------------------------- | -------------------------------------- |
| Local                     | individual development/tests                  | synthetic fixtures/fakes                      | code/schema only through reviewed flow |
| Private staging           | provider sandbox and pre-release verification | isolated sandbox data/keys                    | immutable artifact/schema after gate   |
| Portfolio production/demo | public synthetic reviewer experience          | synthetic data/fakes/sandbox-labeled behavior | immutable artifact/schema only         |
| Future commercial         | separate unapproved operation                 | real data/providers only after gates          | never demo/staging data or credentials |

Databases, object prefixes, secrets, provider accounts, DNS/origins, telemetry projects, queues, caches, access groups, and backups are unique per environment. No data, session, identity document, provider object, demo workspace, or secret is promoted between them. A code/schema artifact may move only via controlled gate with compatibility/rollback plan. Exception requires an explicit new approved decision.

## Permitted movement

| Asset                                                        | Local / CI → staging           | Staging → portfolio production                | Any current environment → future commercial |
| ------------------------------------------------------------ | ------------------------------ | --------------------------------------------- | ------------------------------------------- |
| Reviewed source                                              | reviewed commit only           | no direct source deployment                   | separate commercial review only             |
| Image and release manifest                                   | attested immutable digest only | same staged digest; never rebuild from branch | new commercial pipeline after gates         |
| Compatible migration                                         | evidence and lock plan         | same reviewed migration package               | revalidated commercial plan                 |
| Synthetic records, media, sessions, provider objects, logs   | prohibited                     | prohibited                                    | prohibited                                  |
| Secrets, encryption material, OAuth/webhook clients, backups | prohibited                     | prohibited                                    | prohibited                                  |

Staging is private and production-shaped. Portfolio production is public only as a visibly synthetic, quota-limited reviewer experience. Future commercial is a distinct, unapproved venture: it cannot be created by renaming portfolio production, restoring its backup, or changing an adapter flag.

## Target release interface

**Procedure status: Specified — Not Executed — Not Verified.**

The future release tooling must require an environment identity and immutable release digest, for example:

```sh
pnpm ops:release:preflight -- --environment=staging --release=sha256:<digest>
pnpm ops:release:promote -- --from=staging --to=portfolio --release=sha256:<digest>
```

These are **DERIVED-PLAN-DEFAULT** command shapes, not existing scripts. They must reject a raw branch name, an unapproved environment, a mismatched manifest, or any request that moves data/secrets rather than a reviewed artifact.

## Related documents

- [Environment matrix](../environments/ENVIRONMENT-MATRIX.md)
- [Staging deployment](STAGING-DEPLOYMENT.md)
- [Portfolio production deployment](PORTFOLIO-PRODUCTION-DEPLOYMENT.md)
- [Future environment separation](../future/ENVIRONMENT-SEPARATION-AND-NO-DATA-PROMOTION.md)
