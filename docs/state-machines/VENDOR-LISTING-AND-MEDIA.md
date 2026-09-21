# Vendor, Listing, and Media State Machines

**Status:** Specified — Not Executed — Not Verified

## `STATE-VND-001` — Vendor application

| From → to                       | Actor               | Guard                                                  | Side effect                                           | Timeout/terminal/recovery                      |
| ------------------------------- | ------------------- | ------------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------- |
| Draft → Submitted               | applicant           | required private data complete                         | `EVT-VENDOR-APPLICATION-SUBMITTED`                    | remains submitted until review                 |
| Submitted → InReview            | Vendor Operations   | scoped reviewer                                        | audit assignment                                      | reassignment leaves audit                      |
| InReview → Approved             | authorized approver | review/KYB-sandbox result and dual control if required | grant active Vendor/membership, `EVT-VENDOR-APPROVED` | terminal until suspension; appeal is separate  |
| InReview → Rejected             | authorized reviewer | reason/evidence recorded                               | `EVT-VENDOR-REJECTED`                                 | applicant may submit permitted new application |
| Approved → Restricted/Suspended | Trust/Operations    | policy/risk and approval tier                          | block new commitments, preserve records               | appeal/reinstate transition                    |

## `STATE-LISTING-001` — Listing revision and publication

| From → to                      | Actor           | Guard                                 | Side effect         | Timeout/terminal/recovery            |
| ------------------------------ | --------------- | ------------------------------------- | ------------------- | ------------------------------------ |
| Draft → SubmittedForReview     | Vendor member   | ownership/category/schema checks      | version/audit event | revision can return to draft         |
| SubmittedForReview → Published | system/reviewer | routine valid or approved risk review | projection event    | unpublish/revise creates new version |
| SubmittedForReview → Rejected  | reviewer        | reason recorded                       | notify/audit        | corrected revision re-submits        |

## `STATE-MED-001` — Media asset

| From → to                     | Actor                     | Guard                                                              | Side effect                                          | Timeout/terminal/recovery                                               |
| ----------------------------- | ------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| UploadRequested → Quarantined | upload processor          | scoped upload intent, checksum/object binding, size/type admission | persist private quarantine version and media event   | interruption/expiry leaves no public asset; a new intent is required    |
| Quarantined → Accepted        | media processor/moderator | content/MIME/scan/transform/accessibility checks pass              | create accepted immutable media version              | retriable processor failure remains quarantined/retries; no public link |
| Quarantined → Rejected        | processor/moderator       | unsafe, invalid, or inaccessible media result                      | retain restricted reason/audit and notify uploader   | terminal for asset version; corrected replacement starts a new upload   |
| Accepted → PublishedMedia     | catalog publisher         | Listing public                                                     | signed/public rendition                              | revoke/unpublish on later issue                                         |
| PublishedMedia → Revoked      | Catalog/Trust authority   | later report, policy change, or safety finding                     | remove public rendition/link, preserve audit/version | replace/re-review through a new accepted version                        |
