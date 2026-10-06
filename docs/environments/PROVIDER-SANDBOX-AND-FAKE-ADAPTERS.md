# Provider Sandbox and Fake Adapters

> **Document status:** specified procedure
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-066`, `DEC-073`–`DEC-078`, `DEC-088`, `DEC-094`–`DEC-101`, `DEC-105`, `DEC-108`, `DEC-122`, `DEC-139`, `DEC-155`, `DEC-179`](../governance/DECISION-REGISTER.md)
> **Normative owner:** prospective local/sandbox adapter selection and failure contract

No Project Junction provider configuration, key, webhook endpoint, sandbox test call, or external delivery exists. A fake verifies Junction behavior against a controlled contract; it does not prove a provider integration, legal role, delivery, pricing, regional availability, or production capability.

## Adapter modes and hard boundaries

| Capability                   | Deterministic local fake                                        | Private staging target                                                    | Portfolio-demo mode                                                 | Hard boundary                                              |
| ---------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| payments, refunds, transfers | `FakePayment`: scripted success/failure/duplicate/late callback | Stripe sandbox/Connect                                                    | quota-limited Stripe sandbox with shared synthetic Connect accounts | no real money, settlement, escrow, or merchant/legal claim |
| identity/KYB                 | synthetic verification-state fixture                            | Didit Sandbox only                                                        | synthetic verification fixture only                                 | no real documents or public-demo verification              |
| meetings                     | `DemoMeet` scripted lifecycle                                   | Google Meet REST through assigned synthetic Staff test accounts           | `DemoMeet` only                                                     | no Calendar write/sync or real reviewer meeting connection |
| email, SMS, push             | captured outbox/receipt fixture                                 | Resend test/staging route, allowlisted one-way AfroMessage, Web Push test | synthetic content; deterministic SMS                                | fake capture is not delivery evidence                      |
| maps                         | deterministic geocode/manual-pin fixture                        | restricted MapTiler staging key                                           | restricted portfolio key where a map is shown                       | PostGIS/address snapshots stay authoritative               |
| media                        | quarantine/scan/process fixture                                 | self-hosted MinIO and separate bucket/namespace                           | MinIO synthetic media only                                          | no public raw upload or cross-environment object reuse     |
| telemetry                    | sanitized local sink                                            | separate Sentry/Better Stack projects                                     | separate portfolio projects/status checks                           | no sensitive payloads or shared project                    |

`local-fake`, `staging-sandbox`, and `portfolio-demo` are explicit configuration modes. A failed adapter must fail closed in its selected mode; it may not silently fall back to a live, staging, or different-provider adapter. `future-commercial` is not an allowed runtime mode until the future launch gates are approved.

## Contract and callback requirements

Every adapter must define a normalized command/result model, an inbound-event model, idempotency/retry rules, timeout behavior, reconciliation lookup, outage behavior, and replacement test. Provider-originated callbacks pass through the same signature-verification, inbox-deduplication, ordering, and audit path in staging that the eventual adapter contract requires. A local fake injects a normalized, identifiable test event into that boundary; it never bypasses the business transition by directly changing authoritative state.

Each fake must reproduce unavailable, slow, malformed, duplicate, out-of-order, retryable, permanently failed, and late-success conditions. Test evidence records adapter mode and scenario name, so an observer cannot mistake a deterministic response for a provider operation.

## Future test interface

**Procedure status: Specified — Not Executed — Not Verified.**

The future repository should expose contract scenarios through commands resembling:

```sh
pnpm providers:contract --adapter=fake-payment --scenario=late-success
pnpm providers:contract --adapter=meeting --scenario=provisioning-timeout
pnpm providers:contract --adapter=notification --scenario=duplicate-callback
```

These are **DERIVED-PLAN-DEFAULT** command shapes, not existing scripts. They must use synthetic identities, capture evidence without secret values, and leave no real communication, financial operation, identity submission, or provider object outside the designated test boundary.

## Selection, cost, and ownership

Provider selection/replacement requires the capability/cost/limitation register, current official source, sandbox test plan, owner, credential boundary, retention/delete impact, outage behavior, and a passing replacement contract. The portfolio target remains free tiers plus no more than US$25/month of third-party services excluding VPS and domain; a free sandbox does not remove revalidation or quota controls.

## Related documents

- [Provider integration contracts](../architecture/PROVIDER-INTEGRATION-CONTRACTS.md)
- [Environment matrix](ENVIRONMENT-MATRIX.md)
- [Webhook contracts](../interfaces/WEBHOOK-CONTRACTS.md)
- [Sandbox payments and provider substitutes](../demo/SANDBOX-PAYMENTS-AND-PROVIDER-SUBSTITUTES.md)
