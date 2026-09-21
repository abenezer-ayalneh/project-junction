# Catalog, Inventory, and Locations — Context Glossary

**Status:** Specified — Not Executed — Not Verified  
**Glossary only:** canonical language; no requirements or implementation detail.

| Term           | Meaning                                                         | Avoid                                    |
| -------------- | --------------------------------------------------------------- | ---------------------------------------- |
| Storefront     | structured public presentation owned by one Vendor              | global marketplace profile               |
| Listing        | published or draft Product/Service offering revision            | generic “item”                           |
| Product        | physical retail offering                                        | Service or digital good                  |
| Variant        | sellable Product option identified by a SKU                     | separate Listing when it is an option    |
| Service        | fixed-duration appointment offering                             | quote job, rental, class                 |
| Service Option | price/duration-bearing selectable version of a Service          | Staff-specific price                     |
| Location       | Vendor-operated place for stock, pickup, Staff, or appointments | Customer delivery destination            |
| Stock          | derived available quantity for SKU-variant at Location          | editable scalar truth                    |
| Stock movement | auditable reasoned change in stock                              | “set quantity” without adjustment reason |
| Delivery zone  | named Location-owned geospatial service area                    | live driver route                        |
| Media          | versioned listing/storefront asset                              | arbitrary public upload                  |
