# Privacy, Data Rights, and Data Lifecycle

> **Status:** Planned privacy behavior. No personal data store, retention job, export, or deletion workflow exists.

## Data-minimization principle

Project Junction stores the minimum data needed for the documented marketplace workflow, authorization, security, evidence, accounting, operations, and portfolio demonstration. Provider payloads are not copied wholesale when normalized fields and references suffice. `[DEC-088, DEC-095, DEC-123]`

Public-demo data is synthetic. It must not collect real KYB documents or become future-production data. `[DEC-066, DEC-109]`

## Data classes

At minimum classify:

- public Storefront, Listing, Vendor update, public review, and consenting Staff profile;
- authenticated Customer/Vendor profile and preferences;
- structured address/contact/instructions and Booking attendee details;
- private messages, attachments, handoff/completion/no-show/return/dispute evidence;
- authentication, MFA, session, security, block/report, and audit records;
- payment-provider references and safe saved-method display metadata;
- immutable ledger, stock movement, receipt, refund, transfer, payout, and reconciliation records;
- private Staff feedback and Vendor operational analytics;
- media quarantine/source/rendition metadata; and
- synthetic Demo Workspace data and cleanup records.

Each class needs owner context, allowed actors, public/private namespace, encryption/access expectations, retention trigger, export behavior, deletion/pseudonymization behavior, and audit sensitivity.

## Address and contact snapshots

Customer delivery data includes structured address, contact, landmark, instructions, and map pin. Checkout snapshots the necessary fulfillment version so a later profile edit does not alter historical delivery evidence. `[DEC-054]`

Historical snapshots must be hidden from unrelated Vendor members and retained only as long as the documented purpose requires.

## Payment and provider data

Junction stores only Stripe payment-method references and display metadata after explicit opt-in; no raw card data. Removal requires recent authentication. `[DEC-151]`

Provider IDs, webhook payloads, transfer/payout references, Google connection tokens, Resend/AfroMessage IDs, and storage keys are private operational data. They are environment-scoped and excluded or redacted from ordinary exports/logs.

## Analytics boundary

Analytics uses typed first-party events minimized to the Vendor operational/funnel purpose. No session replay, browser/device fingerprinting, or third-party behavioral analytics. `[DEC-052, DEC-123]`

Recommendation personalization, if enabled, must be consented, explainable, resettable, and revocable. Default rules should work from non-personal context. `[DEC-043]`

## Self-service export

Users can request export of data they are entitled to receive. `[DEC-060]`

Export must:

- authenticate and apply recent-auth where risk requires;
- scope to the requesting User/workspace and permitted Vendor roles;
- avoid another person’s private messages/evidence/Staff feedback/security data;
- include human-readable context for IDs and timestamps;
- generate through a private expiring download; and
- be auditable and idempotent.

Exact export format and completion period require later policy/legal validation.

## Deletion and pseudonymization

Users can request deletion. Mutable personal profile/preferences and unneeded content should be deleted according to policy. Records retained for legal, audit, security, abuse prevention, stock integrity, case evidence, or financial integrity are pseudonymized so they no longer expose the original person through ordinary product access. `[DEC-060]`

Deletion cannot unbalance Ledger Transactions, remove Stock Movements, rewrite receipts, erase dispute decisions, or invalidate provider reconciliation. `[DEC-049, DEC-060, DEC-140]`

Pseudonymization must use a stable non-identifying internal reference only where necessary to connect retained records; lookup back to the original person must be removed or separately restricted according to the retention purpose.

## Demo expiry and cleanup

Demo Workspaces have quotas, expiry, and automated cleanup. `[DEC-107]`

On expiry:

- revoke Persona access and WebSocket subscriptions;
- remove or anonymize workspace-owned mutable business data;
- expire signed object/download links;
- remove push subscriptions and queued communications;
- retain only minimum abuse/cleanup evidence;
- mark non-deletable provider sandbox objects inaccessible and queued for cleanup; and
- never reassign old provider objects to a new workspace. `[DEC-108, DEC-109]`

The exact expiry interval was not confirmed.

## Logs, errors, and observability

Sentry and Better Stack data must be scrubbed of passwords, session cookies, auth tokens, payment details, sensitive message/evidence bodies, Google/provider credentials, and excessive personal data. `[DEC-096]`

Correlation IDs should allow operational diagnosis without embedding Customer email, phone, address, or free text.

## Retention policy status

Exact retention periods for messages, evidence, reviews, audit, provider events, exports, media sources, and security logs were not confirmed. A future privacy/compliance document must validate them before implementation. Until then, no document should invent durations or promise immediate erasure of records required for immutable financial/security integrity.

## Acceptance criteria

- public demo collects no real KYB documents; `[DEC-066]`
- demo and future-production data never mix/promote; `[DEC-109]`
- analytics contains no replay/fingerprint/third-party behavioral tracker; `[DEC-123]`
- saved payment methods are opt-in, reference-only, and securely removable; `[DEC-151]`
- export cannot cross User/workspace/Vendor scope;
- deletion removes mutable access while pseudonymizing retained integrity records; `[DEC-060]`
- immutable Ledger/Stock/Case histories remain valid after deletion; `[DEC-049, DEC-140]`
- logs and provider metadata expose no secret or sensitive free text; and
- expired demo workspaces cannot be reopened or leak provider/object references. `[DEC-107–DEC-109]`
