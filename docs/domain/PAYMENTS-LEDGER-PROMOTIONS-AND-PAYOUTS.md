# Payments, Ledger, Promotions, and Payouts

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** financial behavior and reconciliation  
**Decision coverage:** `DEC-025`, `DEC-026`, `DEC-056`–`DEC-059`, `DEC-073`, `DEC-075`, `DEC-078`, `DEC-083`, `DEC-086`, `DEC-104`, `DEC-105`, `DEC-140`–`DEC-146`, `DEC-154`, `DEC-155`, `DEC-163`, `DEC-187`, `DEC-188`

The portfolio target has a provider-neutral payment adapter. Its selected Stripe sandbox unified-charge model makes Junction payment merchant and each Vendor contracting seller. This proves flows only; it makes no real commercial/legal/payment claim. Ordinary processor/dispute fees are Junction operating cost. Chapa is a later provider-complete adapter candidate, never an implied live approval.

`INV-PAY-001` requires every economic event to produce balanced immutable `Money` (integer minor unit, explicit currency) postings. A correction is a reversal/new transaction, never an edited balance. Webhooks verify, deduplicate in durable inbox, and reconcile to provider/Purchase/ledger state. Timeouts are unknown/reconcile rather than blind retry.

Promotion: max one Vendor coupon then one Platform campaign; Vendor discount and Platform funding remain economically distinct. Platform budget reserves during valid hold and releases/consumes idempotently. Commission is transaction-only revenue, based on Vendor net sale after Vendor discount, before Platform subsidy, excluding delivery; rate is effective-dated global/default or audited Vendor override, never category-specific; rounding uses deterministic largest remainder. Portfolio receipt is non-tax; Vendor may attach externally issued invoice.

Earnings are pending/available/frozen by affected component. Product releases after snapshotted 7/14 window; Booking after 48-hour contest; later accepted fault claim may recover from available/future Vendor earnings. Weekly automatic payout batches include eligible above-minimum non-frozen balances. Chargeback principal defaults to affected Vendor balance, with audited Platform override. See `POL-FIN-*`.

## Local implementation boundary — 2026-10-12

Phase 04 C01 implements the internal Money/immutable-ledger seam, not the full financial lifecycle. Positive posting amounts are debits and negative amounts credits. Accounts are processor clearing, Vendor payable, Platform commission, Platform promotion expense and Platform processor/dispute fee expenses. Only Vendor payable carries Vendor/optional Location scope; component IDs preserve later allocations. All transactions snapshot the sandbox merchant/seller/ordinary-fee model. Safe integer JSON amounts become bigint for summation/storage; one currency must balance to zero.

A workspace-scoped economic event commits postings, audit and outbox atomically with its authoritative source operation. Exact replays return history; changed payloads conflict. Database constraints and deferred triggers enforce balance/scope/currency even for raw writers. Update/delete/truncate and appending after commit are forbidden. An original transaction may be reversed once with identical dimensions and opposite amounts; corrected values require a new economic event. Corrections can share the caller transaction to preserve atomicity. No manual mutation HTTP route exists; approval/recent-auth/dual-control workflows remain C09. Existing commerce facts are not retrospectively posted; C05–C06 owns integration, C03 promotions and C08 earnings. See [Phase 04 local evidence](../quality/PHASE-04-LOCAL-ACCEPTANCE-EVIDENCE.md).

## Local Phase 04 C03 boundary — 2026-10-13

Promotion/commission and non-tax receipt-context snapshots now exist on new complete mixed quotes. Vendor discount precedes Platform subsidy; commission is effective Vendor/global rate applied after Vendor discount, before subsidy, excluding delivery. Exact allocation and compact original unit funding are centralized. Definitions/rates, their audit and outbox are immutable/replay-safe; no assumed rate is introduced. Old null-finance C02 history remains readable.

The internal budget participant uses owned current quote allocations, usage controls and a common bounded hold reference. Immutable reserve/release/consume movements drive a guarded projection; concurrency, raw repeatable-read cap contention, expiry/replay and rollback are locally proven. Consumption is terminal; a later economic refund cannot rewrite that history. C04 owns atomic resource integration, C05–C06 actual payment/ledger/refund/Purchase/receipt, and C08–C09 earnings/payout/reconciliation. No actual development Finance grants or definitions were seeded. [C03 evidence](../quality/PHASE-04-LOCAL-ACCEPTANCE-EVIDENCE.md#p04-c03--promotion-and-commission-snapshots--2026-10-13).
