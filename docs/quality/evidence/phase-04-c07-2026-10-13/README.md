# P04-C07 local evidence — 2026-10-13

User local machine only. Disposable loopback PostgreSQL schemas, built API/worker, production Next server and headless Microsoft Edge. No remote deployment or live funds.

`browser.json` records the complete mixed checkout journey. Desktop/mobile quote, confirmation and Purchase captures plus mobile unknown-payment capture show the served UI. Browser holds retry with the original idempotency key; two requests create one authoritative hold. One payment commits two Orders and one Booking. Browser proof runs after HTTP checks to preserve their fixture stock assertions. The test server uses temporary Nx state to avoid sharing a user's active preview task and drains intercepted requests before shutdown.

Checks: five-project Nx lint/typecheck/unit targets (123 passed, one existing worker skip); API/web builds; focused mixed Purchase PostgreSQL suite and built HTTP/actual worker; 48-migration compatibility and populated upgrade; docs/public-contract audits; Impeccable detector and bounded visual review. See verification.json for exact results and open gates.

Reproduce workspace checks with `pnpm nx run-many -t lint,typecheck,test --projects=contracts,platform-core,api,worker,web --parallel=3` and builds with `pnpm nx run-many -t build --projects=api,web --parallel=2`. Load local `.env` into the process for database checks. Set `FOUNDATION_TEST_NAME="Phase 04 mixed Purchase split"` and `MIXED_CHECKOUT_BROWSER_CHECK=1` plus `PLAYWRIGHT_MODULE_PATH` to the local Playwright index.mjs, then run `pnpm nx run platform-core:test-integration`. Run `node --env-file=.env tools/check-migration-compatibility.mjs` and `node --env-file=.env tools/check-populated-upgrade.mjs` for the separate migration checks.

Controlled fixture accounts may be verified. Normal local accounts remain unverified under DEC-190. The checkout eligibility read does not enable identity verification. Formal provider, independent accessibility, retention, target recovery and phase/public-release gates remain open. C08 is not started.
