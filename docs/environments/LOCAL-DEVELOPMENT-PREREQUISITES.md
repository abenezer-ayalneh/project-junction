# Local Development Prerequisites

> **Document status:** specified
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-079`–`DEC-088`, `DEC-115`, `DEC-121`](../governance/DECISION-REGISTER.md)
> **Normative owner:** intended developer-machine prerequisites

No prerequisite has been installed or verified by this documentation work.

## Required tool families

| Tool                  | Target                                           | Purpose                                                                                  |
| --------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Git                   | Current supported stable                         | Source history and review                                                                |
| Node.js               | 24 LTS [DEC-121]                                 | Next/Nest/Nx runtime                                                                     |
| pnpm/Corepack         | Stable major pinned at repository initialization | Dependency and workspace commands                                                        |
| Docker Engine/Desktop | Compose v2 capable                               | PostgreSQL/PostGIS, Redis, Meilisearch, object service, mail/test services               |
| POSIX shell           | macOS zsh is primary developer context           | Documented task wrappers                                                                 |
| `age` and SOPS        | Pinned supported versions                        | Optional local encrypted-secret workflow; never required for ordinary synthetic defaults |

Optional diagnostic clients include PostgreSQL client tools matching server major, Redis CLI, `curl`, an S3 client, and browser accessibility/dev tools. Exact patch versions are recorded only when the repository is initialized; they are not invented here.

## Host expectations

- Docker has enough local memory/disk for PostgreSQL/PostGIS, Redis, Meilisearch, object storage, mail capture, and media processing.
- Ports are configurable so Junction does not require stopping unrelated local projects.
- Source checkout resides on a case-sensitive-safe path and supports long filenames.
- Clock and time zone are correct; scheduling tests explicitly cover `Africa/Addis_Ababa` and UTC.
- Local development uses synthetic identities and media. Real identity documents, production keys, or customer data are prohibited.

## Future verification checklist

**Procedure status: Specified — Not Executed — Not Verified.**

After a repository exists, the setup owner records the exact output of Node, pnpm, Docker, Compose, Git, PostgreSQL client, SOPS, and age version checks. The intended non-mutating probes are:

```sh
node --version
pnpm --version
docker version
docker compose version
git --version
psql --version
sops --version
age --version
```

These commands have not been run for Project Junction. The setup owner also verifies the lockfile package manager, supported architecture, available disk/RAM, and Docker health. The resulting evidence belongs in the quality/evidence index, not as a claim in this file.

## Related documents

- [Target system description](../architecture/TARGET-SYSTEM-DESCRIPTION.md)
- [Local development setup](LOCAL-DEVELOPMENT-SETUP.md)
