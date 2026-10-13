# Marketplace UI/UX Specification

**Document status:** accepted target specification from the User-approved research and documentation plan

**System claim:** **Implemented and accepted locally — complete Phase 01 Microsoft Edge scenario matrix recorded on 2026-10-12**

**Research date:** 2026-10-06; traffic ranking period: September 2026

**Decision coverage:** `DEC-191`–`DEC-193`; preserves `DEC-043`, `DEC-053`, `DEC-061`, `DEC-062`, `DEC-117`–`DEC-119`, `DEC-123`, `DEC-125`–`DEC-127`, `DEC-130`, `DEC-152`, `DEC-175`, and `DEC-190`

**Normative owner:** customer-facing marketplace composition, content hierarchy, and interactions

## Authority and intended outcome

Junction's target interface must support shopping for physical Products and booking fixed-duration Services through recognizable marketplace navigation, image-led discovery, useful comparison information, dedicated details, and clear commitment and aftercare flows. Products and Services receive equal prominence. Categories and Listings lead the homepage; legitimate promotions are secondary. These are User-confirmed directions, not optional inspiration (`DEC-191`–`DEC-193`).

The [UX design-system specification](UX-DESIGN-SYSTEM-AND-RESPONSIVENESS.md) retains ownership of component appearance, tokens, themes, icons, and styling rules. This document owns how those components compose a marketplace. The [frontend architecture](../architecture/FRONTEND-ARCHITECTURE.md) owns rendering and state boundaries; domain, policy, access, and release documents own business behavior. Context glossaries retain canonical meanings of Product, Service, Listing, Storefront, Location, Purchase, Order, and Booking.

The approved plan and direct selections are `USER-CONFIRMED`. Detailed layout defaults, card media proportions, and action-label recommendations below are `DERIVED-PLAN-DEFAULT` within that approved scope; they are not additional User decisions or measured benchmark outcomes. They guide implementation while preserving the authoritative constraints.

This is a target specification. The source inspection below is not served-UI acceptance. Writing this document does not implement a screen, change an API, complete a phase, or enable public commerce. Development and acceptance testing must run on the User's local machine. Remote marketplace research is reference gathering; historical staging plans do not authorize development, testing, or deployment on a remote host.

## Research selection and evidence

“Most widely used” is operationalized as the top three website domains in Similarweb's **worldwide Marketplace category, all traffic, September 2026**, updated 2026-10-01 and retrieved 2026-10-06. This reproducible selection is about estimated website visits, not unique shoppers, app usage, revenue, or totals across each brand's country domains. [Ranking source, `REF-023`](https://www.similarweb.com/top-websites/e-commerce-and-shopping/marketplace/).

| Rank | Benchmark             | Inspected material                                                                                                          | Evidence boundary                                                                                                                                                                                |
| ---- | --------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Amazon (`amazon.com`) | Public homepage in the local browser; official Listing and Featured Offer guidance (`REF-024`–`REF-026`)                    | Homepage reflected an anonymous visitor with an Ethiopia delivery context. Seller guidance documents patterns; no signed-in checkout or conversion experiment was executed.                      |
| 2    | Temu (`temu.com`)     | Indexed first-party product landing-page content and purchase FAQ (`REF-030`, `REF-031`)                                    | Live browser navigation was blocked; homepage extraction was empty. Indexed product text supports the findings below, but current responsive layout and interactions were not directly verified. |
| 3    | eBay (`ebay.com`)     | Public homepage and a “phone case” search in the local browser; official search and feedback guidance (`REF-027`–`REF-029`) | Anonymous public browsing only. The dismissible shipping-context prompt, search, filters, and result information were inspected; no purchase or account action was completed.                    |

The [canonical source register](../governance/AUTHORITATIVE-SOURCE-REGISTER.md) records URLs, retrieval dates, drift risks, and refresh triggers. Research pages vary by region, session, and campaign. The benchmark summaries are observations or first-party descriptions. Expected usability benefits are **inferences**, not proof that a particular pattern caused popularity or will increase Junction's conversion. Refresh a benchmark before claiming its current implementation; retain this dated ranking as the selection snapshot.

### Selected patterns and their adaptation

| Benchmark pattern                            | Observed or described evidence                                                                                                                                                                                                               | Expected benefit (inference)                                                  | Junction adaptation                                                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Amazon: search and category access           | Homepage places department selection and search in the main header, with shopping categories beneath it. [Homepage](https://www.amazon.com/) (`REF-024`).                                                                                    | Makes an intentional search and an exploratory browse easy to start.          | Persistent marketplace search with equally visible Products and Services entry points.                                        |
| Amazon: product information and variations   | Official guidance describes images, titles, descriptions, and grouped variants. [Listing guide](https://sell.amazon.com/blog/amazon-product-listings) (`REF-025`).                                                                           | Helps a shopper understand and select the offering before committing.         | A dedicated Vendor-owned Product detail view with gallery and explicit SKU selection.                                         |
| Amazon: grouped purchase decisions           | Featured Offer guidance groups price, shipping attributes, and purchase actions near the top of a detail page. [Featured Offer](https://sell.amazon.com/uk/blog/buy-box-featured-offer) (`REF-026`).                                         | Reduces searching between disconnected price, delivery, and action controls.  | Group price, quantity, Location/fulfillment eligibility, policy summary, and Add to Cart; availability remains authoritative. |
| eBay: search refinement and revisiting       | Public results show item-specific filters, sorting, query context, prices, delivery information, and Save this search. [Search guidance](https://www.ebay.com/help/Buying/Finding_Items_Managing_Purchases/Search_tips?id=4006) (`REF-028`). | Supports narrowing a large catalog and returning to a useful query.           | Typed, URL-owned filters; visible applied selections; supported saved searches; explicit pagination.                          |
| eBay: seller reputation                      | Result information identifies the seller; official feedback profiles describe verified-purchase feedback. [Feedback profiles](https://www.ebay.com/help/Account/Settings/Feedback_profiles?id=4204) (`REF-029`).                             | Gives shoppers relevant context about who fulfills the commitment.            | Display Vendor identity and genuine review aggregates when available; apply Junction's own review-entitlement rules.          |
| Temu: product scanning and related discovery | Indexed product content includes images, title, seller, price, review information, Add to Cart, and related offerings (`REF-030`).                                                                                                           | Makes comparison and continuation possible without reading every description. | Image-led cards with stable information order; contextual related Products or Services using supported, explainable rules.    |
| Temu: order and help continuity              | Its first-party FAQ describes confirmation and revisiting order information through Your orders. [Purchase FAQ](https://www.temu.com/kr-en/support/c3/-purchase-an--on-temu-f-4-s-158.html) (`REF-031`, indexed evidence).                   | Gives a shopper a clear destination after commitment.                         | Confirmation links to a Purchase with separately actionable Orders and Bookings, plus contextual support.                     |

### Adopt, adapt, and exclude

| Treatment | Pattern or boundary                                                                                                                                   | Existing authority and decision                                                                                                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adopt     | Search, category access, imagery, comparison information, and clear detail actions                                                                    | Marketplace presentation under `DEC-191`; typed discovery under `DEC-042`–`DEC-044`.                                                                                                                                       |
| Adapt     | Goods-focused navigation and merchandising                                                                                                            | Equal Product/Service prominence (`DEC-192`); physical Products and fixed-duration Services retain distinct detail and selection flows.                                                                                    |
| Adapt     | Benchmark purchase areas and fast commitment                                                                                                          | Public browse, local/non-authoritative anonymous Cart, verified target checkout, and all-or-nothing hold remain governed by `DEC-053`, `DEC-125`, `DEC-152`. No shortcut bypasses quote, policy, identity, or hold checks. |
| Adapt     | Recommendations, deals, ratings, and seller signals                                                                                                   | Explainable, opt-in personalization (`DEC-043`, `DEC-123`, `DEC-175`); category-led home (`DEC-193`); actual campaign and review evidence. Platform approval is not a claim of commercial KYB or a purchase guarantee.     |
| Exclude   | Importing Amazon's shared product page and competing seller-offer model                                                                               | Junction Listings are Vendor-owned; no shared canonical catalog (`DEC-016`, `DEC-045`, `DEC-130`; [catalog authority](../domain/VENDOR-STOREFRONT-CATALOG-AND-DISCOVERY.md)).                                              |
| Exclude   | Auctions, negotiation, C2C, wallet/credit rewards, or expanded return promises                                                                        | Preserve [scope exclusions](SCOPE-AND-EXCLUSIONS.md), fixed prices, deferred loyalty, and Junction's policy snapshots. These business models are outside this UI research change.                                          |
| Exclude   | Fabricated ratings, discounts, sales counts, stock pressure, promises, or resettable promotional timers                                               | Truthful claims and authoritative price/availability; `DEC-004`, `DEC-005`, `DEC-062`, `DEC-123`. A genuine checkout-hold timer communicates an actual reservation expiry.                                                 |
| Exclude   | Default behavioral personalization, third-party tracking, social feeds, public Q&A, autoplay merchandising, and compulsory app-download interruptions | Opt-in recommendations, minimized first-party analytics, bounded engagement, public-video accessibility, and low-connectivity requirements.                                                                                |
| Preserve  | Neutral controls, Lucide icons, browser-local Light/Dark/System choice, restrained Junction red, neutral Storefronts                                  | User reconfirmed `DEC-117`, `DEC-118`, `DEC-126`, `DEC-130`; no visual decision is superseded.                                                                                                                             |

Excluded benchmark mechanisms are not proposals to change Junction's business model. If a later implementation proposes any incompatible rule, stop that dependent change and use **grill-with-docs** to present the conflicting normative wording, a concrete scenario, and a recommended choice. Ask one question at a time; record an explicit answer and supersession before changing authority. Do not add interface requirements to context glossaries.

## Marketplace shell and homepage

### Navigation and first viewport

The desktop header contains the Junction mark/home link, prominent labeled search, saved items, account, and Cart when each destination is supported. An adjacent navigation row exposes **Products**, **Services**, and category access with equal visual weight. Public shopping navigation precedes role-workspace links; Vendor, Staff, and Platform work remains within the existing tailored shells. Help and the appearance menu remain reachable. Keep an honest environment/demo disclosure visible without replacing the shopping content with engineering explanations.

On mobile, put the mark, account, and supported Cart access in a compact row, followed by a full-width search field and equally visible Products/Services links. Category access must be operable by touch and keyboard; essential navigation cannot depend on hover. Do not hide Services under a generic “More” menu. Explicit location choices may refine discovery; do not require geolocation permission or infer a delivery address from a browsing location.

The homepage sequence is fixed:

1. Marketplace header and equal vertical navigation.
2. Compact introduction with **Shop products** and **Explore services**, with equal emphasis.
3. Equal category-entry groups for Products and Services using admitted categories and relevant licensed or properly labeled fixture imagery.
4. Separate Product and Service discovery sections, each with a heading, image-led Listings, and **View all products** or **View all services**.
5. Approved public Vendor discovery with links to structured Storefronts.
6. Contextual related/recommended content and compact legitimate promotions when supported, then help/policy/footer destinations.

At desktop width, show the two category groups and the starts of both Listing sections side by side. On phones, both vertical actions and category-group headings must appear before the first long Listing grid; subsequent Listing sections stack with the same heading treatment and initial item limit. Both remain discoverable even if one catalog is empty. No full-screen marketing hero, signup wall, rotating banner, or promotion must displace category entry from the first viewport.

Default discovery uses query/category context or editorial selection of actually published Listings. Personalized sections require the existing explicit opt-in and a visible explanation. Labels such as “Best sellers,” “Near you,” “Available today,” and “Deals” require the corresponding data; use accurate headings such as “Explore products” when that evidence is absent. If a destination or campaign is unsupported, omit its affordance rather than supplying a dead link or simulated success.

```text
Desktop home
Junction | Search Products and Services              | Saved | Account | Cart
Products | Services | Categories                    | Help  | Appearance
Short introduction: Shop products / Explore services
Product category entries              | Service category entries
Explore products: image-led Listings  | Explore services: image-led Listings
Public Vendor Storefronts
Supported related discovery / compact genuine campaign / footer

Mobile home
Junction                         Account / Cart
Search Products and Services
Products                 Services
Shop products            Explore services
Product categories       Service categories
Explore products / View all products / initial grid
Explore services / View all services / initial grid
Public Vendor Storefronts / help / footer
```

## Search, Listing cards, and detail views

### Search and category results

An unscoped search shows separately headed Product and Service result groups with direct access to each full vertical. Within a vertical, preserve the query and visibly identify the active type. Search, category, supported filters, sort, and pagination belong in shareable URL state. Opening a Listing and returning must restore the query, applied filters, result position, and loaded page where possible. Changing filters or sort resets the pagination cursor.

Desktop results use a filter sidebar beside the results region. Mobile exposes **Filter** and **Sort** above results; the filter sheet has **Apply filters** and **Clear filters**, retains unapplied edits until dismissed, and returns focus to its trigger. Applied filters remain visible outside the sheet as individually removable chips. Relevant criteria include category, price, and Vendor; fulfillment/location or service mode/duration criteria appear only when the public contract supports them. Do not render unimplemented criteria that silently do nothing.

Offer Relevance, Price: low to high, and Price: high to low only when the query service provides those orders across the full result set. Never sort only a fetched page while implying global ordering. Display an authoritative total when provided; otherwise state “N shown,” not an invented total. Use explicit **More products** or **More services** pagination and preserve access to the footer. Avoid automatic infinite scrolling. Empty results retain filters and offer **Clear filters**; an unavailable catalog is a separate error with **Try again**.

### Listing card information order

Each card presents: primary approved image → meaningful linked title → Vendor name/Storefront link → price → applicable selection/context → genuine rating/count when available → supported save action. Description excerpts are secondary and cannot replace imagery or price. Product cards show relevant variant context; Service cards show duration and in-person/online mode when known. Distinguish card links from save buttons and avoid nested interactive targets.

Use a square media area with a contained Product photograph; a Service image may cover the same reserved area without obscuring meaningful content. Reserve media dimensions to prevent layout shifts. A missing or failed image receives a neutral, labeled fallback. It must not substitute a random photograph or present an unrelated image as the offering. Responsive media, lazy loading below the first viewport, and on-demand captioned/no-speech video preserve the existing media and connectivity rules.

A simple offering shows its actual price and currency. If alternatives have different prices, show **From** plus the lowest selectable offering price; selection on detail reveals the exact price. Do not treat a missing base price as zero. Discounts and crossed-out comparison prices require valid price/promotion evidence. Missing reviews display “No reviews yet” on detail; listing cards omit an empty star strip. Never mix Product and Service rating dimensions or publish private Staff feedback.

### Product detail

Use a breadcrumb and a dedicated Listing destination. Desktop groups a gallery alongside title, Vendor link, relevant details, variant selection, and the purchase area. Mobile orders gallery → title/Vendor → price → variants/quantity → fulfillment/policy summary → action, then extended description/specifications, supported reviews, and contextual related Products.

The gallery provides labeled thumbnails, an accessible larger view, and an honest missing-media state. Explicitly selected variants determine the SKU and exact price. Quantity and selected Location determine applicable availability; browsing or adding to a Cart must not claim a reservation. Display eligible pickup/delivery choices and known fees/timing without guessing. The primary **Add to Cart** action validates required selections and reports a specific failure or an added-item summary with **View Cart** and **Continue shopping**.

Group price, selection, eligibility, fulfillment, and policy information near the action. If a mobile purchase summary is sticky, it must preserve access to fields, focus, errors, and footer content and show the selected price. Detailed returns and delivery rules link to their normative policies. A **Buy now** shortcut is not required by this specification; any future shortcut must satisfy the same authorized checkout contract.

### Service detail

Use the same gallery/title/Vendor foundation while presenting Service-specific selections: Service Option and add-ons → duration/exact price → eligible Location or online mode → named Staff or any qualified Staff → date and available time → cancellation/amendment summary → **Add appointment to Cart**.

Show the timezone with date/time selections. Slots are live authoritative availability, not a guarantee before the Checkout Hold. A slot conflict retains safe selections, explains that the time is unavailable, and offers refresh/alternative selection. Adding an intent is not a confirmed Booking. An offline view cannot imply that a Staff allocation succeeded. Actual confirmation follows the payment/hold lifecycle. Selection, amendment, cancellation, and Staff-consent behavior link to the [Services authority](../domain/SERVICES-SCHEDULING-AND-BOOKINGS.md).

```text
Desktop detail: gallery | title + Vendor + selection + price + policy + action
Mobile detail: gallery -> title/Vendor -> selection/price -> policy/action -> detail
Products select SKU/quantity/fulfillment; Services select Option/Staff/date/time.
```

## Vendor Storefront, Cart, and aftercare

### Vendor Storefront

Present structured cover/logo and display name, description, eligible public Locations, and genuine review context. Give Products and Services equal tab/link treatment when offered; clearly disclose an empty vertical without creating fake inventory. Supply Vendor-scoped search/filtering only when supported. Reuse Listing cards and detail destinations, and provide the existing **Follow Vendor** action when available. Branding uses Vendor-owned content with neutral controls; no page builder, theme selection, or Vendor control palette is introduced.

Publication, public access, and media revocation remain authoritative. An unpublished Listing or Storefront is unavailable even through a saved link; remove it from selectable recommendations and explain its unavailability. Storefronts do not expose private setup, review notes, membership, or pending content.

### Cart and checkout

The Cart preserves Vendor identity and clearly separates physical goods from appointment intents within each Vendor group. Goods show selected variants, quantities, one eligible fulfillment Location per group, pickup/delivery selection, and known fee/policy information. Service intents show Option/add-ons, Staff choice, Location/mode, date/time/timezone, and price. Editing/removal identifies the affected component. Show a clear empty Cart with paths to both verticals.

An anonymous Cart is local and non-authoritative. Explain that price/availability is checked at checkout. Sign-in visibly merges and reprices it, presenting conflicts for resolution before commitment. Unsupported Cart or checkout actions remain absent from earlier discovery milestones.

Desktop places the order summary beside selection/review fields; mobile places the summary after the groups and before the primary action. Keep item amounts, Vendor discounts, Platform campaign funding, delivery fees, and final currency/total legible. Coupons follow the existing stacking/allocation policy; unimplemented discounts do not receive decorative fields.

Checkout exposes: prerequisites → fulfillment/appointment review → final quote/policy review → actual Checkout Hold and payment → authoritative outcome. Label the entry action **Continue to checkout** and the payment confirmation with the payable amount and accurate sandbox context. Show the real hold expiry; editing a held selection requires the documented replacement/abandonment flow. Unavailable stock or Staff allocation blocks the coordinated attempt and identifies the necessary correction; never present unaffected components as purchased separately.

The target public-release path retains account/adult verification and restored MFA/Didit requirements. Under [`DEC-190`](../quality/AUTH-SIMPLIFICATION-DECISIONS.md), current local development defers MFA/Didit and leaves Users adult-unverified. This specification does not restore those screens, fabricate approval, or change the current local authentication policy. Future checkout must use its owning phase's authorized runtime policy; local acceptance cannot stand in for public-release restoration.

On hold expiry, retain safe Cart data and offer a fresh quote. A timeout/unknown payment result displays **Checking payment status** and an authoritative refresh/support path; it does not claim success or invite an uncontrolled second payment. Late success/refund follows the existing state machine. Confirmation appears only on authoritative success and links to the Purchase.

### Purchases, Orders, and Bookings

Show a Purchase's reference, receipt context, payment status, totals, and distinct Vendor Orders and Bookings. Goods use actual pickup/delivery progress and authorized handoff instructions; appointments show schedule, timezone, assigned Staff, mode, and the available join/attendance action. A failed notification does not change an authoritative outcome.

Expose **View Order**, **View Booking**, **Get help**, and only currently permitted **Cancel**, **Request return**, **Amend Booking**, **Join appointment**, or **Leave a review** actions. Policy eligibility and effects must be visible before a consequential confirmation. Cancellation/refund of one component leaves the others legible and intact. Product exchanges retain the prescribed return/refund/fresh-Purchase flow. Aftercare uses Junction's snapshotted rules, not a benchmark's guarantee or return window.

## Responsive behavior and shared states

Derived layout defaults implement the approved hierarchy without changing component styling: one card column at very narrow widths/expanded text, two on typical phones, three on tablets, and four on wide desktop result pages. Equal homepage sections can use fewer columns within their allotted width. Maintain meaningful titles, readable prices, stable media proportions, and usable targets rather than squeezing a fixed column count. Verify at 320, 390, 768, 1024, and 1440 CSS pixels, plus 200%/400% zoom and pseudo-localization.

Keyboard access, focus restoration, visible focus, semantic headings/landmarks, accessible names, non-color status information, appropriate announcements, and reduced motion are mandatory. Use responsive sheets instead of desktop-only hover controls. Cached content shows its freshness/connection limits; availability and commitment still need live authority. Follow the [accessibility and low-connectivity specification](ACCESSIBILITY-I18N-AND-LOW-CONNECTIVITY.md) and existing performance requirements.

| State                          | Required presentation and recovery                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Initial loading                | Reserve the intended media/layout space; label loading without fabricated prices, ratings, or stock.              |
| Empty catalog/vertical         | Identify the empty Product or Service section and preserve the other vertical and useful navigation.              |
| No matching results            | Retain query/filters and offer Clear filters; distinguish this from catalog failure.                              |
| Service unavailable            | Preserve safe input and existing readable content; offer Try again without converting failure into zero results.  |
| Missing media/reviews          | Show the media fallback; omit unearned card ratings and state No reviews yet on detail.                           |
| Validation error               | Explain the specific selection/field and move focus appropriately; preserve valid input.                          |
| Restricted/unpublished content | Explain unavailability and offer safe public discovery; reveal no private review content.                         |
| Offline/stale content          | Identify cached information; prevent reservation/payment/Booking success claims without a live response.          |
| Stock/slot conflict            | Identify the affected selection, refresh authoritative alternatives, and require a corrected coordinated attempt. |
| Hold expired/payment uncertain | Show distinct states and the corresponding fresh-quote or status-reconciliation path.                             |
| Success                        | Summarize the completed action accurately and provide the next relevant destination.                              |

## Current implementation gaps and phase ownership

Source inspection on 2026-10-06 found text-led public cards and only home/Storefront public routes. Public browse supports `kind`, `category`, `q`, `cursor`, and `limit`; its Listing summary contains basic offering fields and optional short-video metadata. Vendor summaries contain ID/slug, and Storefront reads contain display name/description/Locations/Listings. This is a scoped source snapshot, not an assertion that any served journey passed.

Snapshot evidence: [public contracts](../../libs/contracts/src/lib/api.ts), [marketplace read facade](../../apps/web/src/lib/marketplace.ts), [public homepage](../../apps/web/src/app/page.tsx), and [Storefront route](../../apps/web/src/app/vendors/[slug]/page.tsx).

| Needed information/capability                               | Gap and owning slice                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Approved Listing photographs/gallery; Storefront logo/cover | No photograph/gallery or structured image branding fields in the inspected public contracts. Extend the authorized media/publication path in Phase 01; a video reference is not a complete image gallery.                                                                                                                                                                                                    |
| Vendor attribution in browse results                        | No Vendor ID/name/slug attribution in the inspected Listing summary. Phase 01 must supply sufficient public identity and a Storefront destination.                                                                                                                                                                                                                                                           |
| Dedicated Listing detail reads/destinations                 | No dedicated public detail route/read was found in the inspected web/API facade. Phase 01 must support a published, Vendor-owned Listing destination; transaction selectors follow their owning phases.                                                                                                                                                                                                      |
| Filters, sort, totals, and scoped Storefront search         | The inspected browse contract lacks richer criteria, explicit sort, total counts, and those Storefront queries. Phase 01 must implement authoritative query behavior before showing the controls.                                                                                                                                                                                                            |
| Review aggregates and eligibility                           | Public contracts lack aggregates/entitlement context. Phase 05 owns reputation and aftercare; omit ratings until genuine approved data exists.                                                                                                                                                                                                                                                               |
| Product availability and fulfillment eligibility            | The existing inventory seam does not supply the complete Customer purchase context. Phase 02 owns SKU/Location stock, delivery/pickup eligibility, and product actions.                                                                                                                                                                                                                                      |
| Service Options, Staff, slots, and appointment selection    | Basic Service price/duration is insufficient for live selection. Phase 03 owns scheduling and Booking behavior.                                                                                                                                                                                                                                                                                              |
| Cart, quote/hold, payment, and outcome commands             | Phase 02 goods Product selection and browser-local Cart/quote/hold/release UI are locally verified under P02-C06. Controlled local payment/Order APIs and Cart AwaitingPayment/commit refresh are verified under P02-C07. Unified mixed Cart, sandbox payment/outcome and private Purchase receipt UI are locally verified under P04-C07; future aftercare actions and formal release gates remain separate. |

These are required capabilities and information, not invented endpoints, JSON shapes, or implementation evidence. Extend shared public contracts through the existing API conventions and authorization boundaries. Do not fetch private Vendor data to fill public presentation gaps or manufacture client-side business truth.

| Phase owner                                                             | Presentation requirement(s)                                                                                        | Acceptance scenarios                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| [Phase 01](../requirements/PHASE-01-VENDOR-SUPPLY-AND-DISCOVERY.md)     | `REQ-P01-UX-001` shell/home; `REQ-P01-UX-002` discovery state/refinement; `REQ-P01-UX-003` cards/detail/Storefront | `TST-P01-005`–`TST-P01-007`           |
| [Phase 02](../requirements/PHASE-02-GOODS-COMMERCE.md)                  | `REQ-P02-UX-001` Product selection, fulfillment, and goods purchase presentation                                   | `TST-P02-004`                         |
| [Phase 03](../requirements/PHASE-03-SERVICES-AND-BOOKINGS.md)           | `REQ-P03-UX-001` Service selection and Booking presentation                                                        | `TST-P03-004`                         |
| [Phase 04](../requirements/PHASE-04-UNIFIED-COMMERCE-AND-FINANCE.md)    | `REQ-P04-UX-001` unified Cart/checkout/Purchase presentation                                                       | `TST-P04-004`                         |
| [Phase 05](../requirements/PHASE-05-TRUST-OPERATIONS-AND-ENGAGEMENT.md) | `REQ-P05-UX-001` aftercare, reputation, and opt-in engagement                                                      | `TST-P05-005`                         |
| [Phase 06](../requirements/PHASE-06-HARDENING-AND-PUBLIC-RELEASE.md)    | `REQ-P06-UX-001` complete responsive/accessibility/connectivity acceptance                                         | `TST-P06-006`, existing `TST-P06-004` |

Phase files own requirement outcome wording; this document specifies presentation, and the [acceptance catalog](../quality/PHASE-ACCEPTANCE-CATALOG.md) owns scenario identifiers. Deliver these interfaces with the corresponding capability, rather than treating marketplace design as optional Phase 06 decoration. The mapping preserves phase order, historical evidence, and current phase status; it does not reopen or claim to have completed an earlier dated acceptance record.

## Local acceptance

The checks below were completed in the served local application with disposable data and recorded on 2026-10-12. Browser screenshots support presentation findings; contract, integration, and state evidence establish authorization, publication, revocation, and storage behavior.

| Scenario      | Concrete local checks                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TST-P01-005` | On desktop and phone, find both Products and Services without opening a secondary menu; exercise both category groups, detail entry, and return navigation. With either vertical empty, its entry remains visible and the other remains usable. Unsupported destinations have no dead action.                                                                                                             |
| `TST-P01-006` | Search, apply/remove filters, sort, paginate, open a Listing, return, share the URL, and reload. State is preserved, changed criteria reset pagination, and sorting applies to the full queried set. Check empty versus unavailable responses, retry, and the mobile filter sheet's Apply/Clear/focus behavior.                                                                                           |
| `TST-P01-007` | Check simple/variant price display, Vendor attribution, approved images, missing/broken images, long titles, absent reviews, and structured Storefront navigation. Unpublishing prevents saved/direct detail and revoked-media access. No missing base price becomes zero and no fixture claim appears as real reputation.                                                                                |
| `TST-P02-004` | Select variants/quantity/Location and eligible pickup/delivery, inspect exact price and policies, then add to Cart. Exercise absent selections, stock conflicts, failed reads, and safe retry. Cart additions never claim stock reservation.                                                                                                                                                              |
| `TST-P03-004` | Select Service Option/add-ons/mode/Staff/date/time with timezone visible. Exercise a concurrent slot loss, offline attempt, and failed refresh while preserving safe selections. An intent becomes a confirmed Booking only through the authorized outcome.                                                                                                                                               |
| `TST-P04-004` | Merge/reprice an anonymous mixed multi-Vendor Cart after sign-in; review conflicts, fees, totals, and policies. Exercise unavailable components, hold expiry/replacement, unknown payment, retry/reconciliation, late success/refund, and confirmation. No partial purchase or duplicate payment is inferred. Apply `DEC-190` accurately during local checks and retain the pre-release restoration gate. |
| `TST-P05-005` | Inspect independent Order/Booking states and permitted support/cancel/return/amend/join/review actions. Partial cancellation leaves other components intact; only entitled reviews create public aggregates. Personalization starts off and opt-out returns to non-personal context.                                                                                                                      |
| `TST-P06-006` | Complete the supported discovery-to-aftercare flows at the specified widths, themes, zoom levels, and pseudo-locale. Verify keyboard/screen-reader feedback, touch targets, reduced motion, captions/no-speech video, slow-network media/layout, cached-content disclosure, and blocked offline commitments. Record actual performance against existing budgets.                                          |

The definition of done is an evidenced shopping journey with genuine content, functioning navigation and selection, visible authoritative outcomes, and tested recovery.

Local Phase 02 Product/Cart evidence: [P02-C06 captures and limits](../quality/evidence/phase-02-c06-2026-10-12/README.md). This does not close independent accessibility or formal public-release gates.
