# Decision Register

**Document status:** accepted baseline  
**System claim:** specified; not implemented  
**Normative owner:** decision provenance and cross-document ownership

Unless marked otherwise, each entry is `USER-CONFIRMED`. `DEC-138` is superseded by later explicit launch decisions. Links identify the single normative home for the decision.

## Strategy, audience, and scope

_Normative owners: product description, scope, and multiphase requirements._

<a id="dec-001"></a>

- `DEC-001` — Project Junction is separate from the parked social-checkout venture; any Dire Dawa launch requires fresh validation. [Product description](../product/PRODUCT-DESCRIPTION.md)
  <a id="dec-002"></a>
- `DEC-002` — “AliExpress-level” means capability breadth, not traffic or global scale. [Vision](../product/VISION-OUTCOMES-AND-SUCCESS.md)
  <a id="dec-003"></a>
- `DEC-003` — Technical hiring teams are the primary portfolio audience. [Audience](../product/AUDIENCE-PERSONAS-AND-JOBS.md)
  <a id="dec-004"></a>
- `DEC-004` — Every claimed feature must receive uniform production depth. [Vision](../product/VISION-OUTCOMES-AND-SUCCESS.md)
  <a id="dec-005"></a>
- `DEC-005` — Work expands in stages, with each released capability production-complete. [Multiphase requirements](../requirements/MULTIPHASE-REQUIREMENTS.md)
  <a id="dec-006"></a>
- `DEC-006` — Release scope covers physical goods and scheduled appointments. [Feature catalog](../product/FEATURE-CATALOG.md)
  <a id="dec-007"></a>
- `DEC-007` — Services are fixed-duration appointments, not quote jobs or rentals. [Scope](../product/SCOPE-AND-EXCLUSIONS.md)
  <a id="dec-008"></a>
- `DEC-008` — Marketplace supply is B2C business Vendors, not C2C. [Scope](../product/SCOPE-AND-EXCLUSIONS.md)
  <a id="dec-009"></a>
- `DEC-009` — A Vendor Storefront may sell both Products and Services. [Product description](../product/PRODUCT-DESCRIPTION.md)
  <a id="dec-010"></a>
- `DEC-010` — One User identity may be a Customer and member of multiple Vendors. [Roles](../product/ROLES-PERMISSIONS-AND-RESPONSIBILITIES.md)
  <a id="dec-011"></a>
- `DEC-011` — Initial context is synthetic Dire Dawa, ETB, Ethiopian conventions, and `Africa/Addis_Ababa`; no cross-border claim. [Seed context](../product/SEED-CATEGORIES-AND-SYNTHETIC-CONTENT.md)
  <a id="dec-012"></a>
- `DEC-012` — English is complete; i18n and pseudo-locale testing are included; real local translations require human review. [Accessibility and i18n](../product/ACCESSIBILITY-I18N-AND-LOW-CONNECTIVITY.md)
  <a id="dec-013"></a>
- `DEC-013` — The future client is a responsive mobile-first installable PWA; native apps are later. [UX](../product/UX-DESIGN-SYSTEM-AND-RESPONSIVENESS.md)
  <a id="dec-014"></a>
- `DEC-014` — This is solo, milestone-driven work with no artificial deadline. [Vision](../product/VISION-OUTCOMES-AND-SUCCESS.md)
  <a id="dec-015"></a>
- `DEC-015` — AI is deferred and may only be bounded assistive functionality, never the product identity. [Scope](../product/SCOPE-AND-EXCLUSIONS.md)

## Catalog, locations, inventory, fulfillment, and discovery

_Normative owners: catalog, locations/fulfillment, and feature catalog._

<a id="dec-016"></a>

- `DEC-016` — Listings are Vendor-owned; there is no shared canonical catalog. [Catalog](../domain/VENDOR-STOREFRONT-CATALOG-AND-DISCOVERY.md)
  <a id="dec-017"></a>
- `DEC-017` — Optional Vendor Locations own stock, pickup, Staff, hours, and appointment operations. [Locations](../domain/LOCATIONS-INVENTORY-AND-FULFILLMENT.md)
  <a id="dec-018"></a>
- `DEC-018` — SKU-variant/Location reservations are strict; no overselling or backorders. [Invariants](../domain/CROSS-CONTEXT-INVARIANTS.md)
  <a id="dec-019"></a>
- `DEC-019` — Appointment capacity is Staff-aware, qualified, scheduled, and atomically allocated. [Services](../domain/SERVICES-SCHEDULING-AND-BOOKINGS.md)
  <a id="dec-020"></a>
- `DEC-020` — Service modes are Vendor Location and online; home service is excluded. [Services](../domain/SERVICES-SCHEDULING-AND-BOOKINGS.md)
  <a id="dec-021"></a>
- `DEC-021` — Service Options and add-ons have fixed price and known duration effects. [Services](../domain/SERVICES-SCHEDULING-AND-BOOKINGS.md)
  <a id="dec-027"></a>
- `DEC-027` — Vendors manage delivery and pickup; Junction has no fleet or carrier integration. [Fulfillment](../domain/LOCATIONS-INVENTORY-AND-FULFILLMENT.md)
  <a id="dec-028"></a>
- `DEC-028` — Paid Product Orders auto-confirm; Vendor cancellation is exceptional. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
  <a id="dec-037"></a>
- `DEC-037` — Product handoff uses a Customer one-time code/QR with an evidence fallback. [Fulfillment](../domain/LOCATIONS-INVENTORY-AND-FULFILLMENT.md)
  <a id="dec-042"></a>
- `DEC-042` — Search has typed Product and Service verticals. [Catalog](../domain/VENDOR-STOREFRONT-CATALOG-AND-DISCOVERY.md)
  <a id="dec-043"></a>
- `DEC-043` — Recommendations are explainable rules, not fake ML. [Catalog](../domain/VENDOR-STOREFRONT-CATALOG-AND-DISCOVERY.md)
  <a id="dec-044"></a>
- `DEC-044` — Product and Service taxonomies are separately typed with shared themes. [Catalog](../domain/VENDOR-STOREFRONT-CATALOG-AND-DISCOVERY.md)
  <a id="dec-045"></a>
- `DEC-045` — Prices are fixed, not negotiated. [Scope](../product/SCOPE-AND-EXCLUSIONS.md)
  <a id="dec-046"></a>
- `DEC-046` — Only low-risk categories are allowed; controlled, medical, financial, legal, adult, weapons, alcohol, regulated, and digital goods are excluded. [Scope](../product/SCOPE-AND-EXCLUSIONS.md)
  <a id="dec-047"></a>
- `DEC-047` — Listing publication receives risk-based review. [Catalog](../domain/VENDOR-STOREFRONT-CATALOG-AND-DISCOVERY.md)
  <a id="dec-048"></a>
- `DEC-048` — Product/variant/stock CSV import/export uses versioned templates, dry runs, errors, previews, and idempotent commit. [Catalog](../domain/VENDOR-STOREFRONT-CATALOG-AND-DISCOVERY.md)
  <a id="dec-049"></a>
- `DEC-049` — Stock changes use an immutable audited movement ledger. [Locations](../domain/LOCATIONS-INVENTORY-AND-FULFILLMENT.md)
  <a id="dec-051"></a>
- `DEC-051` — Social scope is wishlists, saved services/searches, Vendor follows, and Vendor updates. [Feature catalog](../product/FEATURE-CATALOG.md)
  <a id="dec-052"></a>
- `DEC-052` — Vendors receive operational and funnel analytics. [Catalog](../domain/VENDOR-STOREFRONT-CATALOG-AND-DISCOVERY.md)
  <a id="dec-053"></a>
- `DEC-053` — Browsing is public; a verified account is required at checkout. [Roles](../product/ROLES-PERMISSIONS-AND-RESPONSIBILITIES.md)
  <a id="dec-054"></a>
- `DEC-054` — Addresses include contact, landmark, instructions, map pin, and snapshot behavior. [Locations](../domain/LOCATIONS-INVENTORY-AND-FULFILLMENT.md)
  <a id="dec-055"></a>
- `DEC-055` — Location zones carry fee, minimum, free threshold, and ETA; Customers choose delivery/pickup per Vendor group. [Locations](../domain/LOCATIONS-INVENTORY-AND-FULFILLMENT.md)
  <a id="dec-102"></a>
- `DEC-102` — Products use simple and variant structures only. [Catalog](../domain/VENDOR-STOREFRONT-CATALOG-AND-DISCOVERY.md)
  <a id="dec-123"></a>
- `DEC-123` — Analytics is first-party typed PostgreSQL projection with minimized data, no replay, fingerprinting, or third-party behavioral analytics. [Search and analytics](../architecture/SEARCH-REALTIME-AND-ANALYTICS.md)
  <a id="dec-130"></a>
- `DEC-130` — Storefronts use structured logo, cover, and content branding; no page builder, theme marketplace, or Vendor-selected accent color. [Catalog](../domain/VENDOR-STOREFRONT-CATALOG-AND-DISCOVERY.md)
  <a id="dec-131"></a>
- `DEC-131` — Each Vendor cart group uses one fulfillment Location; no split fulfillment. [Fulfillment](../domain/LOCATIONS-INVENTORY-AND-FULFILLMENT.md)
  <a id="dec-132"></a>
- `DEC-132` — Pickup is ready-then-collect inside a snapshotted window and is not a Booking. [Fulfillment](../domain/LOCATIONS-INVENTORY-AND-FULFILLMENT.md)
  <a id="dec-133"></a>
- `DEC-133` — Vendor cancellation may affect a line/quantity only, preserve unaffected components, refund proportionally, and refund delivery when the group is wholly cancelled. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
  <a id="dec-148"></a>
- `DEC-148` — Eligible fulfillment Locations are ranked and explained by stock, zone, fee, and ETA before confirmation. [Locations](../domain/LOCATIONS-INVENTORY-AND-FULFILLMENT.md)
  <a id="dec-161"></a>
- `DEC-161` — Delivery is milestones and proof, not dispatch, route, driver, or GPS management. [Fulfillment](../domain/LOCATIONS-INVENTORY-AND-FULFILLMENT.md)
  <a id="dec-166"></a>
- `DEC-166` — Product exchanges are return/refund then fresh purchase, not a dedicated exchange workflow. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
  <a id="dec-175"></a>
- `DEC-175` — Release 1 includes short public video. [Feature catalog](../product/FEATURE-CATALOG.md)
  <a id="dec-176"></a>
- `DEC-176` — Public video audio requires captions or an explicit no-speech declaration with description. [Accessibility and i18n](../product/ACCESSIBILITY-I18N-AND-LOW-CONNECTIVITY.md)
  <a id="dec-180"></a>
- `DEC-180` — Synthetic categories are apparel/accessories, phone/computer accessories, home/everyday goods, grooming, tutoring/coaching, and photography/creative appointments. [Seed context](../product/SEED-CATEGORIES-AND-SYNTHETIC-CONTENT.md)

## Scheduling and Booking

_Normative owners: services/booking and policy catalog._

<a id="dec-029"></a>

- `DEC-029` — Paid Bookings instantly confirm. [Services](../domain/SERVICES-SCHEDULING-AND-BOOKINGS.md)
  <a id="dec-032"></a>
- `DEC-032` — Booking amendments may change time, Staff, Location, Option, and add-ons. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
  <a id="dec-033"></a>
- `DEC-033` — Financial amendments charge/refund the delta and atomically swap slots; payment failure preserves the original. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
  <a id="dec-034"></a>
- `DEC-034` — Unchanged components keep purchase price; changed/new components use current price. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
  <a id="dec-035"></a>
- `DEC-035` — No-show reports require Staff evidence, contest window, and policy-based financial treatment. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
  <a id="dec-036"></a>
- `DEC-036` — In-person completion uses Customer code/QR plus Staff confirmation; online completion uses Junction join action plus Staff confirmation; both are disputable. [Services](../domain/SERVICES-SCHEDULING-AND-BOOKINGS.md)
  <a id="dec-050"></a>
- `DEC-050` — Junction calendar is authoritative with recurring hours, exceptions, breaks, buffers, lead time, horizon, and read-only iCal; two-way sync is later. [Services](../domain/SERVICES-SCHEDULING-AND-BOOKINGS.md)
  <a id="dec-098"></a>
- `DEC-098` — Online appointments integrate a meeting provider. [Services](../domain/SERVICES-SCHEDULING-AND-BOOKINGS.md)
  <a id="dec-099"></a>
- `DEC-099` — Google Meet is first via Meet REST rather than Calendar writes, using the narrow meeting-space scope. [Provider contracts](../architecture/PROVIDER-INTEGRATION-CONTRACTS.md)
  <a id="dec-100"></a>
- `DEC-100` — The assigned Staff Google account organizes an online meeting and connects separately. [Services](../domain/SERVICES-SCHEDULING-AND-BOOKINGS.md)
  <a id="dec-101"></a>
- `DEC-101` — Meeting provisioning follows paid confirmation asynchronously with retries, protected replacement, and auto-cancel/full refund at cutoff. [State machine](../state-machines/BOOKING-MEETING-AMENDMENT-AND-ATTENDANCE.md)
  <a id="dec-134"></a>
- `DEC-134` — A Booking has one Customer party and optional attendee details; no group-seat/classes model. [Services](../domain/SERVICES-SCHEDULING-AND-BOOKINGS.md)
  <a id="dec-135"></a>
- `DEC-135` — Bookings are one-off plus rebooking; no recurring series. [Scope](../product/SCOPE-AND-EXCLUSIONS.md)
  <a id="dec-139"></a>
- `DEC-139` — Public online sessions use DemoMeet; private staging validates Google Meet until OAuth approval. [Demo](../demo/SANDBOX-PAYMENTS-AND-PROVIDER-SUBSTITUTES.md)
  <a id="dec-147"></a>
- `DEC-147` — Online appointment recording and transcription are excluded. [Scope](../product/SCOPE-AND-EXCLUSIONS.md)
  <a id="dec-149"></a>
- `DEC-149` — Staff-specific service pricing is excluded; qualified Staff share Option price/duration/buffers/add-ons. [Services](../domain/SERVICES-SCHEDULING-AND-BOOKINGS.md)
  <a id="dec-150"></a>
- `DEC-150` — Public Staff profiles require Staff opt-in; private Staff can remain assignable through “any.” [Roles](../product/ROLES-PERMISSIONS-AND-RESPONSIBILITIES.md)
  <a id="dec-156"></a>
- `DEC-156` — Release 1 appointment capacity is qualified Staff only; scarce resources are deferred. [Scope](../product/SCOPE-AND-EXCLUSIONS.md)
  <a id="dec-159"></a>
- `DEC-159` — First public release includes in-person and online appointments. [Release gates](../requirements/PHASE-AND-RELEASE-GATES.md)
  <a id="dec-164"></a>
- `DEC-164` — Staff profiles have optional User-account links. [Roles](../product/ROLES-PERMISSIONS-AND-RESPONSIBILITIES.md)
  <a id="dec-165"></a>
- `DEC-165` — Waitlists are notification-only and never reserve or auto-charge. [Services](../domain/SERVICES-SCHEDULING-AND-BOOKINGS.md)
  <a id="dec-181"></a>
- `DEC-181` — “Any Staff” may be reassigned with notice; named-Staff changes require Customer consent or cancellation/refund. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
  <a id="dec-182"></a>
- `DEC-182` — A checkout may include up to five independent quantity-one Booking intents. [Cart and checkout](../domain/CART-CHECKOUT-PURCHASE-AND-ORDERS.md)
  <a id="dec-184"></a>
- `DEC-184` — Vendors select snapshotted Booking templates: Flexible refunds 100% at least 24 hours before start, 50% from 2–24 hours, none under 2 hours; Standard refunds 100% at least 48 hours before start, 50% from 12–48 hours, none under 12 hours. Provider cancellation returns 100%; proven no-show follows selected template. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
  <a id="dec-185"></a>
- `DEC-185` — Flexible permits two Customer amendments before its 2-hour final cutoff; Standard permits one before its 12-hour final cutoff. Vendor-disruption proposals do not consume Customer allowance. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
  <a id="dec-188"></a>
- `DEC-188` — Booking earnings remain unavailable for a 48-hour contest window after completion/no-show. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)

## Checkout, finance, policy, and post-purchase

_Normative owners: cart/checkout, payments/ledger, policies, and state machines._

<a id="dec-022"></a>

- `DEC-022` — One mixed multi-Vendor Cart holds Products and selected appointment slots. [Cart and checkout](../domain/CART-CHECKOUT-PURCHASE-AND-ORDERS.md)
  <a id="dec-023"></a>
- `DEC-023` — One Customer Purchase/receipt splits into Vendor Orders and Bookings. [Cart and checkout](../domain/CART-CHECKOUT-PURCHASE-AND-ORDERS.md)
  <a id="dec-024"></a>
- `DEC-024` — Checkout captures the full payment amount. [Payments](../domain/PAYMENTS-LEDGER-PROMOTIONS-AND-PAYOUTS.md)
  <a id="dec-025"></a>
- `DEC-025` — A provider-neutral internal ledger has delayed earnings and sandbox transfers/payouts; no live Ethiopian fund-holding claim. [Payments](../domain/PAYMENTS-LEDGER-PROMOTIONS-AND-PAYOUTS.md)
  <a id="dec-026"></a>
- `DEC-026` — Initial monetization is transaction commission only. [Payments](../domain/PAYMENTS-LEDGER-PROMOTIONS-AND-PAYOUTS.md)
  <a id="dec-030"></a>
- `DEC-030` — Platform-defined bounded cancellation/return templates are Vendor-selected and snapshotted. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
  <a id="dec-031"></a>
- `DEC-031` — Goods have a full return workflow. [Returns](../domain/RETURNS-DISPUTES-SUPPORT-AND-REVIEWS.md)
  <a id="dec-038"></a>
- `DEC-038` — Earnings release per affected line/Booking after snapshot windows; disputes freeze only affected value. [Payments](../domain/PAYMENTS-LEDGER-PROMOTIONS-AND-PAYOUTS.md)
  <a id="dec-039"></a>
- `DEC-039` — Platform mediation uses structured evidence and allows authorized full, partial, or no refund with immutable audit. [Returns](../domain/RETURNS-DISPUTES-SUPPORT-AND-REVIEWS.md)
  <a id="dec-040"></a>
- `DEC-040` — Reviews are verified, multidimensional, completion-only, and text/media moderated. [Returns](../domain/RETURNS-DISPUTES-SUPPORT-AND-REVIEWS.md)
  <a id="dec-041"></a>
- `DEC-041` — Staff feedback is private; public ratings belong to Service and Vendor. [Returns](../domain/RETURNS-DISPUTES-SUPPORT-AND-REVIEWS.md)
  <a id="dec-056"></a>
- `DEC-056` — No tax calculation; demo prices are final and receipts are not Ethiopian tax invoices. [Payments](../domain/PAYMENTS-LEDGER-PROMOTIONS-AND-PAYOUTS.md)
  <a id="dec-057"></a>
- `DEC-057` — Junction emits a non-tax platform receipt; Vendors may attach external invoices. [Payments](../domain/PAYMENTS-LEDGER-PROMOTIONS-AND-PAYOUTS.md)
  <a id="dec-058"></a>
- `DEC-058` — Promotions include Vendor-funded coupons and budget-capped platform campaigns. [Payments](../domain/PAYMENTS-LEDGER-PROMOTIONS-AND-PAYOUTS.md)
  <a id="dec-059"></a>
- `DEC-059` — Loyalty is deferred; future points are expiring and non-cash, never a wallet. [Scope](../product/SCOPE-AND-EXCLUSIONS.md)
  <a id="dec-140"></a>
- `DEC-140` — The money model is an immutable balanced double-entry subledger corrected by reversal. [Ledger](../data/MONEY-AND-DOUBLE-ENTRY-LEDGER.md)
  <a id="dec-141"></a>
- `DEC-141` — Commission basis is Vendor net sale after Vendor discount, before platform subsidy, excluding delivery, with largest-remainder rounding. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
  <a id="dec-142"></a>
- `DEC-142` — Commission uses effective-dated global default plus audited Vendor override; no category rates. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
  <a id="dec-143"></a>
- `DEC-143` — At most one Vendor coupon then one platform campaign applies to remaining eligible value. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
  <a id="dec-144"></a>
- `DEC-144` — Payout batches are automatic weekly above a configurable minimum; frozen amounts are skipped and Finance has no arbitrary withdrawal. [Payments](../domain/PAYMENTS-LEDGER-PROMOTIONS-AND-PAYOUTS.md)
  <a id="dec-145"></a>
- `DEC-145` — Chargebacks default to affected Vendor economics with freeze/reversal/negative payable and Platform override audit. [Payments](../domain/PAYMENTS-LEDGER-PROMOTIONS-AND-PAYOUTS.md)
  <a id="dec-146"></a>
- `DEC-146` — Vendor pays return logistics/original delivery for fault; Customer pays eligible change-of-mind logistics. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
  <a id="dec-151"></a>
- `DEC-151` — Saved Stripe payment methods require explicit opt-in; only references/display metadata are stored and removal needs recent auth. [Payments](../domain/PAYMENTS-LEDGER-PROMOTIONS-AND-PAYOUTS.md)
  <a id="dec-152"></a>
- `DEC-152` — Anonymous Cart is local/non-authoritative and visibly merges after sign-in. [Cart and checkout](../domain/CART-CHECKOUT-PURCHASE-AND-ORDERS.md)
  <a id="dec-154"></a>
- `DEC-154` — Each Vendor is the contracting seller of its own lines and Bookings. [Product description](../product/PRODUCT-DESCRIPTION.md)
  <a id="dec-155"></a>
- `DEC-155` — For the selected Stripe sandbox flow, Junction is payment merchant for the unified charge while Vendors remain contractual sellers; no live legal claim follows. [Payments](../domain/PAYMENTS-LEDGER-PROMOTIONS-AND-PAYOUTS.md)
  <a id="dec-163"></a>
- `DEC-163` — Junction absorbs ordinary processor/dispute fees as operating cost. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
  <a id="dec-183"></a>
- `DEC-183` — Goods templates are Standard 7 calendar days or Flexible 14 calendar days for unused change-of-mind goods, measured from verified handoff; no restocking fee; fault/wrong-item/material-misdescription claims retain a non-optional 30-day baseline. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
  <a id="dec-186"></a>
- `DEC-186` — Failed delivery gets one corrected retry within 48 hours; pickup has 72 hours plus 48-hour grace, then return/inspection/refund treatment. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
  <a id="dec-187"></a>
- `DEC-187` — Product earnings release after the 7/14-day window; later accepted fault claims recover from available/future Vendor earnings. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)

## Trust, support, moderation, privacy, and notifications

_Normative owners: trust domain, security/privacy, and feature catalog._

<a id="dec-060"></a>

- `DEC-060` — Users may export/delete data; retained legal/audit/security records are pseudonymized. [Data classification](../data/DATA-CLASSIFICATION-RETENTION-EXPORT-AND-DELETION.md)
  <a id="dec-061"></a>
- `DEC-061` — WCAG 2.2 AA is required. [Accessibility and i18n](../product/ACCESSIBILITY-I18N-AND-LOW-CONNECTIVITY.md)
  <a id="dec-062"></a>
- `DEC-062` — Low-connectivity supports shell/public cache, optimized media, drafts, idempotent retry; live is required for availability/payment mutations. [Accessibility and i18n](../product/ACCESSIBILITY-I18N-AND-LOW-CONNECTIVITY.md)
  <a id="dec-063"></a>
- `DEC-063` — Rules plus a human moderation queue and audited appeals govern risky content. [Trust](../domain/MESSAGING-NOTIFICATIONS-MODERATION-AND-ANALYTICS.md)
  <a id="dec-064"></a>
- `DEC-064` — Messages are scoped to offering/Order/Booking/return/dispute with attachments, block/report, moderation, retention; no general inbox. [Trust](../domain/MESSAGING-NOTIFICATIONS-MODERATION-AND-ANALYTICS.md)
  <a id="dec-065"></a>
- `DEC-065` — Notifications span in-app, email, PWA push, and SMS. [Trust](../domain/MESSAGING-NOTIFICATIONS-MODERATION-AND-ANALYTICS.md)
  <a id="dec-167"></a>
- `DEC-167` — Pre-purchase communication is private inquiry, not public Q&A. [Scope](../product/SCOPE-AND-EXCLUSIONS.md)
  <a id="dec-168"></a>
- `DEC-168` — General support uses in-app Support Cases, distinct from money disputes. [Returns](../domain/RETURNS-DISPUTES-SUPPORT-AND-REVIEWS.md)
  <a id="dec-169"></a>
- `DEC-169` — Platform staff use preset least-privilege roles. [Roles](../product/ROLES-PERMISSIONS-AND-RESPONSIBILITIES.md)
  <a id="dec-170"></a>
- `DEC-170` — Highest-risk manual actions require risk-tiered dual control. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
  <a id="dec-171"></a>
- `DEC-171` — Purchasing/Vendor-operating accounts are adults only; adult bookers may provide limited attendee details. [Roles](../product/ROLES-PERMISSIONS-AND-RESPONSIBILITIES.md)
  <a id="dec-173"></a>
- `DEC-173` — Vendor suspension blocks new sales but preserves scoped access for existing obligations. [Policies](../domain/POLICY-CATALOG-AND-SNAPSHOTS.md)
  <a id="dec-174"></a>
- `DEC-174` — Personalized recommendations require explicit opt-in; contextual discovery is default. [Catalog](../domain/VENDOR-STOREFRONT-CATALOG-AND-DISCOVERY.md)

## Identity, provider, architecture, and deployment

_Normative owners: architecture, security, environments, deployment, and demo._

<a id="dec-066"></a>

- `DEC-066` — Didit age verification is gated to private sandbox; public demo identity fixtures stay non-authoritative; no provider result establishes commercial KYB. [Provider contracts](../architecture/PROVIDER-INTEGRATION-CONTRACTS.md)
  <a id="dec-067"></a>
- `DEC-067` — Vendor roles are Owner, Manager, Catalog, Fulfillment, Scheduler, Service Staff, Finance, with optional Location scope. [Roles](../product/ROLES-PERMISSIONS-AND-RESPONSIBILITIES.md)
  <a id="dec-068"></a>
- `DEC-068` — Authentication is verified email/password plus Google; phone is optional. [Security](../security/AUTHENTICATION-AUTHORIZATION-AND-DUAL-CONTROL.md)
  <a id="dec-069"></a>
- `DEC-069` — MFA is mandatory for Vendor Owner/Finance and Platform roles; sensitive action requires recent auth. [Security](../security/AUTHENTICATION-AUTHORIZATION-AND-DUAL-CONTROL.md)
  <a id="dec-070"></a>
- `DEC-070` — Better Auth is selected. [Architecture](../architecture/TARGET-SYSTEM-DESCRIPTION.md)
  <a id="dec-071"></a>
- `DEC-071` — Next owns Better Auth routes/config; Nest validates secure revocable same-origin cookie sessions backed by Redis/PostgreSQL; no local-storage bearer. [Security](../security/AUTHENTICATION-AUTHORIZATION-AND-DUAL-CONTROL.md)
  <a id="dec-072"></a>
- `DEC-072` — Authenticated WebSockets use Redis fanout; REST remains authoritative. [Realtime](../interfaces/REALTIME-CONTRACTS.md)
  <a id="dec-073"></a>
- `DEC-073` — Resend email uses outbox/idempotency/webhooks/suppression/domain auth and demo sink. [Provider contracts](../architecture/PROVIDER-INTEGRATION-CONTRACTS.md)
  <a id="dec-074"></a>
- `DEC-074` — Public demo SMS is deterministic; private staging uses allowlisted one-way AfroMessage templates with reconciliation. [Provider contracts](../architecture/PROVIDER-INTEGRATION-CONTRACTS.md)
  <a id="dec-075"></a>
- `DEC-075` — Stripe is first, Chapa follows as the next adapter. [Provider contracts](../architecture/PROVIDER-INTEGRATION-CONTRACTS.md)
  <a id="dec-076"></a>
- `DEC-076` — Legitimate Stripe sandbox access was confirmed. [Demo](../demo/SANDBOX-PAYMENTS-AND-PROVIDER-SUBSTITUTES.md)
  <a id="dec-077"></a>
- `DEC-077` — Release 1 uses Stripe sandbox/Connect with explicit simulation; this proves no Ethiopian production capability. [Provider contracts](../architecture/PROVIDER-INTEGRATION-CONTRACTS.md)
  <a id="dec-078"></a>
- `DEC-078` — Chapa is the next production-complete payment adapter. [Future backlog](../future/DEFERRED-CAPABILITY-BACKLOG.md)
  <a id="dec-079"></a>
- `DEC-079` — Target stack is Next frontend, Nest backend, PostgreSQL, shared TypeScript. [Architecture](../architecture/TARGET-SYSTEM-DESCRIPTION.md)
  <a id="dec-080"></a>
- `DEC-080` — Target repository shape is Nx monorepo. [Architecture](../architecture/TARGET-SYSTEM-DESCRIPTION.md)
  <a id="dec-081"></a>
- `DEC-081` — Target backend is modular monolith plus separate worker, PostgreSQL transactions, and outbox. [Architecture](../architecture/BACKGROUND-JOBS-OUTBOX-AND-RECONCILIATION.md)
  <a id="dec-082"></a>
- `DEC-082` — Ordering and Booking stay separate contexts under Checkout/Purchase and Payments/Ledger. [Architecture](../architecture/BACKEND-CONTEXT-AND-DATA-ARCHITECTURE.md)
  <a id="dec-083"></a>
- `DEC-083` — API is versioned REST/OpenAPI with generated client, idempotency, webhooks, and file interfaces. [API conventions](../interfaces/API-CONVENTIONS.md)
  <a id="dec-084"></a>
- `DEC-084` — Prisma 7 handles normal persistence; audited parameterized SQL handles locks/advisory/`SKIP LOCKED`; no persistence types leak. [Data ownership](../data/DATA-OWNERSHIP-AND-CONTEXT-BOUNDARIES.md)
  <a id="dec-085"></a>
- `DEC-085` — One PostgreSQL database/migration history has logical context ownership. [Data ownership](../data/DATA-OWNERSHIP-AND-CONTEXT-BOUNDARIES.md)
  <a id="dec-086"></a>
- `DEC-086` — BullMQ/Redis jobs use PostgreSQL truth/outbox, stable IDs, and idempotent handlers; Redis outage loses no business truth. [Background jobs](../architecture/BACKGROUND-JOBS-OUTBOX-AND-RECONCILIATION.md)
  <a id="dec-087"></a>
- `DEC-087` — Meilisearch is rebuildable outbox projection; PostgreSQL is authoritative. [Search and analytics](../architecture/SEARCH-REALTIME-AND-ANALYTICS.md)
  <a id="dec-088"></a>
- `DEC-088` — S3-compatible media uses signed uploads, public/private namespaces, metadata, scan/transforms, CDN. [Media](../architecture/MEDIA-STORAGE-AND-PROCESSING.md)
  <a id="dec-089"></a>
- `DEC-089` — Project Junction targets an owned VPS. [Deployment topology](../deployment/INFRASTRUCTURE-AND-NETWORK-TOPOLOGY.md)
  <a id="dec-090"></a>
- `DEC-090` — One hardened VPS uses Docker Compose/Caddy with offsite backup; host downtime is accepted. [Production deployment](../deployment/PORTFOLIO-PRODUCTION-DEPLOYMENT.md)
  <a id="dec-091"></a>
- `DEC-091` — Initial VPS is approximately 4 vCPU, 8–16 GB RAM, 160+ GB SSD/NVMe, finalized after load testing. [Capacity](../deployment/CAPACITY-COST-AND-SCALING.md)
  <a id="dec-092"></a>
- `DEC-092` — GitHub Actions/GHCR use scanned immutable images, pinned digests, SSH deploy, migration lock, health gates, rollback, expand/contract migration. [CI/CD](../deployment/CI-CD-AND-RELEASE-PROMOTION.md)
  <a id="dec-093"></a>
- `DEC-093` — Staging is isolated resource-limited Compose on the same VPS with separate services/secrets/networks. [Staging](../deployment/STAGING-DEPLOYMENT.md)
  <a id="dec-094"></a>
- `DEC-094` — A self-hosted MinIO staging bucket stores app media; a separate B2 account/bucket holds encrypted Object-Locked backups. [Backup](../deployment/BACKUP-RESTORE-AND-DISASTER-RECOVERY.md)
  <a id="dec-095"></a>
- `DEC-095` — MapLibre/MapTiler provide presentation; domain owns normalized pins/polygons and manual pin fallback; public OSM endpoints are excluded. [Maps](../architecture/MAPS-ADDRESSES-AND-POSTGIS.md)
  <a id="dec-096"></a>
- `DEC-096` — Sentry covers errors/releases/performance; Better Stack covers checks, heartbeats, incidents, status. [Operations](../operations/MONITORING-ALERTING-AND-STATUS-PAGE.md)
  <a id="dec-097"></a>
- `DEC-097` — Cloudflare proxy, locked origin, Full Strict TLS, Caddy, Cloudflare-only firewall, and app abuse controls are planned. [Network topology](../deployment/INFRASTRUCTURE-AND-NETWORK-TOPOLOGY.md)
  <a id="dec-103"></a>
- `DEC-103` — Stripe Connect uses hosted Express-style/controller properties, platform charge, and separate transfers. [Provider contracts](../architecture/PROVIDER-INTEGRATION-CONTRACTS.md)
  <a id="dec-104"></a>
- `DEC-104` — ETB is treated as two-decimal Stripe card presentment; sandbox settlement may convert. [Payments](../domain/PAYMENTS-LEDGER-PROMOTIONS-AND-PAYOUTS.md)
  <a id="dec-105"></a>
- `DEC-105` — Stripe uses embedded Payment Element and typed next action; webhooks/reconciliation are authoritative. [Provider contracts](../architecture/PROVIDER-INTEGRATION-CONTRACTS.md)
  <a id="dec-107"></a>
- `DEC-107` — Public demo uses isolated ephemeral synthetic workspaces, visible persona switching, quotas, expiry. [Demo](../demo/PUBLIC-DEMO-DESCRIPTION.md)
  <a id="dec-108"></a>
- `DEC-108` — Public demo performs quota-limited real Stripe sandbox operations using shared synthetic Connect accounts, provider metadata/cleanup, Turnstile/rate limits. [Demo](../demo/SANDBOX-PAYMENTS-AND-PROVIDER-SUBSTITUTES.md)
  <a id="dec-109"></a>
- `DEC-109` — Portfolio demo and future Dire Dawa production remain permanently separate; data is never promoted. [Future gates](../future/ENVIRONMENT-SEPARATION-AND-NO-DATA-PROMOTION.md)
  <a id="dec-110"></a>
- `DEC-110` — SOPS+age secrets decrypt on host into Compose file secrets; offline recovery key; CI receives no app secrets. [Secrets](../deployment/SECRETS-TLS-AND-ORIGIN-SECURITY.md)
  <a id="dec-111"></a>
- `DEC-111` — Database RPO is 15 minutes, host RTO four hours; pgBackRest/WAL, encrypted media copy, heartbeats, monthly PITR, quarterly rebuild. [Backup](../deployment/BACKUP-RESTORE-AND-DISASTER-RECOVERY.md)
  <a id="dec-112"></a>
- `DEC-112` — Future source repository is public GitHub. [Portfolio positioning](../product/PORTFOLIO-POSITIONING-AND-CLAIMS.md)
  <a id="dec-113"></a>
- `DEC-113` — Future repository has copyright/reuse notice but no open-source license; issues allowed, external code contributions not during portfolio phase. [Portfolio positioning](../product/PORTFOLIO-POSITIONING-AND-CLAIMS.md)
  <a id="dec-114"></a>
- `DEC-114` — Current root becomes Project Junction while prior README is preserved verbatim under `docs/ventures/`. [README](../../README.md)
  <a id="dec-115"></a>
- `DEC-115` — Stable codename is Project Junction with future `@junction/*` namespace. [Product description](../product/PRODUCT-DESCRIPTION.md)
  <a id="dec-116"></a>
- `DEC-116` — Documentation-as-code in Git is authoritative. [Documentation conventions](./DOCUMENTATION-CONVENTIONS.md)
  <a id="dec-117"></a>
- `DEC-117` — stock shadcn/ui and Lucide are the UI and icon baseline. [UX](../product/UX-DESIGN-SYSTEM-AND-RESPONSIVENESS.md)
  <a id="dec-118"></a>
- `DEC-118` — Tailwind 4 with stock shadcn neutral semantic CSS-variable/OKLCH tokens; no custom Junction control preset. [UX](../product/UX-DESIGN-SYSTEM-AND-RESPONSIVENESS.md)
  <a id="dec-119"></a>
- `DEC-119` — Hybrid Next App Router: server-render public discovery, TanStack Query islands, no business Server Actions/BFF duplication. [Frontend](../architecture/FRONTEND-ARCHITECTURE.md)
  <a id="dec-120"></a>
- `DEC-120` — Zod Standard Schema at Nest boundary; OpenAPI SDK/query hooks; private domain/Prisma types. [API conventions](../interfaces/API-CONVENTIONS.md)
  <a id="dec-121"></a>
- `DEC-121` — Node 24 LTS, PostgreSQL 18, Prisma 7, Nest 11, stable Next/Nx/pnpm initialization, PostgreSQL UUIDv7. [Architecture](../architecture/TARGET-SYSTEM-DESCRIPTION.md)
  <a id="dec-122"></a>
- `DEC-122` — Standard Web Push uses VAPID. [Provider contracts](../architecture/PROVIDER-INTEGRATION-CONTRACTS.md)
  <a id="dec-124"></a>
- `DEC-124` — Socket.IO forces WebSocket with authenticated rooms, Zod envelopes, Redis fanout, cursors, REST reconciliation. [Realtime](../interfaces/REALTIME-CONTRACTS.md)
  <a id="dec-125"></a>
- `DEC-125` — Checkout is all-or-nothing 15-minute hold; late provider success auto-refunds. [Cart and checkout](../domain/CART-CHECKOUT-PURCHASE-AND-ORDERS.md)
  <a id="dec-126"></a>
- `DEC-126` — Visual direction is stock shadcn neutral with a restrained Junction-red mark, semantic state colors, honest local seed context, and browser-local light/dark/system choice. [UX](../product/UX-DESIGN-SYSTEM-AND-RESPONSIVENESS.md)
  <a id="dec-127"></a>
- `DEC-127` — One adaptive Next app has role route groups/shells and lazy back office; Nest authorizes. [Frontend](../architecture/FRONTEND-ARCHITECTURE.md)
  <a id="dec-128"></a>
- `DEC-128` — PostGIS owns delivery polygons/distances through audited SQL; MapTiler is presentation only. [Maps](../architecture/MAPS-ADDRESSES-AND-POSTGIS.md)
  <a id="dec-129"></a>
- `DEC-129` — Typed AccessContext/scoped repositories ban unscoped Prisma and use adversarial tests; no pervasive RLS. [Security](../security/WORKSPACE-VENDOR-AND-LOCATION-ISOLATION.md)
  <a id="dec-136"></a>
- `DEC-136` — Target validation envelope is 100 concurrent users, 10 checkouts/minute, 10k Products, 2k Services, 100 Vendors. [Performance](../quality/PERFORMANCE-RELIABILITY-AND-SLO.md)
  <a id="dec-137"></a>
- `DEC-137` — Target is 99.5% measured monthly internal SLO, Better Stack status, error-budget release pauses. [Performance](../quality/PERFORMANCE-RELIABILITY-AND-SLO.md)
  <a id="dec-153"></a>
- `DEC-153` — Security acceptance target is OWASP ASVS 5.0 Level 2. [ASVS matrix](../security/ASVS-5-LEVEL-2-MATRIX.md)
  <a id="dec-157"></a>
- `DEC-157` — The first public release contains goods and Bookings, superseding the earlier smaller public slice. [Release gates](../requirements/PHASE-AND-RELEASE-GATES.md)
  <a id="dec-158"></a>
- `DEC-158` — Launch cart is mixed multi-Vendor. [Release gates](../requirements/PHASE-AND-RELEASE-GATES.md)
  <a id="dec-160"></a>
- `DEC-160` — First public release includes pickup and delivery. [Release gates](../requirements/PHASE-AND-RELEASE-GATES.md)
  <a id="dec-162"></a>
- `DEC-162` — Vendors apply, pass private verification/review, and require Platform approval before publishing. [Roles](../product/ROLES-PERMISSIONS-AND-RESPONSIBILITIES.md)
  <a id="dec-172"></a>
- `DEC-172` — Demo workspace lifetime is fixed at 24 hours. [Demo](../demo/ISOLATION-QUOTAS-EXPIRY-AND-CLEANUP.md)
  <a id="dec-177"></a>
- `DEC-177` — Demo entry has no signup after Turnstile/abuse checks. [Demo](../demo/PUBLIC-DEMO-DESCRIPTION.md)
  <a id="dec-178"></a>
- `DEC-178` — Public demo exposes all roles safely within the workspace; global/high-risk side effects remain unavailable/simulated. [Demo](../demo/PERSONA-AND-ROLE-SWITCHING-MATRIX.md)
  <a id="dec-179"></a>
- `DEC-179` — External services target free tiers plus a US$25/month ceiling, excluding VPS/domain. [Capacity](../deployment/CAPACITY-COST-AND-SCALING.md)
  <a id="dec-189"></a>
- `DEC-189` — Pending Vendors may prepare privately before approval but cannot publish/transact. [Roles](../product/ROLES-PERMISSIONS-AND-RESPONSIBILITIES.md)
  <a id="dec-190"></a>
- `DEC-190` — Current development is local-only with fresh local accounts/database, email/password and Google authentication, and Mailpit delivery; MFA/Didit and private staging acceptance are deferred until pre-public-release restoration. [Local authentication decision record](../quality/AUTH-SIMPLIFICATION-DECISIONS.md)

## Release and supersession

<a id="dec-106"></a>

- `DEC-106` — Goods purchase is the first private vertical slice. [Multiphase requirements](../requirements/MULTIPHASE-REQUIREMENTS.md)
  <a id="dec-138"></a>
- `DEC-138` — **SUPERSEDED.** Earlier public-release-after-goods-pickup strategy. [Supersession record](./REJECTED-DEFERRED-AND-SUPERSEDED.md)
- Later public-release requirements replace `DEC-138` while preserving private staged slices. [Release gates](../requirements/PHASE-AND-RELEASE-GATES.md)
