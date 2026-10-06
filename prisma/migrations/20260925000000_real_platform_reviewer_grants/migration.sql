CREATE TABLE "platform_reviewer_grants" (
    "user_id" UUID NOT NULL PRIMARY KEY REFERENCES "users"("id") ON DELETE RESTRICT,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "granted_by" TEXT NOT NULL
);
