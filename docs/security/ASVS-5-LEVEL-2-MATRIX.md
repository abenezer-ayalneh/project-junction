# ASVS 5.0 Level 2 Matrix

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-153`; technical target is a User-confirmed outcome, individual tools are derived defaults.

Project Junction targets the applicable portions of OWASP ASVS 5.0 Level 2. This is a planning matrix, not a claim of implementation, assessment, or certification.

| ASVS area                  | Junction control intent                                             | Primary evidence                   | Status    |
| -------------------------- | ------------------------------------------------------------------- | ---------------------------------- | --------- |
| V1 Architecture            | context ownership, trust boundaries, secure defaults, threat model  | architecture review, `TST-SEC-001` | specified |
| V2 Authentication          | account verification, session rotation/revocation, abuse throttling | auth tests and logs                | specified |
| V3 Session management      | opaque/rotated sessions, secure cookies, logout-all devices         | browser/API tests                  | specified |
| V4 Access control          | `AccessContext`, Vendor/Location isolation, dual control            | role matrix/IDOR tests             | specified |
| V5 Validation/sanitization | schema validation, safe rendering, CSV/media validation             | negative tests                     | specified |
| V6 Cryptography            | TLS, encrypted backups, managed secrets, signed provider calls      | configuration/recovery evidence    | specified |
| V7 Error handling/logging  | safe errors, correlation IDs, audit events, secret redaction        | log inspection tests               | specified |
| V8 Data protection         | classification, retention, exports/deletion, minimization           | privacy test evidence              | specified |
| V9 Communications          | TLS/origin policy, webhook signatures, safe realtime auth           | integration tests                  | specified |
| V10 Malicious code         | dependency/SAST/secret scans as derived release controls            | pipeline evidence                  | specified |
| V11 Business logic         | holds, idempotency, ledger balance, disputes and approvals          | concurrency/financial tests        | specified |
| V12 Files/resources        | quarantine, content validation, bounded transforms, signed URLs     | upload tests                       | specified |
| V13 API/web service        | authenticated capabilities, pagination, idempotency, rate limits    | API contract tests                 | specified |
| V14 Configuration          | environment separation, least privilege, staged rollout, rollback   | deployment evidence                | specified |

Each release gate must link an applicable ASVS item to a test or review in [security verification](./SECURITY-VERIFICATION-AND-RELEASE-GATES.md). Non-applicable items require a written rationale; no item may be silently omitted.
