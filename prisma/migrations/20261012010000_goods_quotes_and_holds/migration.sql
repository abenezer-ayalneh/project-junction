ALTER TABLE locations ADD COLUMN goods_configuration JSONB,
  ADD COLUMN goods_configuration_version INTEGER NOT NULL DEFAULT 0 CHECK (goods_configuration_version >= 0);
CREATE TABLE goods_quotes (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  selection JSONB NOT NULL, snapshot JSONB NOT NULL,
  expires_at TIMESTAMPTZ(6) NOT NULL, created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX goods_quotes_customer_id_workspace_id_created_at_idx ON goods_quotes(customer_id, workspace_id, created_at);
CREATE TABLE goods_holds (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  quote_id UUID NOT NULL REFERENCES goods_quotes(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  state TEXT NOT NULL DEFAULT 'holding' CHECK (state IN ('holding', 'released', 'expired')),
  expires_at TIMESTAMPTZ(6) NOT NULL, created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(), released_at TIMESTAMPTZ(6),
  CHECK ((state = 'holding' AND released_at IS NULL) OR (state <> 'holding' AND released_at IS NOT NULL))
);
CREATE UNIQUE INDEX goods_holds_quote_id_key ON goods_holds(quote_id);
CREATE INDEX goods_holds_state_expires_at_idx ON goods_holds(state, expires_at);
CREATE TABLE goods_hold_lines (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  hold_id UUID NOT NULL REFERENCES goods_holds(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  sku TEXT, quantity INTEGER NOT NULL CHECK (quantity > 0),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  vendor_workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX goods_hold_lines_hold_id_idx ON goods_hold_lines(hold_id);
CREATE UNIQUE INDEX goods_hold_lines_item_key ON goods_hold_lines(hold_id, listing_id, location_id, sku) NULLS NOT DISTINCT;
ALTER TABLE inventory_movements ADD COLUMN hold_id UUID REFERENCES goods_holds(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE INDEX inventory_movements_hold_id_idx ON inventory_movements(hold_id);
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_reason_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_reason_check CHECK (
  (hold_id IS NULL AND transfer_id IS NULL AND (
    (reason = 'received' AND on_hand_delta > 0 AND reserved_delta = 0)
    OR (reason = 'adjusted' AND on_hand_delta <> 0 AND reserved_delta = 0 AND note IS NOT NULL)
    OR (reason = 'damaged' AND on_hand_delta < 0 AND reserved_delta = 0 AND note IS NOT NULL)
  ))
  OR (hold_id IS NULL AND transfer_id IS NOT NULL AND reason = 'transferred' AND on_hand_delta <> 0
      AND reserved_delta = 0 AND note IS NOT NULL AND length(trim(note)) >= 5)
  OR (hold_id IS NOT NULL AND transfer_id IS NULL AND on_hand_delta = 0 AND (
    (reason = 'held' AND reserved_delta > 0) OR (reason = 'released' AND reserved_delta < 0)
  ))
);
CREATE UNIQUE INDEX inventory_movements_hold_item_reason_key
  ON inventory_movements(hold_id, listing_id, location_id, sku, reason) NULLS NOT DISTINCT WHERE hold_id IS NOT NULL;

CREATE FUNCTION reject_goods_snapshot_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Goods quote snapshots and hold lines are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER goods_quotes_immutable BEFORE UPDATE OR DELETE ON goods_quotes FOR EACH ROW EXECUTE FUNCTION reject_goods_snapshot_mutation();
CREATE TRIGGER goods_hold_lines_immutable BEFORE UPDATE OR DELETE ON goods_hold_lines FOR EACH ROW EXECUTE FUNCTION reject_goods_snapshot_mutation();
CREATE FUNCTION guard_goods_hold_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.state <> 'holding' OR NEW.state NOT IN ('released', 'expired')
     OR NEW.id <> OLD.id OR NEW.quote_id <> OLD.quote_id OR NEW.expires_at <> OLD.expires_at OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Goods hold permits only one terminal release' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER goods_holds_transition BEFORE UPDATE OR DELETE ON goods_holds FOR EACH ROW EXECUTE FUNCTION guard_goods_hold_transition();

-- At commit, every line has one matching reservation and terminal holds have one
-- matching release. Orphans, unrelated item movements and partial release fail.
CREATE FUNCTION check_goods_hold_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; valid BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'goods_holds' THEN target := NEW.id; ELSE target := NEW.hold_id; END IF;
  IF target IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.goods_hold_lines WHERE hold_id = $1)
    AND NOT EXISTS (
      SELECT 1 FROM %I.goods_hold_lines l
      JOIN %I.goods_holds h ON h.id = l.hold_id
      JOIN %I.listings p ON p.id = l.listing_id
      JOIN %I.locations loc ON loc.id = l.location_id
      JOIN %I.vendors v ON v.id = l.vendor_id
      WHERE l.hold_id = $1 AND (p.vendor_id <> l.vendor_id OR loc.vendor_id <> l.vendor_id OR v.workspace_id <> l.vendor_workspace_id
        OR (SELECT count(*) FROM %I.inventory_movements m WHERE m.hold_id = l.hold_id
          AND m.listing_id = l.listing_id AND m.location_id = l.location_id AND m.sku IS NOT DISTINCT FROM l.sku
          AND m.reason = ''held'' AND m.reserved_delta = l.quantity) <> 1
        OR (SELECT count(*) FROM %I.inventory_movements m WHERE m.hold_id = l.hold_id
          AND m.listing_id = l.listing_id AND m.location_id = l.location_id AND m.sku IS NOT DISTINCT FROM l.sku
          AND m.reason = ''released'' AND m.reserved_delta = -l.quantity) <> CASE WHEN h.state = ''holding'' THEN 0 ELSE 1 END)
    ) AND NOT EXISTS (
      SELECT 1 FROM %I.inventory_movements m WHERE m.hold_id = $1
      AND NOT EXISTS (SELECT 1 FROM %I.goods_hold_lines l WHERE l.hold_id = m.hold_id
        AND l.listing_id = m.listing_id AND l.location_id = m.location_id AND l.sku IS NOT DISTINCT FROM m.sku)
    )', TG_TABLE_SCHEMA, TG_TABLE_SCHEMA, TG_TABLE_SCHEMA, TG_TABLE_SCHEMA, TG_TABLE_SCHEMA,
       TG_TABLE_SCHEMA, TG_TABLE_SCHEMA, TG_TABLE_SCHEMA, TG_TABLE_SCHEMA, TG_TABLE_SCHEMA)
    INTO valid USING target;
  IF valid IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Goods hold requires a complete matching inventory ledger' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER goods_hold_ledger_check AFTER INSERT OR UPDATE ON goods_holds
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_hold_ledger();
CREATE CONSTRAINT TRIGGER goods_hold_line_ledger_check AFTER INSERT ON goods_hold_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_hold_ledger();
CREATE CONSTRAINT TRIGGER inventory_hold_ledger_check AFTER INSERT ON inventory_movements
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_hold_ledger();
