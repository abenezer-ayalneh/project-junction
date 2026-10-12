-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN     "order_line_id" UUID;

-- AlterTable
ALTER TABLE "goods_holds" ADD COLUMN     "committed_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "goods_payment_attempts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "hold_id" UUID NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'processing',
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ETB',
    "provider" TEXT NOT NULL DEFAULT 'local-controlled',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_local_payment_results" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "payment_id" UUID NOT NULL,
    "outcome" TEXT NOT NULL,
    "succeeded_at" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_local_payment_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_purchases" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "hold_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "paid_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_vendor_orders" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "purchase_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "vendor_workspace_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'confirmed',
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_vendor_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_order_lines" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "order_id" UUID NOT NULL,
    "hold_line_id" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "goods_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_refund_operations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "payment_id" UUID NOT NULL,
    "semantic_key" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "provider_reference" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "goods_refund_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "goods_payment_attempts_hold_id_key" ON "goods_payment_attempts"("hold_id");

-- CreateIndex
CREATE INDEX "goods_payment_attempts_state_created_at_idx" ON "goods_payment_attempts"("state", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "goods_local_payment_results_payment_id_key" ON "goods_local_payment_results"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_purchases_hold_id_key" ON "goods_purchases"("hold_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_purchases_payment_id_key" ON "goods_purchases"("payment_id");

-- CreateIndex
CREATE INDEX "goods_purchases_customer_id_workspace_id_created_at_idx" ON "goods_purchases"("customer_id", "workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "goods_vendor_orders_vendor_workspace_id_vendor_id_location__idx" ON "goods_vendor_orders"("vendor_workspace_id", "vendor_id", "location_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "goods_vendor_orders_purchase_id_vendor_id_key" ON "goods_vendor_orders"("purchase_id", "vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_order_lines_hold_line_id_key" ON "goods_order_lines"("hold_line_id");

-- CreateIndex
CREATE INDEX "goods_order_lines_order_id_idx" ON "goods_order_lines"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_refund_operations_semantic_key_key" ON "goods_refund_operations"("semantic_key");

-- CreateIndex
CREATE INDEX "goods_refund_operations_state_created_at_idx" ON "goods_refund_operations"("state", "created_at");

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "goods_order_lines"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_payment_attempts" ADD CONSTRAINT "goods_payment_attempts_hold_id_fkey" FOREIGN KEY ("hold_id") REFERENCES "goods_holds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_local_payment_results" ADD CONSTRAINT "goods_local_payment_results_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "goods_payment_attempts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_purchases" ADD CONSTRAINT "goods_purchases_hold_id_fkey" FOREIGN KEY ("hold_id") REFERENCES "goods_holds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_purchases" ADD CONSTRAINT "goods_purchases_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "goods_payment_attempts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_purchases" ADD CONSTRAINT "goods_purchases_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_purchases" ADD CONSTRAINT "goods_purchases_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_vendor_orders" ADD CONSTRAINT "goods_vendor_orders_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "goods_purchases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_vendor_orders" ADD CONSTRAINT "goods_vendor_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_vendor_orders" ADD CONSTRAINT "goods_vendor_orders_vendor_workspace_id_fkey" FOREIGN KEY ("vendor_workspace_id") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_vendor_orders" ADD CONSTRAINT "goods_vendor_orders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_order_lines" ADD CONSTRAINT "goods_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "goods_vendor_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_order_lines" ADD CONSTRAINT "goods_order_lines_hold_line_id_fkey" FOREIGN KEY ("hold_line_id") REFERENCES "goods_hold_lines"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_refund_operations" ADD CONSTRAINT "goods_refund_operations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "goods_payment_attempts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


ALTER TABLE goods_holds DROP CONSTRAINT goods_holds_state_check, DROP CONSTRAINT goods_holds_check;
ALTER TABLE goods_holds ADD CONSTRAINT goods_holds_state_check CHECK (state IN ('holding','awaiting_payment','committed','released','expired','compensating')),
 ADD CONSTRAINT goods_holds_terminal_time_check CHECK (
   (state IN ('holding','awaiting_payment') AND released_at IS NULL AND committed_at IS NULL)
   OR (state = 'committed' AND committed_at IS NOT NULL AND released_at IS NULL)
   OR (state IN ('released','expired','compensating') AND released_at IS NOT NULL AND committed_at IS NULL));
ALTER TABLE goods_payment_attempts ADD CONSTRAINT goods_payment_state_check CHECK (state IN ('processing','unknown','succeeded','failed','refund_pending','refunded')),
 ADD CONSTRAINT goods_payment_amount_check CHECK (amount_cents > 0 AND currency = 'ETB' AND provider = 'local-controlled');
ALTER TABLE goods_local_payment_results ADD CONSTRAINT goods_local_result_check CHECK ((outcome = 'succeeded' AND succeeded_at IS NOT NULL) OR (outcome = 'failed' AND succeeded_at IS NULL));
ALTER TABLE goods_refund_operations ADD CONSTRAINT goods_refund_state_check CHECK (
 (state = 'pending' AND completed_at IS NULL AND provider_reference IS NULL) OR (state = 'succeeded' AND completed_at IS NOT NULL AND provider_reference IS NOT NULL)),
 ADD CONSTRAINT goods_refund_amount_check CHECK (amount_cents > 0);
CREATE TRIGGER goods_purchases_immutable BEFORE UPDATE OR DELETE ON goods_purchases FOR EACH ROW EXECUTE FUNCTION reject_goods_snapshot_mutation();
CREATE TRIGGER goods_order_lines_immutable BEFORE UPDATE OR DELETE ON goods_order_lines FOR EACH ROW EXECUTE FUNCTION reject_goods_snapshot_mutation();
CREATE TRIGGER goods_vendor_orders_immutable BEFORE UPDATE OR DELETE ON goods_vendor_orders FOR EACH ROW EXECUTE FUNCTION reject_goods_snapshot_mutation();
CREATE TRIGGER goods_local_payment_results_immutable BEFORE UPDATE OR DELETE ON goods_local_payment_results FOR EACH ROW EXECUTE FUNCTION reject_goods_snapshot_mutation();

CREATE OR REPLACE FUNCTION guard_goods_hold_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' OR NEW.id <> OLD.id OR NEW.quote_id <> OLD.quote_id OR NEW.created_at <> OLD.created_at
    OR NOT ((OLD.state = 'holding' AND NEW.state IN ('awaiting_payment','released','expired'))
       OR (OLD.state = 'awaiting_payment' AND NEW.state IN ('committed','released','expired'))
       OR (OLD.state IN ('expired','released') AND NEW.state = 'compensating'))
    OR (NEW.expires_at <> OLD.expires_at AND NOT (OLD.state = 'holding' AND NEW.state = 'awaiting_payment')) THEN
   RAISE EXCEPTION 'Invalid goods hold transition' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END;
$$;
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_reason_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_reason_check CHECK (
 (hold_id IS NULL AND transfer_id IS NULL AND order_line_id IS NULL AND (
   (reason = 'received' AND on_hand_delta > 0 AND reserved_delta = 0)
   OR (reason = 'adjusted' AND on_hand_delta <> 0 AND reserved_delta = 0 AND note IS NOT NULL)
   OR (reason = 'damaged' AND on_hand_delta < 0 AND reserved_delta = 0 AND note IS NOT NULL)))
 OR (hold_id IS NULL AND order_line_id IS NULL AND transfer_id IS NOT NULL AND reason = 'transferred' AND on_hand_delta <> 0
   AND reserved_delta = 0 AND note IS NOT NULL AND length(trim(note)) >= 5)
 OR (hold_id IS NOT NULL AND transfer_id IS NULL AND order_line_id IS NULL AND on_hand_delta = 0 AND (
   (reason = 'held' AND reserved_delta > 0) OR (reason = 'released' AND reserved_delta < 0)))
 OR (hold_id IS NOT NULL AND transfer_id IS NULL AND order_line_id IS NOT NULL AND reason = 'sold' AND on_hand_delta < 0 AND reserved_delta = on_hand_delta)
);

CREATE OR REPLACE FUNCTION check_goods_hold_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
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
          AND m.reason = ''released'' AND m.reserved_delta = -l.quantity) <> CASE WHEN h.state IN (''holding'',''awaiting_payment'',''committed'') THEN 0 ELSE 1 END
        OR (SELECT count(*) FROM %I.inventory_movements m WHERE m.hold_id = l.hold_id
          AND m.listing_id = l.listing_id AND m.location_id = l.location_id AND m.sku IS NOT DISTINCT FROM l.sku
          AND m.reason = ''sold'' AND m.on_hand_delta = -l.quantity AND m.reserved_delta = -l.quantity) <> CASE WHEN h.state = ''committed'' THEN 1 ELSE 0 END)
    ) AND NOT EXISTS (
      SELECT 1 FROM %I.inventory_movements m WHERE m.hold_id = $1
      AND NOT EXISTS (SELECT 1 FROM %I.goods_hold_lines l WHERE l.hold_id = m.hold_id
        AND l.listing_id = m.listing_id AND l.location_id = m.location_id AND l.sku IS NOT DISTINCT FROM m.sku)
    )', TG_TABLE_SCHEMA, TG_TABLE_SCHEMA, TG_TABLE_SCHEMA, TG_TABLE_SCHEMA, TG_TABLE_SCHEMA,
       TG_TABLE_SCHEMA, TG_TABLE_SCHEMA, TG_TABLE_SCHEMA, TG_TABLE_SCHEMA, TG_TABLE_SCHEMA, TG_TABLE_SCHEMA)
    INTO valid USING target;
  IF valid IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Goods hold requires a complete matching inventory ledger' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Every committed hold has exactly one fully decomposed paid Purchase and sold
-- movements linked to its immutable Order lines. No partial purchase can commit.
CREATE FUNCTION check_goods_purchase_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; valid BOOLEAN;
BEGIN
 IF TG_TABLE_NAME = 'goods_holds' THEN target := NEW.id;
 ELSIF TG_TABLE_NAME = 'goods_purchases' THEN target := NEW.hold_id;
 ELSE RETURN NEW; END IF;
 EXECUTE format('SELECT NOT EXISTS (SELECT 1 FROM %I.goods_holds h WHERE h.id = $1 AND h.state = ''committed'' AND (
   NOT EXISTS (SELECT 1 FROM %I.goods_purchases p JOIN %I.goods_payment_attempts pay ON pay.id = p.payment_id
     JOIN %I.goods_quotes q ON q.id = h.quote_id JOIN %I.goods_local_payment_results r ON r.payment_id = pay.id
     WHERE p.hold_id = h.id AND pay.hold_id = h.id AND pay.state = ''succeeded''
       AND p.customer_id = q.customer_id AND p.workspace_id = q.workspace_id AND p.snapshot = q.snapshot
       AND pay.amount_cents = (q.snapshot->>''totalCents'')::integer
       AND r.outcome = ''succeeded'' AND r.succeeded_at >= pay.created_at AND r.succeeded_at < h.expires_at AND p.paid_at = r.succeeded_at)
   OR EXISTS (SELECT 1 FROM %I.goods_hold_lines l WHERE l.hold_id = h.id AND
     NOT EXISTS (SELECT 1 FROM %I.goods_order_lines ol JOIN %I.goods_vendor_orders o ON o.id = ol.order_id
       JOIN %I.goods_purchases p ON p.id = o.purchase_id JOIN %I.inventory_movements m ON m.order_line_id = ol.id
       WHERE p.hold_id = h.id AND ol.hold_line_id = l.id AND o.vendor_id = l.vendor_id
         AND o.vendor_workspace_id = l.vendor_workspace_id AND o.location_id = l.location_id
         AND m.hold_id = h.id AND m.listing_id = l.listing_id AND m.location_id = l.location_id
         AND m.sku IS NOT DISTINCT FROM l.sku AND m.reason = ''sold'' AND m.on_hand_delta = -l.quantity))
 )) AND NOT EXISTS (SELECT 1 FROM %I.goods_purchases p JOIN %I.goods_holds h ON h.id = p.hold_id WHERE h.id = $1 AND h.state <> ''committed'')',
 TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,
 TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA)
 INTO valid USING target;
 IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Goods Purchase requires matching payment, complete Orders and sold ledger' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER goods_purchase_commit_check AFTER INSERT ON goods_purchases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_purchase_commit();
CREATE CONSTRAINT TRIGGER goods_hold_purchase_check AFTER UPDATE ON goods_holds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_purchase_commit();

CREATE FUNCTION guard_goods_payment_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' OR NEW.id <> OLD.id OR NEW.hold_id <> OLD.hold_id OR NEW.amount_cents <> OLD.amount_cents
   OR NEW.currency <> OLD.currency OR NEW.provider <> OLD.provider OR NEW.created_at <> OLD.created_at
   OR NOT ((OLD.state IN ('processing','unknown') AND NEW.state IN ('unknown','succeeded','failed','refund_pending'))
     OR (OLD.state = 'refund_pending' AND NEW.state = 'refunded')) THEN
   RAISE EXCEPTION 'Invalid goods payment transition or immutable payment reference mutation' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER goods_payments_transition BEFORE UPDATE OR DELETE ON goods_payment_attempts FOR EACH ROW EXECUTE FUNCTION guard_goods_payment_transition();
CREATE FUNCTION guard_goods_refund_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' OR OLD.state <> 'pending' OR NEW.state <> 'succeeded' OR NEW.id <> OLD.id
   OR NEW.payment_id <> OLD.payment_id OR NEW.semantic_key <> OLD.semantic_key OR NEW.amount_cents <> OLD.amount_cents OR NEW.created_at <> OLD.created_at THEN
   RAISE EXCEPTION 'Invalid goods refund transition or immutable operation mutation' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER goods_refunds_transition BEFORE UPDATE OR DELETE ON goods_refund_operations FOR EACH ROW EXECUTE FUNCTION guard_goods_refund_transition();

-- Seal purchased aggregates: immutable child rows can be added only while the
-- matching hold is being atomically committed, never after commercial commit.
CREATE FUNCTION guard_goods_order_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE valid BOOLEAN;
BEGIN
 IF TG_TABLE_NAME = 'goods_vendor_orders' THEN
   EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.goods_purchases p JOIN %I.goods_holds h ON h.id = p.hold_id
     JOIN %I.vendors v ON v.id = $2, jsonb_array_elements(p.snapshot->''groups'') g
     WHERE p.id = $1 AND h.state = ''awaiting_payment'' AND v.workspace_id = $3
       AND (g->>''vendorId'')::uuid = $2 AND (g->>''locationId'')::uuid = $4 AND g = $5)',
       TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA)
     INTO valid USING NEW.purchase_id,NEW.vendor_id,NEW.vendor_workspace_id,NEW.location_id,NEW.snapshot;
 ELSE
   EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.goods_vendor_orders o JOIN %I.goods_purchases p ON p.id = o.purchase_id
     JOIN %I.goods_holds h ON h.id = p.hold_id JOIN %I.goods_hold_lines l ON l.hold_id = h.id,
     jsonb_array_elements(o.snapshot->''lines'') q
     WHERE o.id = $1 AND l.id = $2 AND h.state = ''awaiting_payment'' AND l.vendor_id = o.vendor_id
       AND l.location_id = o.location_id AND l.vendor_workspace_id = o.vendor_workspace_id AND q = $3
       AND (q->>''listingId'')::uuid = l.listing_id AND (q->>''sku'') IS NOT DISTINCT FROM l.sku
       AND (q->>''quantity'')::integer = l.quantity)',
       TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA)
     INTO valid USING NEW.order_id,NEW.hold_line_id,NEW.snapshot;
 END IF;
 IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Goods Order rows must match the committing held snapshot' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER goods_order_insert_guard BEFORE INSERT ON goods_vendor_orders FOR EACH ROW EXECUTE FUNCTION guard_goods_order_insert();
CREATE TRIGGER goods_line_insert_guard BEFORE INSERT ON goods_order_lines FOR EACH ROW EXECUTE FUNCTION guard_goods_order_insert();

CREATE FUNCTION check_goods_refund_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE valid BOOLEAN;
BEGIN
 EXECUTE format('SELECT COALESCE(sum(r.amount_cents::bigint),0) <= pay.amount_cents
   FROM %I.goods_payment_attempts pay LEFT JOIN %I.goods_refund_operations r ON r.payment_id = pay.id
   WHERE pay.id = $1 GROUP BY pay.amount_cents', TG_TABLE_SCHEMA,TG_TABLE_SCHEMA) INTO valid USING NEW.payment_id;
 IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Refund allocation exceeds captured payment' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER goods_refund_total_check AFTER INSERT ON goods_refund_operations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_refund_total();
