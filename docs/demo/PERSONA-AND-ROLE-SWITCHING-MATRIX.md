# Persona and Role-Switching Matrix

**Status:** Specified — Not Executed — Not Verified  
**Decision coverage:** `DEC-010`, `DEC-107`, `DEC-117`, `DEC-118`, `DEC-162`, `DEC-163`, `DEC-168`–`DEC-170`

| Synthetic persona    | Intended proof                                                      | Accessible demo scope                        | Hard boundary                                     |
| -------------------- | ------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------- |
| Customer Ada         | browse, Cart, five Booking intents, Checkout, order/Booking/support | own synthetic profile/Purchases/Bookings     | no Vendor/Platform records                        |
| Vendor Owner Bekele  | storefront, catalog, stock, delivery, policy, staff                 | one synthetic Vendor and permitted Locations | no competitor/customer-wide data                  |
| Service Staff Chaltu | availability, attendance, consent-aware substitution                | assigned synthetic schedule/services         | no finance/catalog administration by default      |
| Support Desta        | linked Support Cases and safe assistance                            | assigned synthetic cases                     | no self-approved money/suspension                 |
| Trust Eden           | moderation/restricted suspension/appeal                             | case-scoped enforcement data                 | high-risk action requires fixture second approval |
| Finance Fikir        | reconciliation/refund/payout simulation                             | synthetic financial exception data           | cannot edit ledger or self-approve high risk      |
| Platform Owner Genet | configuration/release/audit visibility                              | isolated synthetic control-plane records     | cannot access a real environment or credentials   |

Switching is an explicit workspace action, records a synthetic audit event, reissues scoped access, and never means the browser has gained every role simultaneously. Demo fixtures demonstrate dual-control by a second synthetic approver rather than bypassing it.
