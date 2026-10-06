ALTER TABLE "media_assets"
  DROP CONSTRAINT "media_assets_state_check",
  ADD COLUMN "rendition_key" TEXT,
  ADD COLUMN "poster_key" TEXT,
  ADD COLUMN "scan_verdict" TEXT,
  ADD COLUMN "duration_seconds" DOUBLE PRECISION,
  ADD COLUMN "source_width" INTEGER,
  ADD COLUMN "source_height" INTEGER,
  ADD COLUMN "output_width" INTEGER,
  ADD COLUMN "output_height" INTEGER,
  ADD COLUMN "moderated_by" UUID,
  ADD COLUMN "moderated_at" TIMESTAMPTZ(6),
  ADD COLUMN "moderation_note" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Earlier metadata-only code could mark media ready. Revoke that unsafe state before tightening the gate.
UPDATE "media_assets"
SET "state" = 'quarantined', "processed_at" = NULL, "quarantine_reason" = 'safe processing required'
WHERE "state" = 'ready';

CREATE UNIQUE INDEX "media_assets_rendition_key_key" ON "media_assets"("rendition_key");
CREATE UNIQUE INDEX "media_assets_poster_key_key" ON "media_assets"("poster_key");

ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_state_check" CHECK ("state" IN ('pending_upload', 'quarantined', 'needs_moderation', 'ready', 'rejected')),
  ADD CONSTRAINT "media_assets_processed_check" CHECK (
    "state" NOT IN ('needs_moderation', 'ready') OR
    ("rendition_key" IS NOT NULL AND "poster_key" IS NOT NULL AND "scan_verdict" = 'clean' AND "processed_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "media_assets_moderated_check" CHECK (
    "state" <> 'ready' OR ("moderated_by" IS NOT NULL AND "moderated_at" IS NOT NULL)
  );
