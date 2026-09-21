# Project Junction — Cross-Context Contracts

> **Status:** Planned contract semantics. Wire schemas and endpoint shapes will be specified later; no implementation exists.

## Contract rules

1. Public contracts use explicit application/domain schemas; Prisma records never cross a context or API boundary. `[DEC-084, DEC-120]`
2. Every mutating command has an actor `AccessContext`, idempotency identity, expected resource/version where relevant, and one success or typed failure result. `[DEC-083, DEC-129]`
3. A context publishes integration events only from the same PostgreSQL transaction that committed its authoritative change. `[DEC-081, DEC-086]`
4. Consumers use stable event/job identity and record idempotent completion. Redis delivery is not proof of business completion. `[DEC-086]`
5. Events carry identifiers and immutable snapshots needed by consumers; they do not expose mutable persistence entities.

## Checkout reservation contract

`Cart & Checkout` coordinates these participant contracts:

- `Pricing.quote(selection, customer, context)` → priced components, funding allocations, commission snapshots, expiry assumptions;
- `Inventory.prepareReservation(skusByLocation, holdId, expiresAt)` → prepared or conflict;
- `Scheduling.prepareAllocation(candidates, holdId, expiresAt)` → concrete Staff allocations or conflict;
- `Promotions.prepareFunding(allocations, holdId, expiresAt)` → budget reservations or conflict; and
- `Checkout.commitHold(...)` or `Checkout.abortHold(...)` → all participants commit/release idempotently.

Preparation must not expose partially reserved checkout as successful. Every participant shares the same 15-minute hold identity and expiry. `[DEC-018, DEC-019, DEC-125]`

## Payment-to-Purchase contract

Payments reports a verified provider outcome containing provider success time, amount/currency, payment reference, idempotency linkage, and verification/reconciliation state. `[DEC-105, DEC-125]`

If success belongs inside an active Hold:

1. Checkout finalizes the Customer commitment exactly once.
2. Purchase records the commercial snapshot.
3. Ordering accepts Product components.
4. Booking accepts appointment components.
5. Ledger posts the balanced sale transaction.
6. Outbox events start receipt, notification, search/analytics, meeting, transfer, and operational work.

If success is after expiry, Payments initiates refund/reconciliation; Inventory and Scheduling must not recommit released resources. `[DEC-125]`

## Purchase component reference

Every downstream economic/aftercare command identifies:

- Purchase;
- Vendor;
- component type (`OrderLine` or `Booking`);
- component ID and, for goods, affected quantity;
- original price/policy/funding/commission snapshots;
- requested reason/outcome; and
- causation/correlation IDs.

This reference is required to uphold affected-value isolation. `[DEC-038, DEC-133]`

## Operational-fact-to-ledger contract

Operational contexts publish authorized facts such as:

- payment captured/refunded/charged back;
- Product line cancelled, handed off, returned, or accepted as Vendor fault;
- Booking cancelled, amended, completed, no-show-finalized, or disputed;
- earning availability window elapsed;
- dispute decided full/partial/no refund;
- promotion funding consumed/released; and
- transfer/payout succeeded/reversed/failed.

Ledger maps each fact to a named posting template. The producer never sends arbitrary debit/credit accounts, and Ledger never changes the operational outcome. `[DEC-038, DEC-039, DEC-140–DEC-146]`

## Provider command contract

All provider commands include stable internal operation ID, expected amount/currency or intended meeting/message parameters, domain owner, workspace/environment label, and metadata needed for reconciliation/cleanup. `[DEC-073, DEC-074, DEC-101, DEC-105, DEC-108]`

Provider results distinguish at least:

- accepted/completed;
- requires Customer next action;
- retryable/unknown;
- permanently rejected; and
- reconciled compensation required.

Only verified provider evidence may finalize provider state. AfroMessage’s unsigned callback cannot be sole authority; poll/reconcile instead. `[DEC-074]`

## Realtime projection contract

REST responses include the authoritative current state and cursor/version needed for realtime continuation. Socket.IO events use authenticated rooms, Zod envelopes, ordered cursors, and workspace/Vendor/Customer scope. A missing cursor forces REST reconciliation. `[DEC-072, DEC-124, DEC-129]`

## Search and analytics contracts

Catalog/Location/availability contexts publish typed projection events. Meilisearch documents are disposable and rebuildable. Analytics consumes privacy-minimized typed events into PostgreSQL projections; it may not receive raw message bodies, secrets, unnecessary personal data, session replay, or fingerprints. `[DEC-087, DEC-123]`

## Media contract

Media returns an immutable object/media ID, namespace, ownership scope, detected type, safety state, dimensions/duration where relevant, safe rendition references, and moderation readiness. A Listing/message/review stores that ID; it never trusts a client URL or raw storage key. `[DEC-088, DEC-129]`

## Contract verification

- generated SDK and server OpenAPI agree; `[DEC-083, DEC-120]`
- each consumer handles duplicate, delayed, reordered, and missing events;
- retry after response loss returns the original mutation result;
- scope survives async and webhook round trips;
- provider unknown state triggers reconciliation rather than a guessed outcome;
- rebuild of Redis/Meilisearch reproduces current authoritative state; and
- no contract permits arbitrary ledger accounts, publication state, or cross-scope IDs from an untrusted caller.
