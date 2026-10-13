# P04-C07 design finish review — 2026-10-13

Disposition: **ship the local chunk**. The unified checkout and Purchase surfaces extend the incumbent neutral shadcn/ui system with centered, literal copy. No material design fixes are required within this chunk. This disposition is a bounded local review, not a public-release or independent accessibility acceptance.

## Scope and evidence

Reviewed `apps/web/DESIGN.md`, `apps/web/PRODUCT.md`, `apps/web/.impeccable/design.json`, `apps/web/src/app/global.css`, the root layout, and the completed `unified-checkout.tsx`, `checkout-review.tsx`, and `purchase-detail.tsx` components. Compared the seven local served captures below with the component source. The detector artifact contains no findings (`detector.json`: `[]`); this does not replace visual inspection.

| Capture                                      | Finish evidence                                                                                                                                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [quote-desktop.png](quote-desktop.png)       | Browser selections and account Checkout remain separate in two columns. Vendor groups, goods, appointment details, policies, fees, discounts and total precede the reservation action.                                  |
| [quote-mobile.png](quote-mobile.png)         | Single-column flow preserves the same content and centered controls; location references wrap and the reservation action remains readable.                                                                              |
| [unknown-mobile.png](unknown-mobile.png)     | The original deadline, abandonment consequence, payment reference, unresolved outcome and instruction against another payment are explicit. Local sandbox result controls are disclosed as controlled provider results. |
| [outcome-desktop.png](outcome-desktop.png)   | Confirmed Purchase is distinguished from the committed hold and links to the Purchase and non-tax receipt.                                                                                                              |
| [outcome-mobile.png](outcome-mobile.png)     | Payment reference wraps; confirmation and receipt action remain legible in the stacked layout.                                                                                                                          |
| [purchase-desktop.png](purchase-desktop.png) | Captured/refunded/pending amounts, two Orders, one Booking and original receipt use clear heading and divider hierarchy.                                                                                                |
| [purchase-mobile.png](purchase-mobile.png)   | Purchase, Order, Booking and location references wrap within the content; receipt details, total and return action remain available.                                                                                    |

## Incumbent system comparison

- Palette: semantic neutral CSS variables own controls, surfaces, borders and text; Junction red remains confined to the shared brand mark. No new accent system appears.
- Type ramp: ordinary body and small policy text, semibold section headings and emphasized totals follow the existing stock scale. The intended family in DESIGN.md is Geist; the sampled global stylesheet and root layout currently select a system sans stack, recorded below as existing drift.
- Layout rule: centered text and wrapped action groups follow the user preference. Checkout switches from one column to the existing large-screen two-column composition; Purchase uses a centered reading column.
- Shape and depth rule: stock rounded controls and light divider strokes organize the flow. No decorative panels, added shadows, glass effects or motion create a competing aesthetic.
- Copy and state rule: sandbox, unreserved selections, authoritative status recovery, reservation deadline and non-tax receipt wording remain explicit. Destructive checkout abandonment states its reservation and late-payment consequences.

No comp or new visual world was necessary for this ordinary extension. `apps/web/DESIGN.md` and its sidecar were preserved rather than rewritten to legitimize source or documentation drift.

## Existing drift and limits

The existing sidecar still describes an earlier indigo/Avenir operational-briefing world, synthetic status snippets and a proof-panel shadow; it does not describe the current neutral shadcn system in DESIGN.md or the inspected checkout. DESIGN.md also retains approximate, non-literal token values and private-staging terminology, while PRODUCT.md describes the earlier foundation audience and capability boundary. Global CSS uses a system sans stack despite DESIGN.md naming Geist. These incumbent discrepancies are reported, not canonized or repaired, because this chunk does not authorize a system or product-document refresh.

The shared mobile navigation clips the Vendor workspace label at the viewport edge in the mobile captures. It is existing shared-shell behavior outside P04-C07; the checkout and Purchase content inspected here remains contained. This limitation is not adopted as a design rule.

The captures cover light appearance, quote, unknown payment, confirmation and Purchase states at desktop/mobile sizes. They do not prove dark appearance, keyboard/screen-reader behavior, every error/merge state, or WCAG 2.2 AA acceptance. Source inspection confirms status semantics and recovery copy but does not substitute for those checks. All evidence was inspected on the user's local machine; no staging, remote acceptance testing or deployment was performed.
