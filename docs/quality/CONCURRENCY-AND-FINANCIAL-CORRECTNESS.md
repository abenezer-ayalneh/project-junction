# Concurrency and Financial Correctness

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-018`, `DEC-019`, `DEC-033`, `DEC-086`, `DEC-140`, `DEC-157`, `DEC-181`, `DEC-182`, `DEC-185`–`DEC-189`

## Non-negotiable properties

- `INV-COM-001`: a SKU-variant/Location cannot be oversold; a successful hold is time-bounded and released exactly once.
- `INV-BOOK-001`: a Staff member cannot have overlapping confirmed/held capacity; any-qualified allocation remains atomic.
- `INV-PAY-001`: each committed financial event produces balanced double-entry postings in integer minor units; corrections are reversals/new entries, never edits.
- `INV-CHK-001`: a Checkout idempotency key produces one semantic outcome, even after client retry, timeout, or duplicate provider callback.
- `INV-ORD-001`: partial Vendor cancellation, return, refund, dispute, and payout eligibility affect only their lawful/snapshotted component and preserve unaffected components.

## Mandatory adversarial cases

Test simultaneous reserve/checkout, hold expiry racing payment confirmation, payment success after expiry, refund racing payout, duplicate/out-of-order webhook, amendment slot swap under contention, Staff substitution consent revocation, failed delivery retry/pickup grace, no-show contest, transaction rollback after outbox write, and search/realtime projection lag. Each test must report requested action, winning authoritative transaction, state/event sequence, postings, retry behavior, and recovery result.

Reconciliation compares provider-visible events, webhook inbox, Checkout/Purchase records, ledger balances, transfer/payout state, and exception queue. Mismatch never silently changes money; it opens a scoped operational case governed by `POL-FIN-004`.
