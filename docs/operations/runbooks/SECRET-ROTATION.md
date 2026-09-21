# RUN-004 — Secret Rotation

**Status:** Specified — Not Executed — Not Verified  
**Target owner:** Platform Owner and the secret's designated service owner  
**Trigger:** Planned rotation, staff/access change, provider revocation, failed authentication, or suspected credential exposure.

## Safeguards

- This target procedure must never put a secret value in documentation, issue comments, terminal history, screenshots, logs, test fixtures, or `EVD-*` evidence.
- Identify the exact credential, environment, owner, scope, expiration/revocation behavior, dependent services, webhook validation role, and safe overlap window before making a change.
- Use a least-privilege replacement credential in the correct isolated future environment. Do not copy a portfolio/demo secret to staging or any future commercial environment.
- If exposure is suspected, begin [RUN-013](SECURITY-INCIDENT-AND-DATA-BREACH.md) concurrently; an exposed credential must not be re-enabled as a rollback shortcut.

## Target procedure

1. Create a restricted rotation record with a correlation ID, business reason, target consumers, owner, and planned verification. Keep actual values only in the future approved secret-management boundary.
2. Issue and stage the replacement credential with the narrowest required permissions. Update only its intended consumers and reload/redeploy them in a controlled order.
3. Verify authentication, authorized scope, webhook signature continuity where relevant, background jobs, and provider callbacks using sanitized traces. Ensure no consumer is silently using a fallback or old credential.
4. Revoke the former credential once replacement behavior is verified, or immediately when exposure demands it. Remove obsolete references and check sanitized telemetry for unexpected use.
5. Update the secret inventory, owner/review date, dependency record, and follow-up remediation without recording secret material.

## Rollback, recovery, and escalation

- For a non-compromise planned rotation that fails before revocation, restore only the previously authorized credential through the approved secret boundary, investigate, and retry under a new change record.
- Never reactivate a possibly exposed credential. Contain affected consumers, rotate related credentials as scope requires, and follow [RUN-013](SECURITY-INCIDENT-AND-DATA-BREACH.md).
- Escalate to the provider owner if overlap/revocation semantics are unknown or callback validation fails; use [RUN-005](PROVIDER-OUTAGE.md) if the change causes a provider-facing outage.

## Verification and evidence

Record a restricted `EVD-OPS-*` entry containing secret inventory ID (never value), environment, owner, reason, consumer list, authorization-scope result, timestamps, old credential revocation state, sanitized verification result, and any incident linkage. Future release evidence must meet applicable `CTL-*` and `TST-OPS-*` controls.

## Related normative documents

- [Secrets, TLS, and origin security](../../deployment/SECRETS-TLS-AND-ORIGIN-SECURITY.md)
- [Application, upload, and provider security](../../security/APPLICATION-UPLOAD-AND-PROVIDER-SECURITY.md)
- [Security verification and release gates](../../security/SECURITY-VERIFICATION-AND-RELEASE-GATES.md)
