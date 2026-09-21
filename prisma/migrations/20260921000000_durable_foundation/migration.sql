-- Additive Phase 00 expansion; prior readers may ignore these fields.
ALTER TABLE "Session" ADD COLUMN "activeVendorId" UUID REFERENCES "Vendor"(id), ADD COLUMN "activeRole" TEXT;
ALTER TABLE "IdempotencyRecord" ADD COLUMN "workspaceId" UUID;
ALTER TABLE "ProviderInboxEvent" ADD COLUMN "workspaceId" UUID;
ALTER TABLE "OutboxEvent" ADD COLUMN "claimToken" UUID, ADD COLUMN "availableAt" TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX "OutboxEvent_claim_idx" ON "OutboxEvent" (state, "availableAt", "claimedAt");
CREATE TABLE "OutboxReceipt" ("eventId" UUID PRIMARY KEY, "workspaceId" UUID NOT NULL, "processedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
