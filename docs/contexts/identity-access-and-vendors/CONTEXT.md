# Identity, Access, and Vendors — Context Glossary

**Status:** Specified — Not Executed — Not Verified  
**Glossary only:** canonical language; no requirements or implementation detail.

| Term                  | Meaning                                                                                      | Avoid                                         |
| --------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------- |
| User                  | durable adult account identity; may act as Customer and hold memberships                     | “customer account” when the role is not known |
| Customer              | User acting for their own Cart/Purchase/Booking                                              | “buyer” for every actor                       |
| Vendor                | business seller entity that owns a Storefront and can contract on its components             | “merchant account” for a User                 |
| Vendor member         | User with a preset role in one Vendor                                                        | “Vendor” when a membership is meant           |
| Staff profile         | person eligible to deliver Services; optionally linked to a User                             | “employee account” unless the link exists     |
| AccessContext         | active, scoped authority used for a request                                                  | client-selected role                          |
| Location scope        | optional boundary limiting a Vendor member to one/more Locations                             | geographic customer address                   |
| Platform role         | Support, Vendor Operations, Trust & Safety, Finance, Analyst, or Platform Owner capability   | “admin” as a catch-all                        |
| Vendor application    | pre-approval business onboarding record                                                      | approved Vendor                               |
| Restricted suspension | limited operational state preserving records/open obligations while blocking new commitments | deletion                                      |
