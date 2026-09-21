# Accessibility, I18N, and Low Connectivity

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-011`–`DEC-013`, `DEC-061`, `DEC-062`, `DEC-174`, `DEC-175`, `DEC-176`

The target meets WCAG 2.2 AA across public, Customer, Vendor, Staff, and Platform journeys. Required future proof includes keyboard-only completion, semantic structure, focus, contrast, screen-reader output, validation/error messages, touch target suitability, dialogs, data tables, time zone clarity, reduced motion, and accessible realtime updates.

English is complete. All visible text and formats are internationalization-ready; pseudo-localization exposes clipping, concatenation, hard-coded formats, and bidirectional assumptions. Human-reviewed translations are future work; generated translations are not silently published.

Low connectivity supports cached public shell/content, optimized media, drafts, and transparent idempotent retry where safe. Current availability, holds, payment, checkout, Booking creation/amendment, and other authoritative mutations require a live response. No UI may imply that offline data reserved stock, booked Staff, sent money, or completed a provider operation.

Personalization is opt-in. Public video requires captions or a no-speech declaration plus description.
