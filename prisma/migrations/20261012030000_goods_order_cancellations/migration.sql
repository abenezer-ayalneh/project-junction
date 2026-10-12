-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN     "cancellation_line_id" UUID;

-- CreateTable
CREATE TABLE "goods_order_cancellations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "order_id" UUID NOT NULL,
    "refund_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_kind" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "item_refund_cents" INTEGER NOT NULL,
    "delivery_refund_cents" INTEGER NOT NULL,
    "review_required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_order_cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_cancellation_lines" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "cancellation_id" UUID NOT NULL,
    "order_line_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "stock_disposition" TEXT NOT NULL,
    "refund_cents" INTEGER NOT NULL,

    CONSTRAINT "goods_cancellation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_cancellation_grants" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'platform_finance',
    "reason" TEXT NOT NULL,
    "granted_by" TEXT NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "goods_cancellation_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "goods_order_cancellations_refund_id_key" ON "goods_order_cancellations"("refund_id");

-- CreateIndex
CREATE INDEX "goods_order_cancellations_order_id_created_at_idx" ON "goods_order_cancellations"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "goods_cancellation_lines_order_line_id_idx" ON "goods_cancellation_lines"("order_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_cancellation_lines_cancellation_id_order_line_id_key" ON "goods_cancellation_lines"("cancellation_id", "order_line_id");

-- CreateIndex
CREATE INDEX "goods_cancellation_grants_user_id_workspace_id_expires_at_idx" ON "goods_cancellation_grants"("user_id", "workspace_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "goods_cancellation_grants_user_id_workspace_id_order_id_key" ON "goods_cancellation_grants"("user_id", "workspace_id", "order_id");

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_cancellation_line_id_fkey" FOREIGN KEY ("cancellation_line_id") REFERENCES "goods_cancellation_lines"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_order_cancellations" ADD CONSTRAINT "goods_order_cancellations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "goods_vendor_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_order_cancellations" ADD CONSTRAINT "goods_order_cancellations_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "goods_refund_operations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_cancellation_lines" ADD CONSTRAINT "goods_cancellation_lines_cancellation_id_fkey" FOREIGN KEY ("cancellation_id") REFERENCES "goods_order_cancellations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_cancellation_lines" ADD CONSTRAINT "goods_cancellation_lines_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "goods_order_lines"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_cancellation_grants" ADD CONSTRAINT "goods_cancellation_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_cancellation_grants" ADD CONSTRAINT "goods_cancellation_grants_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_cancellation_grants" ADD CONSTRAINT "goods_cancellation_grants_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "goods_vendor_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


ALTER TABLE goods_order_cancellations ADD CONSTRAINT goods_cancellation_amount_check CHECK (item_refund_cents > 0 AND delivery_refund_cents >= 0 AND review_required),
 ADD CONSTRAINT goods_cancellation_actor_check CHECK (actor_kind IN ('vendor','platform') AND length(trim(note)) >= 5);
ALTER TABLE goods_cancellation_lines ADD CONSTRAINT goods_cancel_line_check CHECK (quantity > 0 AND refund_cents > 0 AND stock_disposition IN ('restock','damaged'));
ALTER TABLE goods_cancellation_grants ADD CONSTRAINT goods_cancel_grant_check CHECK (role = 'platform_finance' AND expires_at > granted_at AND length(trim(reason)) >= 5 AND length(trim(granted_by)) > 0);
ALTER TABLE goods_vendor_orders ADD CONSTRAINT goods_order_state_check CHECK (state IN ('confirmed','partially_cancelled','cancelled'));
CREATE TRIGGER goods_order_cancellations_immutable BEFORE UPDATE OR DELETE ON goods_order_cancellations FOR EACH ROW EXECUTE FUNCTION reject_goods_snapshot_mutation();
CREATE TRIGGER goods_cancellation_lines_immutable BEFORE UPDATE OR DELETE ON goods_cancellation_lines FOR EACH ROW EXECUTE FUNCTION reject_goods_snapshot_mutation();
DROP TRIGGER goods_vendor_orders_immutable ON goods_vendor_orders;
CREATE FUNCTION guard_goods_order_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' OR NEW.id <> OLD.id OR NEW.purchase_id <> OLD.purchase_id OR NEW.vendor_id <> OLD.vendor_id
   OR NEW.vendor_workspace_id <> OLD.vendor_workspace_id OR NEW.location_id <> OLD.location_id
   OR NEW.snapshot <> OLD.snapshot OR NEW.created_at <> OLD.created_at
   OR OLD.state NOT IN ('confirmed','partially_cancelled') OR NEW.state NOT IN ('partially_cancelled','cancelled') THEN
   RAISE EXCEPTION 'Goods Order preserves commercial facts and permits only bounded cancellation transitions' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER goods_vendor_orders_immutable BEFORE UPDATE OR DELETE ON goods_vendor_orders FOR EACH ROW EXECUTE FUNCTION guard_goods_order_transition();

ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_reason_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_reason_check CHECK (
 (hold_id IS NULL AND transfer_id IS NULL AND order_line_id IS NULL AND cancellation_line_id IS NULL AND (
   (reason = 'received' AND on_hand_delta > 0 AND reserved_delta = 0)
   OR (reason = 'adjusted' AND on_hand_delta <> 0 AND reserved_delta = 0 AND note IS NOT NULL)
   OR (reason = 'damaged' AND on_hand_delta < 0 AND reserved_delta = 0 AND note IS NOT NULL)))
 OR (hold_id IS NULL AND order_line_id IS NULL AND cancellation_line_id IS NULL AND transfer_id IS NOT NULL AND reason = 'transferred' AND on_hand_delta <> 0
   AND reserved_delta = 0 AND note IS NOT NULL AND length(trim(note)) >= 5)
 OR (hold_id IS NOT NULL AND transfer_id IS NULL AND order_line_id IS NULL AND cancellation_line_id IS NULL AND on_hand_delta = 0 AND (
   (reason = 'held' AND reserved_delta > 0) OR (reason = 'released' AND reserved_delta < 0)))
 OR (hold_id IS NOT NULL AND transfer_id IS NULL AND order_line_id IS NOT NULL AND cancellation_line_id IS NULL AND reason = 'sold' AND on_hand_delta < 0 AND reserved_delta = on_hand_delta)
 OR (hold_id IS NULL AND transfer_id IS NULL AND order_line_id IS NOT NULL AND cancellation_line_id IS NOT NULL AND reserved_delta = 0 AND note IS NOT NULL AND length(trim(note)) >= 5
   AND ((reason = 'returned' AND on_hand_delta > 0) OR (reason = 'damaged' AND on_hand_delta < 0)))
);
CREATE UNIQUE INDEX inventory_cancel_item_reason_key ON inventory_movements(cancellation_line_id, reason) WHERE cancellation_line_id IS NOT NULL;

CREATE OR REPLACE FUNCTION guard_goods_payment_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' OR NEW.id <> OLD.id OR NEW.hold_id <> OLD.hold_id OR NEW.amount_cents <> OLD.amount_cents
   OR NEW.currency <> OLD.currency OR NEW.provider <> OLD.provider OR NEW.created_at <> OLD.created_at
   OR NOT ((OLD.state IN ('processing','unknown') AND NEW.state IN ('unknown','succeeded','failed','refund_pending'))
     OR (OLD.state IN ('succeeded','partially_refunded','refund_pending') AND NEW.state IN ('refund_pending','partially_refunded','refunded'))) THEN
   RAISE EXCEPTION 'Invalid goods payment transition or immutable payment reference mutation' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END;
$$;
ALTER TABLE goods_payment_attempts DROP CONSTRAINT goods_payment_state_check;
ALTER TABLE goods_payment_attempts ADD CONSTRAINT goods_payment_state_check CHECK (state IN ('processing','unknown','succeeded','failed','refund_pending','partially_refunded','refunded'));

-- Cancellation never mutates purchased quantity. Every cancelled unit has an
-- immutable value allocation and matching reasoned stock disposition at commit.
CREATE FUNCTION check_goods_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; valid BOOLEAN;
BEGIN
 IF TG_TABLE_NAME = 'goods_order_cancellations' THEN target := NEW.id;
 ELSIF TG_TABLE_NAME = 'goods_cancellation_lines' THEN target := NEW.cancellation_id;
 ELSE
   IF NEW.cancellation_line_id IS NULL THEN RETURN NEW; END IF;
   EXECUTE format('SELECT cancellation_id FROM %I.goods_cancellation_lines WHERE id = $1', TG_TABLE_SCHEMA) INTO target USING NEW.cancellation_line_id;
 END IF;
 EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.goods_order_cancellations c
   JOIN %I.goods_vendor_orders o ON o.id = c.order_id JOIN %I.goods_purchases p ON p.id = o.purchase_id
   JOIN %I.goods_refund_operations r ON r.id = c.refund_id
   WHERE c.id = $1 AND r.payment_id = p.payment_id AND r.semantic_key = ''cancellation:'' || c.id::text
     AND r.amount_cents::bigint = c.item_refund_cents::bigint + c.delivery_refund_cents
     AND c.item_refund_cents::bigint = (SELECT sum(cl.refund_cents::bigint) FROM %I.goods_cancellation_lines cl WHERE cl.cancellation_id = c.id)
     AND EXISTS (SELECT 1 FROM %I.goods_cancellation_lines cl WHERE cl.cancellation_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM %I.goods_cancellation_lines cl JOIN %I.goods_order_lines ol ON ol.id = cl.order_line_id
       JOIN %I.goods_hold_lines hl ON hl.id = ol.hold_line_id
       WHERE cl.cancellation_id = c.id AND (ol.order_id <> o.id
         OR cl.refund_cents::bigint <> cl.quantity::bigint * (ol.snapshot->>''unitPriceCents'')::bigint
         OR EXISTS (SELECT 1 FROM %I.inventory_movements m WHERE m.cancellation_line_id = cl.id
           AND (m.order_line_id <> ol.id OR m.listing_id <> hl.listing_id OR m.location_id <> hl.location_id
             OR m.sku IS DISTINCT FROM hl.sku OR m.actor_id <> c.actor_id OR m.note <> c.note
             OR m.reserved_delta <> 0 OR (m.reason = ''returned'' AND m.on_hand_delta <> cl.quantity)
             OR (m.reason = ''damaged'' AND (m.on_hand_delta <> -cl.quantity OR cl.stock_disposition <> ''damaged''))))
         OR (SELECT sum(all_cl.quantity::bigint) FROM %I.goods_cancellation_lines all_cl WHERE all_cl.order_line_id = ol.id) > (ol.snapshot->>''quantity'')::integer
         OR (SELECT count(*) FROM %I.inventory_movements m WHERE m.cancellation_line_id = cl.id AND m.order_line_id = ol.id
           AND m.listing_id = hl.listing_id AND m.location_id = hl.location_id AND m.sku IS NOT DISTINCT FROM hl.sku
           AND m.reason = ''returned'' AND m.on_hand_delta = cl.quantity AND m.reserved_delta = 0) <> 1
         OR (SELECT count(*) FROM %I.inventory_movements m WHERE m.cancellation_line_id = cl.id AND m.order_line_id = ol.id
           AND m.listing_id = hl.listing_id AND m.location_id = hl.location_id AND m.sku IS NOT DISTINCT FROM hl.sku
           AND m.reason = ''damaged'' AND m.on_hand_delta = -cl.quantity AND m.reserved_delta = 0) <> CASE WHEN cl.stock_disposition = ''damaged'' THEN 1 ELSE 0 END))
     AND (SELECT sum(all_c.delivery_refund_cents::bigint) FROM %I.goods_order_cancellations all_c WHERE all_c.order_id = o.id) <= (o.snapshot->>''deliveryFeeCents'')::integer
     AND (c.delivery_refund_cents = 0 OR NOT EXISTS (SELECT 1 FROM %I.goods_order_lines ol WHERE ol.order_id = o.id
       AND (SELECT COALESCE(sum(cl.quantity),0) FROM %I.goods_cancellation_lines cl WHERE cl.order_line_id = ol.id) < (ol.snapshot->>''quantity'')::integer)))',
 TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,
 TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,
 TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA) INTO valid USING target;
 IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Cancellation requires matching quantities, stock and scoped refund allocation' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER goods_cancel_record_check AFTER INSERT ON goods_order_cancellations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_cancellation();
CREATE CONSTRAINT TRIGGER goods_cancel_line_ledger_check AFTER INSERT ON goods_cancellation_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_cancellation();
CREATE CONSTRAINT TRIGGER inventory_cancel_check AFTER INSERT ON inventory_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_cancellation();

CREATE OR REPLACE FUNCTION check_goods_purchase_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; valid BOOLEAN;
BEGIN
 IF TG_TABLE_NAME = 'goods_holds' THEN target := NEW.id;
 ELSIF TG_TABLE_NAME = 'goods_purchases' THEN target := NEW.hold_id;
 ELSE RETURN NEW; END IF;
 EXECUTE format('SELECT NOT EXISTS (SELECT 1 FROM %I.goods_holds h WHERE h.id = $1 AND h.state = ''committed'' AND (
   NOT EXISTS (SELECT 1 FROM %I.goods_purchases p JOIN %I.goods_payment_attempts pay ON pay.id = p.payment_id
     JOIN %I.goods_quotes q ON q.id = h.quote_id JOIN %I.goods_local_payment_results r ON r.payment_id = pay.id
     WHERE p.hold_id = h.id AND pay.hold_id = h.id AND pay.state IN (''succeeded'',''refund_pending'',''partially_refunded'',''refunded'')
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

CREATE FUNCTION check_goods_order_cancellation_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; valid BOOLEAN;
BEGIN
 IF TG_TABLE_NAME = 'goods_vendor_orders' THEN target := NEW.id; ELSE target := NEW.order_id; END IF;
 EXECUTE format('SELECT o.state = CASE
   WHEN (SELECT COALESCE(sum(cl.quantity),0) FROM %I.goods_cancellation_lines cl JOIN %I.goods_order_lines ol ON ol.id = cl.order_line_id WHERE ol.order_id = o.id) = 0 THEN ''confirmed''
   WHEN (SELECT COALESCE(sum(cl.quantity),0) FROM %I.goods_cancellation_lines cl JOIN %I.goods_order_lines ol ON ol.id = cl.order_line_id WHERE ol.order_id = o.id)
       = (SELECT sum((ol.snapshot->>''quantity'')::bigint) FROM %I.goods_order_lines ol WHERE ol.order_id = o.id) THEN ''cancelled''
   ELSE ''partially_cancelled'' END
   AND (SELECT COALESCE(sum(c.delivery_refund_cents),0) FROM %I.goods_order_cancellations c WHERE c.order_id = o.id)
       = CASE WHEN o.state = ''cancelled'' THEN (o.snapshot->>''deliveryFeeCents'')::integer ELSE 0 END
   FROM %I.goods_vendor_orders o WHERE o.id = $1',
 TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA) INTO valid USING target;
 IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Order cancellation state and delivery refund must match exact cancelled quantities' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER goods_order_cancel_state_check AFTER UPDATE ON goods_vendor_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_order_cancellation_state();
CREATE CONSTRAINT TRIGGER goods_cancel_state_check AFTER INSERT ON goods_order_cancellations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_order_cancellation_state();

CREATE OR REPLACE FUNCTION check_goods_refund_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE valid BOOLEAN;
BEGIN
 EXECUTE format('SELECT COALESCE(sum(r.amount_cents::bigint),0) <= pay.amount_cents
   AND EXISTS (SELECT 1 FROM %I.goods_local_payment_results result WHERE result.payment_id = pay.id AND result.outcome = ''succeeded'')
   FROM %I.goods_payment_attempts pay LEFT JOIN %I.goods_refund_operations r ON r.payment_id = pay.id
   WHERE pay.id = $1 GROUP BY pay.id,pay.amount_cents', TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA) INTO valid USING NEW.payment_id;
 IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Refund allocation exceeds verified captured payment' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE FUNCTION check_goods_payment_refund_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; valid BOOLEAN;
BEGIN
 IF TG_TABLE_NAME = 'goods_payment_attempts' THEN target := NEW.id; ELSE target := NEW.payment_id; END IF;
 EXECUTE format('SELECT CASE pay.state
   WHEN ''refund_pending'' THEN COALESCE(sum(r.amount_cents) FILTER (WHERE r.state = ''pending''),0) > 0
   WHEN ''partially_refunded'' THEN COALESCE(sum(r.amount_cents) FILTER (WHERE r.state = ''pending''),0) = 0
     AND COALESCE(sum(r.amount_cents) FILTER (WHERE r.state = ''succeeded''),0) > 0
     AND COALESCE(sum(r.amount_cents) FILTER (WHERE r.state = ''succeeded''),0) < pay.amount_cents
   WHEN ''refunded'' THEN COALESCE(sum(r.amount_cents) FILTER (WHERE r.state = ''pending''),0) = 0
     AND COALESCE(sum(r.amount_cents) FILTER (WHERE r.state = ''succeeded''),0) = pay.amount_cents
   ELSE COALESCE(sum(r.amount_cents),0) = 0 END
   FROM %I.goods_payment_attempts pay LEFT JOIN %I.goods_refund_operations r ON r.payment_id = pay.id WHERE pay.id = $1 GROUP BY pay.id,pay.state,pay.amount_cents',
 TG_TABLE_SCHEMA,TG_TABLE_SCHEMA) INTO valid USING target;
 IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Payment refund state must match durable operations' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER goods_payment_refund_state_check AFTER UPDATE ON goods_payment_attempts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_payment_refund_state();
CREATE CONSTRAINT TRIGGER goods_refund_payment_state_check AFTER INSERT OR UPDATE ON goods_refund_operations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_payment_refund_state();

CREATE FUNCTION guard_goods_cancellation_grant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE valid BOOLEAN;
BEGIN
 IF TG_OP = 'UPDATE' AND NEW.revoked_at IS NOT NULL THEN RETURN NEW; END IF;
 EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.goods_vendor_orders o JOIN %I.goods_purchases p ON p.id = o.purchase_id
   JOIN %I.workspaces w ON w.id = $3 WHERE o.id = $1 AND w.kind = ''real'' AND p.customer_id <> $2
     AND NOT EXISTS (SELECT 1 FROM %I.vendor_memberships m WHERE m.vendor_id = o.vendor_id AND m.user_id = $2 AND m.revoked_at IS NULL))',
 TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA) INTO valid USING NEW.order_id,NEW.user_id,NEW.workspace_id;
 IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Platform cancellation authority cannot target its own purchase or Vendor commitment' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER goods_cancellation_grant_guard BEFORE INSERT OR UPDATE ON goods_cancellation_grants FOR EACH ROW EXECUTE FUNCTION guard_goods_cancellation_grant();
