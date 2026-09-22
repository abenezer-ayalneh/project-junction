# Frontend Architecture

> **Document status:** specified
> **System claim:** **Specified — Not Executed — Not Verified**
> **Decision coverage:** [`DEC-012`–`DEC-013`, `DEC-053`, `DEC-117`–`DEC-120`, `DEC-126`–`DEC-127`](../governance/DECISION-REGISTER.md)
> **Normative owner:** frontend application topology

## One adaptive application

Junction targets one Next.js App Router PWA with route groups and tailored shells for public discovery, Customer account, Vendor operations, Staff work, and Platform operations [DEC-127]. These are presentation boundaries, not separate security realms. NestJS re-authorizes every protected read and command.

Public discovery pages use Server Components where they improve first load, metadata, and low-connectivity behavior. TanStack Query client islands own interactive forms, Cart, availability, operational dashboards, and live updates. Business Server Actions or a duplicated Next BFF are excluded [DEC-119].

## Proposed route composition

Exact path names are a **DERIVED-PLAN-DEFAULT**:

- `(public)`: home, Product/Service search, detail, Vendor Storefront.
- `(customer)`: Cart, checkout, Purchases, Bookings, returns/disputes, messages, saved items, preferences.
- `(vendor)`: onboarding, Storefront, catalog, stock, Locations, Staff/schedule, Orders, Bookings, finance, analytics.
- `(staff)`: assigned schedule, Booking preparation, join/complete/no-show.
- `(platform)`: review queues, support, trust, finance, reconciliation, feature controls, audit.
- `(demo)`: workspace creation, persona disclosure/switching, quota/expiry status.

Back-office code is lazy-loaded and unavailable navigation is omitted, but bundle separation never substitutes for API authorization.

## State boundaries

- URL/search parameters own shareable discovery state.
- TanStack Query owns server-state cache and invalidation.
- Form state remains local to the workflow.
- Anonymous Cart is local and non-authoritative; sign-in performs visible merge/reprice/reavailability conflict resolution [DEC-152].
- The server session is held in Secure/HttpOnly cookies, never browser storage [DEC-071].
- WebSocket updates are hints; REST/query refetch is authoritative [DEC-124].

## UI foundation

The UI uses stock shadcn/ui components and Lucide icons over Tailwind 4 and semantic OKLCH CSS-variable tokens [DEC-117–DEC-118]. The standard neutral token preset owns component appearance. Junction red (`#e23247`) is limited to the product mark and restrained brand accents; semantic state colors retain their standard meaning. Local context is expressed by truthful synthetic content and imagery, not ornamental motifs [DEC-126]. Light, dark, and system modes are supported through a browser-local preference that defaults to System.

## Accessibility, i18n, and connectivity

- WCAG 2.2 AA is a release criterion.
- English is complete; all UI is structured for translation and pseudo-locale/expansion tests [DEC-012].
- Content, semantic order, keyboard operation, focus restoration, errors, live regions, contrast, zoom, reduced motion, and captions are part of component acceptance.
- The shell and appropriate public reads may cache; media is responsive/optimized; recoverable drafts and idempotent retries withstand intermittent service. Availability, payment, and mutations require live authoritative confirmation [DEC-062].
- Installability is supported, but offline commerce claims are prohibited.

## Verification required later

Server/client boundaries, hydration, navigation authorization, role-shell bundle loading, session revocation, pseudo-locale, keyboard/screen-reader, 200%/400% zoom, color modes, slow network, stale Cart merge, PWA install/update, and realtime fallback all require evidence before this document is marked verified.

## Related documents

- [API conventions](../interfaces/API-CONVENTIONS.md)
- [Realtime contracts](../interfaces/REALTIME-CONTRACTS.md)
- [Target system description](TARGET-SYSTEM-DESCRIPTION.md)
