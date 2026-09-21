# Payments, Ledger, Promotions, and Payouts

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** financial behavior and reconciliation  
**Decision coverage:** `DEC-025`, `DEC-026`, `DEC-056`–`DEC-059`, `DEC-073`, `DEC-075`, `DEC-078`, `DEC-083`, `DEC-086`, `DEC-104`, `DEC-105`, `DEC-140`–`DEC-146`, `DEC-154`, `DEC-155`, `DEC-163`, `DEC-187`, `DEC-188`

The portfolio target has a provider-neutral payment adapter. Its selected Stripe sandbox unified-charge model makes Junction payment merchant and each Vendor contracting seller. This proves flows only; it makes no real commercial/legal/payment claim. Ordinary processor/dispute fees are Junction operating cost. Chapa is a later provider-complete adapter candidate, never an implied live approval.

`INV-PAY-001` requires every economic event to produce balanced immutable `Money` (integer minor unit, explicit currency) postings. A correction is a reversal/new transaction, never an edited balance. Webhooks verify, deduplicate in durable inbox, and reconcile to provider/Purchase/ledger state. Timeouts are unknown/reconcile rather than blind retry.

Promotion: max one Vendor coupon then one Platform campaign; Vendor discount and Platform funding remain economically distinct. Platform budget reserves during valid hold and releases/consumes idempotently. Commission is transaction-only revenue, based on Vendor net sale after Vendor discount, before Platform subsidy, excluding delivery; rate is effective-dated global/default or audited Vendor override, never category-specific; rounding uses deterministic largest remainder. Portfolio receipt is non-tax; Vendor may attach externally issued invoice.

Earnings are pending/available/frozen by affected component. Product releases after snapshotted 7/14 window; Booking after 48-hour contest; later accepted fault claim may recover from available/future Vendor earnings. Weekly automatic payout batches include eligible above-minimum non-frozen balances. Chargeback principal defaults to affected Vendor balance, with audited Platform override. See `POL-FIN-*`.
