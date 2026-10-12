# P02-C11 local goods return evidence — 2026-10-12

All development and tests ran on the local machine. Nine new PostgreSQL return scenarios pass; the full commerce/authority regression passes 56 scenarios. Built authenticated loopback Nest HTTP smoke passes Customer submission/replay, approval/instructions, shipment, receipt, inspection, out-of-order refund denial, exact refund/replay and reconciled Customer case read.

Evidence covers snapshotted Standard 7/Flexible 14 and fault 30-day boundaries from verified handoff, later policy edits, Customer/Vendor logistics responsibility, unused-goods and no-handoff denial, concurrent exact quantity reservation, current ownership/scope and ordered actions, immutable quantity/events, refund rollback/same-key recovery, no-refund evidence, unchanged unaffected Vendor component, reasoned damage/quarantine without resale, no restocking fee and original-delivery fee treatment.

All 33 migrations deploy/replay; compatibility reports no difference and populated supported-foundation upgrade passes. Five-project lint/typecheck/unit targets pass (65 tests, OpenAPI snapshot, existing worker test skipped). Documentation/contract audits pass. C10's unrelated local media backup controller regression remains recorded for acceptance audit.

Reproduction and limits: [C11 requirements evidence](../../../requirements/PHASE-02-GOODS-COMMERCE.md#p02-c11--goods-returns-and-inspection--2026-10-12). API completion does not claim return UI, real carrier/provider delivery, formal Dispute/appeal or Phase 04 ledger/earnings. No remote or staging verification occurred.
