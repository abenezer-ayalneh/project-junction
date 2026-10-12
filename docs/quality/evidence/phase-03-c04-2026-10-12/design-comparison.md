# P03-C04 design comparison — 2026-10-12

Disposition: preserve the incumbent system. C04 is an ordinary extension of Service detail and Cart, with no new visual world or approved system change. `apps/web/PRODUCT.md`, `apps/web/DESIGN.md` and `apps/web/.impeccable/design.json` are unchanged by this documenter pass.

## Evidence checked

- Documenter role, `reference/document.md` and `reference/craft-floor.md` from the local Impeccable skill.
- Incumbent `apps/web/PRODUCT.md`, `apps/web/DESIGN.md`, `.impeccable/design.json`, and `.impeccable/surfaces/apps-web-src-app-listings-listingid-page-tsx.md`.
- Actual source: `src/app/global.css`, `src/app/layout.tsx`, `src/components/ui/button.tsx`, `src/components/product-selection.tsx`, `src/components/service-selection.tsx`, `src/components/appointment-intents.tsx`, `src/lib/appointment-intents.ts`, `src/app/listings/[listingId]/page.tsx`, `src/app/cart/page.tsx`, and `src/components/goods-cart.tsx`, all under `apps/web`.
- Local full-page captures: [Service desktop](service-desktop.png), [Service mobile](service-mobile.png), [Cart mobile](cart-mobile.png).
- [Finish review](finish-review.md) and [browser evidence](browser.json). Browser checks used loopback API/PostgreSQL and a local served Next build in Microsoft Edge; no staging, remote host or deployment was used.

## Scoped result

The implementation preserves the neutral background, foreground, border and muted tokens, existing gallery/header/footer, stock Button variants and native selects/date/checkbox controls. New Service fields, exact price/duration totals, statuses and actions are centered; the Cart appointment list uses the same neutral bordered grammar and centered summaries. No brand-red control recoloring, new decorative depth, motion or shipping raster asset was introduced.

The actual sequence matches THESIS/STORY: Option and add-ons determine price/duration; mode, Location and qualified Staff precede the visible timezone and date/time fields. Desktop pairs date/time; mobile stacks them. Refresh/reload and unreserved-intent wording are visible. Source rechecks current times before saving and retains safe selections through failed reads; Cart provides edit/remove and keeps Goods separate. The browser packet records real competing-hold slot loss, failed-read recovery, offline/reconnect prevention, timezone-aware editing, same-intent replacement and removal. These behavioral checks are packet evidence, not rerun by the documenter.

The three captures show readable populated controls and no clipping of the new selector or appointment content. The inherited missing-image gallery remains explicitly labeled. The existing mobile navigation clips at the right edge; this inherited issue is outside the narrow extension and is not canonized as a system rule.

## Five-line system summary

1. Palette: achromatic shadcn semantic surfaces and controls; brand red remains a small identity accent.
2. Type: inherited sans hierarchy; detail heading 36/48px, Cart heading 30px, section heading 20px, labels/support text 14px, emphasized totals 16px.
3. Layout rule: existing responsive gallery/detail topology; centered new selection fields and Cart appointment summaries.
4. Form rule: reuse the Goods field class, native controls and stock neutral Button variants, including disabled and visible-focus treatments.
5. State rule: explicit timezone, exact totals, actionable recovery and unreserved/unconfirmed status; no payment or Booking confirmation claim.

## Drift and limitations

PRODUCT.md still describes the Phase 00 foundation/private-staging capability boundary. DESIGN.md retains historical private-staging language and names Geist, while `global.css` declares a system sans stack and `layout.tsx` does not load Geist. The sidecar still describes an older indigo/Avenir operational world, rather than the current neutral source. These are pre-existing discrepancies: no new C04 typography identity is inferred, and verified Geist rendering is not claimed. They are reported without repair because this pass authorizes an existing-surface extension; current phase requirements and `docs/STATUS.md` own execution truth.

The finish review's `ship` disposition applies only to this narrow visual extension. This documenter pass does not independently establish contrast ratios, computed browser typography, keyboard/assistive-technology behavior, Dark/System rendering, full goods regression, phase acceptance or public-release readiness. Light screenshots and source inspection cannot establish those gates. No out-of-scope defect, stale token or historical capability statement was promoted into a new design rule.
