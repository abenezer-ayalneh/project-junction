# Locations, Inventory, and Fulfillment

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** location stock and goods handoff behavior  
**Decision coverage:** `DEC-017`, `DEC-018`, `DEC-027`, `DEC-037`, `DEC-049`, `DEC-054`, `DEC-055`, `DEC-131`–`DEC-133`, `DEC-148`, `DEC-161`, `DEC-186`

Vendor Location owns stock, pickup/hours, Staff operations, delivery zones, and in-person service operations. Inventory consists of immutable reasoned movements (receipt, reservation, sale, release, cancellation, return, damage, transfer, audited adjustment) whose sum derives stock. `INV-INV-001` prohibits negative available quantity/backorders.

Each Cart Vendor group selects exactly one qualifying Location. Before checkout, eligible Locations are ranked and explained by stock, zone, fee, ETA, and suitability; Customer confirms. A delivery address carries contact, structured locality, landmark/instructions, map pin, and immutable Order snapshot. A zone defines fee, minimum, free-delivery threshold, ETA, and polygon; live route pricing is excluded.

Fulfillment is pickup or Vendor-managed delivery. Pickup becomes ready then Customer code/QR collection, with controlled evidence fallback. Delivery uses ordered milestones/proof only—no Platform fleet, carrier, driver, dispatch, route, or GPS model. If delivery fails, one corrected retry occurs within 48 hours. Pickup permits 72 hours plus a 48-hour grace, then return/inspection/refund policy. Partial Vendor cancellation preserves unaffected components and refunds delivery when whole group cancellation requires it.
