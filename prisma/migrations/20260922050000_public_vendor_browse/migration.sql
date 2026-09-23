-- Explicit publication state; synthetic/demo Vendors are private unless a non-demo fixture is published.
ALTER TABLE "Vendor" ADD COLUMN "publicSlug" TEXT UNIQUE, ADD COLUMN "publishedAt" TIMESTAMPTZ;
CREATE INDEX "Vendor_publishedAt_id_idx" ON "Vendor" ("publishedAt", id);
