# Coverage Audit — Baseline 0.1.0

**Status:** Documentation audit complete; target system remains **Specified — Not Executed — Not Verified**  
**Audit date:** 2026-08-28  
**Scope:** the authoritative suite in [Manifest](../MANIFEST.md), conversation provenance, requirement/test traceability, local Markdown links, and documentation-only boundary.

## Static-audit results

| Check                       | Method                                                    | Result                                                                                                                                                                               |
| --------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Required-document presence  | Manifest path existence and duplicate scan                | 169/169 listed documents present; 0 missing; 0 duplicate manifest paths                                                                                                              |
| Source classification       | Source Ledger and individual-row appendix scan            | 194/194 sources classified exactly once; 189 direct-decision sources plus 5 constraint/derived/external/future sources; 0 unclassified                                               |
| Source-to-decision anchors  | `SRC-CHAT-0001`–`0189` link/number/anchor scan            | 189/189 direct sources link one-to-one to matching `DEC-*` anchors; 0 mismatch                                                                                                       |
| Decision inventory          | direct `DEC-001`–`DEC-189` entry/anchor/primary-link scan | 189/189 present; 0 duplicate, orphan, or unlinked primary-owner entries                                                                                                              |
| Requirement assignment      | phase-requirement versus acceptance-catalog scan          | 57/57 `REQ-P##-*` IDs have a scenario mapping; 0 orphan requirements                                                                                                                 |
| Acceptance catalog          | phase references versus catalog scan                      | 27 `TST-*` scenarios indexed; 0 referenced scenarios missing from catalog                                                                                                            |
| State-machine contract      | index/heading/table/row scan                              | 14/14 indexed lifecycle machines have a matching heading; 16 transition tables have actor, guard, side effect, and timeout/terminal/recovery fields; 0 incomplete rows               |
| External-source register    | canonical `REF-*` sequence and date/trigger scan          | 22/22 dated canonical rows (`REF-001`–`REF-022`); 0 duplicate/missing identifiers                                                                                                    |
| Claim-label coverage        | Manifest target-document label scan                       | 128/128 target documents state `Specified — Not Executed — Not Verified`; 0 unlabeled implementation claims                                                                          |
| Local normative links       | Markdown relative-link resolution                         | 0 broken local links                                                                                                                                                                 |
| Documentation-only boundary | workspace artifact scan outside `docs/`                   | only `README.md` and `CONTEXT-MAP.md`; no source, package manifest, migration, container, CI, or infrastructure file                                                                 |
| Parked venture separation   | preservation/repository inspection                        | parked record remains at `docs/ventures/verified-social-checkout-parked.md`; it was moved by direct filesystem rename without content transformation and remains independently gated |

## Required release-scope check

The active public-release contract consistently requires mixed multi-Vendor goods and Bookings, pickup and Vendor-managed delivery, in-person and online appointments, and completed finance/trust/support/moderation/operations workflows. `DEC-138` remains explicitly `SUPERSEDED`; it cannot authorize a smaller public release.

The exact goods (7/14/30 day, no-restocking-fee, delivery/pickup) and Booking (Flexible/Standard, amendment, provider-cancellation, no-show, earnings) policies have one normative owner in the [Policy Catalog](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md), with linked lifecycle and financial documents.

## Closing counters

```text
unclassified sources = 0
orphan decisions = 0
orphan requirements = 0
requirements without tests = 0
broken normative links = 0
unlabeled implementation claims = 0
```

## 2026-09-22 design grammar alignment

The baseline counters above record the 2026-08-28 audit. The current provenance record adds `SRC-CHAT-0195` as a direct selection and classifies the four conflicting visual sources—`SRC-CHAT-0117`, `0118`, `0126`, and `0130`—as `SUPERSEDED`. The current ledger therefore contains 195 classified sources: 190 direct selections and 5 non-decision sources, with 0 unclassified sources. `SRC-CHAT-0195` is normalized through `DEC-117`, `DEC-118`, `DEC-126`, and `DEC-130`.

## 2026-09-22 Phase 00 implementation-claim follow-up

`pnpm docs:check` now validates the current manifest instead of relying only on the documentation-only baseline: all 169 listed document paths exist; all 128 `S/NE/NV` target documents carry the explicit `Specified — Not Executed — Not Verified` label; all 16 Phase 00 functional and cross-phase nonfunctional requirements appear in the acceptance mapping; and all five `TST-P00-*` scenarios are present in both the Phase 00 requirement and acceptance catalog. This static result confirms claim labeling and traceability only. It does not validate ASVS, WCAG, runtime behavior, provider availability, or release readiness.

## Audit limits

This is a static documentation audit. It does not prove application behavior, provider availability, security controls, accessibility, performance, backup recovery, legal compliance, payment capability, or commercial readiness. Those claims remain future `EVD-*` work and, for Dire Dawa commercialization, require the separately documented research and launch gates.
