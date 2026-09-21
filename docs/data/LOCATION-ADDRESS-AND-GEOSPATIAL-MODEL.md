# Location, Address, and Geospatial Model

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** location/address spatial data semantics  
**Decision coverage:** `DEC-017`, `DEC-054`, `DEC-055`, `DEC-095`, `DEC-128`, `DEC-131`, `DEC-148`

`Location` is Vendor-owned and contains publicly intended address/pin/hours/capabilities plus private operational boundaries. `CustomerAddress` contains contact, structured locality, landmark, instructions, map pin, verification/preference metadata, and private access controls. `AddressSnapshot` is copied to a commercial Fulfillment at commitment; later Customer edits never change it.

`DeliveryZone` belongs to one Location and captures a valid effective geometry, fee, minimum order, free-delivery threshold, ETA, active interval, and version. All geometry uses WGS84/SRID 4326 in target PostGIS; a documented containment predicate governs boundary behavior. Geographic decision is server-side; map provider is presentation/geocoding assistance only. User-facing Location selection is deterministic/explainable from stock/zone/fee/ETA and cannot silently split fulfillment.

Coordinates/landmarks/instructions are private Customer operational data and not indexed for public discovery/analytics. Validity, overlap/boundary rules, map outage/manual pin fallback, and snapshot immutability require future tests.
