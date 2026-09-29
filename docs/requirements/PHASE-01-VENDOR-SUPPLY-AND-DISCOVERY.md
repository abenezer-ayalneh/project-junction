# Phase 01 — Vendor Supply and Discovery

**Target status:** Specified — Not Executed — Not Verified. **Local synthetic status:** Accepted against the [Phase 01 evidence record](../quality/PHASE-01-ACCEPTANCE-EVIDENCE.md). The Vendor/catalog API and PostgreSQL slice, private Vendor workspace, scoped Platform review, CSV preview/commit/export, public discovery/storefront, Customer saved/followed state, and opt-in recommendations have integration and served-browser evidence. The accepted media profile has local signed upload, sealed quarantine, scan, transcode, private moderation, silent and captioned public playback, keyboard/narrow-viewport checks, and unpublish revocation. Expired upload, demo workspace, and orphan-object cleanup have tested local paths. Target MinIO acceptance, independent accessibility review, and validated non-demo retention durations remain open. Production, provider, and commercial acceptance remain open.
**Objective:** demonstrate safe business Vendor supply and discoverability without buyer commitment.  
**Owner:** Vendor supply and catalog/discovery contexts  
**Entry:** Phase 00 access/API/event boundaries. **Exit:** reviewed catalog/discovery acceptance.  
**Decision coverage:** `DEC-016`, `DEC-042`–`DEC-048`, `DEC-051`–`DEC-053`, `DEC-066`, `DEC-102`, `DEC-123`, `DEC-130`, `DEC-148`, `DEC-162`, `DEC-175`, `DEC-176`, `DEC-180`, `DEC-189`

## Included / excluded

Includes self-service Vendor application, private pre-approval setup, approval/rejection/restricted states, structured hybrid Storefronts, Location basics, vendor-owned product/service listings, typed taxonomy/search, low-risk publication review, CSV import/export, public browse, saved/follow actions, rule-based opt-in recommendation signals, and synthetic media/video. Excludes live KYB, real documents, a public Vendor API, C2C, regulated categories, and public social Q&A/feed.

## Actors and proof journey

A prospective Vendor applies and can prepare permitted private content but cannot publish or transact. A scoped Platform Vendor-operations/review role evaluates the application and listing risk; only approval enables customer-facing publication. A public visitor can discover typed Product and Service results, while a Customer’s saved/follow preference remains scoped and optional. The phase proves a publish, a rejected/revised risky listing, CSV dry-run/replay, and quarantined captioned/no-speech video.

## Functional requirements

- `REQ-P01-VND-001`: application must enter a private workspace and cannot publish/transact before Platform approval.
- `REQ-P01-CAT-001`: listings are Vendor-owned, fixed-price, simple/variant Products or fixed-duration Services; no shared canonical catalog.
- `REQ-P01-CAT-002`: publication evaluates category/risk/revision and preserves version/audit/reversal path.
- `REQ-P01-CSV-001`: CSV uses versioned template, dry-run, preview, row errors, idempotent commit, and safe export.
- `REQ-P01-DSC-001`: public discovery separates Product/Service verticals; PostgreSQL truth can rebuild search projection.
- `REQ-P01-MEDIA-001`: public short video needs caption or no-speech declaration/description and quarantined processing path.

## Policies, objects, and state

Applies `POL-CAT-001` category/publication rules and `INV-CAT-001` Vendor ownership. Affects Vendor, VendorApplication, Storefront, Location, Listing, Media, Taxonomy, ImportJob, SearchDocument, Follow/SavedSearch and `STATE-VND-001`/`STATE-MED-001`. Events include `EVT-VENDOR-APPLICATION-*`, `EVT-LISTING-*`, `EVT-MEDIA-*`.

## Failure/quality/acceptance

Malformed CSV/media, prohibited category, duplicate import, stale approval, search projection lag, opt-out personalization, and offline draft handling must be explicit; no publish inference occurs. Test `TST-P01-001` approved/publish/search/unpublish, `TST-P01-002` prohibited/risk case, `TST-P01-003` import replay, and `TST-P01-004` video quarantine/caption validation. Security validates isolation/quarantine; accessibility verifies catalog/video; observability records review/import/projection lag. Payments, checkout, booking allocation, and commercial Vendor recruitment are deferred.

## Local implementation evidence

The [Phase 01 acceptance evidence](../quality/PHASE-01-ACCEPTANCE-EVIDENCE.md) tracks each requirement and the remaining phase-exit gates.

The synthetic PostgreSQL integration suite verifies private pre-approval setup, reviewed publication, rejection/revision/resubmission, public projection and unpublish reversal, versioned CSV preview/commit replay, quoted-field and malformed-row handling, content replay, safe export parsing, video quarantine, scoped saved/follow actions, explicit opt-in recommendations, migration replay, populated upgrade, restore rehearsal, and legacy rollback compatibility. It also checks private Vendor catalog read against active Owner membership, scoped Platform review queue visibility, stale review decisions, and approved Vendor publication. The web app renders API-backed public listing search/filter results and published storefronts. Served browser checks on 2026-09-24 confirmed the public empty state, a temporary published Product appearing in discovery, search for that Product, and navigation to its storefront with location and listing details. A second temporary fixture confirmed the Vendor workspace displays a private pending storefront and draft and creates another private draft. A third temporary fixture confirmed scoped Platform queue loading, approval of a pending Vendor and Product, queue removal, and Product visibility in public discovery. A fourth temporary fixture verified CSV preview, commit into a private draft, export action, and malformed-row feedback in the served Vendor workspace. A fifth fixture verified Customer save and follow, persistence across reload, personalized recommendation reason, and opt-out fallback in the served discovery page. A sixth fixture verified storefront editing, versioned revision of a rejected listing, Vendor unpublish, and its removal from public search. The fixtures and their event records were removed afterward. This is local synthetic evidence and does not close the target-system, external accessibility, or commercial acceptance gates.

The local media slice adds a Vendor-owned signed PUT grant with an exact byte policy and ten-minute expiry, then verifies MP4 signature, byte count, and SHA-256 before copying the source into a separate private sealed key. PostgreSQL integration covers ownership, idempotent intent replay, conflicting replay, expiry, and duplicate completion. A local S3-compatible integration check rejected an oversized upload and checksum mismatch and confirmed anonymous reads of the sealed object receive a denial. Real ClamAV and FFmpeg integration tests verified scan, bounded transcode, private rendition/poster, reviewer-scoped preview, optimistic approval, public read only while the listing remains published, audio-caption enforcement, and a valid timed cue; EICAR and invalid caption timing are rejected. Full integration passed 36 tests on 2026-09-24 before the audio-caption case was added. On 2026-09-25, a served local browser uploaded a silent MP4 from the Vendor workspace, displayed its processed reviewer preview at 1280 × 720 with one-second duration, approved it, played the public storefront video, and unpublished the listing. The storefront then showed zero offerings and the public video/poster routes returned 403. The disposable fixture and all four object-store keys were removed and verified absent. Independent accessibility acceptance, operational media retention cleanup, and remaining phase-exit quality evidence are still needed.
