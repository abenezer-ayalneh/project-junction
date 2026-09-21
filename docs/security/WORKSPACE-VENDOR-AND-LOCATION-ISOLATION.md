# Workspace, Vendor, and Location Isolation

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-010`, `DEC-017`, `DEC-107`, `DEC-117`, `DEC-162`

`INV-ACCESS-001`: an actor can read or mutate only records reachable through their authenticated `AccessContext` and the capability’s declared ownership chain. Customer ownership is by User; Vendor ownership is by Vendor plus optional Location; Platform ownership is explicit assigned case or role scope. Staff profiles are not automatically User identities and must not inherit broad Vendor authority.

Required query rules:

- resource IDs alone never grant access;
- Vendor and Location filters are enforced in the repository/service boundary, not only in UI routes;
- aggregate children inherit the parent’s ownership unless an explicit cross-context projection is documented;
- exports, media URLs, search/realtime rooms, and background-job payloads carry scoped identifiers and are re-authorized at use;
- support impersonation is prohibited; any assisted action is attributable to the actual User or a documented staff action;
- deletion, suspension, transfer, and external provider actions retain an audit reference and jurisdictional purpose.

`TST-SEC-012` exercises ID enumeration, stale membership, cross-Location changes, role downgrade, deleted/suspended resources, realtime-room joins, signed-media URL reuse, and job replay.
