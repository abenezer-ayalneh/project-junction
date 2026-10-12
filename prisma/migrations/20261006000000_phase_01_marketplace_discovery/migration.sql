-- Phase 01 marketplace discovery: a projection price supports truthful, full-result ordering.
-- It is additive and rebuilt from the Vendor-owned listing/variant source of truth.
ALTER TABLE "search_documents" ADD COLUMN "price_cents" INTEGER;

CREATE INDEX "search_documents_price_listing_idx" ON "search_documents" ("price_cents", "listing_id");
