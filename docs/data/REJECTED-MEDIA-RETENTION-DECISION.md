# Rejected-media retention decision — pending owner policy

Date: 2026-10-09. Owner: Platform Trust/media operations. Status: **provisional operational choice; policy approval pending**.

The project owner confirmed that the governing jurisdiction and approved business/legal policy have not yet been decided. No counsel review or approved retention decision is recorded. The implementation cannot turn an undecided policy into a legally validated duration.

The 2026-10-09 [governing retention policy draft](./GOVERNING-RETENTION-POLICY.md) supplies the project-wide review artifact, including proposed metadata, audit, hold-review, backup and journal schedules. The owner reconfirmed that the governing context is undecided. Draft preparation does not close this decision or approve its proposed durations.

## Current choice

Keep `rejected-media-v1` at 30 elapsed days from rejection, with explicit preservation holds and a minimum 30-day grace after release. There is no project evidence supporting a different number. Thirty days is a bounded opportunity to correct/challenge rejection; it is a proposed business window, not a statutory requirement or a measured optimum. Existing rejected records stay held until an operator reviews them. Public access is denied immediately on rejection.

## Decision needed before real-account release

The responsible policy owner must record:

1. Deployment jurisdiction(s), controller/operator, and whether media includes real personal data.
2. Approved appeal/correction window and support resolution expectations. Media must remain available through that window or receive an explicit case hold.
3. Applicable preservation/deletion obligations reviewed by the responsible legal reviewer, including exceptional content requiring earlier deletion or mandatory preservation.
4. Maximum backup/Object Lock lifetime and when inaccessible archive copies expire. A locked archive cannot satisfy an immediate physical-deletion claim.
5. Hold review cadence and ownership, plus separate schedules for deletion-journal metadata, moderation records, and audit evidence.
6. Named approver, source policy/review reference, effective date, duration, and backup behavior.

If approval changes the duration, introduce a new named policy version and update rejection snapshots and hold-release grace together. Do not silently reinterpret previously stored `retentionDueAt` deadlines. Document a prospective or explicitly approved migration of existing records, preserve active holds, and rehearse boundary behavior locally before adoption.

## Release disposition

Local implementation and synthetic evidence may proceed. Final retention-policy approval remains open until the decisions above exist. This document records the blocker and the current rationale; it does not assert real-account or commercial legal readiness.
