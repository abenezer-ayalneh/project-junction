# Returns, Disputes, Support, and Reviews

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** post-purchase case and feedback behavior  
**Decision coverage:** `DEC-030`, `DEC-031`, `DEC-035`, `DEC-038`–`DEC-041`, `DEC-060`, `DEC-063`, `DEC-064`, `DEC-133`, `DEC-146`, `DEC-166`, `DEC-183`, `DEC-187`, `DEC-188`

Policies are Platform templates selected by Vendor and snapshotted on Product line/Booking. Goods change-of-mind uses 7- or 14-day policy with 30-day fault protection. Product exchange does not exist: Customer uses ReturnCase/refund and makes a fresh Purchase. Vendor-fault logistics and full-failure original delivery follow snapshotted policy; eligible change-of-mind return logistics is Customer-paid.

ReturnCase targets exact line/quantity, reason, eligibility, evidence, logistics, receipt/inspection, stock disposition, refund, earning effect, and optional Dispute. A Dispute is an evidence-backed authorized decision: full refund, partial refund, or no refund. It freezes only affected value and never changes unrelated Purchase components. Refund/stock/ledger effects use state transitions/new movements/postings.

SupportCase is the in-app case for assistance; private offering inquiry and transaction-scoped messages are permitted, but no public Q&A/general inbox. Review eligibility follows completed Product line/Booking; one verified review per eligible component, dimensions distinguish listing/service and Vendor experience, Staff feedback stays private, public content is moderated with report/appeal route.

Evidence is private/scoped/quarantined, retained/minimized/pseudonymized according to data policy, and cannot circumvent Customer/Vendor/Platform authority.

Local `P02-C11` implements scoped goods ReturnCases and ordered logistics/inspection/refund evidence under the paid 7/14/30-day policy. Refund allocation reuses the immutable goods compensation ledger and preserves original sale facts. Customer case reads reconcile provider outcomes; inspection does not automatically restock. No return UI, formal Dispute, SupportCase, earning mutation or live carrier/provider acceptance is claimed. See the [dated C11 evidence](../requirements/PHASE-02-GOODS-COMMERCE.md#p02-c11--goods-returns-and-inspection--2026-10-12).
