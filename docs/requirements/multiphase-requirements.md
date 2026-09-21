# Multiphase Requirements

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** master phased delivery contract  
**Decision coverage:** `DEC-004`, `DEC-005`, `DEC-106`, `DEC-138`, `DEC-151`, `DEC-157`–`DEC-160`

## Requirement convention

`REQ-P##-{DOMAIN}-###` is the stable requirement identifier. Each requirement must link to source decision(s), policy/invariant/API/state definitions, acceptance scenario(s), future evidence, and a single phase owner. `MUST` means no exit gate without evidence. This is a future implementation plan, not an instruction to start implementation.

## Delivery sequence

| Phase | Private milestone outcome                                                | Depends on             | Public scope         |
| ----- | ------------------------------------------------------------------------ | ---------------------- | -------------------- |
| 00    | foundations, contracts, isolation, documentation and toolchain decisions | documentation baseline | private only         |
| 01    | approved Vendor supply and safe discovery                                | 00                     | private only         |
| 02    | correct goods commerce and fulfillment foundations                       | 00–01                  | private only         |
| 03    | correct Staff-only services and bookings                                 | 00–01                  | private only         |
| 04    | atomic mixed commerce and finance                                        | 02–03                  | private only         |
| 05    | trust, support, engagement, privacy, and operations                      | 01–04                  | private only         |
| 06    | hardening and public portfolio release                                   | 00–05                  | first public release |

`DEC-138` remains historical: it proposed a smaller public goods/pickup slice. It is explicitly superseded. Private implementation may still use small vertical slices, but **no public release** occurs until Phase 06’s full contract is met.

## Cumulative public-release contract

The first public portfolio release includes goods, fixed-duration appointments, mixed multi-Vendor checkout, pickup and Vendor-managed delivery, in-person and online services, complete financial/reconciliation flows, returns/disputes/support/reviews/moderation, role-safe operations, accessible/low-connectivity behavior, synthetic public demo isolation, and recovery/security evidence. It never includes commercial Dire Dawa operation.

## Cross-phase rules

- All authoritative money uses `Money` integer minor units and currency; all financial corrections are reversal/compensating records.
- Stock and Staff capacity are strict/atomic. Every retryable command is idempotent and reconcilable.
- Every new state/event/API remains scoped by `AccessContext`, Vendor, Location, and optional demo workspace as applicable.
- Policy values snapshot at commercial commitment. Policy catalog owns values; requirements reference them.
- No release claim is allowed without current `TST-*` and `EVD-*` evidence.

Detailed phase documents are the sole functional requirements source; [Cross-Phase NFRs](./CROSS-PHASE-NONFUNCTIONAL-REQUIREMENTS.md) applies to all phases.
