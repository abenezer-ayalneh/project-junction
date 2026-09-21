# Phase 01 — Vendor Supply and Discovery

**Status:** Specified — Not Executed — Not Verified  
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
