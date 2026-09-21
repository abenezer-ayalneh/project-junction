# Phase 03 — Services and Bookings

**Status:** Specified — Not Executed — Not Verified  
**Objective:** prove Staff-only fixed-duration appointment correctness privately.  
**Owner:** scheduling and Booking contexts  
**Entry:** Phase 00–01. **Exit:** no-double-booking Booking lifecycle evidence.  
**Decision coverage:** `DEC-019`–`DEC-021`, `DEC-029`, `DEC-032`–`DEC-036`, `DEC-050`, `DEC-098`–`DEC-101`, `DEC-134`, `DEC-135`, `DEC-139`, `DEC-147`, `DEC-149`, `DEC-150`, `DEC-156`, `DEC-164`, `DEC-165`, `DEC-181`, `DEC-184`, `DEC-185`, `DEC-188`

## Included / excluded

Includes fixed-price/fixed-duration Service Options/add-ons, Staff qualification/calendars, named/any Staff atomic allocation, one Customer party/optional attendee details, in-person/online modes, authoritative Junction schedule, read-only iCal, confirmation, meeting provisioning, cancellation/amendment/no-show/attendance, notification-only waitlists, and consent-aware substitution. Excludes shared resources, staff-specific price/duration/buffer differences, home visits, group seats, recurring series, two-way calendar sync, recording/transcription.

## Actors and proof journey

A verified adult Customer chooses a Service Option, eligible Location/mode, named or any qualified Staff, and one appointment time. Scheduler/Staff authority maintains availability; payment commits a single Staff allocation; the Customer can amend or cancel under the snapshotted template. For online service, the assigned Staff connection provisions a meeting asynchronously; for in-person service, Customer code/QR and Staff confirmation record attendance. The proof includes concurrency, consent-aware substitution, provider failure compensation, no-show evidence, and the Customer contest window.

## Functional requirements

- `REQ-P03-SCH-001`: availability evaluates qualifications, hours, exceptions, breaks, buffers, lead time, horizon, Location/mode, and current holds/Bookings.
- `REQ-P03-HOLD-001`: a named/any Staff allocation is atomic and cannot double-book; waitlist has no reservation/auto-charge effect.
- `REQ-P03-BKG-001`: paid Booking confirms immediately, snapshots its commercial/policy/timing context, and supports attendee details without child accounts.
- `REQ-P03-BKG-002`: any-Staff reassignment sends notice; named-Staff change requires Customer consent or cancellation/refund.
- `REQ-P03-BKG-003`: amendments can change time/Staff/Location/Option/add-ons, atomically settle delta, retain original on failure, price unchanged components at purchase price and changed/new components at current price.
- `REQ-P03-POL-001`: Vendor chooses Flexible or Standard snapshot. Flexible refunds 100% at least 24h before start, 50% from 2–24h, none under 2h and permits two Customer amendments before 2h; Standard refunds 100% at least 48h, 50% from 12–48h, none under 12h and permits one before 12h. Provider cancellation is 100%; Vendor disruption does not consume the Customer allowance.
- `REQ-P03-MTG-001`: public demo uses DemoMeet; private staging tests assigned-Staff Google Meet REST; failure retries/reconciles then protected replacement or auto-cancel/full-refund by safety cutoff.
- `REQ-P03-ATT-001`: in-person completion needs code/QR and Staff confirmation; online uses Junction join action and Staff confirmation; no-show is evidence-backed and contestable.

## Policies, objects, and state

Uses `POL-BKG-001`–`POL-BKG-005`, `INV-BOOK-001`; objects Service, ServiceOption, StaffProfile, Schedule, Booking, BookingHold, BookingAmendment, MeetingProvisioning, WaitlistEntry. Applies `STATE-BKG-001`/`STATE-MTG-001`; emits `EVT-BOOKING-*`, `EVT-MEETING-*`. Earnings remain unavailable for 48 hours after completion/no-show contest.

## Failure/quality/acceptance

Conflicting allocation, timeout, expired hold, failed extra payment, provider/outbox retry, consent withdrawal, stale attendance/no-show, and reconnect are all explicit. Online/offline mutations require authority. `TST-P03-001` proves no double booking; `TST-P03-002` proves policy/amendment/ledger behavior; `TST-P03-003` proves meeting compensation and contest path. Mixed checkout and live public release are deferred.
