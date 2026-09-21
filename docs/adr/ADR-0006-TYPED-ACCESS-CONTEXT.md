# ADR-0006: Typed Server-Derived Access Context

**Status:** Accepted target architecture; not implemented  
**Decision:** `DEC-010`, `DEC-071`, `DEC-129`  
**Date:** 2026-08-27

Authorization derives a typed `AccessContext` from session and scoped membership, not client role claims. This makes multi-Vendor and optional Location scope auditable. It imposes context propagation discipline but prevents broad role checks and cross-tenant leakage.
