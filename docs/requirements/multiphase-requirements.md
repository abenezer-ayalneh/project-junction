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

## Single-chunk workflow

**User-confirmed workflow — 2026-10-12:** work starts with Phase 02, and each request to do the next thing on a phase selects and completes exactly one next chunk from that phase’s implementation table. Phase 00–01 are not rechunked by this plan. Chunk boundaries are derived planning defaults rather than new functional requirements.

1. Read the requested phase’s chunk table and dated evidence. Select the earliest unfinished chunk whose dependencies are satisfied; resume an in-progress chunk before starting another. If no phase is named, use the active phase and next chunk recorded in [Documentation Status](../STATUS.md).
2. Reconcile existing source changes with the selected scope. Preserve other work. Implement only the selected chunk and the prerequisites necessary to make it coherent; do not start subsequent chunks automatically.
3. Develop and verify on the user’s local machine through the appropriate Nx targets. Record missing local/provider checks as limitations. Historical staging plans do not authorize remote development, checks or deployment.
4. Update the phase document, relevant affected specifications/acceptance evidence and Documentation Status with actual results, remaining limitations and the next chunk ID. Mark local completion only when supported by evidence; phase acceptance remains a separate gate.
5. Stop after this chunk and report what changed, local verification, open limitations and the next chunk. If a required dependency blocks it, document the blocker and keep it as next. Do not silently skip or start a different phase.

The phase documents own the chunk lists: [Phase 02](./PHASE-02-GOODS-COMMERCE.md#implementation-chunks), [Phase 03](./PHASE-03-SERVICES-AND-BOOKINGS.md#implementation-chunks), [Phase 04](./PHASE-04-UNIFIED-COMMERCE-AND-FINANCE.md#implementation-chunks), [Phase 05](./PHASE-05-TRUST-OPERATIONS-AND-ENGAGEMENT.md#implementation-chunks), and [Phase 06](./PHASE-06-HARDENING-AND-PUBLIC-RELEASE.md#implementation-chunks).
