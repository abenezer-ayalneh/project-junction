# Actors, Aggregates, and Ownership

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** aggregate ownership and command authority  
**Decision coverage:** `DEC-008`–`DEC-010`, `DEC-017`, `DEC-019`, `DEC-023`, `DEC-107`, `DEC-117`, `DEC-118`, `DEC-154`, `DEC-162`, `DEC-164`, `DEC-169`

| Context    | Aggregate                                                     | Owner / authority                    | Boundaries                                                     |
| ---------- | ------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------- |
| Identity   | User, Membership, AccessGrant                                 | User / Vendor / Platform             | server-derived `AccessContext` is authorization authority      |
| Vendor     | VendorApplication, Vendor, Storefront, Location, StaffProfile | Vendor Operations / Vendor member    | Staff profile may lack User link                               |
| Catalog    | Listing, Variant, Service, ServiceOption, Media, ImportJob    | Vendor                               | Platform governs category/review status                        |
| Inventory  | StockLedger/Movement                                          | Vendor Location                      | only movements derive stock                                    |
| Scheduling | Schedule, BookingHold, Booking, Amendment                     | Booking context                      | Staff availability truth; Checkout orchestrates hold only      |
| Checkout   | Cart, CheckoutQuote, CheckoutHold, Purchase                   | Customer / Checkout                  | owns cross-vertical orchestration, not downstream lifecycle    |
| Ordering   | VendorOrder, Fulfillment                                      | Vendor / Customer handoff evidence   | goods lifecycle separate from Booking                          |
| Payments   | PaymentAttempt, WebhookInbox                                  | Payments context                     | provider outcome is input, ledger is internal accounting truth |
| Ledger     | LedgerTransaction/Posting, Earning, Transfer, PayoutBatch     | Finance workflow                     | append-only/reversal correction                                |
| Trust      | ReturnCase, Dispute, SupportCase, Review, ModerationCase      | scoped Customer/Vendor/Platform role | policy snapshot/evidence/audit required                        |
| Demo       | DemoWorkspace, PersonaSession                                 | demo controller                      | synthetic namespace only                                       |

`INV-OWN-001`: commands originate from the aggregate owner or documented authorized role, and each record follows its aggregate’s scope chain. `INV-OWN-002`: Purchase coordinates but never collapses Order/Booking/ledger ownership. `INV-OWN-003`: asynchronous projections/providers cannot become the authority for state transition.
