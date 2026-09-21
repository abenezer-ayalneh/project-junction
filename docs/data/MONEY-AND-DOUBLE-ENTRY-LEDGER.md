# Money and Double-Entry Ledger

> **Document status:** specified
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-025`–`DEC-026`, `DEC-033`–`DEC-041`, `DEC-056`–`DEC-059`, `DEC-103`–`DEC-105`, `DEC-140`–`DEC-146`, `DEC-151`, `DEC-154`–`DEC-155`, `DEC-163`, `DEC-187`–`DEC-188`](../governance/DECISION-REGISTER.md)
> **Normative owner:** internal financial truth

## Model

Junction maintains an immutable, balanced double-entry subledger [DEC-140]. It records internal economic obligations independently of Stripe/Chapa object models. Provider records are reconciled evidence, not a replacement ledger. Historical entries are never edited; correction posts an explicit reversal and, when needed, a corrected transaction.

Every transaction has one currency, business cause, aggregate reference, effective and recorded instants, actor/system reason, idempotency identity, and equal debit/credit totals. ETB is initially modeled with its provider-supported exponent; no code assumes all currencies have two decimals without consulting the currency registry.

## Proposed account families

The precise chart codes are a **DERIVED-PLAN-DEFAULT**, but the model needs accounts for provider clearing/cash, Customer funds/settlement clearing, Vendor pending earnings, Vendor available payable, Vendor negative payable/receivable, platform commission revenue, platform subsidy expense/budget, Vendor discount funding, delivery amounts, refund payable/clearing, dispute/chargeback receivable, processor/dispute fee expense, transfer/payout clearing, and rounding residual.

Subaccounts carry Vendor, Purchase, Order line, Booking, promotion, dispute, and provider references without exposing a customer-facing wallet. Ledger balances are internal accounting views; Users cannot deposit, transfer, or arbitrarily withdraw money [DEC-025, DEC-059].

## Posting moments

- Verified successful payment recognizes provider clearing, Vendor pending earnings, platform commission, promotion funding, delivery economics, and rounding allocation from snapshotted calculation.
- Refund success reverses affected economic amounts proportionally and never silently rewrites the sale.
- Product earnings move from pending to available per affected line after the snapshotted 7- or 14-day window [DEC-187].
- Booking earnings move after the 48-hour completion/no-show contest period [DEC-188].
- A dispute freezes only the affected amount. Resolution releases, refunds, or reverses that amount.
- Weekly payout batches move eligible available amounts through transfer/payout clearing and skip below-minimum or frozen funds [DEC-144].
- Chargeback principal defaults to the affected Vendor economic balance; future earnings may offset a negative payable. Audited Platform override is possible [DEC-145].

## Pricing and allocation

Commission applies to Vendor net sale value after Vendor discount, before platform subsidy, excluding delivery [DEC-141]. The effective-dated global rate or audited Vendor override is snapshotted [DEC-142]. When an aggregate amount must be distributed, the deterministic largest-remainder method allocates integer minor units with a stable line tie-breaker.

At most one Vendor coupon applies first, followed by one budget-reserved platform campaign on remaining eligible value [DEC-143]. Funding sources and budget reservations remain separate. Changed Booking components use current price and unchanged components retain committed price [DEC-034].

## Stripe sandbox interpretation

The intended sandbox flow uses a platform charge and separate transfers across synthetic connected accounts [DEC-103]. The embedded Payment Element may return a next action, but only verified webhook/reconciliation state is authoritative [DEC-105]. Documentation must disclose the selected payment-contract split and must not claim Ethiopian settlement, escrow, or live fund holding [DEC-077, DEC-154–DEC-155].

## Invariants and reconciliation

- Every transaction balances exactly in minor units and one currency.
- One business idempotency identity posts at most one effective transaction.
- A reversal references and negates the original posting set.
- Ledger totals reconcile to provider charges, refunds, disputes, transfers, and payouts by account/environment.
- Provider uncertainty remains pending/reconciling; it never produces guessed revenue or payout.
- No payout consumes pending, frozen, disputed, or already-paid earnings.

## Related documents

- [Provider integration contracts](../architecture/PROVIDER-INTEGRATION-CONTRACTS.md)
- [Webhook contracts](../interfaces/WEBHOOK-CONTRACTS.md)
- [Migration strategy](MIGRATION-AND-COMPATIBILITY-STRATEGY.md)
