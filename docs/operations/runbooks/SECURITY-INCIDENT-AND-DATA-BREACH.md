# RUN-013 — Security Incident and Data Breach

**Status:** Specified — Not Executed — Not Verified  
**Target owner:** Platform Owner with the affected operation owner and an explicitly designated incident decision-maker  
**Trigger:** Suspected compromise, credential misuse, unauthorized access/disclosure, malware/unsafe provider input, integrity failure, or security-control alert requiring investigation.

## Safeguards

- Protect people and contain access first, without destroying evidence or turning off unrelated controls. Start a restricted incident record with observed facts, time, reporter, affected environment, and authority to act.
- Preserve sanitized logs, immutable audit references, provider/webhook evidence, and a timeline. Avoid downloading or copying personal/sensitive data beyond what the investigation requires.
- Do not speculate publicly, conceal an incident, make legal conclusions, or promise notification timing. Jurisdictional notification, tax, payment, and regulatory obligations remain future-validation work.
- Keep demo, staging, portfolio-production, and any future commercial environments strictly separate throughout investigation and recovery.

## Target procedure

1. Triage severity and scope: identities/roles, assets, data classification, environment/workspace boundary, entry path, ongoing access, provider involvement, and potential affected subjects.
2. Contain the smallest safe scope: disable/restrict affected sessions, service access, signed links, or integrations; fence unsafe workflows; preserve trusted access needed for recovery. Start [RUN-004](SECRET-ROTATION.md) for implicated credentials.
3. Collect and protect investigation evidence with restricted access. Correlate audit logs, application/edge/provider events, state transitions, and relevant support/financial cases without altering the underlying record.
4. Eradicate the confirmed cause through reviewed configuration, credential, dependency, media, or access-control correction. Recover only through clean verified paths, using [RUN-003](BACKUP-PITR-AND-CLEAN-HOST-REBUILD.md) if restoration is required.
5. Validate containment and recurrence resistance with targeted access, isolation, upload/provider, and critical-journey checks. Make any needed notifications only after future legal/owner validation and retain the approved communication record.

## Rollback, recovery, and escalation

- Do not restore credentials, public access, or an impaired service solely because the visible symptom disappears. Maintain containment until the scope, remediation, and verification are documented.
- Use [RUN-009](MEDIA-QUARANTINE-FAILURE.md) for unsafe media, [RUN-005](PROVIDER-OUTAGE.md) for provider dependency containment, and [RUN-007](PAYMENT-LEDGER-AND-PAYOUT-MISMATCH.md) for financial consequences. Keep their evidence linked to, not merged into, the restricted incident record.
- Escalate immediately when there is active unauthorized access, sensitive-data disclosure, cross-environment boundary failure, potential fraud/payment impact, inability to preserve evidence, or a decision that requires legal/regulatory authority not yet defined.

## Verification and evidence

Create restricted `EVD-SEC-*` and `EVD-OPS-*` evidence with incident ID, scope/classification, containment actions, evidence chain, secret/provider/financial linkages, remediation, verification result, approved communications, and residual risk. Do not include credentials, raw sensitive data, or unnecessary identity data. Future security evidence must map to the relevant `CTL-*`, ASVS, and release-gate controls.

## Related normative documents

- [Threat model](../../security/THREAT-MODEL.md)
- [Privacy, data subject rights, and retention](../../security/PRIVACY-DATA-SUBJECT-RIGHTS-AND-RETENTION.md)
- [Security verification and release gates](../../security/SECURITY-VERIFICATION-AND-RELEASE-GATES.md)
