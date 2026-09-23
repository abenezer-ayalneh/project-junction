-- Additive lifecycle state. A prior verified timestamp represents the already-completed verification state.
ALTER TABLE "User" ADD COLUMN "adultVerificationState" TEXT NOT NULL DEFAULT 'unverified';
UPDATE "User" SET "adultVerificationState" = 'verified' WHERE "verifiedAt" IS NOT NULL;
