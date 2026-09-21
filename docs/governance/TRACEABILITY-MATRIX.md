# Traceability Matrix

**Document status:** accepted baseline  
**System claim:** target specification with limited local Phase 00 evidence  
**Normative owner:** cross-document traceability

The complete chain is: `SRC-CHAT-*` → `DEC-*` → Decision Register link to one primary normative document → `REQ-*` → `POL-*`/`INV-*`/`API-*`/`STATE-*`/`ADR-*` → `TST-*` → future `EVD-*`. The [Source Ledger Appendix](./SOURCE-LEDGER-APPENDIX.md) supplies the individual chronological source anchor; the Decision Register supplies the individual decision-to-primary-document anchor; this matrix groups compatible chains so the same decision is not copied as competing normative prose.

| Chat source / decision                   | Primary normative home                    | Phase requirements                | Policies/invariants/interfaces/states                                            | Acceptance/evidence                                |
| ---------------------------------------- | ----------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------- |
| `SRC-CHAT-0001`–`0015` / `DEC-001`–`015` | Product description, vision, scope        | `REQ-P00-NFR-001`, P06 claim gate | `INV-DEMO-001`, ADR-0001/0002                                                    | `TST-P06-001/004`, `EVD-CLM-*`                     |
| `SRC-CHAT-0016`–`0055` / `DEC-016`–`055` | Catalog; locations/fulfillment            | P01, `REQ-P02-INV/FUL-*`          | `POL-CAT-*`, `INV-CAT/INV-INV/INV-FUL-*`, `STATE-VND/INV/ORD-*`, `API-010`–`039` | `TST-P01-*`, `TST-P02-001/002`, `EVD-REQ-*`        |
| `SRC-CHAT-0056`–`0065` / `DEC-056`–`065` | policy catalog; trust/engagement          | P04–P05                           | `POL-FIN/TRUST-*`, `INV-PAY/TRUST-*`, `STATE-RET/TRUST-*`, `API-060`–`069`       | `TST-P05-*`, `EVD-SEC/REQ-*`                       |
| `SRC-CHAT-0066`–`0088` / `DEC-066`–`088` | access/security; payments; data           | P00, P04–P06                      | `INV-ACCESS/PAY-*`, `API-001`–`009`, `EVT-030/070`, ADR-0006/0008/0009/0010      | `TST-P00-001`, `TST-P04-002`, `EVD-SEC/PRV-*`      |
| `SRC-CHAT-0089`–`0111` / `DEC-089`–`111` | deployment, provider, demo                | P03, P06                          | `STATE-BKG/DEMO-*`, `RUN-001`–`013`, ADR-0012/0014                               | `TST-P03-003`, `TST-P06-001/002`, `EVD-OPS/PRV-*`  |
| `SRC-CHAT-0112`–`0130` / `DEC-112`–`130` | portfolio claims; architecture/interfaces | P00/P06                           | `API-*`, `EVT-*`, `INV-ACCESS-*`, ADR-0003/0005/0011/0016                        | `TST-P00-001`, `TST-P06-004/005`, `EVD-CLM/SEC-*`  |
| `SRC-CHAT-0131`–`0137` / `DEC-131`–`137` | fulfillment; requirements/gates           | P02, P06                          | `POL-GOOD-*`, `INV-FUL-*`, `STATE-ORD-*`                                         | `TST-P02-002`, `TST-P06-003`, `EVD-PERF/REQ-*`     |
| `SRC-CHAT-0138` / `DEC-138`              | rejected/deferred/superseded register     | none (historical)                 | supersession record                                                              | no public release permitted on this decision       |
| `SRC-CHAT-0139`–`0152` / `DEC-139`–`152` | demo, services, finance, checkout         | P03–P06                           | `POL-BKG/FIN-*`, `INV-BOOK/CHK/PAY-*`, `STATE-BKG/CHK/EARN-*`                    | `TST-P03-*`, `TST-P04-*`, `TST-P06-*`              |
| `SRC-CHAT-0153`–`0155` / `DEC-153`–`155` | ASVS matrix; payments                     | P04/P06                           | `CTL-*`, `INV-PAY-*`, ADR-0008/0015                                              | `TST-P04-002`, `TST-P06-005`, `EVD-SEC-*`          |
| `SRC-CHAT-0156`–`0163` / `DEC-156`–`163` | phase/release gates; policy catalog       | P02–P06                           | `POL-GOOD/BKG/FIN-*`, `INV-BOOK/FUL-*`                                           | `TST-P02-*`, `TST-P03-*`, `TST-P06-*`              |
| `SRC-CHAT-0164`–`0170` / `DEC-164`–`170` | roles, trust/support, demo                | P00/P03/P05/P06                   | `POL-BKG/TRUST-*`, `STATE-RET/TRUST/DEMO-*`, `CTL-040-*`                         | `TST-P00-001`, `TST-P05-001`, `TST-P06-001`        |
| `SRC-CHAT-0171`–`0178` / `DEC-171`–`178` | product, demo, security                   | P03/P05/P06                       | `INV-DEMO-*`, `POL-BKG/TRUST-*`, media contract                                  | `TST-P03-002`, `TST-P05-002`, `TST-P06-001/004`    |
| `SRC-CHAT-0179`–`0189` / `DEC-179`–`189` | research, seed, policy catalog            | P01–P06                           | `POL-GOOD/BKG/FIN-*`, `STATE-ORD/BKG/EARN-*`                                     | `TST-P01-*`, `TST-P02-*`, `TST-P03-*`, `TST-P04-*` |

## Audit invariants

- Each `DEC-001`–`DEC-189` appears in [Decision Register](./DECISION-REGISTER.md) and has one primary normative link.
- `DEC-138` is classified `SUPERSEDED`; no active requirement derives public release from it.
- Every `REQ-P##-*` has a phase owner and acceptance family in the phase/quality suite.
- Every financial rule maps to `POL-FIN-*`, `INV-PAY-001`, relevant `STATE-*`, reconciliation, and a future financial correctness test.
- Every external/time-sensitive claim must attach a dated `REF-*` and refresh trigger before use.
- `EVD-*` values were empty at the documentation baseline; [Phase 00 evidence](../quality/PHASE-00-DURABILITY-EVIDENCE.md) now records limited local checks. Specification is not evidence.

## Phase 00 implementation evidence

`REQ-P00-IAM/API/DATA/EVT/DEMO-*` → `TST-P00-001`–`005` → `EVD-REQ-P00-20260921`: [requirement-level evidence and remaining gaps](../quality/PHASE-00-DURABILITY-EVIDENCE.md). This is partial local evidence, not blanket acceptance of the grouped chains above.
