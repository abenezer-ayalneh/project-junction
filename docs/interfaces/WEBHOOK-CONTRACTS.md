# Webhook Contracts

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** external callback safety and reconciliation

Each provider webhook endpoint is provider-specific, raw-body signature-verified before parsing/side effects, time/replay checked where provider permits, rate constrained, and recorded in a durable inbox. Inbox identity uses provider + event ID (or documented canonical substitute); duplicate delivery is a no-op that returns safe acknowledgment.

Processing sequence: receive → authenticate → persist inbox → map/validate provider payload → idempotently apply internal command → emit outcome/audit → reconcile. Unknown/malformed/stale/out-of-order event becomes retained exception/reconciliation item, not inferred financial/booking success. Provider callback has no User `AccessContext`; adapter uses minimal system authority and validates reference/environment/merchant/workspace binding.

Required future contracts cover payment/refund/chargeback/transfer/payout, provider message receipt if used, meeting async callback if available, and storage processing callback. Outage/retry/dead-letter behavior links [provider failure tests](../quality/PROVIDER-CONTRACT-AND-FAILURE-TESTING.md) and `RUN-005`/`RUN-007`.

## Local Phase 04 C05 payment inbox and compensation — 2026-10-13

`POST /v1/payments/local-mixed-webhook` is a local synthetic provider endpoint, with no Customer cookie authority. The route consumes bounded raw bytes before the default JSON parser. `x-junction-payment-signature` is `<unixSeconds>.<hexHmacSha256>` over timestamp, a dot and exact bytes; comparison is timing-safe and delivery tolerance is five minutes. An explicit random local signing key of at least 32 characters is required. No live provider or staging adapter is enabled by this contract.

After authentication, provider/event ID deduplication durably persists the receipt before reconciliation. Changed terms for the same event ID create a retained conflict record; original history is untouched. Malformed authenticated bodies and wrong payment/reference/workspace/merchant/environment/Money/time become retained exceptions. Pending facts reconcile once to `reconciled`, `superseded` or `exception`; final outcome/time and payload are immutable. Unknown/failure after recorded capture cannot downgrade cash truth. Success after failed/released/expired resources creates full compensation, never a Purchase. Acknowledgment means inbox acceptance, not commercial success. System processing uses original authoritative scope without a User AccessContext.

All development and verification are local. [C05 evidence](../quality/PHASE-04-LOCAL-ACCEPTANCE-EVIDENCE.md#p04-c05--payment-inbox-and-compensation--2026-10-13).
