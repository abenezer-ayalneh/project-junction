# Vendor Storefront, Catalog, and Discovery

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** Vendor offering and discovery behavior  
**Decision coverage:** `DEC-016`, `DEC-042`–`DEC-048`, `DEC-051`, `DEC-052`, `DEC-102`, `DEC-123`, `DEC-130`, `DEC-162`, `DEC-175`, `DEC-176`, `DEC-180`, `DEC-189`

Vendor applies → private setup → review → approved/rejected/restricted. Pending Vendor may prepare permitted private content but cannot publish or transact. Storefront is structured branding, not a page builder. Listings are Vendor-owned; Product Listings use simple/variant structures, Services use fixed-duration Options/add-ons; there is no shared canonical catalog.

`POL-CAT-001` permits only low-risk fixed-price physical goods and non-regulated appointments. `POL-CAT-002` uses risk-based publication: new/flagged/high-impact revisions may require review, routine validated revisions can publish, and every public revision remains versioned/auditable/reversible. CSV import/export is versioned, dry-run, previewed, row-error aware, and idempotent.

Search has typed Product and Service verticals. PostgreSQL is source truth; search projections are rebuildable. Recommendations are explainable rules and require opt-in for personalized behavior. Engagement is wishlists, saved services/searches, follows, and Vendor updates—not public feed/comments/creator/livestream commerce. Vendor analytics is first-party, minimized and scope-limited; no session replay/fingerprinting/third-party behavior tracking.

Media moves through quarantine before public use. Short public video must contain captions, or explicit no-speech declaration plus description. `EVT-LISTING-*`, `EVT-IMPORT-*`, `EVT-MEDIA-*` drive projections but never make a projection authoritative.
