-- Additive local demo-only actor path. A session is either a verified user actor
-- or a fixture-backed demo persona; service derivation enforces that invariant.
CREATE TABLE "DemoPersona" (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"(id),
  key TEXT NOT NULL,
  role TEXT NOT NULL,
  "vendorId" UUID,
  "locationIds" UUID[] NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("workspaceId", key)
);
CREATE INDEX "DemoPersona_workspaceId_role_idx" ON "DemoPersona" ("workspaceId", role);
ALTER TABLE "Session" ADD COLUMN "demoPersonaId" UUID REFERENCES "DemoPersona"(id);
