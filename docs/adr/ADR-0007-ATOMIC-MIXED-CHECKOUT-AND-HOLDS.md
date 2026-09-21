# ADR-0007: Atomic Mixed Checkout with Expiring Holds

**Status:** Accepted  
**Decision:** `DEC-018`, `DEC-019`, `DEC-022`–`DEC-023`, `DEC-125`, `DEC-157`–`DEC-158`, `DEC-182`  
**Date:** 2026-08-27

A Customer-facing Purchase can coordinate multi-Vendor goods and up to five independent Booking intents. Strict stock and Staff holds expire and are idempotent; final commit creates appropriate Orders/Bookings. This is harder than separate carts but satisfies the selected first-public-release contract without oversell/double booking.
