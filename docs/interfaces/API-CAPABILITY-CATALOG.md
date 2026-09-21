# API Capability Catalog

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** capability-level interface inventory

| ID range        | Capability        | Owner                    | Examples                                                  |
| --------------- | ----------------- | ------------------------ | --------------------------------------------------------- |
| `API-001`–`009` | identity/access   | Identity                 | session, active context, membership, recent-auth          |
| `API-010`–`019` | Vendor/supply     | Vendor/Catalog           | application, Storefront, Location, listing, import        |
| `API-020`–`029` | discovery         | Catalog/Discovery        | search, detail, saved/follow, recommendation preference   |
| `API-030`–`039` | goods/fulfillment | Inventory/Ordering       | stock, quote, Order, pickup/delivery milestones           |
| `API-040`–`049` | scheduling        | Scheduling/Booking       | availability, hold, Booking, amendment, attendance        |
| `API-050`–`059` | checkout/finance  | Checkout/Payments/Ledger | Cart, quote, hold, payment status, receipt, earnings      |
| `API-060`–`069` | trust/engagement  | Trust/Support            | return, dispute, SupportCase, review, inquiry, moderation |
| `API-070`–`079` | operations/demo   | Platform/Demo            | reconciliation, approval, audit, demo workspace/persona   |

Example command contracts must name authorization scope, idempotency requirement, aggregate/state guard, normal/failure response, emitted event, asynchronous work, and reconciliation endpoint. Capability routes are not an implementation commitment or public API availability statement.
