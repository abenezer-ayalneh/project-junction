# Test Strategy

**Status:** Specified — Not Executed — Not Verified  
**Normative owner:** verification approach  
**Decision coverage:** `DEC-004`, `DEC-060`–`DEC-062`, `DEC-086`, `DEC-123`, `DEC-153`, `DEC-157`–`DEC-161`

The target portfolio system must prove every public claim to the same production depth. Testing is cumulative: a later phase reruns earlier correctness, security, accessibility, and recovery evidence. No framework, CI pipeline, test suite, or executed result exists in this documentation phase.

| Test layer           | Purpose                                                          | Representative evidence |
| -------------------- | ---------------------------------------------------------------- | ----------------------- |
| Unit/domain          | policies, money rounding, guards, state transitions, permissions | `TST-DOM-*`             |
| API/contract         | request schemas, errors, idempotency, authorization, pagination  | `TST-API-*`             |
| Integration          | PostgreSQL constraints, outbox, worker, provider fake/adapters   | `TST-INT-*`             |
| Concurrency          | stock/slot holds, simultaneous checkout/amendment, ledger replay | `TST-CON-*`             |
| End-to-end           | Customer, Vendor, Staff, Platform journeys and accessibility     | `TST-E2E-*`             |
| Failure/chaos        | provider outage, retry, timeout, stale callback, job replay      | `TST-FLT-*`             |
| Operational/recovery | backup, restore, rollback, secret rotation, alert/runbook drills | `TST-OPS-*`             |

Acceptance evidence is immutable or versioned, links source/requirement/policy/test/result, and distinguishes an expected scenario from a passed execution. Fakes are deterministic and do not substitute for a later provider sandbox contract test.
