# Cross-Context Invariants

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** global business correctness rules

| ID               | Invariant                                                                                                         | Affected contexts            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `INV-ACCESS-001` | authoritative action is limited to server-derived scoped `AccessContext`                                          | all                          |
| `INV-CAT-001`    | Listing belongs to exactly one Vendor revision; public visibility requires permitted publication state            | Vendor/Catalog/Discovery     |
| `INV-INV-001`    | stock balance is derived from immutable movements; no oversell/backorder                                          | Inventory/Checkout/Ordering  |
| `INV-BOOK-001`   | one qualified Staff member cannot overlap held/confirmed capacity                                                 | Scheduling/Checkout          |
| `INV-CHK-001`    | one idempotency key creates one semantic Checkout outcome; all required components hold/commit or compensate      | Checkout/Payments            |
| `INV-PUR-001`    | one Purchase may contain Orders and Bookings, but downstream lifecycle remains independent                        | Checkout/Ordering/Scheduling |
| `INV-PAY-001`    | every committed economic event balances in integer-minor-unit ledger postings; correction uses reversal/new entry | Payments/Ledger              |
| `INV-POL-001`    | policy/version/price/funding/commission/fulfillment/address context snapshots at commitment                       | all commercial contexts      |
| `INV-FUL-001`    | a Vendor group has one selected fulfillment Location and pickup/delivery path; delivery is Vendor managed         | Ordering/Fulfillment         |
| `INV-TRUST-001`  | case/dispute/review/enforcement is scoped to its eligible component/evidence and preserves audit                  | Trust/Support                |
| `INV-DEMO-001`   | demo data/credentials/side effects are synthetic and workspace-bound; expires/purges at 24 hours                  | Demo/all                     |

Every violation must fail closed, emit an audit/observability signal, and route retry/timeout/compensation through the relevant state machine rather than a direct data repair.
