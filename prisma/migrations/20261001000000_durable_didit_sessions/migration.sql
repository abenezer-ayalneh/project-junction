CREATE TABLE "identity_verification_sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_reference" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'issued',
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_checked_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "identity_verification_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "identity_verification_sessions_provider_provider_reference_key"
    ON "identity_verification_sessions"("provider", "provider_reference");

CREATE INDEX "identity_verification_sessions_user_state_idx"
    ON "identity_verification_sessions"("user_id", "provider", "state", "issued_at");

CREATE INDEX "identity_verification_sessions_workspace_state_idx"
    ON "identity_verification_sessions"("workspace_id", "provider", "state", "issued_at");

ALTER TABLE "identity_verification_sessions"
    ADD CONSTRAINT "identity_verification_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "identity_verification_sessions"
    ADD CONSTRAINT "identity_verification_sessions_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
