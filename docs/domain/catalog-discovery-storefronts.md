# Catalog, Storefronts, Discovery, and Analytics

> **Status:** Planned domain behavior; no catalog, search index, or analytics pipeline exists.

## Vendor-owned catalog

Every Listing belongs to one Vendor. Junction does not normalize several Vendors onto one canonical marketplace Product. Similar items remain independent Listings with independent descriptions, media, variants, price, policy, publication, inventory, and reputation. `[DEC-016]`

Release 1 Product structures are:

- **simple Product:** one sellable SKU; or
- **variant Product:** a finite set of selectable variants, each mapped to a Vendor SKU. `[DEC-102]`

Release 1 Services are fixed-price, fixed-duration appointment offerings. A Service exposes one or more Options and declared add-ons whose price and duration effects are known before selection. `[DEC-007, DEC-021, DEC-045]`

## Storefront

A Vendor Storefront may contain Products, Services, or both. `[DEC-009]`

Customization is structured rather than free-form. The intended model includes Vendor identity, logo/cover, description, restrained accent token, Locations, selected policies, curated offering collections, and moderated Vendor updates. There is no page builder, arbitrary HTML/CSS, custom theme upload, or independent Storefront application. `[DEC-130]`

## Taxonomies and category policy

Product and Service taxonomies are separately typed. Shared discovery themes may point into both, but a Product category cannot be accidentally assigned to a Service and vice versa. `[DEC-044]`

Only low-risk categories may publish in Release 1. Controlled goods; medical, financial, and legal services; adult content; weapons; alcohol; regulated categories; and digital goods are excluded. `[DEC-046]`

Category admission does not guarantee publication. Risk-based rules may hold a Listing/media submission for human review, decision, and appeal. `[DEC-047, DEC-063]`

## Publication semantics

Catalog must represent at least these semantic conditions, although final state names remain a state-machine design choice:

- Vendor-editable and not public;
- submitted/awaiting automated or human checks;
- public and discoverable;
- rejected with actionable reason/appeal path;
- removed or suspended from discovery without erasing history; and
- archived by the Vendor.

Only Catalog owns authoritative publication eligibility. Search, recommendations, CDN URLs, and stale client caches cannot publish content. `[DEC-047, DEC-087, DEC-088]`

## CSV import and export

Products, variants, and stock support versioned CSV templates. `[DEC-048]`

The import contract requires:

1. template/version detection;
2. parse and schema validation;
3. dry run with row-level errors and warnings;
4. preview of creates/updates and stock effects;
5. explicit commit using an idempotency identity;
6. an immutable result report; and
7. safe replay returning the original outcome rather than duplicating Products, variants, or movements.

Stock rows never overwrite an opaque “quantity” column directly; committed changes become audited stock movements owned by Inventory. `[DEC-049]`

Export returns Vendor-scoped data in the current versioned template and must not leak another Vendor or private moderation/provider metadata.

## Search

Unified discovery offers explicit Product and Service verticals. Search/filter facets differ by vertical while common navigation can cover Vendor, Location, category, price, reputation, and relevance. Service results may include calculated availability summaries; Product results may include Location/fulfillment eligibility, but neither projection is authoritative at checkout. `[DEC-042, DEC-125]`

Meilisearch is a disposable projection populated from PostgreSQL outbox events and rebuildable from authoritative data. A lost/stale index may degrade discovery; it must never change publication, stock, price, or Booking truth. `[DEC-087]`

## Recommendations

Recommendations are explainable deterministic rules. Each recommendation result should be able to state factors such as category/theme match, saved/followed preference, location relevance, availability, price, popularity, or recent Vendor update. It must not be described as AI/ML unless a future, separately documented model truly exists. `[DEC-043]`

Default recommendations use non-personal context. If behavioral personalization is introduced, it must be consented, resettable, revocable, and derived from the privacy-minimized first-party event boundary rather than fingerprinting or third-party trackers. `[DEC-043, DEC-123]`

## Engagement

Allowed social/discovery persistence is limited to:

- Product wishlists;
- saved Services;
- saved searches;
- Vendor follows; and
- moderated Vendor updates. `[DEC-051]`

No unrestricted public Q&A, general social feed, follower-to-follower messaging, or engagement gamification is implied.

## Vendor analytics

Vendors receive operational/funnel analytics needed to understand discovery and commerce, such as Listing views, search appearance, saves/follows, Cart progression, checkout conversion, fulfillment/Booking outcomes, cancellations/returns, and availability gaps. `[DEC-052]`

Events are typed, first-party, privacy-minimized PostgreSQL projections. Session replay, fingerprinting, and third-party behavioral analytics are prohibited. `[DEC-123]`

Analytics is advisory: it cannot become payment, inventory, booking, or publication truth.

## Media references

Listings reference Media-owned immutable safe renditions after upload validation, scan, transformation, and moderation readiness. Catalog never trusts a caller-supplied storage URL and never publishes quarantined/private objects. `[DEC-088]`

The chat confirmed support for media processing but did not confirm exact public video duration/size, audio-caption policy, or attachment limits; those values must remain proposed until the User confirms them.

## Acceptance criteria

- Vendor A cannot see/edit/import/export Vendor B’s catalog.
- A CSV replay produces the original result and no extra stock movement. `[DEC-048]`
- Prohibited/held content cannot surface through search, direct Listing route, recommendation, cached page, or object URL. `[DEC-046, DEC-047]`
- Rebuilding Meilisearch yields the current public catalog without changing authoritative state. `[DEC-087]`
- Recommendation output exposes a human-readable reason and contains no fake ML claim. `[DEC-043]`
- Simple/variant selection always resolves to one SKU before stock is checked. `[DEC-018, DEC-102]`
- Staff assignment never changes a Service Option’s commercial/time contract. `[DEC-149]`
- Analytics contains no raw secrets, message bodies, session replay, fingerprint, or unnecessary personal data. `[DEC-123]`
