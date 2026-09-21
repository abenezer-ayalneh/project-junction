# Reconciliation and Financial Operations

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** financial operations and exception treatment  
**Decision coverage:** `DEC-025`, `DEC-086`, `DEC-103`–`DEC-105`, `DEC-140`, `DEC-144`, `DEC-145`, `DEC-154`, `DEC-155`, `DEC-163`, `DEC-187`, `DEC-188`

Junction is the planned Stripe sandbox payment merchant in the selected unified-charge model; each Vendor remains the contracting seller. This portfolio description does not make a live money, regulatory, tax, or settlement claim. Ordinary processor/dispute fees are modeled as Junction cost under the selected policy; any future commercial variation requires reapproval.

At a future cadence, Finance compares provider payment/transfer/payout records, verified webhook inbox entries, Checkout/Purchase/VendorOrder/Booking state, immutable ledger postings, earnings availability, and exception cases. The only permitted correction is an approved compensating posting or domain transition. Never edit a settled ledger record, mark an unknown payment successful, release earnings to hide a mismatch, or use a demo fake as provider proof.

| Exception                | Required response                                                                |
| ------------------------ | -------------------------------------------------------------------------------- |
| duplicate/stale callback | inbox deduplicate, preserve trace, reconcile to authoritative provider reference |
| hold/payment race        | resolve against persisted Checkout state; release or compensate per policy       |
| refund/payout collision  | freeze only affected eligibility, open case, require review                      |
| fee/rounding mismatch    | preserve source values, calculate explained variance, use approved correction    |
| provider outage          | queue/retry safely, announce impact, do not fabricate success                    |

See `POL-FIN-*`, [ledger model](../data/MONEY-AND-DOUBLE-ENTRY-LEDGER.md), and `RUN-007`.
