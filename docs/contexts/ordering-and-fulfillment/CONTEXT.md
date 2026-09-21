# Ordering and Fulfillment — Context Glossary

**Status:** Specified — Not Executed — Not Verified  
**Glossary only:** canonical language; no requirements or implementation detail.

| Term                 | Meaning                                                              | Avoid                               |
| -------------------- | -------------------------------------------------------------------- | ----------------------------------- |
| Vendor Order         | one Vendor’s goods component of a Purchase                           | entire Purchase                     |
| Order line           | Product variant and quantity component of Vendor Order               | Listing                             |
| Fulfillment          | pickup or Vendor-managed delivery lifecycle for a Vendor group       | carrier/driver system               |
| Pickup               | ready-then-collect goods handoff                                     | appointment                         |
| Delivery             | Vendor-operated goods transfer tracked by milestones/proof           | Junction dispatch or GPS tracking   |
| Handoff proof        | code/QR or controlled evidence of Customer collection/receipt        | proof of delivery vendor app only   |
| Failed delivery      | declared unsuccessful delivery requiring policy route                | automatic refund without inspection |
| Address snapshot     | immutable selected destination/contact context at commitment         | mutable saved address               |
| Partial cancellation | cancellation of lawful line/quantity while other components continue | cancelling entire Purchase          |
