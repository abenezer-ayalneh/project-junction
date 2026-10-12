-- CreateTable
CREATE TABLE "goods_return_cases" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "order_line_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "unused" BOOLEAN NOT NULL,
    "policy_snapshot" JSONB NOT NULL,
    "verified_handoff_at" TIMESTAMPTZ(6) NOT NULL,
    "eligible_until" TIMESTAMPTZ(6) NOT NULL,
    "logistics_payer" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'submitted',
    "version" INTEGER NOT NULL DEFAULT 1,
    "cancellation_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_return_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_return_events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "return_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "evidence" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "goods_return_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "goods_return_cases_cancellation_id_key" ON "goods_return_cases"("cancellation_id");

-- CreateIndex
CREATE INDEX "goods_return_cases_order_line_id_state_idx" ON "goods_return_cases"("order_line_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "goods_return_events_return_id_version_key" ON "goods_return_events"("return_id", "version");

-- AddForeignKey
ALTER TABLE "goods_return_cases" ADD CONSTRAINT "goods_return_cases_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "goods_order_lines"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_return_cases" ADD CONSTRAINT "goods_return_cases_cancellation_id_fkey" FOREIGN KEY ("cancellation_id") REFERENCES "goods_order_cancellations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_return_events" ADD CONSTRAINT "goods_return_events_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "goods_return_cases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE goods_return_cases ADD CONSTRAINT goods_return_reason_check CHECK(reason IN ('change_of_mind','fault','wrong_item','material_misdescription') AND (reason<>'change_of_mind' OR unused)),
 ADD CONSTRAINT goods_return_quantity_check CHECK(quantity>0 AND version>0 AND eligible_until>verified_handoff_at AND created_at>=verified_handoff_at AND created_at<eligible_until),
 ADD CONSTRAINT goods_return_state_check CHECK(state IN ('submitted','approved','declined','in_transit','received','inspected','refund_pending','resolved_no_refund')),
 ADD CONSTRAINT goods_return_logistics_check CHECK(logistics_payer=CASE WHEN reason='change_of_mind' THEN 'customer' ELSE 'vendor' END),
 ADD CONSTRAINT goods_return_refund_link_check CHECK((state='refund_pending')=(cancellation_id IS NOT NULL));
CREATE TRIGGER goods_return_event_immutable BEFORE UPDATE OR DELETE ON goods_return_events FOR EACH ROW EXECUTE FUNCTION reject_goods_snapshot_mutation();
CREATE FUNCTION guard_goods_return_case() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['state','version','cancellation_id'])<>(to_jsonb(OLD)-ARRAY['state','version','cancellation_id']) OR NEW.version<>OLD.version+1 OR
 NOT ((OLD.state='submitted' AND NEW.state IN ('approved','declined')) OR (OLD.state='approved' AND NEW.state='in_transit') OR (OLD.state='in_transit' AND NEW.state='received') OR (OLD.state='received' AND NEW.state='inspected') OR (OLD.state='inspected' AND NEW.state IN ('refund_pending','resolved_no_refund'))) THEN
 RAISE EXCEPTION 'Return identity and evidence are immutable; lifecycle must follow ordered actions' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER goods_return_case_guard BEFORE UPDATE OR DELETE ON goods_return_cases FOR EACH ROW EXECUTE FUNCTION guard_goods_return_case();
CREATE FUNCTION check_goods_return_case() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; valid BOOLEAN;
BEGIN
 IF TG_TABLE_NAME='goods_return_cases' THEN target:=NEW.id; ELSE target:=NEW.return_id; END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.goods_return_cases r JOIN %I.goods_order_lines l ON l.id=r.order_line_id JOIN %I.goods_vendor_orders o ON o.id=l.order_id JOIN %I.goods_purchases p ON p.id=o.purchase_id JOIN %I.goods_fulfillments f ON f.order_id=o.id
 WHERE r.id=$1 AND r.customer_id=p.customer_id AND r.policy_snapshot=l.snapshot->''policy''
 AND (EXISTS(SELECT 1 FROM %I.goods_pickup_handoffs h WHERE h.fulfillment_id=f.id AND h.handed_off_at=r.verified_handoff_at) OR EXISTS(SELECT 1 FROM %I.goods_delivery_progress d JOIN %I.goods_delivery_handoffs h ON h.progress_id=d.id WHERE d.fulfillment_id=f.id AND h.handed_off_at=r.verified_handoff_at))
 AND r.eligible_until=r.verified_handoff_at+make_interval(days => CASE WHEN r.reason=''change_of_mind'' THEN (r.policy_snapshot->>''changeOfMindDays'')::integer ELSE (r.policy_snapshot->>''faultProtectionDays'')::integer END)
 AND (SELECT count(*) FROM %I.goods_return_events e WHERE e.return_id=r.id)=r.version
 AND EXISTS(SELECT 1 FROM %I.goods_return_events e WHERE e.return_id=r.id AND e.version=1 AND e.action=''submit'')
 AND EXISTS(SELECT 1 FROM %I.goods_return_events e WHERE e.return_id=r.id AND e.version=r.version AND e.action=CASE r.state WHEN ''submitted'' THEN ''submit'' WHEN ''approved'' THEN ''approve'' WHEN ''declined'' THEN ''decline'' WHEN ''in_transit'' THEN ''ship'' WHEN ''received'' THEN ''receive'' WHEN ''inspected'' THEN ''inspect'' WHEN ''refund_pending'' THEN ''refund'' WHEN ''resolved_no_refund'' THEN ''no_refund'' END)
 AND (SELECT COALESCE(sum(c.quantity),0) FROM %I.goods_cancellation_lines c WHERE c.order_line_id=l.id)+(SELECT COALESCE(sum(a.quantity),0) FROM %I.goods_return_cases a WHERE a.order_line_id=l.id AND a.state NOT IN (''declined'',''resolved_no_refund'',''refund_pending'')) <= (l.snapshot->>''quantity'')::integer
 AND (r.cancellation_id IS NULL OR EXISTS(SELECT 1 FROM %I.goods_order_cancellations c JOIN %I.goods_cancellation_lines cl ON cl.cancellation_id=c.id WHERE c.id=r.cancellation_id AND c.order_id=o.id AND c.origin=''return_inspection'' AND cl.order_line_id=l.id AND cl.quantity=r.quantity AND (SELECT count(*) FROM %I.goods_cancellation_lines other WHERE other.cancellation_id=c.id)=1 AND (r.reason<>''change_of_mind'' OR c.delivery_refund_cents=0))))',
 TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA) INTO valid USING target;
 IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Return requires owned handed-off quantities, frozen eligible policy and complete evidence/refund linkage' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER goods_return_case_check AFTER INSERT OR UPDATE ON goods_return_cases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_return_case();
CREATE CONSTRAINT TRIGGER goods_return_event_check AFTER INSERT ON goods_return_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_goods_return_case();
ALTER TABLE goods_order_cancellations DROP CONSTRAINT goods_cancellation_origin_check;
ALTER TABLE goods_order_cancellations ADD CONSTRAINT goods_cancellation_origin_check CHECK(origin IN ('pre_fulfillment','pickup_expiry','delivery_failure','return_inspection'));

CREATE OR REPLACE FUNCTION check_goods_cancellation_fulfillment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE valid BOOLEAN;
BEGIN
 EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.goods_order_cancellations c JOIN %I.goods_fulfillments f ON f.order_id=c.order_id WHERE c.id=$1 AND
  ((c.origin=''pre_fulfillment'' AND f.state IN (''pending'',''preparing'',''cancelled'') AND NOT EXISTS(SELECT 1 FROM %I.goods_delivery_progress d WHERE d.fulfillment_id=f.id)) OR (c.origin=''pickup_expiry'' AND f.state=''inspection_completed'' AND EXISTS (SELECT 1 FROM %I.goods_pickup_inspections i WHERE i.fulfillment_id=f.id AND i.cancellation_id=c.id)) OR (c.origin=''delivery_failure'' AND EXISTS(SELECT 1 FROM %I.goods_delivery_progress d JOIN %I.goods_delivery_inspections i ON i.progress_id=d.id WHERE d.fulfillment_id=f.id AND d.state=''inspection_completed'' AND i.cancellation_id=c.id)) OR (c.origin=''return_inspection'' AND EXISTS(SELECT 1 FROM %I.goods_return_cases r WHERE r.cancellation_id=c.id AND r.state=''refund_pending''))))',
 TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA) INTO valid USING NEW.id;
 IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Cancellation must follow its actual fulfillment or pickup inspection path' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION check_goods_order_cancellation_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; valid BOOLEAN;
BEGIN
 IF TG_TABLE_NAME = 'goods_vendor_orders' THEN target := NEW.id; ELSE target := NEW.order_id; END IF;
 EXECUTE format('SELECT o.state = CASE
   WHEN (SELECT COALESCE(sum(cl.quantity),0) FROM %I.goods_cancellation_lines cl JOIN %I.goods_order_lines ol ON ol.id = cl.order_line_id WHERE ol.order_id = o.id) = 0 THEN ''confirmed''
   WHEN (SELECT COALESCE(sum(cl.quantity),0) FROM %I.goods_cancellation_lines cl JOIN %I.goods_order_lines ol ON ol.id = cl.order_line_id WHERE ol.order_id = o.id)
       = (SELECT sum((ol.snapshot->>''quantity'')::bigint) FROM %I.goods_order_lines ol WHERE ol.order_id = o.id) THEN ''cancelled''
   ELSE ''partially_cancelled'' END
   AND ((o.state=''cancelled'' AND EXISTS(SELECT 1 FROM %I.goods_order_cancellations returns WHERE returns.order_id=o.id AND returns.origin=''return_inspection'')) OR (SELECT COALESCE(sum(c.delivery_refund_cents),0) FROM %I.goods_order_cancellations c WHERE c.order_id = o.id)
       = CASE WHEN o.state = ''cancelled'' THEN (o.snapshot->>''deliveryFeeCents'')::integer ELSE 0 END)
   FROM %I.goods_vendor_orders o WHERE o.id = $1',
 TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA) INTO valid USING target;
 IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Order cancellation state and delivery refund must match exact cancelled quantities' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$$;
