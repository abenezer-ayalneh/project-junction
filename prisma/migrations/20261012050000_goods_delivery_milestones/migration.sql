-- CreateTable
CREATE TABLE "goods_delivery_progress" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "fulfillment_id" UUID NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'out_for_delivery',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "address" JSONB NOT NULL,
    "failed_at" TIMESTAMPTZ(6),
    "retry_deadline" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "goods_delivery_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_delivery_events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "progress_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" UUID,
    "evidence" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "goods_delivery_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "goods_delivery_progress_fulfillment_id_key" ON "goods_delivery_progress"("fulfillment_id");

-- CreateIndex
CREATE INDEX "goods_delivery_progress_state_retry_deadline_idx" ON "goods_delivery_progress"("state", "retry_deadline");

-- CreateIndex
CREATE UNIQUE INDEX "goods_delivery_events_progress_id_version_key" ON "goods_delivery_events"("progress_id", "version");

-- AddForeignKey
ALTER TABLE "goods_delivery_progress" ADD CONSTRAINT "goods_delivery_progress_fulfillment_id_fkey" FOREIGN KEY ("fulfillment_id") REFERENCES "goods_fulfillments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_delivery_events" ADD CONSTRAINT "goods_delivery_events_progress_id_fkey" FOREIGN KEY ("progress_id") REFERENCES "goods_delivery_progress"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


ALTER TABLE goods_delivery_progress ADD CONSTRAINT goods_delivery_state_check CHECK (state IN ('out_for_delivery','delivery_failed','delivered','inspection_pending','inspection_completed')),
 ADD CONSTRAINT goods_delivery_attempt_check CHECK (attempt BETWEEN 1 AND 2 AND version > 0),
 ADD CONSTRAINT goods_delivery_deadline_check CHECK (retry_deadline IS NULL OR failed_at IS NOT NULL);
ALTER TABLE goods_delivery_events ADD CONSTRAINT goods_delivery_action_check CHECK (action IN ('dispatch','failed','retry','delivered','expire','proof_rejected','inspected') AND version>0);
CREATE TRIGGER goods_delivery_event_immutable BEFORE UPDATE OR DELETE ON goods_delivery_events FOR EACH ROW EXECUTE FUNCTION reject_goods_snapshot_mutation();
CREATE FUNCTION guard_goods_delivery_progress() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR NEW.id<>OLD.id OR NEW.fulfillment_id<>OLD.fulfillment_id OR NEW.version<>OLD.version+1 OR NEW.code_digest<>OLD.code_digest OR NEW.quantity_snapshot<>OLD.quantity_snapshot OR NEW.rejected_proofs<OLD.rejected_proofs
  OR NOT ((OLD.state='out_for_delivery' AND NEW.state IN ('delivery_failed','delivered','inspection_pending')) OR (OLD.state='delivery_failed' AND NEW.state IN ('out_for_delivery','inspection_pending')) OR (OLD.state='inspection_pending' AND NEW.state='inspection_completed') OR (OLD.state='out_for_delivery' AND NEW.state='out_for_delivery' AND NEW.rejected_proofs=OLD.rejected_proofs+1))
  OR (NEW.attempt<>OLD.attempt AND NOT (OLD.state='delivery_failed' AND OLD.attempt=1 AND NEW.state='out_for_delivery' AND NEW.attempt=2))
  OR (NEW.address<>OLD.address AND NOT (OLD.state='delivery_failed' AND NEW.state='out_for_delivery' AND NEW.attempt=2)) THEN
 RAISE EXCEPTION 'Invalid delivery transition or attempt mutation' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER goods_delivery_progress_guard BEFORE UPDATE OR DELETE ON goods_delivery_progress FOR EACH ROW EXECUTE FUNCTION guard_goods_delivery_progress();
CREATE FUNCTION check_goods_delivery_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; valid BOOLEAN;
BEGIN
 IF TG_TABLE_NAME='goods_delivery_progress' THEN target:=NEW.id; ELSE target:=NEW.progress_id; END IF;
 EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.goods_delivery_progress p JOIN %I.goods_fulfillments f ON f.id=p.fulfillment_id
 WHERE p.id=$1 AND f.method=''delivery'' AND (SELECT count(*) FROM %I.goods_delivery_events e WHERE e.progress_id=p.id)=p.version
 AND EXISTS (SELECT 1 FROM %I.goods_delivery_events e WHERE e.progress_id=p.id AND e.version=p.version)
 AND EXISTS (SELECT 1 FROM %I.goods_delivery_events e WHERE e.progress_id=p.id AND e.version=1 AND e.action=''dispatch''))',
 TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA) INTO valid USING target;
 IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Delivery progress requires complete immutable milestone records' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER goods_delivery_progress_event_check AFTER INSERT OR UPDATE ON goods_delivery_progress DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_delivery_event();
CREATE CONSTRAINT TRIGGER goods_delivery_event_check AFTER INSERT ON goods_delivery_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_delivery_event();
-- AlterTable
ALTER TABLE "goods_delivery_progress" ADD COLUMN     "code_ciphertext" TEXT NOT NULL,
ADD COLUMN     "code_digest" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "goods_delivery_handoffs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "progress_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "handed_off_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "goods_delivery_handoffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "goods_delivery_handoffs_progress_id_key" ON "goods_delivery_handoffs"("progress_id");

-- AddForeignKey
ALTER TABLE "goods_delivery_handoffs" ADD CONSTRAINT "goods_delivery_handoffs_progress_id_fkey" FOREIGN KEY ("progress_id") REFERENCES "goods_delivery_progress"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


CREATE TRIGGER goods_delivery_handoff_immutable BEFORE UPDATE OR DELETE ON goods_delivery_handoffs FOR EACH ROW EXECUTE FUNCTION reject_goods_snapshot_mutation();
ALTER TABLE goods_delivery_handoffs ADD CONSTRAINT goods_delivery_handoff_method_check CHECK(method IN ('code','qr','fallback'));
CREATE FUNCTION check_goods_delivery_handoff() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; valid BOOLEAN;
BEGIN
 IF TG_TABLE_NAME='goods_delivery_progress' THEN target:=NEW.id; ELSE target:=NEW.progress_id; END IF;
 EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.goods_delivery_progress d JOIN %I.goods_fulfillments f ON f.id=d.fulfillment_id
 JOIN %I.goods_vendor_orders o ON o.id=f.order_id JOIN %I.goods_purchases p ON p.id=o.purchase_id
 WHERE d.id=$1 AND ((d.state=''delivered'' AND EXISTS(SELECT 1 FROM %I.goods_delivery_handoffs h WHERE h.progress_id=d.id
 AND h.customer_id=p.customer_id AND (h.evidence->>''proofDigest''=d.code_digest OR (h.method=''fallback'' AND EXISTS(SELECT 1 FROM %I.goods_delivery_acknowledgements a WHERE a.id=h.acknowledgement_id AND a.progress_id=d.id AND a.customer_id=p.customer_id AND a.purpose=''handoff'' AND a.customer_id<>h.actor_id AND a.acknowledged_at<=h.handed_off_at AND a.acknowledged_at>=h.handed_off_at-interval ''15 minutes''))) AND EXISTS(SELECT 1 FROM %I.goods_delivery_events e WHERE e.progress_id=d.id AND e.version=d.version AND e.action=''delivered'' AND e.occurred_at=h.handed_off_at)))
 OR (d.state<>''delivered'' AND NOT EXISTS(SELECT 1 FROM %I.goods_delivery_handoffs h WHERE h.progress_id=d.id))))',
 TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA) INTO valid USING target;
 IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Delivered goods require one Customer-bound immutable handoff and event' USING ERRCODE='23514';END IF;
 RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER goods_delivery_handoff_check AFTER INSERT ON goods_delivery_handoffs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_delivery_handoff();
CREATE CONSTRAINT TRIGGER goods_delivery_terminal_proof_check AFTER UPDATE ON goods_delivery_progress DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_delivery_handoff();

ALTER TABLE goods_delivery_progress ADD CONSTRAINT goods_delivery_code_check CHECK (code_digest ~ '^[a-f0-9]{64}$' AND (state NOT IN ('delivered','inspection_pending','inspection_completed') OR code_ciphertext=''));
-- AlterTable
ALTER TABLE "goods_delivery_progress" ADD COLUMN     "quantity_snapshot" JSONB NOT NULL,
ADD COLUMN     "rejected_proofs" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "goods_delivery_handoffs" ADD COLUMN     "acknowledgement_id" UUID;

-- CreateTable
CREATE TABLE "goods_delivery_acknowledgements" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "progress_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "goods_delivery_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_delivery_inspections" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "progress_id" UUID NOT NULL,
    "cancellation_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "evidence" JSONB NOT NULL,
    "inspected_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "goods_delivery_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goods_delivery_acknowledgements_progress_id_idx" ON "goods_delivery_acknowledgements"("progress_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_delivery_inspections_progress_id_key" ON "goods_delivery_inspections"("progress_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_delivery_inspections_cancellation_id_key" ON "goods_delivery_inspections"("cancellation_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_delivery_handoffs_acknowledgement_id_key" ON "goods_delivery_handoffs"("acknowledgement_id");

-- AddForeignKey
ALTER TABLE "goods_delivery_handoffs" ADD CONSTRAINT "goods_delivery_handoffs_acknowledgement_id_fkey" FOREIGN KEY ("acknowledgement_id") REFERENCES "goods_delivery_acknowledgements"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_delivery_acknowledgements" ADD CONSTRAINT "goods_delivery_acknowledgements_progress_id_fkey" FOREIGN KEY ("progress_id") REFERENCES "goods_delivery_progress"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_delivery_inspections" ADD CONSTRAINT "goods_delivery_inspections_progress_id_fkey" FOREIGN KEY ("progress_id") REFERENCES "goods_delivery_progress"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_delivery_inspections" ADD CONSTRAINT "goods_delivery_inspections_cancellation_id_fkey" FOREIGN KEY ("cancellation_id") REFERENCES "goods_order_cancellations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


ALTER TABLE goods_order_cancellations DROP CONSTRAINT goods_cancellation_origin_check;
ALTER TABLE goods_order_cancellations ADD CONSTRAINT goods_cancellation_origin_check CHECK(origin IN ('pre_fulfillment','pickup_expiry','delivery_failure'));
ALTER TABLE goods_delivery_progress ADD CONSTRAINT goods_delivery_rejected_proofs_check CHECK(rejected_proofs BETWEEN 0 AND 5);
CREATE TRIGGER goods_delivery_ack_immutable BEFORE UPDATE OR DELETE ON goods_delivery_acknowledgements FOR EACH ROW EXECUTE FUNCTION reject_goods_snapshot_mutation();
CREATE TRIGGER goods_delivery_inspection_immutable BEFORE UPDATE OR DELETE ON goods_delivery_inspections FOR EACH ROW EXECUTE FUNCTION reject_goods_snapshot_mutation();
ALTER TABLE goods_delivery_acknowledgements ADD CONSTRAINT goods_delivery_ack_purpose_check CHECK(purpose IN ('correction','handoff'));
CREATE FUNCTION check_goods_delivery_inspection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; valid BOOLEAN;
BEGIN
 IF TG_TABLE_NAME='goods_delivery_progress' THEN target:=NEW.id; ELSE target:=NEW.progress_id; END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.goods_delivery_progress d JOIN %I.goods_fulfillments f ON f.id=d.fulfillment_id WHERE d.id=$1 AND
 ((d.state=''inspection_completed'' AND EXISTS(SELECT 1 FROM %I.goods_delivery_inspections i JOIN %I.goods_order_cancellations c ON c.id=i.cancellation_id WHERE i.progress_id=d.id AND c.order_id=f.order_id AND c.origin=''delivery_failure'' AND c.actor_id=i.actor_id)) OR
 (d.state<>''inspection_completed'' AND NOT EXISTS(SELECT 1 FROM %I.goods_delivery_inspections i WHERE i.progress_id=d.id))))',
 TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA) INTO valid USING target;
 IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Terminal delivery inspection requires matching scoped refund recovery' USING ERRCODE='23514';END IF;
 RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER goods_delivery_inspection_check AFTER INSERT ON goods_delivery_inspections DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_delivery_inspection();
CREATE CONSTRAINT TRIGGER goods_delivery_inspected_state_check AFTER UPDATE ON goods_delivery_progress DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_delivery_inspection();

CREATE OR REPLACE FUNCTION check_goods_cancellation_fulfillment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE valid BOOLEAN;
BEGIN
 EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.goods_order_cancellations c JOIN %I.goods_fulfillments f ON f.order_id=c.order_id WHERE c.id=$1 AND
  ((c.origin=''pre_fulfillment'' AND f.state IN (''pending'',''preparing'',''cancelled'') AND NOT EXISTS(SELECT 1 FROM %I.goods_delivery_progress d WHERE d.fulfillment_id=f.id)) OR (c.origin=''pickup_expiry'' AND f.state=''inspection_completed'' AND EXISTS (SELECT 1 FROM %I.goods_pickup_inspections i WHERE i.fulfillment_id=f.id AND i.cancellation_id=c.id)) OR (c.origin=''delivery_failure'' AND EXISTS(SELECT 1 FROM %I.goods_delivery_progress d JOIN %I.goods_delivery_inspections i ON i.progress_id=d.id WHERE d.fulfillment_id=f.id AND d.state=''inspection_completed'' AND i.cancellation_id=c.id))))',
 TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA) INTO valid USING NEW.id;
 IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Cancellation must follow its actual fulfillment or pickup inspection path' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
