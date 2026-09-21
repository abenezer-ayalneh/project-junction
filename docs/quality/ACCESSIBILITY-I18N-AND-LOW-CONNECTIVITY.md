# Accessibility, I18N, and Low Connectivity Quality

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-012`, `DEC-013`, `DEC-061`, `DEC-062`, `DEC-126`, `DEC-175`, `DEC-176`

The public target is WCAG 2.2 AA. Future evidence must cover keyboard-only task completion, visible focus, semantic landmarks/headings, color contrast, error/validation announcements, touch target size, dialogs, tables, time zone/date clarity, reduced motion, screen-reader flows, captions/no-speech declaration for public short videos, and responsive layouts at narrow and wide viewports.

English is complete. All human-visible strings must be externalizable; pseudo-localization must detect clipping, concatenation, hard-coded date/currency/number formats, and bidirectional assumptions. Human-reviewed translations are a future capability, not auto-published machine translations.

Low-connectivity tests use slow/offline/reconnect simulations. Cacheable public shell/media and locally saved non-authoritative drafts may work offline. Availability, Checkout, payment, Booking creation/amendment, support submission with evidence, and any money mutation require a current connection and must explain retry/reconciliation rather than claim offline success.
