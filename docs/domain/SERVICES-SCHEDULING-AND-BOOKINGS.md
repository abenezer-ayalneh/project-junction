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

## Local atomic Staff hold — P03-C03, 2026-10-12

A verified adult Customer can atomically hold one current appointment intent for fifteen elapsed minutes. Current definition/rules versions, qualification/consent, calendar/grid and occupancy are revalidated using the same evaluator as public slots. Any-Staff chooses one available concrete qualified profile deterministically under lock without exposing private Staff identity. Named selection requires current public consent. Full occupied bounds include uniform buffers; occupancy blocks the same Staff across Services, Locations and modes. PostgreSQL exclusion independently guards overlapping held/booked ranges.

Hold acceptance stores immutable selection/commercial terms and deadline, one unique concrete allocation, audit, Customer/Vendor workspace events and retry outcome together. Creation replay is original acceptance; it never renews or resurrects capacity. Current Customer read/release and worker/read/create expiry terminate only the linked uncommitted allocation once. Worker expiry needs no Customer session and remains valid after restriction/revocation. Later C05 will own paid Booking confirmation and commercial/policy/timing commitment; C08 owns waitlists. A hold creates no charge or confirmed Booking. Shared goods/appointment checkout serialization is a derived local lock strategy, not mixed-checkout implementation or a throughput/release acceptance claim.

### Local C04 selection boundary — 2026-10-12

Service selection and Cart now store browser-local unreserved appointment intents after current definition/slot revalidation. These intents contain selected public terms and timezone, but allocate no Staff and confirm no Booking. Editing replaces the same intent; removal does not affect goods. Safe selectors survive slot-loss/read/offline recovery on the current page; fresh times are required before Add. Paid confirmation and policy snapshots remain C05 and later. See [local evidence](../quality/PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c04--service-selection-and-booking-intent-ui--2026-10-12).

## Local paid Booking commitment — 2026-10-12

C05 implements controlled local payment start and durable receipt/reconciliation with immutable Booking purchase terms, policy, attendee and exact hold deadline. Unknown/failure never confirms; late or terminal-hold success compensates with one local refund. Assigned Staff stays private for any-Staff responses. Optional attendee fields create no User. Promotion/commission are null in this local slice pending Phase 04. See [C05 evidence](../quality/PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c05--paid-booking-confirmation--2026-10-12). Later lifecycle and formal gates remain open.

## Local Booking cancellation — 2026-10-12

C06 uses purchased Flexible/Standard cutoffs for Customer refunds and full refunds for scoped Vendor cancellation. Half-value refunds round down to minor units. Cancellation, allocation release, refund request and event/replay outcomes are atomic; purchase history stays immutable. Local refund receipts remain separately auditable. [C06 evidence](../quality/PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c06--cancellation-policy-and-refunds--2026-10-12).

## Local Booking amendment — 2026-10-12

C07 stores immutable original and append-only amendment terms alongside current allocation/effective terms. Unchanged component prices retain purchased amounts; new/changed components use current prices. Replacement capacity, controlled delta settlement, allowance and event/retry records commit atomically; failures retain the original. Effective-value cancellation plus delta refunds accounts for additional controlled collections. Full ledger integration remains Phase 04. [C07 evidence](../quality/PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c07--atomic-amendments-and-price-delta--2026-10-12).

## Local substitution and waitlists — 2026-10-12

C08 preserves purchased timing/price and Customer allowance during Vendor Staff disruption. Any-Staff replacement remains private and sends notice; named replacement requires consent or full-refund cancellation. Unanswered named proposals cancel at start as a derived local safe deadline. Customer edits invalidate pending proposals. Waitlist entries only notify about currently available slots; no reservation, payment or confirmation is created. [C08 evidence](../quality/PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c08--staff-substitution-and-waitlists--2026-10-12).

## Local meeting provisioning — 2026-10-12

C09 provisions after paid confirmation with stable Booking-version/assigned-Staff/connection identity and bounded leases/retries. Local controlled connections use opaque references; no Google request is made. Invalid/stale results cannot expose a meeting link. Protected local DemoMeet replacement precedes a configured cutoff (derived default 15 minutes), otherwise Platform cancellation returns full value. Withdrawn Staff connection/membership hides readiness immediately. Live Google OAuth/Meet REST and public demo deployment remain open. [C09 evidence](../quality/PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c09--meeting-provisioning-and-compensation--2026-10-12).

## Local attendance and contest — 2026-10-12

C10 binds private Customer code/QR to current Booking version and Staff, requires assigned Staff confirmation or Junction join plus Staff, and records contestable no-show/completion evidence. Eligibility remains frozen during contest; Phase 04 posting is explicitly pending. [C10 evidence](../quality/PHASE-03-LOCAL-ACCEPTANCE-EVIDENCE.md#p03-c10--attendance-completion-and-no-show-contest--2026-10-12).

## Phase 03 local acceptance — 2026-10-12

C11 audits every Phase 03 requirement, adds private current-terms iCal and explicit mode/Location/Staff amendment coverage. Local C01–C11 are complete; real providers, public demo, independent accessibility/retention/target recovery and Phase 04 financial posting remain separate gates. See [C11 evidence](../quality/evidence/phase-03-c11-2026-10-12/acceptance-audit.md).
