# Return, Dispute, and Support Case State Machines

**Status:** Specified — Not Executed — Not Verified

## `STATE-RET-001` — ReturnCase

| From → to                     | Actor                     | Guard                                                             | Side effect                                  | Timeout/terminal/recovery                                                          |
| ----------------------------- | ------------------------- | ----------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| Draft → Submitted             | Customer                  | owns exact eligible line/quantity; policy window/evidence         | `EVT-RETURN-SUBMITTED`                       | ineligible gives reason/no state change                                            |
| Submitted → Approved/Declined | Vendor/Platform authority | snapshotted policy/evidence                                       | logistics/refund instruction/audit           | appeal/dispute route                                                               |
| Approved → InTransit          | Customer/Vendor           | accepted instructions and shipment/handoff proof where applicable | evidence/stock pending event                 | loss/late path opens scoped case; no automatic refund inference                    |
| InTransit → Received          | Vendor/Platform receiver  | item/quantity proof matches scoped ReturnCase                     | receipt/disposition event                    | missing/damaged evidence remains case-visible and contestable                      |
| Received → Inspected          | Vendor/Platform           | scoped inspection                                                 | disposition event                            | disputed evidence preserved                                                        |
| Inspected → Refunded          | authorized outcome        | policy/Dispute result allows refund                               | initiate provider refund + reversal/movement | provider unknown becomes `ReconciliationRequired`; original sale remains immutable |
| Inspected → ResolvedNoRefund  | authorized outcome        | policy/Dispute result denies refund                               | preserve decision/evidence/audit             | terminal case outcome; appeal/dispute policy remains available                     |

## Dispute

| From → to                                           | Actor                                        | Guard                                                       | Side effect                                                       | Timeout/terminal/recovery                                                     |
| --------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Open → EvidenceCollection                           | Customer/Vendor/authorized Platform role     | scoped affected component/value and dispute basis           | freeze only affected earning/value; request/retain evidence       | missing evidence remains visible; no financial inference                      |
| EvidenceCollection → DecisionPending                | authorized case owner                        | minimum evidence/policy/response window reached             | record proposed outcome and approval tier                         | further evidence returns to collection through explicit event                 |
| DecisionPending → FullRefund/PartialRefund/NoRefund | authorized decision-maker + required checker | snapshotted policy, evidence, and approval complete         | issue scoped provider/ledger command and immutable decision audit | provider uncertainty enters `ReconciliationRequired`; no result is fabricated |
| FullRefund/PartialRefund/NoRefund → Closed          | case owner                                   | provider/reconciliation and required communication complete | release/freeze/reverse only affected value; close case            | reopening requires an explicit appeal/new event, not direct edit              |

## SupportCase

| From → to                                     | Actor                                 | Guard                                                   | Side effect                                                    | Timeout/terminal/recovery                                    |
| --------------------------------------------- | ------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| Open → WaitingCustomer                        | Support/Vendor/Customer participant   | scoped case needs Customer information                  | send scoped notification and audit status                      | notification failure is retried/logged; case remains open    |
| Open → WaitingVendor                          | Support/Customer/Vendor participant   | scoped case needs Vendor information                    | send scoped notification and audit status                      | notification failure is retried/logged; case remains open    |
| Open/WaitingCustomer/WaitingVendor → InReview | authorized Support/Trust/Finance role | authority matches case type and evidence scope          | assign queue/owner and record work                             | financial action is delegated to formal policy/approval path |
| InReview → Resolved                           | authorized case owner                 | documented answer/action and communication ready        | audit outcome; link formal refund/dispute transition if needed | no unilateral money effect from SupportCase alone            |
| Resolved → Closed                             | system/case owner                     | configured close condition and no pending formal action | preserve transcript/audit and close                            | reopening requires explicit event and reauthorization        |

Missing/failed provider result leaves `ReconciliationRequired`, never fabricated resolution. Actor must be scoped; high-risk decision needs required approval.
