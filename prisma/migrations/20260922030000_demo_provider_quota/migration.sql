-- Additive bound for the only Phase 00 demo provider substitute.
ALTER TABLE "DemoWorkspace"
  ADD COLUMN "providerEventsUsed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "providerEventsLimit" INTEGER NOT NULL DEFAULT 25;
