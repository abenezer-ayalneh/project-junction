# API Conventions

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** external API contract conventions  
**Decision coverage:** `DEC-072`, `DEC-073`, `DEC-083`, `DEC-120`, `DEC-124`, `DEC-129`

The future authoritative interface is versioned REST (`/v1`) described by OpenAPI and validated at the Nest boundary using Zod Standard Schema. Public transport types are distinct from domain/Prisma types. Generated TypeScript SDK/query hooks are a planned consumer convenience, not a source of authorization.

- Commands use `POST`, `PATCH`, or action endpoints as appropriate and require an `Idempotency-Key` when a retry could create a commercial/provider/side effect.
- Resource reads are cursor-paginated where collections can grow; caller context never defines authority.
- Each protected request derives `AccessContext` server side; relevant Vendor/Location/demo workspace scope is explicit in domain data, not trusted from header/query alone.
- Responses carry correlation/request ID, schema version, stable error code, and safe human message. Sensitive internal state never leaks.
- The local foundation sends an `X-Request-Id` response header for every HTTP request. It preserves a caller-provided UUID only when valid; otherwise it generates one. The health body and error envelope use that same value, while future response envelopes may carry it in their body contracts where appropriate.
- Every current `/v1` response also sends `X-API-Version: v1` and `X-API-Lifecycle: active`, including errors. Browser clients may read those headers through CORS. They identify the active public-contract baseline; they do not guarantee a deployed or publicly available service.
- A future breaking replacement must use a new URI major version, ship its reviewed OpenAPI contract before deprecating the prior version, and preserve the old major version for at least 180 days after its `Deprecation: true` notice. Deprecated responses must send `Deprecation`, an HTTP-date `Sunset`, and a `Link` header to the replacement contract. Removal requires an updated OpenAPI snapshot, migration guidance, telemetry/release evidence, and explicit owner approval. Additive fields and endpoints remain compatible within a major version; do not silently repurpose or weaken existing fields, errors, idempotency behavior, or authorization.
- REST is authoritative after reconnect or realtime cursor gap. Server Actions/BFF duplication is excluded for business commands.
- The local Socket.IO foundation returns a scoped workspace outbox high-water cursor on an authorized room join. A known cursor replays at most 25 durable, payload-minimal workspace notifications in the join response; an unknown or over-limit cursor returns no events and `restRefetchRequired: true`, so REST remains authoritative. When `REALTIME_REDIS_FANOUT=enabled`, the implemented foundation command emits the same durable event identity through Redis; every candidate socket is re-derived from durable authority before it receives the event. Redis failure does not change command truth.
- Provider callbacks/media/realtime have their own contracts and do not masquerade as ordinary authenticated API requests.
- The retired `POST /v1/synthetic/accounts` fixture-provisioning route is absent from the active API contract. Local development uses Better Auth registration/sign-in and real local accounts; disposable identities and controlled provider responses are limited to isolated tests. A verified Vendor Owner may create or revoke a scoped Staff binding through `/v1/foundation/staff`; revocation invalidates matching Staff sessions and disconnects their realtime sockets.
