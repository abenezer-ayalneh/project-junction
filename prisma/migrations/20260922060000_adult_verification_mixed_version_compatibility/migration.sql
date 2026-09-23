-- Compatibility window for an older application binary that still writes only verifiedAt.
-- New application writers must set an explicit lifecycle state; remove this default after the
-- supported mixed-version window has closed.
ALTER TABLE "User" ALTER COLUMN "adultVerificationState" SET DEFAULT 'legacy_verified_compat';
