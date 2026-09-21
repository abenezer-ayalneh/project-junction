# Messaging, Notifications, and Moderation

> **Status:** Planned communication and trust behavior; no channel/provider is configured.

## Scoped messaging

Conversations are allowed only when anchored to an offering, Vendor Order/line, Booking, return, or dispute. `[DEC-064]`

Required capabilities are:

- authorized participants derived from the anchored context;
- text and controlled attachments;
- blocking and reporting;
- moderation and evidence preservation;
- retention policy; and
- immutable/audited administrative actions. `[DEC-064]`

Junction does not provide a general social inbox, arbitrary User lookup, Customer-to-Customer chat, or marketing conversation. `[DEC-064]`

## Attachment boundary

Attachments use private signed upload/access, ownership metadata, quarantine, malware/type validation, and moderation. A message cannot reference a caller-supplied arbitrary object key or public Listing rendition. `[DEC-088, DEC-129]`

The planning session did not confirm exact image/PDF types, counts, sizes, or retention durations; those remain proposed configuration.

## Notifications

Supported channels are:

- in-app;
- email;
- standard Web Push using VAPID; and
- optional SMS. `[DEC-065, DEC-122]`

Business contexts emit committed facts to a notification outbox. Channel delivery is asynchronous and idempotent; notification failure does not roll back payment, Order, Booking, return, or dispute state. `[DEC-073, DEC-086]`

Preference, consent, mandatory transactional exceptions, quiet hours, and exact retry/retention values require explicit policy documentation before implementation; exact values were not confirmed.

## Email

Resend is the selected email provider. Integration requires outbox idempotency, provider webhooks, suppression handling, authenticated sending domain, and a deterministic demo sink. `[DEC-073]`

Provider accepted/delivered/bounced/complained/suppressed state is delivery evidence only; it cannot change the source business transaction.

## Web Push

Use standard Web Push with VAPID. `[DEC-122]`

Subscriptions belong to one real User/browser/environment or one synthetic Demo Workspace and must be revocable, scope-safe, and removable after demo expiry or User deletion. Notification payloads disclose the minimum necessary information and fetch sensitive detail through authenticated REST.

## SMS

Public demo uses a deterministic SMS sink. Private staging may use AfroMessage only for allowlisted transactional templates. SMS is one-way, not marketing or chat. `[DEC-074]`

Because AfroMessage callbacks are not signed under the researched contract, callback receipt is not final authority. Use a high-entropy endpoint plus provider polling/reconciliation, and never place secrets or excessive personal/order data in message bodies. `[DEC-074]`

## Realtime in-app delivery

Socket.IO uses authenticated rooms, forced WebSocket transport, Zod envelopes, Redis fanout, and ordered cursors. REST remains authoritative; cursor gaps trigger refetch/reconciliation. `[DEC-072, DEC-124]`

Rooms are scoped to workspace and the authorized Customer/Vendor/Platform resource. A role or membership change invalidates future subscription authority. `[DEC-129]`

## Moderation

Rules may route risky Listings, media, messages, reviews, and Vendor updates into a human moderation queue. `[DEC-047, DEC-063]`

Moderation records:

- source object/version and scope;
- signals/reports and reporter protection;
- evidence snapshot;
- assigned human decision and reason;
- resulting visibility/restriction action;
- actor/time/audit; and
- appeal and appeal outcome. `[DEC-063]`

Moderation cannot edit immutable financial, stock, handoff, or original evidence history. It may restrict visibility/access and publish a decision event to the owning context.

## Vendor updates and social boundary

Vendor updates are the only planned broadcast-style social content. They are followed through Vendor follows and remain subject to publication/moderation. Wishlists, saved Services/searches, and follows do not create a general feed or messaging relationship. `[DEC-051]`

## Acceptance criteria

- only context-authorized participants access a conversation;
- blocking/reporting works without erasing evidence; `[DEC-064]`
- attachment IDs cannot cross workspace/Vendor/Customer scope; `[DEC-129]`
- duplicate outbox/provider callback does not duplicate visible notification;
- suppressed/bounced email does not retry indefinitely; `[DEC-073]`
- public demo sends no real email or SMS; `[DEC-073, DEC-074]`
- AfroMessage callback alone cannot finalize delivery; `[DEC-074]`
- WebSocket cursor gap recovers through REST; `[DEC-124]`
- moderation decision and appeal are human, reasoned, and audited; `[DEC-063]`
- no channel becomes general social chat, SMS marketing, or source-of-truth mutation.
