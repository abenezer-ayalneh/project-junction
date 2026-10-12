# Phase 01 Acceptance Evidence

**Assessment date:** 2026-09-25

**Scope:** historical local milestone verified with disposable fixtures; this is not the current local development flow

**Historical fixture-based phase exit:** verified

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

## Marketplace redesign implementation evidence

**Assessment date:** 2026-10-07

**Scope:** current local implementation verification using a uniquely tagged disposable Vendor, Product/Service listings, and local object-store images. The fixture and its object-store records were removed after the browser pass.

| Requirement and scenario        | Current local evidence                                                                                                                                                                                                                                                                                                                                                                                                                                   | Assessment                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `REQ-P01-UX-001`, `TST-P01-005` | A served local homepage exposed equal Product and Service navigation, both category groups, image-led verticals, Vendor discovery, and no transaction actions. The same route was inspected at desktop width and at 390 px.                                                                                                                                                                                                                              | Accepted locally on 2026-10-12 after the complete Edge matrix.                 |
| `REQ-P01-UX-002`, `TST-P01-006` | Served search retained `kind`, category, price, and sort in the URL; a filtered price-descending result opened a Listing whose Discovery link retained the original query. At 390 px, the Filter dialog exposed type/category/Vendor/price controls and Apply closed the dialog and restored trigger focus. The served unavailable state was also observed before the local API was started.                                                             | Accepted locally on 2026-10-12 after populated pagination and recovery checks. |
| `REQ-P01-UX-003`, `TST-P01-007` | Public cards showed an approved image, an honest missing-image fallback, simple price, variant from-price, and fixed service duration. The Listing detail showed Vendor attribution, public Location, and the later-phase review fallback. The structured Storefront rendered the approved Vendor-owned logo and cover. A real local ClamAV/FFmpeg integration test verified that approved images are unavailable before moderation and after unpublish. | Accepted locally on 2026-10-12 after direct and saved-state revocation checks. |

The local checks also passed the contracts/platform-core/API/web typecheck, lint, and test targets; the API OpenAPI snapshot is current. The focused real-media integration path replayed all 25 migrations against a fresh local schema and covered image upload, scan/transform, moderation, publication, structured Storefront selection, and unpublish revocation. A local production web build completed successfully.

This record does not promote the target phase exit. The served local redesign matrix in `TST-P01-005` through `TST-P01-007` was completed in Microsoft Edge on 2026-10-12. Independent accessibility review and target-environment acceptance remain separate open gates.

## Served media trace

On 2026-09-25 a disposable `@example.invalid` synthetic fixture uploaded a one-second silent MP4 through the Vendor workspace. The worker moved it from `quarantined` to `needs_moderation` with a clean scan and a 1280 × 720 rendition. A scoped Trust reviewer loaded a private preview; the browser reported video `readyState=4`, one-second duration, and no media error. Approval removed the item from the review queue. The public storefront loaded and played the approved video. After the Vendor unpublished the listing, the storefront showed zero offerings and direct public video/poster requests returned HTTP 403. The fixture workspace, User, and four object-store objects were deleted and verified absent.

The first public playback attempt exposed a cross-origin resource policy mismatch. The public media routes now explicitly allow cross-origin embedding for published assets while retaining current database publication checks and `no-store` responses. The repaired browser playback was verified after this change.

A second disposable `@example.invalid` fixture on 2026-09-25 used a one-second MP4 with AAC audio and a valid WebVTT cue. The local scanner and processor produced a 1280 × 720 rendition, then scoped moderation approved it. In the served storefront, the video loaded with no media error, the caption track reached ready state 2 in showing mode, and the text “A tone plays.” was visibly overlaid on the video. Focusing the video and pressing Space played it through; Home returned it to the captioned start frame. At a 390 px viewport, the caption, video controls, description, and listing remained visible without horizontal clipping. The Platform review page showed scoped catalog-health metrics. The fixture workspace, User, and all four object-store keys were deleted and verified absent.

A short-lived demo Vendor fixture entered an unsent Product draft in the served browser, reloaded, reentered its session, and recovered the title, description, and price. Submitting it created one private draft and cleared the form. The demo was purged; its Vendor, sessions, and listing were gone, while the expected workspace tombstone remained. The separate web test covers a failed network response followed by the same-key retry.

## Verification commands

- `set -a; source ./.env.example; set +a; pnpm test:integration` passed 39 tests plus API/worker smoke on 2026-09-25 after the cleanup, catalog-health, and orphan-sweep changes. The historical local fixture is now `.env.integration.example`; `.env.example` is the private staging template. The run includes real ClamAV/FFmpeg audio-caption validation, expired upload cleanup, fail-first demo object purge, orphan deletion failure/retry, and projection-lag detection/rebuild.
- The OpenAPI test passed 20 tests and updated its reviewed snapshot with the catalog-health contract. The full Nx typecheck/lint/test/build gate passed for all five projects after the final review/import lag contract and browser draft-recovery changes.
- A scoped Platform catalog-health read exposes pending review age, import dry-run age, projection lag, media backlog, and dead-letter count. Integration verifies denied Vendor access and projection lag clearing after rebuild; the scoped review page was also checked in the served browser.
- A web test verified that an unsent private draft survives a reload and that an ambiguous network failure retains the same idempotency key for retry, then clears the tab-scoped draft on success.
- The Vendor listing form now keeps an unsent private draft in tab-scoped storage keyed by Vendor ID. Reconnection requires the Vendor session again; the stored draft contains no session ID and clears on successful creation. Served reload/recovery and a private create were verified.

## Open target phase-exit evidence

1. Fresh Phase 01 target MinIO acceptance remains open. The [historical Phase 00 transition record](./PHASE-00-REAL-TRANSITION.md) records a configured private bucket, scoped application policy, HTTPS origin, and presigned upload/download/deletion verification before staging was suspended. That historical result and the local check below do not establish current target configuration, application-credential isolation, or the complete Phase 01 moderation/publication/revocation journey. Under the repository's local development policy, remote acceptance testing requires an explicit staging request.
2. Independent accessibility review remains outstanding. The 2026-10-12 owner-directed Microsoft Edge audit completed the local keyboard, focus, semantic-tree, theme, zoom, reduced-motion, and responsive checks, but a self-review cannot establish reviewer independence or native screen-reader acceptance.
3. Non-demo rejected-media cleanup is implemented under [rejected-media-v1](../data/REJECTED-MEDIA-RETENTION.md): 30 days from rejection, indefinite evidence holds, a fresh 30-day window after hold release, and audited worker deletion with durable retry/backoff. Existing rejected records migrate onto preservation holds. The policy owner has not decided the governing jurisdiction or approved retention policy. Approval remains a release gate. The follow-ups below implement local backup-copy/restore reconciliation and encrypted media generation scheduling with registered archive expiry. Offsite activation and database dependency rotation remain part of the broader recovery system.

## Phase 01 implementation completion follow-up — 2026-10-09

- Applying desktop or mobile filters preserves the selected sort while resetting pagination. A web regression submits changed criteria and checks the resulting URL.
- Shared Listing cards now expose Save/Saved controls on home, search, and Storefront surfaces. One layout provider shares the authenticated saved-state read across cards. Actions refresh authoritative state, require sign-in, announce success/failure, and preserve the desired mutation after an ambiguous response so retry cannot accidentally reverse a committed save. Web regressions cover existing saves, anonymous denial, and lost-response retry.
- Listing galleries now offer a named native enlarged-image dialog, previous/next buttons and arrow-key navigation, descriptive image text, missing-image recovery, and focus restoration on close. The native dialog supplies modal containment and Escape handling. The component regression covers opening, navigation, image failure/recovery, Close, and return focus using jsdom dialog shims; this is not independent browser accessibility acceptance.
- Rejected-media retention has a migration, versioned policy, reviewer-scoped idempotent evidence-hold endpoint, and a ten-minute worker schedule. The focused local PostgreSQL integration scenario passed with all 26 migrations and migration replay. It verifies hold protection, unauthorized Vendor denial, idempotent hold replay, release grace, partial storage-deletion failure, persisted retry timing, concurrent cleanup serialization, preserved moderation/checksum metadata, deletion audit, and denial of holds after purge. Storage deletion uses a controlled failing adapter in this scenario; the separate MinIO storage test below establishes real object-store deletion behavior.

The retention migration was also applied to the current loopback-only local database. Historical rejected files are protected by migration holds. No remote service was used. The operational policy is a documented derived default; legal validation and backup propagation are not claimed by implementation or local tests.

All five projects' Nx lint, typecheck, and unit targets completed successfully; the worker's existing unit suite is skipped. Web passed 12 tests across five suites. API passed 21 tests and its reviewed OpenAPI snapshot includes the retention-hold contract. The populated upgrade check passed with no Prisma/migration schema difference after documenting the existing marketplace indexes and Storefront media relations in Prisma. The Impeccable mechanical detector reported no findings on the changed UI components. These checks do not replace the remaining served-browser matrix or independent accessibility review.

## MinIO storage acceptance follow-up — 2026-10-09

**Assessment:** local MinIO storage boundary passed; target MinIO acceptance remains open.

The running `project-junction-local` Compose service used `junction-minio-local:source`, built from the pinned official source release in `ops/local/minio.Dockerfile`. Its API was reached at `http://127.0.0.1:59000`, using the local `junction-media-local` bucket and local fixture credentials from `.env.integration.example`. The binary reports `DEVELOPMENT.GOGET`; this is not a verified target image digest. No remote host or staging service was contacted.

The expanded `libs/platform-core/src/lib/media-store.integration.ts` scenario verified:

- Anonymous bucket listing, object PUT, and sealed-object GET each returned HTTP 403.
- A signed PUT rejected an incorrect byte count and accepted the declared MP4 bytes. Sealing rejected a checksum mismatch, then stored the checksum-matched object with the expected content length and included it in the authenticated private listing.
- A signed GET returned HTTP 200 and exactly matched the source bytes. A tampered signature and an expired grant each returned HTTP 403.
- Deleting the sealed object caused its still-valid signed GET to return HTTP 404. Cleanup deleted both disposable object keys and authenticated HEAD requests confirmed HTTP 404 for each; cleanup errors are no longer silently ignored by this scenario.

Verification used the local fixture environment:

```sh
set -a
source .env.integration.example
set +a
FOUNDATION_TEST_NAME='rejects incorrect signed PUT size and seals only a checksum-matched private MP4 object' pnpm nx run platform-core:test-integration
```

The focused integration target passed one scenario; 42 unrelated scenarios were skipped. All 25 migrations deployed to a fresh disposable loopback PostgreSQL schema, a second deployment reported no pending migrations, and the runner removed the schema afterward. Platform-core lint and typecheck passed after expanding the assertions.

This run uses local MinIO root fixture credentials over loopback HTTP. It does not verify target TLS/CORS, a separate target application's bucket-scoped credentials, denial of access to other buckets or administrative APIs, or browser upload/moderation/publication/revocation on the target. Those checks remain required before closing the target gate. This focused storage scenario does not need FFmpeg and does not supersede the previously reported missing-local-FFmpeg limitation for the full media-workflow test.

## Search accessibility follow-up — 2026-10-08

Scope: served local `/search?q=coffee` with empty Product/Service results. This does not establish populated Listing or Storefront acceptance or independent accessibility review.

- Keyboard: Enter opened the Appearance menu; Enter selected Light, ArrowDown and Enter selected Dark. Both document theme classes and computed body backgrounds changed correctly. Earlier Tab/Shift+Tab checks reached search and Account controls.
- Confirmed defects repaired: search had no visible focus indicator; added a focus outline to the search form and high-contrast focus-visible outlines to native controls and links. The mobile Filter dialog now has an accessible heading association.
- Reduced motion: added a prefers-reduced-motion media rule suppressing animation/transition durations and smooth scrolling. Runtime with the preference enabled remains unverified.
- Web Nx lint and typecheck passed after these fixes.
- Browser automation began timing out after reload and also timed out navigating a fresh tab. Post-fix focus, dialog Tab containment/Escape/return focus, actual browser zoom, theme persistence, and runtime reduced-motion checks remain open. Theme switching before the timeout is verified; this follow-up does not mark the full acceptance matrix complete.

### Remaining search checks verified — 2026-10-08

The stopped local development server was recovered by terminating its unresponsive Next.js process and restarting `pnpm nx run web:dev`. The previous timeout limitation is superseded for the checks below.

- Focus: served dark-theme search showed a visible 2 px foreground outline around the focused search form. Computed form outline matched the screenshot.
- Mobile dialog: at 390 px, Enter opened the named `Filter results` dialog and initially focused Close. Tab reached Offering type, Category, Vendor, Min price, Max price, Apply, and Clear. The browser briefly moved focus to its chrome/body sentinel at the wrap boundary, then returned to Close; no background page control received focus. Escape closed the dialog and returned focus to Filter. Keyboard Close and Apply also closed it; Apply returned focus to Filter.
- Smallest mobile layout: at 320 × 640, the dialog measured 282 px wide with a 280 px scroll width; the document had no horizontal overflow. Both price inputs, Close, Apply, and Clear remained visible and usable.
- Appearance: Light and Dark each survived a served page reload with the corresponding document class. Earlier keyboard switching and computed background checks remain valid.
- Actual zoom: local Microsoft Edge displayed 200% zoom with an effective 1024 CSS-pixel viewport; document scroll width did not exceed the viewport. The in-app browser's ignored zoom shortcut is not counted as zoom evidence.
- Reduced motion: Edge DevTools enabled `prefers-reduced-motion: reduce`; matchMedia returned true. Computed button transition and appearance-menu animation/transition durations were each `0.00001s` (0.01 ms). The menu opened and closed successfully. Emulation was disabled and browser zoom restored after verification.

No further product-code changes were needed in this pass. The focus, dialog naming, and reduced-motion fixes from the preceding follow-up are now locally evidenced. This closes those specific search checks, not independent accessibility review, populated-result pagination, or the complete marketplace viewport/recovery matrix.

## Rejected-media backup and policy follow-up — 2026-10-09

Implementation now journals every irreversible deletion decision in a separate private S3 bucket before deleting active media. Conditional creation prevents retries from changing scope; missing/unavailable journal storage causes audited retry without deleting bytes. Holds cannot reverse a journaled deletion. Active-object cleanup and backup-copy reconciliation remove all versions and delete markers, with exact-key matching and read verification.

Local Nx operations provide `platform-core:media-backup-rotate` and `platform-core:media-restore-reconcile`. Rotation requires a separate copy bucket; restore requires loopback services, fenced traffic, and a disposable recovery schema. Reconciliation replays the current journal into old database state, clears restored references, restores rejected state, and audits completion. It rejects missing journal coverage for already-purged rows. See [the operational policy](../data/REJECTED-MEDIA-RETENTION.md) for configuration and archive limitations.

Local evidence: the focused integration run passed four scenarios with 42 unrelated scenarios skipped; the actual database-restore target also passed.

- MinIO integration: immutable independent journal, identical retry, conflicting scope denial, removal of two historical object versions plus a prior rendition with a different content hash, idempotent rerun, preservation of a neighbouring object, and purging bytes recopied from an older backup.
- Governance-locked MinIO copy: reconciliation fails with a storage lock error and leaves the locked version intact; no operational governance bypass is requested. Only test teardown bypasses its disposable fixture lock.
- PostgreSQL integration: journal outage deletes no objects; partial deletion retains durable scope; later retries finish; a late hold is denied; simulated older approval/hold and restored references are reconciled with metadata retained and idempotent replay.
- `platform-core:test-media-restore`: real local `pg_dump`/`pg_restore` from before deletion, followed by rehydrating old media bytes and reconciling against a current independent journal. Deleted references and files do not reappear; replay is a no-op. Disposable schema, dump, keys, and journal bucket are removed afterward.
- Contracts, platform-core, API, and worker Nx lint/typecheck/unit tasks passed. Unit counts: contracts 2, platform-core 18, API 21; worker's existing test remains skipped.

Reproduction (local only):

```sh
set -a
source .env.integration.example
set +a
FOUNDATION_TEST_NAME='rejected.media.*(backup propagation|evidence holds)|rejects incorrect signed PUT size' pnpm nx run platform-core:test-integration
pnpm nx run platform-core:test-media-restore
```

This is local synthetic evidence, including versioned storage and actual database restore. It does not establish offsite pgBackRest/B2 scheduling, total-host recovery, Object Lock expiry, or encrypted archive rewrite. Immutable archive generations require lifecycle expiry and current-journal reconciliation when unpacked; copies preserving different key layouts require an adapter. Source/copy IAM must include version-list and version-delete permissions. Current CLI operations deliberately reject remote endpoints under the project's local-development policy.

The owner confirmed that the governing jurisdiction and approved policy are undecided. The 30-day period remains provisional, with its rationale and concrete approval inputs recorded in [the retention decision](../data/REJECTED-MEDIA-RETENTION-DECISION.md). Policy finalization and production backup integration are still open; this follow-up does not claim production readiness.

## Media backup scheduler and archive expiry — 2026-10-10

The local [media backup lifecycle](../data/MEDIA-BACKUP-LIFECYCLE.md) now creates encrypted, database-scoped media generations on a configurable interval, persists their original recovery point and expiry, and expires their complete version/multipart scope. The controller imports standalone archives using authenticated streaming encryption, supports audited generation holds, retries Object Lock failures without governance bypass, and reconciles current deletion decisions before isolated media restore. PostgreSQL advisory locking serializes executable operations; SIGTERM shuts the watcher down cleanly. Explicit policy and private encryption key files are required. Synthetic examples do not adopt the governing policy's proposed periods.

The focused local PostgreSQL/MinIO integration run passed **10 scenarios**, with **44 unrelated scenarios skipped**, after all 26 migrations and replay. Eight new lifecycle scenarios and two existing deletion-propagation scenarios cover:

- Encrypted media round-trip, key/authentication/tamper denial, missing source/ciphertext failures, database ownership and journal exclusions, and duplicate schedule prevention.
- Historical versions/delete markers, registered archive expiry, post-expiry recopy cleanup, holds/release without lifetime renewal, source/journal preservation, and actual governance-lock expiry followed by physical disposal.
- Catalog/journal failure, invalid manifests and unknown scopes failing closed; a streamed 65 MiB archive, interrupted stream abort, and staged multipart cleanup after simulated process death.
- The actual CLI against local database-owned media, competing advisory lock denial, watcher heartbeat/shutdown, and repeat scheduling.

Platform-core Nx build, lint, typecheck and all 18 unit tests also passed. The controller passed Node syntax validation and its help entry point.

The pinned local MinIO build's multipart listing can omit directory-prefix matches and include stale indexes for other buckets. The controller lists pages without that prefix, filters its exact scope, and verifies each candidate with bucket-scoped `ListParts`; only a confirmed 404 is ignored. Expiry verifies both versions and extant staged uploads before declaring disposal.

Reproduction uses disposable local schemas, buckets and key files:

```sh
set -a
source .env.integration.example
set +a
FOUNDATION_TEST_NAME='local media backup lifecycle|local rejected-media backup propagation' pnpm nx run platform-core:test-integration
pnpm nx run-many -t lint typecheck test build -p platform-core
```

Provider activation, production IAM/TLS, matching database/media recovery points, pgBackRest dependency rotation, offsite RPO/RTO and total-host recovery remain unverified. Journal/catalog disposal and the governing jurisdiction/entity/period approvals remain open. This implementation closes the local media scheduler and registered archive-expiry capability; it does not close Phase 01's policy, accessibility or target acceptance gates.

## Owner-directed local acceptance — 2026-10-12

**Assessment:** the marketplace redesign and local storage/recovery implementation are accepted for local scope. Target-environment and independent-review gates remain open.

The served application was reviewed in Microsoft Edge with a uniquely tagged disposable Vendor, 12 Products, five Services, simple and variant prices, an unavailable price, approved and missing media, a two-image gallery, a deliberately broken image, a long unbroken title, and a verified Customer save. The disposable fixture was used only on loopback services.

- `TST-P01-005` passed at 320, 390, 768, 1024, and 1440 CSS pixels in Light and Dark themes. Products, Services, both category groups, Listing detail, return navigation, Storefront discovery, and the one-empty-vertical case remained usable. Native Edge zoom at 200% and 400% produced no horizontal overflow on home, search, Listing, or Storefront surfaces.
- `TST-P01-006` passed with populated full-set price ordering and cursor pagination, filter application/removal, changed-criteria cursor reset, Listing return navigation, reload, and a shared URL opened in a fresh Edge tab. Empty results remained distinct from an API outage; retry restored the original query after the API returned. The mobile filter dialog's Apply, Clear, Escape, focus containment, and trigger-focus restoration passed.
- `TST-P01-007` passed for simple, variant from-price, unavailable price, Vendor attribution, approved gallery images, missing and broken image recovery, a long unbroken title, absent reviews, and structured Storefront navigation. Unpublishing removed the saved Listing from discovery and Storefront responses, denied direct Listing access, and made the public media route return HTTP 403.
- The accessibility self-review passed keyboard operation, visible focus, dialog naming and return focus, semantic headings and labels in Edge's accessibility tree, Light/Dark persistence, actual browser zoom, and the existing reduced-motion runtime check. This is internal evidence; it does not satisfy the independent-review or native screen-reader gate.

The review found and repaired four defects: uncontrolled filter and sort controls could display stale values after URL navigation; the homepage Vendor status badge overflowed at 320 px; a valid long unbroken Listing title caused horizontal overflow; and the reduced-motion rule globally suppressed every transition instead of targeting spatial animation. A web regression now covers filter state after removal and back navigation.

The screenshot and viewport evidence is stored under [`docs/quality/evidence/phase-01-edge-2026-10-12`](./evidence/phase-01-edge-2026-10-12/). The JSON matrix records viewport and document widths; screenshots include Light/Dark home, search, Listing gallery, and Storefront views, native 200%/400% zoom, keyboard gallery focus, outage recovery, saved state, and publication revocation.

Local MinIO and recovery checks also passed. Focused integration covered signed upload byte enforcement, sealed/private access, real ClamAV and FFmpeg processing, moderation/publication/revocation, deletion propagation, encrypted backup generations, registered archive expiry, and actual PostgreSQL dump/restore reconciliation. Target TLS/CORS, separate target application credentials, provider IAM, offsite activation, matching database/media recovery points, pgBackRest dependency rotation, and total-host RPO/RTO cannot be established from the local-only environment and remain open.
