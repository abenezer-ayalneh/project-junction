# Assumptions, Risks, and Open Questions

**Document status:** accepted baseline  
**System claim:** specified; no operational claim  
**Decision coverage:** `DEC-001`–`DEC-189`

## Accepted assumptions

- The portfolio demo uses synthetic Dire Dawa context and must never be presented as validated local market demand.
- ETB, Ethiopian address/phone conventions, and `Africa/Addis_Ababa` are initial configuration choices, not evidence of live payment or tax readiness.
- Stripe sandbox access permits a portfolio demonstration but does not prove Ethiopia support, commercial terms, or a lawful live model.
- The system may document future provider integrations without creating accounts, secrets, payments, KYB checks, or infrastructure.
- A single-host portfolio deployment may accept host downtime while still documenting recovery targets and offsite backups.

## Risks requiring later validation

| ID        | Risk                                                                                                                                   | Future validation trigger                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `RSK-001` | Ethiopian marketplace, payment, tax, invoice, KYB, consumer-protection, and privacy obligations may differ from portfolio assumptions. | Before any real customer, Vendor, payment, or pilot activity. |
| `RSK-002` | Stripe Connect, ETB presentment, transfer, payout, and merchant-role behavior may not map to a future Ethiopian deployment.            | Before using any live payment account.                        |
| `RSK-003` | Chapa capabilities and contracts may not supply the needed collection, refund, disbursement, and webhook flows.                        | Before accepting Chapa as a production adapter.               |
| `RSK-004` | Google Meet OAuth and Staff-account permissions may change.                                                                            | Before a real online-appointment release.                     |
| `RSK-005` | Provider pricing/free tiers may exceed the US$25 portfolio-service target.                                                             | Before subscribing, deploying, or increasing demo quotas.     |
| `RSK-006` | Synthetic seed categories are illustrative, not a demand forecast.                                                                     | Before local pilot design or Vendor recruitment.              |
| `RSK-007` | A one-VPS topology cannot offer a public SLA.                                                                                          | Before making reliability claims to real customers.           |

## Open questions

There are no implementation-blocking product questions for the documentation baseline. Future legal, commercial, provider, and market questions are intentionally deferred and governed by the `docs/future/` gates.

## Derived defaults requiring provenance labels

Named test tools, exact shell commands, exact media-size limits, host OS selection, provisioning automation, and specific security-scanner choices are documentation defaults unless a direct User decision says otherwise. They must not be represented as pre-existing implementation facts.
