-- Phase 00: one authoritative PostgreSQL migration stream.
-- PostgreSQL 18 supplies uuidv7(); PostGIS is retained for later location work.
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE "User" (
  id UUID PRIMARY KEY DEFAULT uuidv7(), email TEXT NOT NULL UNIQUE,
  "verifiedAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE "Workspace" (
  id UUID PRIMARY KEY DEFAULT uuidv7(), kind TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE "Session" (
  id UUID PRIMARY KEY DEFAULT uuidv7(), "userId" UUID REFERENCES "User"(id),
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"(id), "expiresAt" TIMESTAMPTZ NOT NULL,
  "revokedAt" TIMESTAMPTZ, "mfaVerifiedAt" TIMESTAMPTZ, "recentAuthAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "Session_workspaceId_expiresAt_idx" ON "Session" ("workspaceId", "expiresAt");
CREATE TABLE "Vendor" (
  id UUID PRIMARY KEY DEFAULT uuidv7(), "workspaceId" UUID NOT NULL REFERENCES "Workspace"(id),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "Vendor_workspaceId_idx" ON "Vendor" ("workspaceId");
CREATE TABLE "Location" (
  id UUID PRIMARY KEY DEFAULT uuidv7(), "vendorId" UUID NOT NULL REFERENCES "Vendor"(id)
);
CREATE INDEX "Location_vendorId_idx" ON "Location" ("vendorId");
CREATE TABLE "VendorMembership" (
  id UUID PRIMARY KEY DEFAULT uuidv7(), "userId" UUID NOT NULL REFERENCES "User"(id),
  "vendorId" UUID NOT NULL REFERENCES "Vendor"(id), role TEXT NOT NULL,
  "locationIds" UUID[] NOT NULL, "revokedAt" TIMESTAMPTZ,
  UNIQUE ("userId", "vendorId")
);
CREATE INDEX "VendorMembership_vendorId_revokedAt_idx" ON "VendorMembership" ("vendorId", "revokedAt");
CREATE TABLE "IdempotencyRecord" (
  id UUID PRIMARY KEY DEFAULT uuidv7(), key TEXT NOT NULL, "scopeHash" TEXT NOT NULL,
  method TEXT NOT NULL, "requestHash" TEXT NOT NULL, outcome JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "expiresAt" TIMESTAMPTZ NOT NULL,
  UNIQUE (key, "scopeHash", method)
);
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord" ("expiresAt");
CREATE TABLE "OutboxEvent" (
  id UUID PRIMARY KEY DEFAULT uuidv7(), "eventId" UUID NOT NULL UNIQUE,
  "workspaceId" UUID NOT NULL, type TEXT NOT NULL, payload JSONB NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
  "claimedBy" TEXT, "claimedAt" TIMESTAMPTZ, "occurredAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "OutboxEvent_state_occurredAt_idx" ON "OutboxEvent" (state, "occurredAt");
CREATE INDEX "OutboxEvent_workspaceId_occurredAt_idx" ON "OutboxEvent" ("workspaceId", "occurredAt");
CREATE TABLE "ProviderInboxEvent" (
  id UUID PRIMARY KEY DEFAULT uuidv7(), provider TEXT NOT NULL, "providerEventId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL, payload JSONB NOT NULL, "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "processedAt" TIMESTAMPTZ, UNIQUE (provider, "providerEventId")
);
CREATE TABLE "DemoWorkspace" (
  id UUID PRIMARY KEY DEFAULT uuidv7(), "workspaceId" UUID NOT NULL REFERENCES "Workspace"(id),
  "expiresAt" TIMESTAMPTZ NOT NULL, "purgedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "DemoWorkspace_expiresAt_purgedAt_idx" ON "DemoWorkspace" ("expiresAt", "purgedAt");
CREATE TABLE "AuditLog" (
  id UUID PRIMARY KEY DEFAULT uuidv7(), "workspaceId" UUID, "actorId" UUID,
  action TEXT NOT NULL, "correlationId" UUID NOT NULL, metadata JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog" ("workspaceId", "createdAt");
