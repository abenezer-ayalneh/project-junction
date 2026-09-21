# UX, Design System, and Responsiveness

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-013`, `DEC-061`, `DEC-062`, `DEC-117`, `DEC-118`, `DEC-126`, `DEC-175`, `DEC-176`

The future client is one adaptive, mobile-first installable PWA. It uses a neutral global marketplace visual language—cool neutrals, blue/indigo, restrained promotional color—with light, dark, and system theme choices. Synthetic Dire Dawa context comes through honest seed content/images, not decorative cultural stereotypes.

The target component basis is Tailwind plus shadcn/Radix-style primitives, but this is an architectural/design choice, not an implemented dependency. Design tokens must cover typography, spacing, color/contrast, elevation, semantic states, focus, motion, error/success, money/time, data density, and responsive breakpoints. Mobile interactions must keep Cart/Checkout price/policy/hold status legible; desktop must not conceal operational tables/approval evidence.

Responsive design, keyboard/focus, reduced motion, accessible dialogs, durable form drafts, and visible low-connectivity/retry status are functional requirements. Public video controls/captions/no-speech metadata are first-class content requirements, not an afterthought.
