# P02-C06 local browser evidence — 2026-10-12

Served production Next web and built Nest API on loopback, disposable local PostgreSQL schema and verified test-account fixture, Microsoft Edge headless. Successful browser API responses came from the actual API. Explicit failure injection aborted one advisory read and discarded one response after a committed hold; retry preserved its original key and reservation count. The fixture and test services were cleaned up.

- [Product desktop](./product-desktop.png): variant/SKU, exact price, quantity, Location, pickup policy and non-reserving Cart action.
- [Product mobile](./product-mobile.png): 320px selection layout without page overflow.
- [Cart mobile](./cart-mobile.png): retained selections, delivery contact/pin, current-price change, delivery fee/ETA and policy review before a hold.

The browser also verified missing selections, stock conflicts, Cart persistence/no stock reservation, real quote repricing, hold response loss/replay, reload reconciliation, release and restored stock, outside-zone delivery rejection and corrected-pin recovery. Six new component tests and fifteen focused PostgreSQL regression scenarios passed. This is local evidence for TST-P02-004; independent accessibility/native screen-reader review, payment/Orders and the formal Phase 02 exit remain open. The controlled verified identity is test data and does not change ordinary local account eligibility.

Reproduction and full limitations are recorded in [Phase 02 P02-C06](../../../requirements/PHASE-02-GOODS-COMMERCE.md#p02-c06--product-selection-and-goods-cart-ui--2026-10-12).
