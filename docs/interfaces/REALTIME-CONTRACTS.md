# Realtime Contracts

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-072`, `DEC-124`, `DEC-129`

The target uses Socket.IO forced WebSocket transport with authenticated, scoped rooms and Zod-validated envelopes. Realtime is notification/projection delivery, never the authority for checkout, payment, availability, authorization, or reconciliation.

Envelope fields: `type`, `schemaVersion`, `eventId`, `cursor`, `occurredAt`, `scope`, minimal payload, correlation ID. Rooms correspond to current scoped Customer, Vendor/Location, Platform case, and demo workspace contexts; join authorization is rechecked on connection, role/scope change, and sensitive command. Client reconnect submits cursor; server replays permitted bounded events or signals `resync_required`; client then calls authoritative REST/query refetch.

Duplicate, delayed, missing, revoked-session, unauthorized-room, replayed, and schema-mismatched envelope handling must be tested. Redis fanout is a target projection/distribution component; loss of realtime does not lose domain truth.
