# ADR-0011: Transactional Outbox and Rebuildable Projections

**Status:** Accepted target architecture; not implemented  
**Decision:** `DEC-081`, `DEC-086`–`DEC-087`, `DEC-123`–`DEC-124`  
**Date:** 2026-08-27

The target records domain changes transactionally with an outbox and uses worker-driven, rebuildable search/realtime/analytics projections. This accepts eventual projection lag but avoids treating queues or search as commerce truth and enables safe rebuild/reconciliation.
