# Payments, Ledger, Earnings, Transfers, and Payouts

> **Status:** Planned financial domain. No money is collected, held, transferred, or paid by the current repository.
>
> **Claim boundary:** Sandbox and simulated workflows must never be described as live Ethiopian fund holding, escrow, settlement, or Vendor payout capability. `[DEC-025, DEC-077]`

## Provider order

1. Stripe sandbox/Connect is the first payment and transfer adapter. Legitimate sandbox access was confirmed during planning. `[DEC-075–DEC-077]`
2. Chapa follows as a separate production-complete adapter. It does not inherit Stripe assumptions and does not become a live claim without current contract/operability validation. `[DEC-075, DEC-078]`

Domain accounting remains provider-neutral even while the initial adapter is Stripe. `[DEC-025]`

## Stripe integration shape

The selected sandbox model uses:

- embedded Payment Element;
- typed gateway “next action” rather than provider-specific UI state leaking across the domain;
- a platform charge;
- separate transfers to hosted Express-style connected accounts configured through controller properties;
- verified webhooks plus polling/API reconciliation as authoritative; and
- ETB as a two-decimal card-presentment currency, with possible sandbox settlement conversion. `[DEC-103–DEC-105]`

These are technical sandbox choices, not a legal conclusion that Junction is a live Ethiopian marketplace or a confirmed “merchant of record.”

## Payment lifecycle

A Payment Attempt belongs to one Checkout Hold and exact amount/currency. Checkout performs full capture. `[DEC-024]`

Minimum semantic states are created, awaiting Customer action, processing/unknown, succeeded, failed/cancelled, refund pending, partially refunded, fully refunded, and reconciliation required. Exact persisted labels may differ, but no client redirect alone may declare success. `[DEC-105]`

Provider success time decides whether success occurred inside the Hold. A late success after expiry is refunded automatically and cannot commit released stock/Staff. `[DEC-125]`

## Saved payment methods

Saving is explicit opt-in. Junction stores provider references and safe display metadata only, never raw card data. Removal requires recent authentication. `[DEC-151]`

Demo saved methods and real-account saved methods must remain separate by environment/workspace. `[DEC-107–DEC-109]`

## Double-entry subledger

The internal ledger is immutable and balanced. Every Ledger Transaction contains postings whose total debits equal total credits. Corrections use linked reversals/new transactions; posted rows are never edited or deleted. `[DEC-140]`

The ledger must be capable of representing, without hard-coding one provider:

- Customer payment clearing;
- Vendor pending earnings;
- Vendor available earnings;
- Platform commission;
- Vendor coupon funding;
- Platform campaign funding/budget consumption;
- delivery amount ownership;
- Customer refund payable/clearing;
- frozen disputed value;
- transfer/payout clearing;
- chargeback principal;
- negative Vendor payable; and
- rounding residual allocated by the documented deterministic method. `[DEC-038, DEC-058, DEC-141–DEC-145]`

Exact chart-of-account names are an accounting design artifact and must be verified before implementation; the economic distinctions above are required.

## Posting templates

Every economic fact maps to a reviewed named posting template. Required families include:

- sale capture;
- Vendor/Platform discount allocation;
- commission recognition;
- Product-line or Booking cancellation/refund;
- delivery refund where applicable;
- earning availability release;
- dispute freeze/unfreeze;
- transfer create/succeed/fail/reverse;
- payout batch succeed/fail;
- return/fault adjustment;
- chargeback and chargeback override; and
- manual correction through reversal.

A business module requests a template plus affected component and values; it cannot submit arbitrary account IDs/debits/credits.

## Earnings

Earnings belong to affected Product line/quantity or Booking components, not only to the Purchase or Vendor total. `[DEC-038]`

Product earnings become available after the purchased return/policy window. Booking earnings become available after completion/no-show and its contest window. The exact durations remain policy snapshots; the grilling session did not confirm the numerical thresholds previously proposed by the assistant. `[DEC-030, DEC-035, DEC-038]`

A dispute freezes only affected value. Unrelated components and Vendor amounts continue through normal availability/payout. `[DEC-038]`

## Commission

Transaction commission is Junction’s only initial monetization. `[DEC-026]`

Basis: Vendor net sale after Vendor discount, before Platform subsidy, excluding delivery. Fixed allocations use deterministic largest-remainder rounding. `[DEC-141]`

Rate: effective-dated global default, optionally replaced by an audited Vendor override. There are no category-specific commission rules. `[DEC-142]`

The applicable basis, rate/version, allocated amount, and rounding result are snapshotted on each component.

## Transfers and payouts

Internal earning availability does not equal provider transfer/payout completion. The provider state is reconciled separately. `[DEC-025, DEC-105]`

Weekly automatic payout batches include eligible Vendor balances over a configurable minimum and exclude frozen value. Vendor Finance sees statements and status but cannot issue arbitrary wallet withdrawals. `[DEC-144]`

Every batch/transfer operation is idempotent, resumable, and reconciled. A provider timeout is “unknown/reconcile,” not immediate retry that risks duplication.

## Chargebacks

Chargeback principal defaults to the affected Vendor economic balance. Junction may freeze value, reverse a transfer, use future earnings, or record negative payable. An authorized Platform override may change responsibility and must record actor, reason, evidence, and resulting reversal postings. `[DEC-145]`

The planning decision did not establish general processor/dispute-fee allocation; do not assume Junction always absorbs it.

## Reconciliation

At minimum reconcile:

- captured/refunded provider amount against Payment and Ledger;
- transfer/payout objects against eligible/batched amounts;
- chargebacks against affected components and negative payable;
- provider currency/presentation/settlement metadata against internal ETB display; and
- webhook inbox, outbox jobs, and stable operation IDs.

Mismatch is visible and actionable; reconciliation does not silently mutate the ledger. Corrections post reversal/new transactions. `[DEC-105, DEC-140]`

## Acceptance criteria

- every transaction balances and posted history is immutable; `[DEC-140]`
- full/partial refund and reversal target only affected components; `[DEC-038]`
- deterministic replay yields identical commission/discount allocation; `[DEC-141, DEC-143]`
- duplicate provider events create no duplicate posting/transfer/refund;
- unknown timeout triggers reconciliation rather than blind repeat;
- frozen amounts do not enter payout while unrelated amounts may; `[DEC-038, DEC-144]`
- chargeback default/override produces auditable balanced postings; `[DEC-145]`
- saved methods are opt-in/reference-only/recent-auth removable; and `[DEC-151]`
- UI/docs label sandbox/simulation accurately. `[DEC-025, DEC-077]`
