-- AlterTable
ALTER TABLE "vendor_memberships" ADD COLUMN     "goods_fulfillment_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "goods_order_cancellations" ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'pre_fulfillment';

-- CreateTable
CREATE TABLE "goods_fulfillments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "order_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "snapshot" JSONB NOT NULL,
    "quantity_snapshot" JSONB,
    "prepared_at" TIMESTAMPTZ(6),
    "ready_at" TIMESTAMPTZ(6),
    "pickup_window_ends_at" TIMESTAMPTZ(6),
    "pickup_grace_ends_at" TIMESTAMPTZ(6),
    "handoff_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "code_ciphertext" TEXT,
    "code_digest" TEXT,
    "failed_code_attempts" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_fulfillments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_pickup_acknowledgements" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "fulfillment_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_pickup_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_pickup_handoffs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "fulfillment_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "acknowledgement_id" UUID,
    "evidence" JSONB NOT NULL,
    "handed_off_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "goods_pickup_handoffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_pickup_inspections" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "fulfillment_id" UUID NOT NULL,
    "cancellation_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "evidence" JSONB NOT NULL,
    "inspected_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "goods_pickup_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "goods_fulfillments_order_id_key" ON "goods_fulfillments"("order_id");

-- CreateIndex
CREATE INDEX "goods_fulfillments_state_pickup_grace_ends_at_idx" ON "goods_fulfillments"("state", "pickup_grace_ends_at");

-- CreateIndex
CREATE INDEX "goods_pickup_acknowledgements_fulfillment_id_idx" ON "goods_pickup_acknowledgements"("fulfillment_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_pickup_handoffs_fulfillment_id_key" ON "goods_pickup_handoffs"("fulfillment_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_pickup_handoffs_acknowledgement_id_key" ON "goods_pickup_handoffs"("acknowledgement_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_pickup_inspections_fulfillment_id_key" ON "goods_pickup_inspections"("fulfillment_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_pickup_inspections_cancellation_id_key" ON "goods_pickup_inspections"("cancellation_id");

-- AddForeignKey
ALTER TABLE "goods_fulfillments" ADD CONSTRAINT "goods_fulfillments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "goods_vendor_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_pickup_acknowledgements" ADD CONSTRAINT "goods_pickup_acknowledgements_fulfillment_id_fkey" FOREIGN KEY ("fulfillment_id") REFERENCES "goods_fulfillments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_pickup_handoffs" ADD CONSTRAINT "goods_pickup_handoffs_fulfillment_id_fkey" FOREIGN KEY ("fulfillment_id") REFERENCES "goods_fulfillments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_pickup_handoffs" ADD CONSTRAINT "goods_pickup_handoffs_acknowledgement_id_fkey" FOREIGN KEY ("acknowledgement_id") REFERENCES "goods_pickup_acknowledgements"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_pickup_inspections" ADD CONSTRAINT "goods_pickup_inspections_fulfillment_id_fkey" FOREIGN KEY ("fulfillment_id") REFERENCES "goods_fulfillments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_pickup_inspections" ADD CONSTRAINT "goods_pickup_inspections_cancellation_id_fkey" FOREIGN KEY ("cancellation_id") REFERENCES "goods_order_cancellations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;



-- Existing paid Orders receive only an unstarted fulfillment; no readiness or
-- handoff evidence is inferred during upgrade.
INSERT INTO goods_fulfillments(order_id,method,state,snapshot,ended_at)
 SELECT id, snapshot->'fulfillment'->>'method', CASE WHEN state='cancelled' THEN 'cancelled' ELSE 'pending' END, snapshot,
 CASE WHEN state='cancelled' THEN now() ELSE NULL END FROM goods_vendor_orders;
ALTER TABLE goods_fulfillments ADD CONSTRAINT goods_fulfillment_state_check CHECK (state IN ('pending','preparing','ready_for_pickup','collected','inspection_pending','inspection_completed','cancelled')),
 ADD CONSTRAINT goods_fulfillment_method_check CHECK (method IN ('pickup','delivery')),
 ADD CONSTRAINT goods_fulfillment_attempts_check CHECK (failed_code_attempts BETWEEN 0 AND 5 AND version > 0),
 ADD CONSTRAINT goods_fulfillment_code_check CHECK (code_digest IS NULL OR code_digest ~ '^[a-f0-9]{64}$'),
 ADD CONSTRAINT goods_fulfillment_ready_check CHECK (state NOT IN ('ready_for_pickup','collected','inspection_pending','inspection_completed') OR (method='pickup' AND quantity_snapshot IS NOT NULL AND prepared_at IS NOT NULL AND ready_at IS NOT NULL AND pickup_window_ends_at = ready_at + interval '72 hours' AND pickup_grace_ends_at = ready_at + interval '120 hours' AND code_digest IS NOT NULL)),
 ADD CONSTRAINT goods_fulfillment_terminal_check CHECK ((state='ready_for_pickup' AND code_ciphertext IS NOT NULL AND handoff_at IS NULL AND ended_at IS NULL)
  OR (state='collected' AND handoff_at IS NOT NULL AND ended_at=handoff_at AND code_ciphertext IS NULL AND handoff_at>=ready_at AND handoff_at<pickup_grace_ends_at)
  OR (state IN ('inspection_pending','inspection_completed','cancelled') AND handoff_at IS NULL AND ended_at IS NOT NULL AND code_ciphertext IS NULL)
  OR (state IN ('pending','preparing') AND handoff_at IS NULL AND ended_at IS NULL AND code_ciphertext IS NULL));
ALTER TABLE goods_pickup_handoffs ADD CONSTRAINT goods_handoff_method_check CHECK ((method IN ('code','qr') AND acknowledgement_id IS NULL) OR (method='fallback' AND acknowledgement_id IS NOT NULL));
ALTER TABLE goods_pickup_acknowledgements ADD CONSTRAINT goods_pickup_ack_reason_check CHECK (reason IN ('code_unavailable','accessibility') AND length(trim(statement))>=10);
ALTER TABLE goods_order_cancellations ADD CONSTRAINT goods_cancellation_origin_check CHECK (origin IN ('pre_fulfillment','pickup_expiry'));
ALTER TABLE goods_cancellation_lines DROP CONSTRAINT goods_cancel_line_check;
ALTER TABLE goods_cancellation_lines ADD CONSTRAINT goods_cancel_line_check CHECK (quantity>0 AND refund_cents>0 AND stock_disposition IN ('restock','damaged','quarantine','lost'));
CREATE TRIGGER goods_pickup_ack_immutable BEFORE UPDATE OR DELETE ON goods_pickup_acknowledgements FOR EACH ROW EXECUTE FUNCTION reject_goods_snapshot_mutation();
CREATE TRIGGER goods_pickup_handoff_immutable BEFORE UPDATE OR DELETE ON goods_pickup_handoffs FOR EACH ROW EXECUTE FUNCTION reject_goods_snapshot_mutation();
CREATE TRIGGER goods_pickup_inspection_immutable BEFORE UPDATE OR DELETE ON goods_pickup_inspections FOR EACH ROW EXECUTE FUNCTION reject_goods_snapshot_mutation();

CREATE FUNCTION guard_goods_fulfillment_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR NEW.id<>OLD.id OR NEW.order_id<>OLD.order_id OR NEW.method<>OLD.method OR NEW.snapshot<>OLD.snapshot OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1
   OR NOT ((OLD.state='pending' AND NEW.state IN ('preparing','cancelled')) OR (OLD.state='preparing' AND NEW.state IN ('ready_for_pickup','cancelled'))
     OR (OLD.state='ready_for_pickup' AND NEW.state IN ('collected','inspection_pending')) OR (OLD.state='inspection_pending' AND NEW.state='inspection_completed')
     OR (OLD.state='ready_for_pickup' AND NEW.state='ready_for_pickup' AND NEW.failed_code_attempts=OLD.failed_code_attempts+1))
   OR (OLD.prepared_at IS NOT NULL AND NEW.prepared_at IS DISTINCT FROM OLD.prepared_at)
   OR (OLD.ready_at IS NOT NULL AND (NEW.ready_at IS DISTINCT FROM OLD.ready_at OR NEW.pickup_window_ends_at IS DISTINCT FROM OLD.pickup_window_ends_at OR NEW.pickup_grace_ends_at IS DISTINCT FROM OLD.pickup_grace_ends_at OR NEW.quantity_snapshot IS DISTINCT FROM OLD.quantity_snapshot OR NEW.code_digest IS DISTINCT FROM OLD.code_digest))
   OR (NEW.state='ready_for_pickup' AND OLD.state='ready_for_pickup' AND NEW.code_ciphertext IS DISTINCT FROM OLD.code_ciphertext)
   OR NEW.failed_code_attempts<OLD.failed_code_attempts
   OR (NEW.state='inspection_pending' AND NEW.ended_at<NEW.pickup_grace_ends_at) THEN
   RAISE EXCEPTION 'Invalid or mutable goods fulfillment transition' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER goods_fulfillment_transition BEFORE UPDATE OR DELETE ON goods_fulfillments FOR EACH ROW EXECUTE FUNCTION guard_goods_fulfillment_transition();

CREATE FUNCTION check_goods_pickup_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; valid BOOLEAN;
BEGIN
 IF TG_TABLE_NAME='goods_fulfillments' THEN target:=NEW.id; ELSE target:=NEW.fulfillment_id; END IF;
 EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.goods_fulfillments f JOIN %I.goods_vendor_orders o ON o.id=f.order_id JOIN %I.goods_purchases p ON p.id=o.purchase_id
 WHERE f.id=$1 AND f.snapshot=o.snapshot AND f.method=f.snapshot->''fulfillment''->>''method''
  AND (f.quantity_snapshot IS NULL OR (jsonb_array_length(f.quantity_snapshot)>0 AND
   (SELECT count(*) FROM jsonb_array_elements(f.quantity_snapshot)) = (SELECT count(DISTINCT q->>''lineId'') FROM jsonb_array_elements(f.quantity_snapshot) q) AND
   NOT EXISTS (SELECT 1 FROM %I.goods_order_lines ol WHERE ol.order_id=o.id AND (ol.snapshot->>''quantity'')::integer > (SELECT COALESCE(sum(cl.quantity),0) FROM %I.goods_cancellation_lines cl JOIN %I.goods_order_cancellations c ON c.id=cl.cancellation_id WHERE cl.order_line_id=ol.id AND c.origin=''pre_fulfillment'') AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(f.quantity_snapshot) q WHERE (q->>''lineId'')::uuid=ol.id)) AND
   NOT EXISTS (SELECT 1 FROM jsonb_array_elements(f.quantity_snapshot) q WHERE (q->>''quantity'')::integer<=0 OR NOT EXISTS (SELECT 1 FROM %I.goods_order_lines ol WHERE ol.order_id=o.id AND ol.id=(q->>''lineId'')::uuid AND (q->>''quantity'')::integer = (ol.snapshot->>''quantity'')::integer - (SELECT COALESCE(sum(cl.quantity),0) FROM %I.goods_cancellation_lines cl JOIN %I.goods_order_cancellations c ON c.id=cl.cancellation_id WHERE cl.order_line_id=ol.id AND c.origin=''pre_fulfillment'')))))
  AND (f.state<>''collected'' OR EXISTS (SELECT 1 FROM %I.goods_pickup_handoffs h WHERE h.fulfillment_id=f.id AND h.customer_id=p.customer_id AND h.handed_off_at=f.handoff_at
   AND (h.method<>''fallback'' OR EXISTS (SELECT 1 FROM %I.goods_pickup_acknowledgements a WHERE a.id=h.acknowledgement_id AND a.fulfillment_id=f.id AND a.customer_id=p.customer_id AND a.customer_id<>h.actor_id AND a.reason=h.evidence->>''reason'' AND a.created_at<=h.handed_off_at AND a.created_at>=h.handed_off_at-interval ''15 minutes''))))
  AND (f.state=''collected'' OR NOT EXISTS (SELECT 1 FROM %I.goods_pickup_handoffs h WHERE h.fulfillment_id=f.id))
  AND (f.state<>''inspection_completed'' OR EXISTS (SELECT 1 FROM %I.goods_pickup_inspections i JOIN %I.goods_order_cancellations c ON c.id=i.cancellation_id WHERE i.fulfillment_id=f.id AND c.order_id=o.id AND c.origin=''pickup_expiry'' AND c.actor_id=i.actor_id))
  AND (f.state=''inspection_completed'' OR NOT EXISTS (SELECT 1 FROM %I.goods_pickup_inspections i WHERE i.fulfillment_id=f.id)))',
 TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA)
 INTO valid USING target;
 IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Pickup requires scoped immutable handoff or inspection evidence' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER goods_pickup_fulfillment_check AFTER INSERT OR UPDATE ON goods_fulfillments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_pickup_evidence();
CREATE CONSTRAINT TRIGGER goods_pickup_handoff_check AFTER INSERT ON goods_pickup_handoffs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_pickup_evidence();
CREATE CONSTRAINT TRIGGER goods_pickup_inspection_check AFTER INSERT ON goods_pickup_inspections DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_pickup_evidence();

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
   AND ((reason = 'returned' AND on_hand_delta > 0) OR (reason IN ('damaged','quarantined','lost') AND on_hand_delta < 0)))
);

CREATE OR REPLACE FUNCTION check_goods_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$
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
             OR (m.reason IN (''damaged'',''quarantined'',''lost'') AND (m.on_hand_delta <> -cl.quantity OR m.reason <> CASE cl.stock_disposition WHEN ''quarantine'' THEN ''quarantined'' ELSE cl.stock_disposition END))))
         OR (SELECT sum(all_cl.quantity::bigint) FROM %I.goods_cancellation_lines all_cl WHERE all_cl.order_line_id = ol.id) > (ol.snapshot->>''quantity'')::integer
         OR (SELECT count(*) FROM %I.inventory_movements m WHERE m.cancellation_line_id = cl.id AND m.order_line_id = ol.id
           AND m.listing_id = hl.listing_id AND m.location_id = hl.location_id AND m.sku IS NOT DISTINCT FROM hl.sku
           AND m.reason = ''returned'' AND m.on_hand_delta = cl.quantity AND m.reserved_delta = 0) <> 1
         OR (SELECT count(*) FROM %I.inventory_movements m WHERE m.cancellation_line_id = cl.id AND m.order_line_id = ol.id
           AND m.listing_id = hl.listing_id AND m.location_id = hl.location_id AND m.sku IS NOT DISTINCT FROM hl.sku
           AND m.reason = CASE cl.stock_disposition WHEN ''quarantine'' THEN ''quarantined'' WHEN ''lost'' THEN ''lost'' ELSE ''damaged'' END AND m.on_hand_delta = -cl.quantity AND m.reserved_delta = 0) <> CASE WHEN cl.stock_disposition IN (''damaged'',''quarantine'',''lost'') THEN 1 ELSE 0 END))
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

CREATE FUNCTION check_goods_cancellation_fulfillment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE valid BOOLEAN;
BEGIN
 EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.goods_order_cancellations c JOIN %I.goods_fulfillments f ON f.order_id=c.order_id WHERE c.id=$1 AND
  ((c.origin=''pre_fulfillment'' AND f.state IN (''pending'',''preparing'',''cancelled'')) OR (c.origin=''pickup_expiry'' AND f.state=''inspection_completed'' AND EXISTS (SELECT 1 FROM %I.goods_pickup_inspections i WHERE i.fulfillment_id=f.id AND i.cancellation_id=c.id))))',
 TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA) INTO valid USING NEW.id;
 IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Cancellation must follow its actual fulfillment or pickup inspection path' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER goods_cancel_fulfillment_check AFTER INSERT ON goods_order_cancellations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_cancellation_fulfillment();


CREATE FUNCTION guard_goods_pickup_ack() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE valid BOOLEAN;
BEGIN
 EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.goods_fulfillments f JOIN %I.goods_vendor_orders o ON o.id=f.order_id JOIN %I.goods_purchases p ON p.id=o.purchase_id WHERE f.id=$1 AND f.state=''ready_for_pickup'' AND p.customer_id=$2 AND $3>=f.ready_at AND $3<f.pickup_grace_ends_at)',TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA) INTO valid USING NEW.fulfillment_id,NEW.customer_id,NEW.created_at;
 IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Pickup acknowledgement belongs to the actual Customer and active ready window' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER goods_pickup_ack_guard BEFORE INSERT ON goods_pickup_acknowledgements FOR EACH ROW EXECUTE FUNCTION guard_goods_pickup_ack();

CREATE FUNCTION guard_goods_pickup_handoff() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE valid BOOLEAN;
BEGIN
 EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.goods_fulfillments f JOIN %I.goods_vendor_orders o ON o.id=f.order_id JOIN %I.goods_purchases p ON p.id=o.purchase_id
 JOIN %I.vendor_memberships m ON m.vendor_id=o.vendor_id AND m.user_id=$2
 WHERE f.id=$1 AND f.state=''ready_for_pickup'' AND m.revoked_at IS NULL AND o.location_id=ANY(m.location_ids)
  AND (m.role=''vendor_owner'' OR (m.role=''vendor_staff'' AND m.goods_fulfillment_enabled)) AND p.customer_id=$3
  AND $4>=f.ready_at AND $4<f.pickup_grace_ends_at AND ($5=''fallback'' OR (f.failed_code_attempts<5 AND $6->>''proofDigest''=f.code_digest)))',TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA)
 INTO valid USING NEW.fulfillment_id,NEW.actor_id,NEW.customer_id,NEW.handed_off_at,NEW.method,NEW.evidence;
 IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Handoff requires current assigned fulfillment authority, valid time and bound proof' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER goods_pickup_handoff_guard BEFORE INSERT ON goods_pickup_handoffs FOR EACH ROW EXECUTE FUNCTION guard_goods_pickup_handoff();
