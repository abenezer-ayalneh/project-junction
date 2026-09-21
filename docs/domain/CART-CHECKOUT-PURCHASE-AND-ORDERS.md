# Cart, Checkout, Purchase, and Orders

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** customer commerce orchestration  
**Decision coverage:** `DEC-022`–`DEC-024`, `DEC-028`, `DEC-033`, `DEC-034`, `DEC-125`, `DEC-131`–`DEC-133`, `DEC-152`, `DEC-157`–`DEC-160`, `DEC-182`

Cart is a Customer selection and not commercial truth. Guest Cart may be local and merges visibly on verified sign-in with repricing, availability recheck, and conflict explanation. A Cart can contain multiple Vendor groups, goods, and up to five independent quantity-one Booking intents. Customer chooses pickup/delivery per goods group and in-person/online service mode as appropriate.

Checkout constructs a quote then creates a 15-minute all-or-nothing CheckoutHold for every selected stock/Staff component. An idempotency key identifies the semantic attempt. Successful provider confirmation within the valid hold produces one Purchase, Vendor Orders, confirmed Bookings, snapshots, ledger/outbox work. Late provider success must auto-refund/compensate. No partial silent commitment, oversell, double booking, or duplicate payment semantics.

Purchase is a customer-facing commercial aggregate; Vendor Order and Booking retain distinct state machines. Paid Product Orders auto-confirm. Vendor cancellation is exceptional and may lawfully affect a line/quantity only, preserve unaffected components, refund proportionally, and refund delivery if all items in group are cancelled. Prices/policies/addresses/discounts/commission/fees/terms snapshot at commercial commitment.
