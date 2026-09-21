# Booking, Meeting, Amendment, and Attendance State Machines

**Status:** Specified — Not Executed — Not Verified

## `STATE-BKG-001` — Booking

| From → to                          | Actor                       | Guard                                               | Side effect                               | Timeout/terminal/recovery                               |
| ---------------------------------- | --------------------------- | --------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| Held → Confirmed                   | Checkout                    | verified paid valid allocation                      | Booking snapshot, `EVT-BOOKING-CONFIRMED` | hold expiry releases if not confirmed                   |
| Confirmed → AmendmentPending       | Customer/authorized Vendor  | applicable snapshot/limit/cutoff                    | candidate allocation/price delta          | allocation/payment failure restores confirmed unchanged |
| AmendmentPending → Confirmed       | Checkout                    | atomic replacement slot + delta success             | release original, event/ledger            | duplicate resolves idem result                          |
| Confirmed → Cancelled              | Customer/Vendor/Platform    | policy/authority                                    | refund/cancel/earning change              | terminal except dispute                                 |
| Confirmed → AttendancePending      | clock/Staff                 | service start context                               | prepare verification                      | no automatic completion                                 |
| AttendancePending → Completed      | Customer+Staff              | mode evidence: code/QR or join + Staff confirmation | earning contest clock                     | disputable                                              |
| AttendancePending → NoShowReported | Staff                       | structured evidence                                 | contest notification/clock                | Customer contest/dispute                                |
| NoShowReported → NoShowFinal       | clock/authorized resolution | contest outcome                                     | policy ledger/earning start               | disputable per policy                                   |

Any-Staff reassignment with notice is permitted by policy; named Staff requires Customer consent or cancellation/refund. Flexible policy has 24h/2h refund bands and two amendments before 2h; Standard has 48h/12h bands and one amendment before 12h. Provider cancellation refunds 100%; Vendor disruption does not consume Customer allowance. Waitlist never enters Held/Confirmed.

## `STATE-MTG-001` — Meeting provision

| From → to                                         | Actor                          | Guard                                                                                         | Side effect                                                                               | Timeout/terminal/recovery                                                            |
| ------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Pending → Provisioning                            | meeting worker                 | confirmed, paid online Booking; assigned Staff connection eligible; stable operation identity | invoke provider adapter after committed Booking event                                     | adapter timeout/failure creates retry work; Booking remains confirmed                |
| Provisioning → Ready                              | worker/provider adapter        | verified provider response belongs to the Booking/environment/Staff connection                | persist protected meeting reference, emit `EVT-MEETING-READY`, notify scoped participants | terminal usable meeting state; later change uses explicit replacement workflow       |
| Provisioning → RetryScheduled                     | worker                         | retriable timeout/temporary/malformed-but-safe provider failure                               | persist scrubbed failure/attempt and schedule bounded retry                               | no meeting link is invented or exposed                                               |
| RetryScheduled → Provisioning                     | worker                         | retry budget and Booking still active                                                         | reissue same semantic provisioning operation                                              | duplicate provider result resolves to one recorded meeting state                     |
| Provisioning/RetryScheduled → ReplacementRequired | clock/operations               | safety cutoff reached without valid meeting                                                   | protect Customer/Staff communication and open replacement decision                        | authorized manual replacement or cancellation/refund is required                     |
| ReplacementRequired → Ready/BookingCancelled      | authorized operations/Checkout | valid replacement or approved provider-failure compensation                                   | save protected replacement or cancel Booking with full refund/reversal                    | terminal outcome is auditable; no Calendar sync/recording/transcription state exists |

Public demo uses DemoMeet; private staging provider paths remain separated.
