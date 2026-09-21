# Services, Staff Scheduling, and Bookings

> **Status:** Planned domain behavior; no scheduler, Booking, or meeting integration exists.

## Service commercial model

Release 1 supports fixed-duration, fixed-price appointments only. A Service has one or more Options; add-ons state their price and duration effects before selection. `[DEC-007, DEC-021, DEC-045]`

The Service/Option contract is uniform across all qualified Staff: assigned Staff cannot change price, duration, buffers, or add-on effects. `[DEC-149]`

Delivery modes are:

- at a Vendor Location; and
- online. `[DEC-020]`

Home service, group seats/classes, recurring series, recording, and transcription are excluded. `[DEC-020, DEC-134, DEC-135, DEC-147]`

## Capacity model

Release 1 capacity is Staff-only. A Booking reserves one qualified Staff member; it does not reserve rooms, chairs, vehicles, equipment, or another shared resource. One Booking is one Customer party, with optional attendee details rather than multiple sellable seats. `[DEC-019, DEC-134]`

Staff may be selected by name or as “any qualified Staff.” Any-Staff selection still resolves atomically to one concrete Staff allocation. Public Staff profiles require Staff consent; hidden Staff may participate in any-Staff allocation without being publicly listed. `[DEC-019, DEC-150]`

## Availability calculation

Junction’s internal calendar is authoritative. Availability combines:

- Staff qualification for the Service Option;
- recurring working hours;
- date/time exceptions;
- breaks;
- Service duration and buffers;
- lead time;
- booking horizon;
- existing active allocations;
- delivery mode and, for in-person Service, Location; and
- local time-zone interpretation. `[DEC-019, DEC-050]`

The result is a candidate set, not a reservation. Only Checkout’s atomic allocation creates a hold. `[DEC-125]`

Read-only iCal export is in scope. Two-way calendar synchronization is deferred. `[DEC-050]`

## Booking creation

A Customer selects Service Option, add-ons, mode, Location if applicable, time, and named/any Staff preference. Checkout atomically resolves one qualified Staff member and reserves the interval with all other selected Product/Booking components for 15 minutes. `[DEC-019, DEC-022, DEC-125]`

Provider success inside the hold converts the allocation into a Booking and confirms it immediately. `[DEC-029]`

The Booking snapshots Service/Option/add-on description, duration/buffers, Staff/selection mode, Location or online mode, start/end/time zone, price, promotion/commission allocation, and cancellation/amendment policy. `[DEC-030, DEC-034]`

## Online meeting provisioning

Public demo uses DemoMeet. Private staging uses Google Meet REST—not Calendar write/sync—through the separately connected Google identity of the assigned Staff member, using the narrower meeting-space scope. `[DEC-099, DEC-100, DEC-139]`

Provisioning starts asynchronously only after paid confirmation. It must be idempotent, retryable, observable, and reconcilable. A protected manual replacement may recover the Booking. If no valid meeting exists by the configured safety cutoff, Junction cancels and fully refunds the Booking. `[DEC-101]`

Google access tokens/references belong to a private provider boundary. A public demo Persona cannot connect or impersonate a real Google identity. `[DEC-107, DEC-129]`

## Amendment

A Customer amendment may change time, Staff, Location, Option, and add-ons. `[DEC-032]`

Rules:

1. calculate current eligibility and price;
2. retain original price for unchanged components;
3. use current price for changed/new components;
4. atomically prepare the replacement allocation;
5. collect extra payment or prepare partial refund for the delta;
6. commit replacement and release original only when required steps succeed; and
7. retain the original Booking unchanged if allocation or extra payment fails. `[DEC-033, DEC-034]`

Provider meeting changes follow only after the Booking amendment commits and must be compensatable/reconcilable.

## Completion and no-show

In-person completion requires Customer code/QR plus Staff confirmation. Online completion combines the Junction join action and Staff confirmation. Both outcomes can be disputed. `[DEC-036]`

Staff may report Customer no-show with structured evidence. A contest window and snapshotted policy determine refund and earnings. A report is not unilateral final financial authority. `[DEC-035]`

No appointment recording or transcription is captured as evidence. `[DEC-147]`

## Cancellation and policy

Platform supplies bounded policy templates and Vendor selects one; the purchased version is snapshotted. `[DEC-030]`

The session did not confirm exact hour thresholds, refund percentages, amendment counts, Staff substitution rules, or waitlist behavior. They must stay open/proposed rather than be imported from the previous assistant plan.

## Earnings and disputes

Booking earnings remain pending until completion/no-show plus the snapshotted contest window. A dispute freezes only the affected Booking value. Authorized mediation may award full, partial, or no refund; ledger corrections use reversal postings. `[DEC-035, DEC-038, DEC-039, DEC-140]`

## Acceptance criteria

- concurrent allocation never double-books Staff; `[DEC-019]`
- “any Staff” resolves to exactly one qualified person without exposing private profiles; `[DEC-150]`
- schedule exceptions, breaks, buffers, lead time, horizon, time zone, and existing allocations affect availability; `[DEC-050]`
- paid Booking confirms immediately and unpaid/expired hold leaves no active allocation; `[DEC-029, DEC-125]`
- failed amendment/extra charge leaves original Booking intact; `[DEC-033]`
- changed/unchanged price treatment is deterministic; `[DEC-034]`
- meeting provisioning retries without duplicate spaces and reaches replacement or refund at cutoff; `[DEC-101]`
- Calendar write/sync, recording, and transcription do not occur; `[DEC-099, DEC-147]`
- completion/no-show evidence is scoped, private, and contestable; and `[DEC-035, DEC-036]`
- only the affected Booking’s money freezes during dispute. `[DEC-038]`
