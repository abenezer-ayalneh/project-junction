ALTER TABLE "media_assets"
  DROP CONSTRAINT "MediaAsset_state_check",
  ADD COLUMN "uploader_id" UUID,
  ADD COLUMN "upload_key" TEXT,
  ADD COLUMN "sealed_key" TEXT,
  ADD COLUMN "upload_sha256" TEXT,
  ADD COLUMN "upload_bytes" INTEGER,
  ADD COLUMN "upload_expires_at" TIMESTAMPTZ(6),
  ADD COLUMN "uploaded_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX "media_assets_upload_key_key" ON "media_assets"("upload_key");
CREATE UNIQUE INDEX "media_assets_sealed_key_key" ON "media_assets"("sealed_key");

ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_state_check" CHECK ("state" IN ('pending_upload', 'quarantined', 'ready', 'rejected')),
  ADD CONSTRAINT "media_assets_upload_bytes_check" CHECK ("upload_bytes" IS NULL OR "upload_bytes" BETWEEN 1 AND 26214400),
  ADD CONSTRAINT "media_assets_upload_sha256_check" CHECK ("upload_sha256" IS NULL OR "upload_sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "media_assets_upload_intent_check" CHECK (
    "state" <> 'pending_upload' OR
    ("uploader_id" IS NOT NULL AND "upload_key" IS NOT NULL AND "upload_sha256" IS NOT NULL AND "upload_bytes" IS NOT NULL AND "upload_expires_at" IS NOT NULL)
  );
