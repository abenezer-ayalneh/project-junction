# Maps, Addresses, and PostGIS

> **Document status:** specified
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-054`–`DEC-055`, `DEC-095`, `DEC-128`, `DEC-148`](../governance/DECISION-REGISTER.md)
> **Normative owner:** mapping-provider boundary and spatial computation

## Ownership

MapLibre GL JS renders maps and MapTiler Cloud supplies restricted-key tiles/geocoding assistance. Junction stores its own normalized address, Customer contact/landmark/instructions, confirmed pin, Location pin, and delivery polygons. PostGIS is authoritative for containment and distance decisions [DEC-095, DEC-128]. Raw provider payloads are not indiscriminately retained.

Public OpenStreetMap tile or Nominatim endpoints are not a production backend. Manual pin placement and structured-address correction remain available when geocoding is weak.

## Spatial model

- All stored points and polygons use SRID 4326.
- A Vendor Location owns zero or more effective-dated delivery zones.
- A zone snapshots fee, minimum order, optional free-delivery threshold, ETA range, and active status [DEC-055].
- Polygon validity is checked before activation; self-intersection, empty geometry, invalid winding, and unsupported extent are rejected.
- Boundary inclusion follows one documented PostGIS predicate and is tested explicitly.
- Customer address snapshots retain the chosen normalized fields, pin, landmark, delivery instructions, and contact needed for the Order [DEC-054]. Later profile edits do not rewrite an Order.

## Fulfillment-location selection

For each Vendor group, Junction filters Locations by complete stock, fulfillment capability, pickup selection or delivery-zone containment, and active status. Eligible Locations are then ranked and explained by stock, zone, fee, and ETA [DEC-148]. The Customer confirms one Location; split fulfillment is excluded [DEC-131]. Checkout revalidates the confirmed choice under lock.

The ranking formula and tie-breaker are a **DERIVED-PLAN-DEFAULT** that must be fixed before implementation; it cannot hide a higher fee or invent ETA precision.

## Security and privacy

- Browser map keys use origin restrictions and only public presentation scopes.
- Server provider keys are separate and never shipped to the browser.
- Customer pins and instructions are private operational data, omitted from analytics/search and revealed only to authorized fulfillment/support actors.
- Logs and error telemetry coarsen or remove coordinates.
- Public Storefront pins may use an intentionally published Location position, never a Customer address.

## Verification required later

Test polygon edges/holes, overlapping zones, invalid shapes, coordinate-order mistakes, map-provider outage, manual pin fallback, address snapshot immutability, cross-Vendor leakage, and PostGIS query/index plans at target data volume.

## Related documents

- [Location, address, and geospatial model](../data/LOCATION-ADDRESS-AND-GEOSPATIAL-MODEL.md)
- [Provider integration contracts](PROVIDER-INTEGRATION-CONTRACTS.md)
