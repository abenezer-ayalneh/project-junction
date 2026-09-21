# Payments, Ledger, and Payout — Context Glossary

**Status:** Specified — Not Executed — Not Verified  
**Glossary only:** canonical language; no requirements or implementation detail.

| Term               | Meaning                                                        | Avoid                 |
| ------------------ | -------------------------------------------------------------- | --------------------- |
| Payment attempt    | provider-facing request/outcome tied to a Checkout             | Purchase truth itself |
| Payment merchant   | platform role in selected sandbox charge model                 | contracting seller    |
| Contracting seller | Vendor responsible for its line/Booking commercial offering    | payment processor     |
| Ledger transaction | balanced immutable accounting event                            | mutable balance row   |
| Posting            | one debit/credit line in ledger transaction                    | ad-hoc adjustment     |
| Earning            | Vendor economic amount pending/available/frozen                | wallet balance        |
| Transfer           | provider-side movement toward Vendor settlement                | payment capture       |
| Payout batch       | scheduled group of eligible Vendor earnings                    | on-demand withdrawal  |
| Reconciliation     | compare provider, inbox, domain and ledger records             | overwrite mismatch    |
| Chargeback         | provider dispute event with Vendor/Platform liability handling | ordinary Support Case |
