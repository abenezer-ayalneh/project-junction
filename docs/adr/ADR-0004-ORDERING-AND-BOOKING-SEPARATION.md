# ADR-0004: Separate Ordering from Booking

**Status:** Accepted  
**Decision:** `DEC-019`, `DEC-082`, `DEC-157`–`DEC-160`  
**Date:** 2026-08-27

Goods fulfillment and staff-allocated appointments have different states, timeouts, evidence, cancellation, and earnings-release rules. A single Purchase coordinates them, but Vendor Orders and Bookings remain separate aggregates. This costs orchestration design but protects correct lifecycle ownership.
