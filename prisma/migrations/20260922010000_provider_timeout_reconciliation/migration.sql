-- Additive synthetic callback reconciliation state. Existing inbox rows were already accepted.
ALTER TABLE "ProviderInboxEvent"
  ADD COLUMN "providerReference" TEXT,
  ADD COLUMN "reconciliationState" TEXT NOT NULL DEFAULT 'reconciled',
  ADD COLUMN "reconciledAt" TIMESTAMPTZ;
CREATE INDEX "ProviderInboxEvent_reconciliation_idx"
  ON "ProviderInboxEvent" ("workspaceId", provider, "providerReference", "reconciliationState");
