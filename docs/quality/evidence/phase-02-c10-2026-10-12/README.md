# P02-C10 local delivery evidence — 2026-10-12

Verification used disposable loopback PostgreSQL schemas and built local Nest API processes. Forty-seven commerce/authority scenarios pass, including five new delivery scenarios. Four pure policy tests pass. The built HTTP smoke exercises dispatch/replay, evidenced failure, Customer address acknowledgements, outside-zone rejection, one corrected retry, Customer-only proof and one-time code handoff.

Repository evidence covers unchanged paid snapshots, immutable milestone rows, out-of-order/current authority denial, exact 48-hour cutoff, concurrent worker expiry without resale, five-attempt proof lock, fresh distinct-witness fallback and stale acknowledgement denial, authoritative handoff time, atomic complete inspection/refund recovery, concurrent duplicate dispatch/inspection and injected inspection failure with rollback/same-key retry. Delivered handoff creates no additional sale movement.

Thirty-two migrations deploy and replay; schema compatibility has no difference; populated supported-foundation upgrade passes. Five-project lint/typecheck/unit checks pass (65 tests and one OpenAPI snapshot, existing worker test skipped). Documentation and contract audits pass.

The broader local integration run passed 98 tests with one unrelated media backup controller test failure. MinIO and ClamAV were started locally after initial missing-service failures. The final controller failure remains a documented regression limitation. No remote or staging verification occurred.

Reproduction and limits: [C10 requirements evidence](../../../requirements/PHASE-02-GOODS-COMMERCE.md#p02-c10--vendor-delivery-and-corrected-retry--2026-10-12). Local delivery completion does not claim UI, actual notification delivery, live refund provider, Phase 04 earnings or formal Phase 02 exit.

C12 audit update — 2026-10-12: the media controller regression was a fixture-isolation issue and is resolved locally. All 108 integration scenarios now pass in isolated suites; see [the consolidated acceptance evidence](../../PHASE-02-LOCAL-ACCEPTANCE-EVIDENCE.md). Historical results above remain the chunk's original verification record.
