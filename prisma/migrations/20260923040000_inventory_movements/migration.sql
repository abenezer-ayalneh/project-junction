CREATE TABLE "inventory_movements" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "location_id" UUID NOT NULL,
  "listing_id" UUID NOT NULL,
  "sku" TEXT,
  "reason" TEXT NOT NULL,
  "on_hand_delta" INTEGER NOT NULL,
  "reserved_delta" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "actor_kind" TEXT NOT NULL,
  "actor_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_movements_nonzero_delta_check" CHECK ("on_hand_delta" <> 0 OR "reserved_delta" <> 0),
  CONSTRAINT "inventory_movements_reason_check" CHECK (
    ("reason" = 'received' AND "on_hand_delta" > 0 AND "reserved_delta" = 0)
    OR ("reason" = 'adjusted' AND "on_hand_delta" <> 0 AND "reserved_delta" = 0 AND "note" IS NOT NULL)
    OR ("reason" = 'damaged' AND "on_hand_delta" < 0 AND "reserved_delta" = 0 AND "note" IS NOT NULL)
  ),
  CONSTRAINT "inventory_movements_actor_kind_check" CHECK ("actor_kind" IN ('user', 'demo_persona')),
  CONSTRAINT "inventory_movements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "inventory_movements_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "inventory_movements_location_item_created_idx"
  ON "inventory_movements"("location_id", "listing_id", "sku", "created_at");

CREATE INDEX "inventory_movements_listing_item_created_idx"
  ON "inventory_movements"("listing_id", "sku", "created_at");
