-- A Vendor chooses approved Listing images for its own public logo and cover; no private asset is made public by this reference alone.
ALTER TABLE "vendors"
  ADD COLUMN "logo_media_id" UUID REFERENCES "media_assets"("id") ON DELETE SET NULL,
  ADD COLUMN "cover_media_id" UUID REFERENCES "media_assets"("id") ON DELETE SET NULL;

CREATE INDEX "vendors_logo_media_id_idx" ON "vendors" ("logo_media_id") WHERE "logo_media_id" IS NOT NULL;
CREATE INDEX "vendors_cover_media_id_idx" ON "vendors" ("cover_media_id") WHERE "cover_media_id" IS NOT NULL;
