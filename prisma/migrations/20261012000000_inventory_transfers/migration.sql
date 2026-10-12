ALTER TABLE "inventory_movements" ADD COLUMN "transfer_id" UUID;
CREATE INDEX "inventory_movements_transfer_id_idx" ON "inventory_movements"("transfer_id");
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_reason_check";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_check" CHECK (
  ("transfer_id" IS NULL AND (
    ("reason" = 'received' AND "on_hand_delta" > 0 AND "reserved_delta" = 0)
    OR ("reason" = 'adjusted' AND "on_hand_delta" <> 0 AND "reserved_delta" = 0 AND "note" IS NOT NULL)
    OR ("reason" = 'damaged' AND "on_hand_delta" < 0 AND "reserved_delta" = 0 AND "note" IS NOT NULL)
  ))
  OR ("transfer_id" IS NOT NULL AND "reason" = 'transferred' AND "on_hand_delta" <> 0
      AND "reserved_delta" = 0 AND "note" IS NOT NULL AND length(trim("note")) >= 5)
);

-- A transfer must commit as one conserving pair for the same Vendor, item and actor.
CREATE FUNCTION check_inventory_transfer_pair() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE valid_pair BOOLEAN;
BEGIN
  IF NEW.transfer_id IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT count(*) = 2 AND sum(m.on_hand_delta::bigint) = 0
    AND count(DISTINCT m.location_id) = 2 AND count(DISTINCT l.vendor_id) = 1
    AND bool_and(l.vendor_id = p.vendor_id)
    AND bool_and(m.listing_id = $2 AND m.sku IS NOT DISTINCT FROM $3
      AND m.actor_id = $4 AND m.actor_kind = $5 AND m.note = $6)
    FROM %I.inventory_movements m JOIN %I.locations l ON l.id = m.location_id
    JOIN %I.listings p ON p.id = m.listing_id WHERE m.transfer_id = $1',
    TG_TABLE_SCHEMA, TG_TABLE_SCHEMA, TG_TABLE_SCHEMA)
    INTO valid_pair USING NEW.transfer_id, NEW.listing_id, NEW.sku, NEW.actor_id, NEW.actor_kind, NEW.note;
  IF valid_pair IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Inventory transfer requires a conserving pair for the same Vendor and item' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER inventory_transfer_pair_check
AFTER INSERT ON "inventory_movements" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_inventory_transfer_pair();

-- Corrections append new movements; historical stock must never be rewritten.
CREATE FUNCTION reject_inventory_movement_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Inventory movements are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER inventory_movements_immutable BEFORE UPDATE OR DELETE ON "inventory_movements"
FOR EACH ROW EXECUTE FUNCTION reject_inventory_movement_mutation();
