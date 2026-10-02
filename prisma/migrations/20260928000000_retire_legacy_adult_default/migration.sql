-- New users cannot inherit adult access from an old writer that supplies only verified_at.
-- Existing compatibility records remain readable for synthetic regression, but staging
-- authorization requires the explicit provider-reviewed "verified" state.
ALTER TABLE "users" ALTER COLUMN "adult_verification_state" SET DEFAULT 'unverified';
