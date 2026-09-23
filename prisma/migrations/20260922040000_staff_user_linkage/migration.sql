-- Optional Staff identity linkage; existing VendorMembership rows remain valid without a Staff profile.
CREATE TABLE "Staff" (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  "vendorId" UUID NOT NULL REFERENCES "Vendor"(id),
  "userId" UUID REFERENCES "User"(id),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("vendorId", "userId")
);
CREATE INDEX "Staff_userId_idx" ON "Staff" ("userId");
ALTER TABLE "VendorMembership" ADD COLUMN "staffId" UUID UNIQUE REFERENCES "Staff"(id);
