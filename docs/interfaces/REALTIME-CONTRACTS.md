# Realtime Contracts

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-072`, `DEC-124`, `DEC-129`

The target uses Socket.IO forced WebSocket transport with authenticated, scoped rooms and Zod-validated envelopes. Realtime is notification/projection delivery, never the authority for checkout, payment, availability, authorization, or reconciliation.

Envelope fields: `type`, `schemaVersion`, durable `eventId`, `cursor`, `occurredAt`, `scope`, and minimal payload. Rooms correspond to current scoped Customer, Vendor/Location, Platform case, and demo workspace contexts; join authorization is rechecked on connection, role/scope change, and sensitive command. The local foundation returns at most 25 redacted, workspace-scoped durable events in the successful `room.joined` response when a supplied cursor is still known and within that bound. An unknown or over-limit cursor returns no events and `restRefetchRequired: true`; the client then calls authoritative REST/query refetch. Live fanout uses the same durable event identity.

Duplicate, delayed, missing, revoked-session, unauthorized-room, replayed, and schema-mismatched envelope handling must be tested. Redis fanout is a target projection/distribution component; loss of realtime does not lose domain truth.
