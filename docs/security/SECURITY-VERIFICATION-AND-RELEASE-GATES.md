# Security Verification and Release Gates

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-060`, `DEC-153`, `DEC-162`, `DEC-163`

No phase is publicly releasable until its security-relevant requirements have evidence. Required future evidence includes threat-model review, authorization tests, session and CSRF/origin tests, SAST/dependency/secret checks as derived technical defaults, upload/provider contract tests, security logging/redaction review, backup/restore exercise, and remediation of critical/high findings or documented risk acceptance by the appropriate distinct approver.

| Gate                     | Minimum evidence                                                                                      | Failure outcome         |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------- |
| Pre-merge                | tests/lint/type controls selected later; secrets scan; review of changed authorization or ledger path | block merge             |
| Private staging          | migrations reviewed, provider sandbox isolation, adverse-path API and webhook tests                   | block promotion         |
| Public portfolio release | ASVS applicability matrix, threat review, demo isolation/expiry, no real secrets/data, rollback plan  | block release           |
| Future commercial gate   | fresh legal/payment/KYB/privacy evidence and independent security assessment scope                    | no commercial operation |

Evidence is indexed under [quality evidence](../quality/EVIDENCE-INDEX.md). A document saying “specified” never substitutes for test output or a review record.

| Security acceptance ID | Target scenario                                                                                                                                                     | Evidence class           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `TST-SEC-001`          | threat-boundary and ASVS applicability review finds every in-scope architecture/control item owned, tested, or explicitly non-applicable                            | `EVD-SEC-*`              |
| `TST-SEC-012`          | adversarial isolation suite rejects ID enumeration, stale membership, cross-Location action, role downgrade, realtime-room join, signed-media reuse, and job replay | `EVD-SEC-*`, `EVD-REQ-*` |
