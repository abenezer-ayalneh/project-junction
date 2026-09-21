# Sandbox Payments and Provider Substitutes

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-025`, `DEC-066`, `DEC-077`, `DEC-098`, `DEC-099`, `DEC-139`, `DEC-164`

| Capability               | Demo substitute                                                     | What it proves                                 | What it does not prove                                                |
| ------------------------ | ------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| Payments/refunds/payouts | deterministic FakePayment or clearly labeled Stripe sandbox fixture | Checkout, webhook, ledger, reconciliation path | real money movement, merchant eligibility, Ethiopian payment legality |
| Identity/KYB             | synthetic evidence fixture                                          | state machine and restricted operations        | identity verification or regulatory compliance                        |
| Online meeting           | DemoMeet                                                            | Booking join/attendance/recovery path          | Google account authorization or production meeting availability       |
| Delivery/SMS/email       | outbox/captured notification fixtures                               | intent, policy, retry/audit                    | physical delivery or real message receipt                             |
| Maps/media               | local deterministic/map fixture and quarantined synthetic assets    | UI/error/processing boundaries                 | live provider capacity or rights clearance                            |

All substitute names, screens, and records must visibly say synthetic or sandbox. Sandbox Stripe’s merchant-role split models Junction as payment merchant and Vendors as contracting sellers only for portfolio proof. It never becomes a commercial arrangement by implication.
