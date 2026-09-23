-- Phase 01: vendor-owned catalog source of truth. Search documents are derived and rebuildable.
ALTER TABLE "Vendor" ADD COLUMN "applicationState" TEXT NOT NULL DEFAULT 'pending' CHECK ("applicationState" IN ('pending', 'approved', 'rejected', 'restricted')),
  ADD COLUMN "applicationReviewedAt" TIMESTAMPTZ,
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN description TEXT;
ALTER TABLE "Location" ADD COLUMN label TEXT, ADD COLUMN city TEXT, ADD COLUMN address TEXT, ADD COLUMN latitude DECIMAL(9, 6), ADD COLUMN longitude DECIMAL(9, 6);

CREATE TABLE "VendorFollow" ("userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE, "vendorId" UUID NOT NULL REFERENCES "Vendor"(id) ON DELETE CASCADE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY ("userId", "vendorId"));
CREATE INDEX "VendorFollow_vendorId_createdAt_idx" ON "VendorFollow" ("vendorId", "createdAt");
CREATE TABLE "SavedSearch" (id UUID PRIMARY KEY DEFAULT uuidv7(), "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE, "workspaceId" UUID NOT NULL, kind TEXT, category TEXT, query TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX "SavedSearch_userId_workspaceId_idx" ON "SavedSearch" ("userId", "workspaceId");
CREATE TABLE "DiscoveryPreference" ("userId" UUID PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE, "workspaceId" UUID NOT NULL, "personalizationOptIn" BOOLEAN NOT NULL DEFAULT false, "updatedAt" TIMESTAMPTZ NOT NULL);
CREATE TABLE "Listing" (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  "vendorId" UUID NOT NULL REFERENCES "Vendor"(id),
  kind TEXT NOT NULL CHECK (kind IN ('product', 'service')),
  category TEXT NOT NULL CHECK (category IN ('goods', 'home', 'fashion', 'beauty', 'appointment', 'education', 'repair')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  "priceCents" INTEGER,
  "durationMinutes" INTEGER,
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'pending_review', 'published', 'rejected', 'unpublished')),
  version INTEGER NOT NULL DEFAULT 1,
  "publishedAt" TIMESTAMPTZ,
  "unpublishedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CHECK ((kind = 'product' AND "durationMinutes" IS NULL) OR (kind = 'service' AND "priceCents" IS NOT NULL AND "durationMinutes" IS NOT NULL))
);
CREATE INDEX "Listing_vendorId_state_idx" ON "Listing" ("vendorId", state);
CREATE INDEX "Listing_kind_state_publishedAt_idx" ON "Listing" (kind, state, "publishedAt");
CREATE TABLE "SavedListing" ("userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE, "listingId" UUID NOT NULL REFERENCES "Listing"(id) ON DELETE CASCADE, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY ("userId", "listingId"));
CREATE TABLE "ListingVariant" (id UUID PRIMARY KEY DEFAULT uuidv7(), "listingId" UUID NOT NULL REFERENCES "Listing"(id) ON DELETE CASCADE, sku TEXT NOT NULL, label TEXT NOT NULL, "priceCents" INTEGER NOT NULL CHECK ("priceCents" > 0), "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE ("listingId", sku));
CREATE INDEX "ListingVariant_listingId_idx" ON "ListingVariant" ("listingId");

CREATE TABLE "ListingRevision" (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  "listingId" UUID NOT NULL REFERENCES "Listing"(id),
  version INTEGER NOT NULL,
  state TEXT NOT NULL,
  risk TEXT NOT NULL CHECK (risk IN ('low', 'review')),
  snapshot JSONB NOT NULL,
  "reviewedBy" UUID,
  "reviewNote" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("listingId", version)
);
CREATE INDEX "ListingRevision_state_createdAt_idx" ON "ListingRevision" (state, "createdAt");

CREATE TABLE "MediaAsset" (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  "listingId" UUID NOT NULL REFERENCES "Listing"(id),
  kind TEXT NOT NULL CHECK (kind = 'short_video'),
  state TEXT NOT NULL DEFAULT 'quarantined' CHECK (state IN ('quarantined', 'ready', 'rejected')),
  "captionText" TEXT,
  "noSpeechDeclared" BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  "quarantineReason" TEXT,
  "processedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (("captionText" IS NOT NULL AND length("captionText") > 0) OR ("noSpeechDeclared" AND description IS NOT NULL AND length(description) > 0) OR state = 'quarantined')
);
CREATE INDEX "MediaAsset_listingId_state_idx" ON "MediaAsset" ("listingId", state);

CREATE TABLE "CatalogImportJob" (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  "vendorId" UUID NOT NULL REFERENCES "Vendor"(id),
  "templateVersion" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'commit')),
  state TEXT NOT NULL CHECK (state IN ('dry_run', 'committed', 'rejected')),
  "rowCount" INTEGER NOT NULL,
  "validRowCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "committedAt" TIMESTAMPTZ,
  UNIQUE ("vendorId", "sourceHash", mode)
);
CREATE TABLE "CatalogImportRow" (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  "importJobId" UUID NOT NULL REFERENCES "CatalogImportJob"(id) ON DELETE CASCADE,
  "rowNumber" INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('valid', 'error', 'committed')),
  errors JSONB NOT NULL,
  preview JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("importJobId", "rowNumber")
);

CREATE TABLE "SearchDocument" (
  "listingId" UUID PRIMARY KEY REFERENCES "Listing"(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  version INTEGER NOT NULL,
  "projectedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "SearchDocument_kind_category_title_idx" ON "SearchDocument" (kind, category, title);
