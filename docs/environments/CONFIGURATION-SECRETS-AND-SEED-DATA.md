# Configuration, Secrets, and Seed Data

> **Document status:** specified
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-011`, `DEC-066`, `DEC-073`–`DEC-077`, `DEC-094`–`DEC-105`, `DEC-107`–`DEC-110`, `DEC-139`, `DEC-172`, `DEC-177`–`DEC-180`](../governance/DECISION-REGISTER.md)
> **Normative owner:** configuration classification, test fixtures, and demo seed rules

## Configuration classes

- **Public build configuration:** origin URLs, safe feature-discovery values, public restricted map key, public VAPID key, build identity.
- **Runtime non-secret configuration:** environment name, time zone, currency, quota values, provider adapter selection, queue concurrency, feature flags, SLO thresholds.
- **Application secrets:** session/encryption material, database/Redis credentials, provider API and webhook secrets, object credentials, private VAPID key.
- **Recovery secrets:** SOPS age recovery key, backup repository credentials, provider-console recovery information; held offline/separately.

The API validates all required configuration at startup, rejects unknown environment mode, and never falls back from a failed sandbox adapter to a live adapter or vice versa. Secret values are never emitted in diagnostics or client bundles.

## Target configuration inventory

The following are **configuration families**, not a created `.env` file or final variable names. At repository initialization, a typed configuration schema must assign exact names, validation, default behavior, owner, and environment availability without placing values in this document.

| Configuration family                                                       | Sensitivity                  | Allowed environments              | Owning boundary      | Notes                                                                         |
| -------------------------------------------------------------------------- | ---------------------------- | --------------------------------- | -------------------- | ----------------------------------------------------------------------------- |
| environment identity, public origins, build revision, feature visibility   | public/runtime non-secret    | local, CI, staging, portfolio     | platform delivery    | browser-visible values must not imply trust or contain keys                   |
| database, Redis, search, object endpoint/namespace                         | secret or restricted runtime | local, staging, portfolio         | platform/data        | environment-specific endpoint and namespace; never copied across environments |
| session, token, encryption, VAPID private material                         | secret                       | local, staging, portfolio         | identity/security    | rotate with overlap where protocol requires; never browser-visible            |
| provider API, webhook, OAuth, SMTP/SMS credentials                         | secret                       | matching adapter environment only | provider integration | adapter mode and credential project must agree                                |
| observability DSN/ingest, alert route, backup/B2, SOPS recovery references | restricted or secret         | staging, portfolio as applicable  | operations           | telemetry payload controls are separate from endpoint configuration           |
| quota, retention, policy/version and synthetic seed selector               | runtime non-secret           | CI, portfolio                     | product/operations   | server validates safe bounds and records active version                       |

The checked-in `.env.local.example` configures local development with real local accounts and loopback services. `.env.example` is the fail-closed private staging template: it names required values without usable credentials or a deployable hostname. `.env.integration.example` is for isolated regression tests only and must not be used to run the local application or loaded into staging.

## Local and CI

The local application uses the explicit local runtime configuration, fresh Better Auth accounts, and Mailpit. Integration tests use disposable identities and deterministic provider fixtures through the isolated test harness; they do not provide a synthetic application runtime. CI uses job-scoped test values. Neither local tests nor CI receive staging/portfolio secrets. The default `.env.example` contains only staging variable names and safe non-secret mode settings.

Local startup must identify the local runtime and reject test-only configuration. Test evidence records any controlled provider fixture and scenario. CI must reject an environment identity other than test/CI. A secret supplied through a command-line argument, screenshot, issue, test fixture, client bundle, or generated artifact is a failed configuration practice, including when the value is synthetic.

## Staging and portfolio

SOPS+age encrypted source material is decrypted on the target host into Compose file secrets; CI receives no application secrets [DEC-110]. Staging and portfolio production use distinct keys, buckets, endpoints, cookie domains, and provider projects. Rotation supports overlap where a provider/session protocol requires it and is recorded in audit/runbook evidence.

Configuration change is a release input: it records the target environment, owner, reason, validation result, dependent release digest, and rotation/rollback plan. It may not be "tested" by pointing staging at portfolio data, secrets, buckets, provider webhooks, or telemetry projects.

## Portfolio-demo seed contract

This contract applies only to the separately specified portfolio demo. It does not seed or define local development accounts or data. Demo content uses ETB, `Africa/Addis_Ababa`, Ethiopian address/phone conventions, and clearly synthetic Dire Dawa context [DEC-011]. Categories are apparel/accessories, phone/computer accessories, home/everyday goods, grooming, tutoring/coaching, and photography/creative appointments [DEC-180].

Seeds must cover:

- Multiple Vendors, Locations, memberships, role/location grants, public/private Staff consent, and one suspended/pending Vendor.
- Simple and variant Products, per-Location stock, delivery zones, pickup/delivery, stock shortages, and a CSV error example.
- Location/online Services, named/any Staff, schedules/exceptions/buffers, waitlist, Booking amendment/disruption/no-show.
- Standard/flexible Product and Booking policies, Vendor/platform promotions, partial cancellation, return, dispute, refund, chargeback, earning, and payout scenarios.
- Public demo personas for every role with explicit quotas and 24-hour expiry.
- Accessibility media samples including captioned/no-speech video.

Seed scripts must be deterministic and idempotent. Public seed content includes a non-real-person/business disclaimer and cannot resemble production identity/payment/KYB data.

## Related documents

- [Environment matrix](ENVIRONMENT-MATRIX.md)
- [Provider integration contracts](../architecture/PROVIDER-INTEGRATION-CONTRACTS.md)
- [Secrets, TLS, and origin security](../deployment/SECRETS-TLS-AND-ORIGIN-SECURITY.md)

## Local mixed payment signing — P04-C05, 2026-10-13

`JUNCTION_MIXED_PAYMENT_WEBHOOK_SECRET` is an explicit random local-only key of at least 32 characters for synthetic mixed payment receipts. The example is commented out; no actual key, Finance policy or grant is seeded by C05. API simulation and raw webhook verification deny missing/short keys and non-local runtime. Worker refund simulation is deterministic and local-only, preserving stable operation IDs after timeout. HTTP evidence uses a disposable process-memory key and loopback services. This does not configure Stripe, Chapa, live funds or a staging deployment.
