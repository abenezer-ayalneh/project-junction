# Cart and Checkout — Context Glossary

**Status:** Specified — Not Executed — Not Verified  
**Glossary only:** canonical language; no requirements or implementation detail.

| Term                 | Meaning                                                                   | Avoid                                         |
| -------------------- | ------------------------------------------------------------------------- | --------------------------------------------- |
| Cart                 | Customer’s non-authoritative selection of Product and Booking intents     | Purchase                                      |
| Vendor group         | Cart components belonging to one Vendor and selected fulfillment Location | shipment by default                           |
| Checkout quote       | time-bounded priced/eligible proposal before commitment                   | invoice                                       |
| Checkout hold        | all-or-nothing temporary inventory/Staff reservation                      | payment authorization unless provider says so |
| Checkout             | orchestration from Quote/Hold toward Purchase after payment truth         | generic Order state                           |
| Purchase             | Customer-facing commercial grouping produced by one Checkout              | Vendor Order                                  |
| Idempotency key      | client-supplied stable identity for one semantic command                  | request ID only                               |
| Promotion allocation | snapped funding/discount result                                           | mutable coupon calculation                    |
| Late success         | provider confirmation after hold no longer valid                          | normal successful checkout                    |
