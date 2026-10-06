# Media Limit Registry

> **Status:** accepted for Phase 01 implementation on 2026-09-24
> **Target status:** Specified — Not Executed — Not Verified
> **Scope:** Release 1 short public video, including Phase 01 synthetic acceptance
> **Decision coverage:** `DEC-175`, `DEC-176`

The media architecture requires accepted limits before upload and processing implementation. These values are accepted for the first short-video profile. They do not authorize public media delivery until the quarantine, scan, transform, moderation, and accessibility gates are verified.

| Limit                       | Accepted value                                                               | Enforcement point           |
| --------------------------- | ---------------------------------------------------------------------------- | --------------------------- |
| Upload bytes                | 25 MiB maximum                                                               | signed intent and processor |
| Duration                    | 30 seconds maximum                                                           | media probe                 |
| Source dimensions           | 1920 × 1080 maximum                                                          | media probe                 |
| Source container and codecs | MP4 with H.264 video and optional AAC audio                                  | signature and probe         |
| Processed video             | H.264 MP4, 1280 × 720 maximum, metadata stripped                             | bounded worker transform    |
| Poster                      | JPEG, 1280 × 720 maximum                                                     | bounded worker transform    |
| Timed captions              | WebVTT, 100 KiB maximum, required when speech or meaningful audio is present | accessibility validation    |
| No-speech path              | Explicit declaration plus 10–1000 character description                      | accessibility validation    |
| Upload intent lifetime      | 10 minutes                                                                   | signed quarantine grant     |

The user accepted this profile on 2026-09-24. The upload intent issues a signed PUT with an exact byte count, MP4 content type, and ten-minute expiry; completion verifies SHA-256 and seals a private object. The worker then scans, probes, transcodes, and generates a private poster before scoped Platform moderation. Public reads check the current listing and Vendor publication state. The legacy `POST /v1/listings/:listingId/short-video` endpoint stores synthetic metadata only and cannot create a publicly playable asset. Local integration verifies the new path; target-environment and independent accessibility acceptance remain open.
