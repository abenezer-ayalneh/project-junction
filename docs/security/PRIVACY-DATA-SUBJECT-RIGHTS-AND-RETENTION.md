# Privacy, Data Subject Rights, and Retention

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-011`, `DEC-062`, `DEC-123`, `DEC-170`, `DEC-174`

Project Junction’s portfolio target uses synthetic content and must minimize personal data. A future commercial privacy posture requires jurisdiction-specific validation and is not asserted here.

`CTL-080`–`CTL-087` require: purpose and role classification before collection; explicit opt-in for personalization; separation of account/contact data from transactional and operational evidence; export and deletion request workflows; immutable financial/audit records retained or pseudonymized when deletion conflicts with a legitimate accounting/security obligation; retention timers with legal-hold override; and no data promotion from demo into future environments.

| Data class            | Examples                                             | Target handling                                                                       |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Public marketplace    | published storefront/listing/review                  | public by deliberate publication; moderation archive retained                         |
| Account/contact       | name, phone, email, address                          | least privilege, encrypted in transit/at rest where supported, export/delete workflow |
| Sensitive operational | support evidence, dispute files, provider references | limited case access, audit trail, shortest justified retention                        |
| Financial/audit       | ledger postings, approvals, reconciliations          | append-only/reversal correction; preserve required evidence                           |
| Demo synthetic        | personas, orders, verification fixtures              | isolated, labeled, automatically purged no later than 24 hours                        |

Requests and exceptions must be recorded as Support Cases or privacy cases without exposing requester data to unrelated Vendor staff. Retention durations are `REQUIRES-FUTURE-VALIDATION` until counsel and local policy review; the data model must make them configurable and testable.
