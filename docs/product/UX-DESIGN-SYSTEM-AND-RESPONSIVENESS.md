# UX, Design System, and Responsiveness

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-013`, `DEC-061`, `DEC-062`, `DEC-117`, `DEC-118`, `DEC-126`, `DEC-175`, `DEC-176`

The future client is one adaptive, mobile-first installable PWA. It uses the stock shadcn/ui neutral visual language and Lucide icons, with Light, Dark, and System choices. System is the initial preference; an explicit choice persists in the current browser before and after sign-in. Junction red (`#e23247`) is limited to the product mark and restrained brand accents, while semantic colors communicate state. Synthetic Dire Dawa context comes through honest seed content/images, not decorative cultural stereotypes.

The target component basis is Tailwind plus stock shadcn/ui primitives and semantic CSS-variable/OKLCH tokens. Components use the standard neutral appearance without a Junction control palette. Design tokens must cover typography, spacing, color/contrast, elevation, semantic states, focus, motion, error/success, money/time, data density, and responsive breakpoints. Vendor identity comes from logo, cover, and content; a Vendor-selected accent color is excluded. Mobile interactions must keep Cart/Checkout price/policy/hold status legible; desktop must not conceal operational tables/approval evidence.

Responsive design, keyboard/focus, reduced motion, accessible dialogs, durable form drafts, and visible low-connectivity/retry status are functional requirements. Public video controls/captions/no-speech metadata are first-class content requirements, not an afterthought.
