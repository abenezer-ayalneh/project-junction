# Services, Scheduling, and Bookings

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** service allocation and attendance behavior  
**Decision coverage:** `DEC-019`–`DEC-021`, `DEC-029`, `DEC-032`–`DEC-036`, `DEC-050`, `DEC-098`–`DEC-101`, `DEC-134`, `DEC-135`, `DEC-139`, `DEC-147`, `DEC-149`, `DEC-150`, `DEC-156`, `DEC-164`, `DEC-165`, `DEC-181`, `DEC-184`, `DEC-185`, `DEC-188`

Service is a fixed-price, fixed-duration appointment with Options/add-ons whose price/time effect is known. Capacity is Staff-only: a Booking allocates exactly one qualified Staff member; no rooms/equipment/group seats or Staff-specific price/duration/buffer differences. Staff profile may have optional User link. Public Staff display requires consent; private qualified Staff may be selected through “any Staff.”

Junction’s scheduling calendar is authoritative: qualified Staff, recurring hours, exceptions, breaks, Location/mode, buffers, minimum notice, booking horizon, and current allocation determine availability. Read-only iCal is allowed; two-way Google/Microsoft sync is deferred. Booking is one Customer party with optional attendee detail and one occurrence; adult account holder remains accountable. Waitlist is notification-only.

Paid Booking confirms immediately after checkout. Any-Staff may be reassigned with notice; a named-Staff change needs Customer consent or cancellation/refund. Amendment can alter time, Staff, Location, Option, add-ons; it atomically swaps allocation and charges/refunds delta, retaining original on failure. Unchanged commercial components keep purchase price; changed/new use current price. In-person completion uses Customer code/QR plus Staff confirmation; online completion uses Junction join action plus Staff confirmation. No-show requires Staff evidence and Customer contest.

Public demo uses DemoMeet; private staging uses separately connected assigned-Staff Google Meet REST (not Calendar write/sync). Provisioning is async/idempotent/retriable, with protected replacement or auto-cancel/full refund by safety cutoff. No recording or transcription. Exact template policy is owned by [Policy Catalog](./POLICY-CATALOG-AND-SNAPSHOTS.md).

## Local implementation boundary — 2026-10-12

`P03-C01` locally implements fixed uniform Option/add-on commercial terms, Option-specific Staff qualification, Vendor Location/online eligibility and private versus consented public Staff identity. Linked Staff alone controls display consent; Owner renaming withdraws it. Versioned configuration is stored with its Service Listing; qualification references are Vendor-validated within the workspace transaction. It does not contain allocation state. Public qualification eligibility is not slot availability. See [local evidence](../quality/PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md). Scheduler/holds/Bookings and all later lifecycle claims remain specified and unverified.

## Local authoritative scheduling — P03-C02, 2026-10-12

Location and per-mode Staff calendars are now versioned and locally verified, with local weekday hours/breaks and replacing date exceptions. Uniform Service rules configure lead time, horizon and slot grid. Every candidate's complete Option/add-on duration and before/after buffers must fit both calendars in person or Staff's online calendar. Calendars may have different timezones; UTC instants/elapsed duration keep DST gaps and repeated times unambiguous. In-person display/grid uses Location timezone; online uses Service-rule timezone.

`staff_allocations` supplies authoritative occupancy across all modes/Locations/Services for the same Staff. Slot calculation subtracts booked intervals and held intervals strictly before expiry; other terminal intervals do not block. Read-only slot calculation uses a consistent PostgreSQL snapshot and returns `reserved: false` with evaluation time and current commercial terms. Missing rules/calendars never imply availability. Hold creation, atomic no-double-booking enforcement, Booking and meeting lifecycles remain unimplemented/unverified beyond this chunk; test occupancy is controlled local evidence rather than a completed paid Booking.

Owner/enabled Scheduler authority is Location-scoped, while linked Staff may manage their own calendars only. Old/new physical scopes guard replacement. Service rules require an Owner covering all eligible Locations. The local operator CLI enables/disables a Scheduler flag on an existing active assigned Staff membership with provenance/reason/audit; it grants no catalog or commercial authority. All non-local gates remain unchanged.
