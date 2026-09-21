# Webhook Contracts

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** external callback safety and reconciliation

Each provider webhook endpoint is provider-specific, raw-body signature-verified before parsing/side effects, time/replay checked where provider permits, rate constrained, and recorded in a durable inbox. Inbox identity uses provider + event ID (or documented canonical substitute); duplicate delivery is a no-op that returns safe acknowledgment.

Processing sequence: receive → authenticate → persist inbox → map/validate provider payload → idempotently apply internal command → emit outcome/audit → reconcile. Unknown/malformed/stale/out-of-order event becomes retained exception/reconciliation item, not inferred financial/booking success. Provider callback has no User `AccessContext`; adapter uses minimal system authority and validates reference/environment/merchant/workspace binding.

Required future contracts cover payment/refund/chargeback/transfer/payout, provider message receipt if used, meeting async callback if available, and storage processing callback. Outage/retry/dead-letter behavior links [provider failure tests](../quality/PROVIDER-CONTRACT-AND-FAILURE-TESTING.md) and `RUN-005`/`RUN-007`.
