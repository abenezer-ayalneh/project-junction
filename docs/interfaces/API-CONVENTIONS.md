# API Conventions

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** external API contract conventions  
**Decision coverage:** `DEC-072`, `DEC-073`, `DEC-083`, `DEC-120`, `DEC-124`, `DEC-129`

The future authoritative interface is versioned REST (`/v1`) described by OpenAPI and validated at the Nest boundary using Zod Standard Schema. Public transport types are distinct from domain/Prisma types. Generated TypeScript SDK/query hooks are a planned consumer convenience, not a source of authorization.

- Commands use `POST`, `PATCH`, or action endpoints as appropriate and require an `Idempotency-Key` when a retry could create a commercial/provider/side effect.
- Resource reads are cursor-paginated where collections can grow; caller context never defines authority.
- Each protected request derives `AccessContext` server side; relevant Vendor/Location/demo workspace scope is explicit in domain data, not trusted from header/query alone.
- Responses carry correlation/request ID, schema version, stable error code, and safe human message. Sensitive internal state never leaks.
- REST is authoritative after reconnect or realtime cursor gap. Server Actions/BFF duplication is excluded for business commands.
- Provider callbacks/media/realtime have their own contracts and do not masquerade as ordinary authenticated API requests.
