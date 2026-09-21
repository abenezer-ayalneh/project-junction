# ADR-0008: Provider-Neutral Payments with Stripe Sandbox Role Split

**Status:** Accepted for portfolio target; no provider configured  
**Decision:** `DEC-025`, `DEC-075`, `DEC-077`, `DEC-103`, `DEC-154`–`DEC-155`  
**Date:** 2026-08-27

The payment interface is provider-neutral. Stripe sandbox models Junction as payment merchant and Vendors as contracting sellers under a unified charge; local fake adapters provide deterministic tests. This offers demonstrable workflow depth without claiming a validated Ethiopian commercial arrangement.
