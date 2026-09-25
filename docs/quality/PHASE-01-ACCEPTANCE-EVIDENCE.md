# Phase 01 Acceptance Evidence

**Assessment date:** 2026-09-25

**Scope:** local synthetic private milestone only

**Local synthetic phase exit:** verified

**Target phase exit:** open

The Phase 01 requirements are evaluated against the [phase gate](../requirements/PHASE-AND-RELEASE-GATES.md), not against the presence of source code alone. The public release and real commercial gates remain separate.

| Requirement and scenario           | Current local evidence                                                                                                                                                                                                                                          | Assessment                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `REQ-P01-VND-001`, `TST-P01-001`   | PostgreSQL integration and served browser: a pending Vendor prepares private content; a scoped reviewer approves the application before public publication.                                                                                                     | Accepted locally.                                  |
| `REQ-P01-CAT-001`, `TST-P01-001`   | Typed simple/variant Product and fixed-duration Service contracts, ownership checks, migration-backed records, and integration cases.                                                                                                                           | Accepted locally.                                  |
| `REQ-P01-CAT-002`, `TST-P01-002`   | Rejected revision, version-stale decision, reviewed publication, audit/outbox event, and unpublish reversal in integration and served browser.                                                                                                                  | Accepted locally.                                  |
| `REQ-P01-CSV-001`, `TST-P01-003`   | Versioned dry-run, row errors, idempotent commit/replay, safe export comparison, and served browser preview/commit/error flow.                                                                                                                                  | Accepted locally.                                  |
| `REQ-P01-DSC-001`, `TST-P01-001`   | PostgreSQL-backed Product/Service filters and search projection rebuild, served public search and storefront navigation, scoped save/follow and opt-in recommendations.                                                                                         | Accepted locally.                                  |
| `REQ-P01-MEDIA-001`, `TST-P01-004` | Signed PUT, sealed quarantine, ClamAV scan, FFmpeg transform, reviewer preview/approval, captioned and silent public playback, and unpublish revocation. Tests reject EICAR, bad checksum, oversize upload, missing captions for audio, and invalid cue timing. | Accepted locally; target environment remains open. |

## Served media trace

On 2026-09-25 a disposable `@example.invalid` synthetic fixture uploaded a one-second silent MP4 through the Vendor workspace. The worker moved it from `quarantined` to `needs_moderation` with a clean scan and a 1280 × 720 rendition. A scoped Trust reviewer loaded a private preview; the browser reported video `readyState=4`, one-second duration, and no media error. Approval removed the item from the review queue. The public storefront loaded and played the approved video. After the Vendor unpublished the listing, the storefront showed zero offerings and direct public video/poster requests returned HTTP 403. The fixture workspace, User, and four object-store objects were deleted and verified absent.

The first public playback attempt exposed a cross-origin resource policy mismatch. The public media routes now explicitly allow cross-origin embedding for published assets while retaining current database publication checks and `no-store` responses. The repaired browser playback was verified after this change.

A second disposable `@example.invalid` fixture on 2026-09-25 used a one-second MP4 with AAC audio and a valid WebVTT cue. The local scanner and processor produced a 1280 × 720 rendition, then scoped moderation approved it. In the served storefront, the video loaded with no media error, the caption track reached ready state 2 in showing mode, and the text “A tone plays.” was visibly overlaid on the video. Focusing the video and pressing Space played it through; Home returned it to the captioned start frame. At a 390 px viewport, the caption, video controls, description, and listing remained visible without horizontal clipping. The Platform review page showed scoped catalog-health metrics. The fixture workspace, User, and all four object-store keys were deleted and verified absent.

A short-lived demo Vendor fixture entered an unsent Product draft in the served browser, reloaded, reentered its session, and recovered the title, description, and price. Submitting it created one private draft and cleared the form. The demo was purged; its Vendor, sessions, and listing were gone, while the expected workspace tombstone remained. The separate web test covers a failed network response followed by the same-key retry.

## Verification commands

- `set -a; source ./.env.example; set +a; pnpm test:integration` passed 39 tests plus API/worker smoke on 2026-09-25 after the cleanup, catalog-health, and orphan-sweep changes. It includes real ClamAV/FFmpeg audio-caption validation, expired upload cleanup, fail-first demo object purge, orphan deletion failure/retry, and projection-lag detection/rebuild.
- The OpenAPI test passed 20 tests and updated its reviewed snapshot with the catalog-health contract. The full Nx typecheck/lint/test/build gate passed for all five projects after the final review/import lag contract and browser draft-recovery changes.
- A scoped Platform catalog-health read exposes pending review age, import dry-run age, projection lag, media backlog, and dead-letter count. Integration verifies denied Vendor access and projection lag clearing after rebuild; the scoped review page was also checked in the served browser.
- A web test verified that an unsent private draft survives a reload and that an ambiguous network failure retains the same idempotency key for retry, then clears the tab-scoped draft on success.
- The Vendor listing form now keeps an unsent private draft in tab-scoped storage keyed by Vendor ID. Reconnection requires the Vendor session again; the stored draft contains no session ID and clears on successful creation. Served reload/recovery and a private create were verified.

## Open target phase-exit evidence

1. A private target environment still needs real Cloudflare R2 credentials, bucket policy, and end-to-end acceptance. Local MinIO proves the S3-compatible boundary only.
2. Independent accessibility review on the target browser/device matrix remains outstanding. The local served browser showed keyboard playback, visible captions, and a narrow viewport, but that is not an independent audit.
3. Exact non-demo rejected-media retention periods remain `REQUIRES-FUTURE-VALIDATION` in the target registry. The local cleanup policy retains referenced evidence until that registry exists; no age-based deletion is implemented for non-demo rejected media.
