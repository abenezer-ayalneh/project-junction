-- Listing image objects share the existing private-media lifecycle and need their admitted source type recorded.
ALTER TABLE "media_assets"
  ADD COLUMN "content_type" TEXT,
  DROP CONSTRAINT "MediaAsset_kind_check",
  DROP CONSTRAINT "MediaAsset_check",
  ADD CONSTRAINT "media_assets_kind_check" CHECK ("kind" IN ('short_video', 'listing_image')),
  ADD CONSTRAINT "media_assets_content_type_check" CHECK (
    ("kind" = 'short_video' AND "content_type" IS NULL) OR
    ("kind" = 'listing_image' AND "content_type" IN ('image/jpeg', 'image/png'))
  ),
  ADD CONSTRAINT "media_assets_video_accessibility_check" CHECK (
    "kind" = 'listing_image' OR
    ("caption_text" IS NOT NULL AND length("caption_text") > 0) OR
    ("no_speech_declared" AND "description" IS NOT NULL AND length("description") > 0) OR
    "state" = 'quarantined'
  );

CREATE INDEX "media_assets_listing_kind_state_moderated_idx"
  ON "media_assets" ("listing_id", "kind", "state", "moderated_at");
