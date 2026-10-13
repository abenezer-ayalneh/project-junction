-- AlterTable
ALTER TABLE "booking_holds" ADD COLUMN     "mixed_intent_id" UUID;

-- AlterTable
ALTER TABLE "booking_refunds" ADD COLUMN     "mixed_payment_id" UUID,
ALTER COLUMN "payment_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "mixed_purchase_id" UUID,
ALTER COLUMN "payment_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "goods_hold_lines" ADD COLUMN     "mixed_stock_line_id" UUID;

-- AlterTable
ALTER TABLE "goods_holds" ADD COLUMN     "mixed_hold_id" UUID;

-- AlterTable
ALTER TABLE "goods_local_payment_results" ALTER COLUMN "payment_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "goods_purchases" ADD COLUMN     "mixed_purchase_id" UUID,
ALTER COLUMN "payment_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "goods_refund_operations" ADD COLUMN     "mixed_payment_id" UUID,
ALTER COLUMN "payment_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "mixed_purchases" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "payment_id" UUID NOT NULL,
    "hold_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "paid_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mixed_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mixed_commerce_allocations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "purchase_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "component_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "vendor_id" UUID NOT NULL,
    "vendor_workspace_id" UUID NOT NULL,
    "location_id" UUID,
    "goods_order_line_id" UUID,
    "booking_id" UUID,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "mixed_commerce_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mixed_external_invoices" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "purchase_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "document_url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mixed_external_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mixed_refund_funding" (
    "additional_capture_id" UUID,
    "provider_reference" TEXT,
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "allocation_id" UUID NOT NULL,
    "goods_refund_id" UUID,
    "booking_refund_id" UUID,
    "quantity" INTEGER NOT NULL,
    "offset" INTEGER NOT NULL,
    "numerator" INTEGER NOT NULL,
    "denominator" INTEGER NOT NULL,
    "customer_minor_units" INTEGER NOT NULL,
    "subsidy_minor_units" INTEGER NOT NULL,
    "commission_minor_units" INTEGER NOT NULL,
    "vendor_minor_units" INTEGER NOT NULL,
    "ledger_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mixed_refund_funding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mixed_additional_captures" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "allocation_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "source_kind" TEXT NOT NULL,
    "provider_reference" TEXT NOT NULL,
    "customer_minor_units" INTEGER NOT NULL,
    "commission_minor_units" INTEGER NOT NULL,
    "vendor_minor_units" INTEGER NOT NULL,
    "ledger_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mixed_additional_captures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mixed_purchases_payment_id_key" ON "mixed_purchases"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "mixed_purchases_hold_id_key" ON "mixed_purchases"("hold_id");

-- CreateIndex
CREATE INDEX "mixed_purchases_workspace_id_customer_id_created_at_idx" ON "mixed_purchases"("workspace_id", "customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "mixed_commerce_allocations_goods_order_line_id_key" ON "mixed_commerce_allocations"("goods_order_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "mixed_commerce_allocations_booking_id_key" ON "mixed_commerce_allocations"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "mixed_commerce_allocations_purchase_id_key_key" ON "mixed_commerce_allocations"("purchase_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "mixed_refund_funding_ledger_id_key" ON "mixed_refund_funding"("ledger_id");

-- CreateIndex
CREATE UNIQUE INDEX "mixed_additional_captures_source_id_key" ON "mixed_additional_captures"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "mixed_additional_captures_provider_reference_key" ON "mixed_additional_captures"("provider_reference");

-- CreateIndex
CREATE UNIQUE INDEX "mixed_additional_captures_ledger_id_key" ON "mixed_additional_captures"("ledger_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_holds_mixed_intent_id_key" ON "booking_holds"("mixed_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_hold_lines_mixed_stock_line_id_key" ON "goods_hold_lines"("mixed_stock_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_holds_mixed_hold_id_key" ON "goods_holds"("mixed_hold_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_purchases_mixed_purchase_id_key" ON "goods_purchases"("mixed_purchase_id");

-- AddForeignKey
ALTER TABLE "goods_holds" ADD CONSTRAINT "goods_holds_mixed_hold_id_fkey" FOREIGN KEY ("mixed_hold_id") REFERENCES "mixed_checkout_holds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_hold_lines" ADD CONSTRAINT "goods_hold_lines_mixed_stock_line_id_fkey" FOREIGN KEY ("mixed_stock_line_id") REFERENCES "mixed_hold_stock_lines"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_purchases" ADD CONSTRAINT "goods_purchases_mixed_purchase_id_fkey" FOREIGN KEY ("mixed_purchase_id") REFERENCES "mixed_purchases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_refund_operations" ADD CONSTRAINT "goods_refund_operations_mixed_payment_id_fkey" FOREIGN KEY ("mixed_payment_id") REFERENCES "mixed_payment_attempts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_mixed_intent_id_fkey" FOREIGN KEY ("mixed_intent_id") REFERENCES "mixed_hold_booking_intents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_mixed_purchase_id_fkey" FOREIGN KEY ("mixed_purchase_id") REFERENCES "mixed_purchases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "booking_refunds" ADD CONSTRAINT "booking_refunds_mixed_payment_id_fkey" FOREIGN KEY ("mixed_payment_id") REFERENCES "mixed_payment_attempts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mixed_purchases" ADD CONSTRAINT "mixed_purchases_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "mixed_payment_attempts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mixed_commerce_allocations" ADD CONSTRAINT "mixed_commerce_allocations_goods_order_line_id_fkey" FOREIGN KEY ("goods_order_line_id") REFERENCES "goods_order_lines"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mixed_commerce_allocations" ADD CONSTRAINT "mixed_commerce_allocations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mixed_commerce_allocations" ADD CONSTRAINT "mixed_commerce_allocations_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "mixed_purchases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mixed_external_invoices" ADD CONSTRAINT "mixed_external_invoices_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "mixed_purchases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mixed_refund_funding" ADD CONSTRAINT "mixed_refund_funding_additional_capture_id_fkey" FOREIGN KEY ("additional_capture_id") REFERENCES "mixed_additional_captures"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mixed_refund_funding" ADD CONSTRAINT "mixed_refund_funding_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "mixed_commerce_allocations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mixed_refund_funding" ADD CONSTRAINT "mixed_refund_funding_goods_refund_id_fkey" FOREIGN KEY ("goods_refund_id") REFERENCES "goods_refund_operations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mixed_refund_funding" ADD CONSTRAINT "mixed_refund_funding_booking_refund_id_fkey" FOREIGN KEY ("booking_refund_id") REFERENCES "booking_refunds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mixed_refund_funding" ADD CONSTRAINT "mixed_refund_funding_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledger_transactions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mixed_additional_captures" ADD CONSTRAINT "mixed_additional_captures_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "mixed_commerce_allocations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mixed_additional_captures" ADD CONSTRAINT "mixed_additional_captures_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "ledger_transactions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Existing operational contexts keep their state machines; mixed financial facts are checked separately.
CREATE OR REPLACE FUNCTION guard_mixed_hold() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE quote mixed_checkout_quotes;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Mixed hold history is immutable'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'holding' THEN RAISE EXCEPTION 'Mixed hold must start holding'; END IF;
  SELECT * INTO STRICT quote FROM mixed_checkout_quotes WHERE id=NEW.quote_id;
  IF quote.cart_id<>NEW.cart_id OR quote.customer_id<>NEW.customer_id OR quote.workspace_id<>NEW.workspace_id OR quote.snapshot IS DISTINCT FROM NEW.snapshot OR quote.expires_at<=NEW.created_at OR jsonb_array_length(quote.snapshot->'conflicts')<>0 OR quote.snapshot->'total'='null'::jsonb OR quote.snapshot->'promotion'='null'::jsonb OR quote.snapshot->'commission'='null'::jsonb OR NOT EXISTS(SELECT 1 FROM mixed_carts WHERE id=NEW.cart_id AND version=quote.cart_version) THEN RAISE EXCEPTION 'Mixed hold requires an owned current complete quote'; END IF;
 ELSIF OLD.state<>'holding' OR NEW.state NOT IN ('released','expired','committed') OR NEW.id<>OLD.id OR NEW.quote_id<>OLD.quote_id OR NEW.cart_id<>OLD.cart_id OR NEW.customer_id<>OLD.customer_id OR NEW.workspace_id<>OLD.workspace_id OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.created_at<>OLD.created_at OR NEW.expires_at<>OLD.expires_at THEN RAISE EXCEPTION 'Mixed hold only permits an immutable terminal transition';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.released_at<NEW.created_at OR (NEW.state='expired' AND NEW.released_at<NEW.expires_at)) THEN RAISE EXCEPTION 'Mixed hold terminal time must match its deadline'; END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION verify_mixed_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID;p mixed_payment_attempts;h mixed_checkout_holds;r mixed_payment_refunds;total BIGINT;
BEGIN
 IF TG_TABLE_NAME='mixed_checkout_holds' THEN SELECT id INTO target FROM mixed_payment_attempts WHERE hold_id=NEW.id;
 ELSIF TG_TABLE_NAME='mixed_payment_refunds' THEN target:=NEW.payment_id;
 ELSE target:=NEW.id;END IF;
 IF target IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO STRICT p FROM mixed_payment_attempts WHERE id=target;SELECT * INTO STRICT h FROM mixed_checkout_holds WHERE id=p.hold_id;
 IF p.state IN ('succeeded','refund_pending','refunded') AND p.capture_ledger_id IS NULL THEN RAISE EXCEPTION 'Captured payment requires immutable ledger evidence';END IF;
 IF p.capture_ledger_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM provider_inbox_events e WHERE e.provider='local-mixed-payment' AND e.reconciliation_state='reconciled' AND e.workspace_id=p.workspace_id AND e.provider_reference=p.provider_reference AND e.payload->>'paymentId'=p.id::text AND e.payload->>'workspaceId'=p.workspace_id::text AND e.payload->>'merchant'='junction' AND e.payload->>'environment'='local-controlled' AND e.payload->>'outcome'='succeeded' AND e.payload->'amount'->>'minorUnits'=p.amount_minor_units::text AND e.payload->'amount'->>'currency'=p.currency AND (e.payload->>'occurredAt')::timestamptz=p.captured_at) THEN RAISE EXCEPTION 'Capture requires reconciled matching provider receipt';END IF;
  IF p.amount_minor_units=0 OR p.captured_at<p.created_at OR p.state NOT IN ('succeeded','refund_pending','refunded') OR NOT EXISTS(SELECT 1 FROM ledger_transactions WHERE id=p.capture_ledger_id AND workspace_id=p.workspace_id AND source_id=p.id AND economic_event_id='mixed-capture:'||p.id::text AND reversal_of IS NULL) OR (SELECT count(*) FROM ledger_postings WHERE transaction_id=p.capture_ledger_id)<>2 OR NOT EXISTS(SELECT 1 FROM ledger_postings WHERE transaction_id=p.capture_ledger_id AND account='processor_clearing' AND minor_units=p.amount_minor_units AND currency=p.currency) OR NOT EXISTS(SELECT 1 FROM ledger_postings WHERE transaction_id=p.capture_ledger_id AND account='customer_refund_liability' AND minor_units=-p.amount_minor_units AND currency=p.currency) THEN RAISE EXCEPTION 'Capture ledger must match original payment Money';END IF;
  IF h.state IN ('released','expired') AND p.state NOT IN ('refund_pending','refunded') THEN RAISE EXCEPTION 'Abandoned capture requires compensation';END IF;
 END IF;
 IF p.state='failed' AND h.state='holding' THEN RAISE EXCEPTION 'Failed payment must release resources';END IF;
 IF p.state='succeeded' AND (h.state NOT IN ('holding','committed') OR p.captured_at>=p.expires_at) THEN RAISE EXCEPTION 'Success requires timely capture and retained resources';END IF;
 SELECT * INTO r FROM mixed_payment_refunds WHERE payment_id=p.id;
 IF p.state IN ('refund_pending','refunded') AND (r.id IS NULL OR r.amount_minor_units<>p.amount_minor_units OR r.currency<>p.currency) THEN RAISE EXCEPTION 'Compensation requires exact durable refund';END IF;
 IF p.state='refunded' AND (r.state<>'completed' OR NOT EXISTS(SELECT 1 FROM ledger_transactions WHERE id=r.reversal_ledger_id AND reversal_of=p.capture_ledger_id AND economic_event_id='mixed-refund:'||r.id::text)) THEN RAISE EXCEPTION 'Refund completion requires exact capture reversal';END IF;
 IF r.state='completed' AND p.state<>'refunded' THEN RAISE EXCEPTION 'Refund and payment completion must align';END IF;
 RETURN NULL;
END; $$;
CREATE OR REPLACE FUNCTION guard_goods_hold_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.mixed_hold_id IS NOT NULL THEN IF TG_OP='DELETE' OR NEW.mixed_hold_id IS DISTINCT FROM OLD.mixed_hold_id OR NEW.id<>OLD.id OR NEW.quote_id<>OLD.quote_id OR NEW.expires_at<>OLD.expires_at OR OLD.state<>'holding' OR NEW.state<>'committed' THEN RAISE EXCEPTION 'Invalid immutable mixed goods projection'; END IF; RETURN NEW;END IF; IF TG_OP='UPDATE' AND NEW.mixed_hold_id IS NOT NULL THEN RAISE EXCEPTION 'Projection cannot be attached after creation'; END IF;
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
CREATE OR REPLACE FUNCTION check_goods_hold_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; valid BOOLEAN;
BEGIN
 IF TG_TABLE_NAME='goods_holds' THEN target:=NEW.id;ELSE target:=NEW.hold_id;END IF;IF EXISTS(SELECT 1 FROM goods_holds WHERE id=target AND mixed_hold_id IS NOT NULL) THEN RETURN NEW;END IF;
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
CREATE OR REPLACE FUNCTION check_goods_purchase_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; valid BOOLEAN;
BEGIN
 IF TG_TABLE_NAME='goods_holds' THEN IF NEW.mixed_hold_id IS NOT NULL THEN RETURN NEW;END IF; ELSIF TG_TABLE_NAME='goods_purchases' THEN IF NEW.mixed_purchase_id IS NOT NULL THEN RETURN NEW;END IF;END IF;
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
CREATE OR REPLACE FUNCTION preserve_booking_purchase() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Booking purchase history is immutable'; END IF;
  IF NEW.id <> OLD.id OR NEW.hold_id <> OLD.hold_id OR NEW.payment_id IS DISTINCT FROM OLD.payment_id OR NEW.mixed_purchase_id IS DISTINCT FROM OLD.mixed_purchase_id
     OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.confirmed_at <> OLD.confirmed_at THEN
    RAISE EXCEPTION 'Booking purchase terms are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION preserve_booking_hold() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.mixed_intent_id IS DISTINCT FROM OLD.mixed_intent_id THEN RAISE EXCEPTION 'Booking projection identity is immutable';END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Booking hold history is immutable'; END IF;
  IF NEW.id <> OLD.id OR NEW.customer_id <> OLD.customer_id OR NEW.workspace_id <> OLD.workspace_id
     OR NEW.vendor_id <> OLD.vendor_id OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
     OR NEW.expires_at <> OLD.expires_at OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Booking hold terms are immutable';
  END IF;
  IF OLD.state <> 'holding' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Terminal Booking hold is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION guard_mixed_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.mixed_intent_id IS NULL THEN
  IF TG_OP='UPDATE' AND NEW.mixed_intent_id IS NOT NULL THEN RAISE EXCEPTION 'Allocation cannot be attached after creation'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
 END IF;
 IF OLD.state='held' AND NEW.state='booked' AND NEW.mixed_intent_id=OLD.mixed_intent_id AND NEW.id=OLD.id AND NEW.staff_id=OLD.staff_id AND NEW.start_at=OLD.start_at AND NEW.end_at=OLD.end_at AND NEW.created_at=OLD.created_at AND NEW.expires_at IS NULL AND EXISTS(SELECT 1 FROM booking_holds h WHERE h.id=NEW.hold_id AND h.mixed_intent_id=OLD.mixed_intent_id) THEN RETURN NEW;END IF; IF OLD.state='booked' AND NEW.state IN ('released','cancelled','expired') AND NEW.mixed_intent_id=OLD.mixed_intent_id AND NEW.id=OLD.id AND NEW.staff_id=OLD.staff_id AND NEW.start_at=OLD.start_at AND NEW.end_at=OLD.end_at THEN RETURN NEW;END IF;
 IF TG_OP='DELETE' OR OLD.state<>'held' OR NEW.state NOT IN ('released','expired') OR NEW.id<>OLD.id OR NEW.mixed_intent_id IS DISTINCT FROM OLD.mixed_intent_id OR NEW.hold_id IS DISTINCT FROM OLD.hold_id OR NEW.staff_id<>OLD.staff_id OR NEW.start_at<>OLD.start_at OR NEW.end_at<>OLD.end_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Mixed Staff allocation is immutable except terminal state'; END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION verify_mixed_hold_components() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE hid UUID; hold mixed_checkout_holds; expected_stock INTEGER; expected_books INTEGER; expected_promos INTEGER;
BEGIN
 IF TG_TABLE_NAME='mixed_checkout_holds' THEN hid:=NEW.id; ELSIF TG_TABLE_NAME IN ('mixed_hold_stock_lines','mixed_hold_booking_intents') THEN hid:=NEW.hold_id; ELSIF TG_TABLE_NAME='inventory_movements' THEN hid:=NEW.mixed_hold_id; ELSIF TG_TABLE_NAME='staff_allocations' THEN SELECT hold_id INTO hid FROM mixed_hold_booking_intents WHERE id=NEW.mixed_intent_id; ELSIF TG_TABLE_NAME='promotion_reservations' THEN hid:=NEW.hold_ref;END IF; IF EXISTS(SELECT 1 FROM mixed_checkout_holds WHERE id=hid AND state='committed') THEN PERFORM verify_mixed_purchase_id(hid);RETURN NULL;END IF;
 IF TG_TABLE_NAME='mixed_checkout_holds' THEN hid:=NEW.id;
 ELSIF TG_TABLE_NAME='mixed_hold_stock_lines' OR TG_TABLE_NAME='mixed_hold_booking_intents' THEN hid:=NEW.hold_id;
 ELSIF TG_TABLE_NAME='inventory_movements' THEN hid:=NEW.mixed_hold_id;
 ELSIF TG_TABLE_NAME='staff_allocations' THEN SELECT hold_id INTO hid FROM mixed_hold_booking_intents WHERE id=NEW.mixed_intent_id;
 ELSE SELECT id INTO hid FROM mixed_checkout_holds WHERE id=NEW.hold_ref; END IF;
 IF hid IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO STRICT hold FROM mixed_checkout_holds WHERE id=hid;
 SELECT count(*) INTO expected_stock FROM jsonb_array_elements(hold.snapshot->'goods') g CROSS JOIN LATERAL jsonb_array_elements(g->'group'->'lines') l;
 expected_books:=jsonb_array_length(hold.snapshot->'bookings');
 expected_promos:=(CASE WHEN hold.snapshot->'promotion'->'vendorCoupon'='null'::jsonb THEN 0 ELSE 1 END)+(CASE WHEN hold.snapshot->'promotion'->'platformCampaign'='null'::jsonb THEN 0 ELSE 1 END);
 IF expected_stock+expected_books=0 OR (SELECT count(*) FROM mixed_hold_stock_lines WHERE hold_id=hid)<>expected_stock OR (SELECT count(*) FROM mixed_hold_booking_intents WHERE hold_id=hid)<>expected_books OR (SELECT count(*) FROM promotion_reservations WHERE hold_ref=hid)<>expected_promos THEN RAISE EXCEPTION 'Mixed hold requires all quote components'; END IF;
 IF EXISTS(
  SELECT 1 FROM mixed_hold_stock_lines s JOIN listings p ON p.id=s.listing_id JOIN locations l ON l.id=s.location_id JOIN vendors v ON v.id=s.vendor_id
  WHERE s.hold_id=hid AND (p.vendor_id<>s.vendor_id OR l.vendor_id<>s.vendor_id OR v.workspace_id<>s.vendor_workspace_id OR NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(hold.snapshot->'goods') g CROSS JOIN LATERAL jsonb_array_elements(g->'group'->'lines') line WHERE (g->>'componentId')::uuid=s.component_id AND (g->'group'->>'vendorId')::uuid=s.vendor_id AND (g->'group'->>'locationId')::uuid=s.location_id AND (line->>'listingId')::uuid=s.listing_id AND line->>'sku' IS NOT DISTINCT FROM s.sku AND (line->>'quantity')::int=s.quantity)
   OR (SELECT count(*) FROM inventory_movements m WHERE m.mixed_hold_id=hid AND m.listing_id=s.listing_id AND m.location_id=s.location_id AND m.sku IS NOT DISTINCT FROM s.sku AND reason='held' AND reserved_delta=s.quantity)<>1
   OR (SELECT count(*) FROM inventory_movements m WHERE m.mixed_hold_id=hid AND m.listing_id=s.listing_id AND m.location_id=s.location_id AND m.sku IS NOT DISTINCT FROM s.sku AND reason='released' AND reserved_delta=-s.quantity)<>(CASE WHEN hold.state='holding' THEN 0 ELSE 1 END))) THEN RAISE EXCEPTION 'Mixed stock reservations must match quote and immutable inventory'; END IF;
 IF EXISTS(SELECT 1 FROM inventory_movements m WHERE m.mixed_hold_id=hid AND NOT EXISTS(SELECT 1 FROM mixed_hold_stock_lines s WHERE s.hold_id=hid AND s.listing_id=m.listing_id AND s.location_id=m.location_id AND s.sku IS NOT DISTINCT FROM m.sku)) THEN RAISE EXCEPTION 'Unexpected mixed inventory movement'; END IF;
 IF EXISTS(
  SELECT 1 FROM mixed_hold_booking_intents b LEFT JOIN staff_allocations a ON a.mixed_intent_id=b.id LEFT JOIN staff_members staff ON staff.id=a.staff_id JOIN vendors v ON v.id=b.vendor_id
  WHERE b.hold_id=hid AND (a.id IS NULL OR staff.vendor_id<>b.vendor_id OR v.workspace_id<>b.vendor_workspace_id OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(hold.snapshot->'bookings') item WHERE (item->>'componentId')::uuid=b.component_id AND item=b.snapshot AND (item->'snapshot'->>'vendorId')::uuid=b.vendor_id AND (item->'snapshot'->>'listingId')::uuid=b.listing_id)
  OR a.expires_at IS DISTINCT FROM hold.expires_at OR a.start_at<>(b.snapshot->'snapshot'->>'start')::timestamptz-((b.snapshot->'snapshot'->>'bufferBeforeMinutes')::int*interval '1 minute') OR a.end_at<>(b.snapshot->'snapshot'->>'end')::timestamptz+((b.snapshot->'snapshot'->>'bufferAfterMinutes')::int*interval '1 minute') OR a.state<>(CASE WHEN hold.state='holding' THEN 'held' ELSE hold.state END)
  OR (b.snapshot->'snapshot'->>'selectedStaffId' IS NOT NULL AND a.staff_id<>(b.snapshot->'snapshot'->>'selectedStaffId')::uuid))) THEN RAISE EXCEPTION 'Mixed Staff allocation must match every quoted intent and common deadline'; END IF;
 IF EXISTS(SELECT 1 FROM promotion_reservations r WHERE r.hold_ref=hid AND (r.quote_id<>hold.quote_id OR r.workspace_id<>hold.workspace_id OR r.customer_id<>hold.customer_id OR r.expires_at<>hold.expires_at OR r.state<>(CASE WHEN hold.state='holding' THEN 'reserved' ELSE 'released' END))) THEN RAISE EXCEPTION 'Mixed promotion reservation must share scope, deadline and state'; END IF;
 RETURN NULL;
END; $$;
CREATE OR REPLACE FUNCTION check_goods_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; valid BOOLEAN;
BEGIN
 IF TG_TABLE_NAME='goods_order_cancellations' THEN target:=NEW.id; ELSIF TG_TABLE_NAME='goods_cancellation_lines' THEN target:=NEW.cancellation_id; ELSE SELECT cancellation_id INTO target FROM goods_cancellation_lines WHERE id=NEW.cancellation_line_id;END IF; IF EXISTS(SELECT 1 FROM goods_order_cancellations c JOIN goods_refund_operations r ON r.id=c.refund_id WHERE c.id=target AND r.mixed_payment_id IS NOT NULL) THEN RETURN NEW;END IF;
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
CREATE OR REPLACE FUNCTION check_goods_refund_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE valid BOOLEAN;
BEGIN
 IF TG_TABLE_NAME='goods_refund_operations' THEN IF NEW.mixed_payment_id IS NOT NULL THEN RETURN NEW;END IF;END IF;
 EXECUTE format('SELECT COALESCE(sum(r.amount_cents::bigint),0) <= pay.amount_cents
   AND EXISTS (SELECT 1 FROM %I.goods_local_payment_results result WHERE result.payment_id = pay.id AND result.outcome = ''succeeded'')
   FROM %I.goods_payment_attempts pay LEFT JOIN %I.goods_refund_operations r ON r.payment_id = pay.id
   WHERE pay.id = $1 GROUP BY pay.id,pay.amount_cents', TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA) INTO valid USING NEW.payment_id;
 IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Refund allocation exceeds verified captured payment' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION check_goods_payment_refund_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; valid BOOLEAN;
BEGIN
 IF TG_TABLE_NAME='goods_refund_operations' THEN IF NEW.mixed_payment_id IS NOT NULL THEN RETURN NEW;END IF;END IF;
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
ALTER TABLE mixed_checkout_holds DROP CONSTRAINT mixed_hold_state;
ALTER TABLE mixed_checkout_holds ADD CONSTRAINT mixed_hold_state CHECK(state IN ('holding','released','expired','committed') AND ((state IN ('holding','committed'))=(released_at IS NULL)));
ALTER TABLE goods_purchases ADD CONSTRAINT goods_purchase_payment_source CHECK((payment_id IS NULL)<>(mixed_purchase_id IS NULL));
ALTER TABLE bookings ADD CONSTRAINT booking_payment_source CHECK((payment_id IS NULL)<>(mixed_purchase_id IS NULL));
ALTER TABLE goods_refund_operations ADD CONSTRAINT goods_refund_source CHECK((payment_id IS NULL)<>(mixed_payment_id IS NULL));
ALTER TABLE booking_refunds ADD CONSTRAINT booking_refund_source CHECK((payment_id IS NULL)<>(mixed_payment_id IS NULL));
ALTER TABLE booking_refunds DROP CONSTRAINT booking_refund_amount;
ALTER TABLE booking_refunds ADD CONSTRAINT booking_refund_amount CHECK(amount_cents>0 OR (mixed_payment_id IS NOT NULL AND amount_cents=0));
ALTER TABLE staff_allocations DROP CONSTRAINT staff_allocation_one_owner;
ALTER TABLE staff_allocations ADD CONSTRAINT staff_allocation_one_owner CHECK(hold_id IS NULL OR mixed_intent_id IS NULL OR state IN ('booked','released','cancelled','expired'));
CREATE FUNCTION forbid_mixed_child_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (TG_TABLE_NAME='goods_payment_attempts' AND EXISTS(SELECT 1 FROM goods_holds WHERE id=NEW.hold_id AND mixed_hold_id IS NOT NULL)) OR (TG_TABLE_NAME='booking_payments' AND EXISTS(SELECT 1 FROM booking_holds WHERE id=NEW.hold_id AND mixed_intent_id IS NOT NULL)) THEN RAISE EXCEPTION 'Mixed checkout has one payment; projections cannot create another';END IF;RETURN NEW;
END; $$;
CREATE TRIGGER goods_no_mixed_payment BEFORE INSERT ON goods_payment_attempts FOR EACH ROW EXECUTE FUNCTION forbid_mixed_child_payment();
CREATE TRIGGER bookings_no_mixed_payment BEFORE INSERT ON booking_payments FOR EACH ROW EXECUTE FUNCTION forbid_mixed_child_payment();
CREATE FUNCTION preserve_mixed_commercial_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Mixed commercial history is immutable';END; $$;
CREATE TRIGGER mixed_purchase_immutable BEFORE UPDATE OR DELETE ON mixed_purchases FOR EACH ROW EXECUTE FUNCTION preserve_mixed_commercial_history();
CREATE TRIGGER mixed_allocation_immutable BEFORE UPDATE OR DELETE ON mixed_commerce_allocations FOR EACH ROW EXECUTE FUNCTION preserve_mixed_commercial_history();
CREATE TRIGGER mixed_invoice_immutable BEFORE UPDATE OR DELETE ON mixed_external_invoices FOR EACH ROW EXECUTE FUNCTION preserve_mixed_commercial_history();
CREATE TRIGGER mixed_purchase_no_truncate BEFORE TRUNCATE ON mixed_purchases FOR EACH STATEMENT EXECUTE FUNCTION preserve_mixed_commercial_history();
CREATE TRIGGER mixed_allocation_no_truncate BEFORE TRUNCATE ON mixed_commerce_allocations FOR EACH STATEMENT EXECUTE FUNCTION preserve_mixed_commercial_history();
CREATE TRIGGER mixed_invoice_no_truncate BEFORE TRUNCATE ON mixed_external_invoices FOR EACH STATEMENT EXECUTE FUNCTION preserve_mixed_commercial_history();
CREATE FUNCTION mixed_ledger_vector(tid UUID, book UUID, source UUID, event TEXT, component UUID, seller UUID, loc UUID, cash BIGINT, subsidy BIGINT, commission BIGINT, vendor BIGINT) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM ledger_transactions WHERE id=tid AND workspace_id=book AND source_id=source AND economic_event_id=event AND reversal_of IS NULL)
 AND NOT EXISTS(SELECT 1 FROM ledger_postings p WHERE p.transaction_id=tid AND (p.currency<>'ETB' OR p.component_id IS DISTINCT FROM component OR p.account NOT IN ('processor_clearing','platform_promotion_expense','platform_commission','vendor_payable') OR p.vendor_id IS DISTINCT FROM CASE WHEN p.account='vendor_payable' THEN seller END OR p.location_id IS DISTINCT FROM CASE WHEN p.account='vendor_payable' THEN loc END))
 AND (SELECT count(*) FROM ledger_postings WHERE transaction_id=tid)=((cash<>0)::int+(subsidy<>0)::int+(commission<>0)::int+(vendor<>0)::int)
 AND COALESCE((SELECT sum(minor_units) FROM ledger_postings WHERE transaction_id=tid AND account='processor_clearing'),0)=cash
 AND COALESCE((SELECT sum(minor_units) FROM ledger_postings WHERE transaction_id=tid AND account='platform_promotion_expense'),0)=subsidy
 AND COALESCE((SELECT sum(minor_units) FROM ledger_postings WHERE transaction_id=tid AND account='platform_commission'),0)=commission
 AND COALESCE((SELECT sum(minor_units) FROM ledger_postings WHERE transaction_id=tid AND account='vendor_payable'),0)=vendor
$$;
CREATE FUNCTION verify_mixed_purchase_id(target UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE p mixed_purchases;h mixed_checkout_holds;pay mixed_payment_attempts;
BEGIN
 SELECT * INTO p FROM mixed_purchases WHERE hold_id=target;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Committed mixed hold requires one Purchase';END IF;
 SELECT * INTO STRICT h FROM mixed_checkout_holds WHERE id=target;SELECT * INTO STRICT pay FROM mixed_payment_attempts WHERE id=p.payment_id;
 IF h.state<>'committed' OR pay.hold_id<>h.id OR pay.workspace_id<>h.workspace_id OR pay.customer_id<>h.customer_id OR p.workspace_id<>h.workspace_id OR p.customer_id<>h.customer_id OR p.snapshot IS DISTINCT FROM h.snapshot OR p.paid_at<>COALESCE(pay.captured_at,pay.created_at) OR p.paid_at>=h.expires_at OR pay.state NOT IN ('succeeded','no_payment_required') OR pay.amount_minor_units<>(h.snapshot->'total'->>'minorUnits')::bigint THEN RAISE EXCEPTION 'Purchase requires exact timely owned payment and original snapshot';END IF;
 IF (SELECT count(*) FROM mixed_commerce_allocations WHERE purchase_id=p.id AND kind IN ('goods','booking'))<>jsonb_array_length(h.snapshot->'promotion'->'allocations') OR EXISTS(SELECT 1 FROM jsonb_array_elements(h.snapshot->'promotion'->'allocations') e WHERE NOT EXISTS(SELECT 1 FROM mixed_commerce_allocations a WHERE a.purchase_id=p.id AND a.key=e->>'key' AND a.snapshot=e AND a.component_id=(e->>'componentId')::uuid AND a.vendor_id=(e->>'vendorId')::uuid AND a.kind=e->>'kind')) THEN RAISE EXCEPTION 'Purchase requires every original funding allocation';END IF;
 IF EXISTS(SELECT 1 FROM mixed_commerce_allocations a JOIN vendors v ON v.id=a.vendor_id LEFT JOIN locations l ON l.id=a.location_id WHERE a.purchase_id=p.id AND (v.workspace_id<>a.vendor_workspace_id OR (a.location_id IS NOT NULL AND l.vendor_id<>a.vendor_id))) THEN RAISE EXCEPTION 'Invalid component seller scope';END IF;
 IF (SELECT count(*) FROM goods_hold_lines gl JOIN goods_holds gh ON gh.id=gl.hold_id WHERE gh.mixed_hold_id=h.id)<>(SELECT count(*) FROM mixed_hold_stock_lines WHERE hold_id=h.id) OR EXISTS(SELECT 1 FROM mixed_hold_stock_lines s LEFT JOIN goods_hold_lines gl ON gl.mixed_stock_line_id=s.id LEFT JOIN goods_holds gh ON gh.id=gl.hold_id LEFT JOIN goods_order_lines ol ON ol.hold_line_id=gl.id LEFT JOIN goods_vendor_orders o ON o.id=ol.order_id LEFT JOIN goods_purchases gp ON gp.id=o.purchase_id WHERE s.hold_id=h.id AND (gl.id IS NULL OR gh.mixed_hold_id<>h.id OR gh.state<>'committed' OR gp.mixed_purchase_id<>p.id OR gp.payment_id IS NOT NULL OR gp.customer_id<>p.customer_id OR gp.workspace_id<>p.workspace_id OR gl.listing_id<>s.listing_id OR gl.location_id<>s.location_id OR gl.vendor_id<>s.vendor_id OR gl.vendor_workspace_id<>s.vendor_workspace_id OR gl.quantity<>s.quantity OR gl.sku IS DISTINCT FROM s.sku OR o.vendor_id<>s.vendor_id OR o.location_id<>s.location_id OR NOT EXISTS(SELECT 1 FROM mixed_commerce_allocations a WHERE a.goods_order_line_id=ol.id AND a.purchase_id=p.id AND a.component_id=s.component_id) OR (SELECT count(*) FROM inventory_movements m WHERE m.mixed_hold_id=h.id AND m.hold_id=gh.id AND m.order_line_id=ol.id AND m.reason='sold' AND m.listing_id=s.listing_id AND m.location_id=s.location_id AND m.sku IS NOT DISTINCT FROM s.sku AND m.on_hand_delta=-s.quantity AND m.reserved_delta=-s.quantity)<>1)) THEN RAISE EXCEPTION 'Purchase requires complete independent Orders and exactly sold stock';END IF;
 IF (SELECT count(*) FROM bookings WHERE mixed_purchase_id=p.id)<>jsonb_array_length(h.snapshot->'bookings') OR EXISTS(SELECT 1 FROM mixed_hold_booking_intents i LEFT JOIN booking_holds bh ON bh.mixed_intent_id=i.id LEFT JOIN bookings b ON b.hold_id=bh.id LEFT JOIN staff_allocations a ON a.id=b.allocation_id WHERE i.hold_id=h.id AND (b.id IS NULL OR b.mixed_purchase_id<>p.id OR b.payment_id IS NOT NULL OR bh.customer_id<>p.customer_id OR bh.workspace_id<>p.workspace_id OR bh.vendor_id<>i.vendor_id OR bh.state<>'committed' OR bh.expires_at<>h.expires_at OR bh.snapshot IS DISTINCT FROM i.snapshot->'snapshot' OR NOT (b.snapshot @> (i.snapshot->'snapshot')) OR b.snapshot->'policy' IS DISTINCT FROM i.snapshot->'policy' OR b.confirmed_at<>p.paid_at OR a.staff_id IS NULL OR NOT EXISTS(SELECT 1 FROM mixed_commerce_allocations f WHERE f.booking_id=b.id AND f.purchase_id=p.id AND f.component_id=i.component_id))) THEN RAISE EXCEPTION 'Purchase requires every independent Booking and concrete occupancy';END IF;
 IF (SELECT count(*) FROM goods_vendor_orders o JOIN goods_purchases gp ON gp.id=o.purchase_id WHERE gp.mixed_purchase_id=p.id)<>jsonb_array_length(h.snapshot->'goods') OR EXISTS(SELECT 1 FROM goods_purchases gp JOIN goods_holds gh ON gh.id=gp.hold_id WHERE gp.mixed_purchase_id=p.id AND (gh.expires_at<>h.expires_at OR gp.snapshot->'groups' IS DISTINCT FROM (SELECT COALESCE(jsonb_agg(g->'group'),'[]'::jsonb) FROM jsonb_array_elements(h.snapshot->'goods') g))) THEN RAISE EXCEPTION 'Goods scope must preserve complete original groups and common deadline';END IF;
 IF (SELECT count(*) FROM mixed_commerce_allocations WHERE purchase_id=p.id AND kind='delivery')<>(SELECT count(*) FROM jsonb_array_elements(h.snapshot->'goods') g WHERE (g->'group'->>'deliveryFeeCents')::bigint>0) OR EXISTS(SELECT 1 FROM mixed_commerce_allocations a WHERE a.purchase_id=p.id AND a.kind='delivery' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(h.snapshot->'goods') g WHERE a.key='delivery:'||(g->>'componentId') AND a.component_id=(g->>'componentId')::uuid AND a.vendor_id=(g->'group'->>'vendorId')::uuid AND a.location_id=(g->'group'->>'locationId')::uuid AND a.snapshot=jsonb_build_object('quantity',1,'customer',(g->'group'->>'deliveryFeeCents')::bigint,'subsidy',0,'commission',0,'vendor',(g->'group'->>'deliveryFeeCents')::bigint))) THEN RAISE EXCEPTION 'Delivery funding must preserve original fee';END IF;
 IF EXISTS(SELECT 1 FROM promotion_reservations WHERE hold_ref=h.id AND state<>'consumed') THEN RAISE EXCEPTION 'Committed funding must be consumed once';END IF;
 IF pay.amount_minor_units>0 AND NOT EXISTS(SELECT 1 FROM ledger_transactions WHERE workspace_id=p.workspace_id AND source_id=p.id AND economic_event_id='mixed-purchase:'||p.id::text AND reversal_of IS NULL AND (SELECT count(*) FROM ledger_postings WHERE transaction_id=ledger_transactions.id)=2 AND EXISTS(SELECT 1 FROM ledger_postings WHERE transaction_id=ledger_transactions.id AND account='customer_refund_liability' AND minor_units=pay.amount_minor_units AND currency='ETB' AND component_id IS NULL AND vendor_id IS NULL AND location_id IS NULL) AND EXISTS(SELECT 1 FROM ledger_postings WHERE transaction_id=ledger_transactions.id AND account='processor_clearing' AND minor_units=-pay.amount_minor_units AND currency='ETB' AND component_id IS NULL AND vendor_id IS NULL AND location_id IS NULL)) THEN RAISE EXCEPTION 'Purchase must clear original capture liability';END IF;
 IF EXISTS(SELECT 1 FROM mixed_commerce_allocations a WHERE a.purchase_id=p.id AND ((a.kind<>'delivery' AND (a.snapshot->>'customerMinorUnits')::bigint+(a.snapshot->>'platformSubsidyMinorUnits')::bigint>0) OR (a.kind='delivery' AND (a.snapshot->>'customer')::bigint>0)) AND NOT EXISTS(SELECT 1 FROM ledger_transactions t WHERE t.workspace_id=a.vendor_workspace_id AND t.source_id=a.id AND t.economic_event_id='mixed-sale:'||a.id::text AND mixed_ledger_vector(t.id,a.vendor_workspace_id,a.id,'mixed-sale:'||a.id::text,a.id,a.vendor_id,a.location_id,COALESCE((a.snapshot->>'customerMinorUnits')::bigint,(a.snapshot->>'customer')::bigint),COALESCE((a.snapshot->>'platformSubsidyMinorUnits')::bigint,0),-COALESCE((a.snapshot->>'commissionMinorUnits')::bigint,0),-COALESCE((a.snapshot->>'vendorEarningMinorUnits')::bigint,(a.snapshot->>'vendor')::bigint)))) THEN RAISE EXCEPTION 'Each funded component requires scoped sale postings';END IF;
END; $$;
CREATE FUNCTION verify_mixed_purchase() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID;
BEGIN
 IF TG_TABLE_NAME='mixed_purchases' THEN target:=NEW.hold_id;ELSIF TG_TABLE_NAME='mixed_checkout_holds' THEN IF NEW.state<>'committed' THEN RETURN NULL;END IF;target:=NEW.id; ELSE SELECT hold_id INTO target FROM mixed_purchases WHERE id=NEW.purchase_id;END IF;
 PERFORM verify_mixed_purchase_id(target);RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER mixed_purchase_complete AFTER INSERT ON mixed_purchases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_mixed_purchase();
CREATE CONSTRAINT TRIGGER mixed_purchase_hold_complete AFTER UPDATE ON mixed_checkout_holds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_mixed_purchase();
CREATE CONSTRAINT TRIGGER mixed_purchase_allocation_complete AFTER INSERT ON mixed_commerce_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_mixed_purchase();

ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_reason_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_reason_check CHECK (
 (mixed_hold_id IS NULL AND (
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
 )) OR (mixed_hold_id IS NOT NULL AND hold_id IS NULL AND transfer_id IS NULL AND order_line_id IS NULL AND cancellation_line_id IS NULL AND on_hand_delta=0 AND ((reason='held' AND reserved_delta>0) OR (reason='released' AND reserved_delta<0)))
 OR (mixed_hold_id IS NOT NULL AND hold_id IS NOT NULL AND order_line_id IS NOT NULL AND cancellation_line_id IS NULL AND transfer_id IS NULL AND reason='sold' AND on_hand_delta<0 AND reserved_delta=on_hand_delta)
);
ALTER TABLE goods_refund_operations DROP CONSTRAINT goods_refund_amount_check;
ALTER TABLE goods_refund_operations ADD CONSTRAINT goods_refund_amount_check CHECK(amount_cents>0 OR (mixed_payment_id IS NOT NULL AND amount_cents=0));
CREATE FUNCTION mixed_original_amount(snapshot JSONB, field TEXT, unit_offset INT, units INT) RETURNS BIGINT LANGUAGE sql IMMUTABLE AS $$
 SELECT COALESCE(sum(greatest(0,least(unit_offset+units,prior+(segment->>'quantity')::int)-greatest(unit_offset,prior))*(segment->>field)::bigint),0)::bigint
 FROM (SELECT e.value AS segment,COALESCE(sum((e.value->>'quantity')::int) OVER(ORDER BY e.ordinality ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0)::int AS prior FROM jsonb_array_elements(snapshot->'unitSegments') WITH ORDINALITY e) parts
$$;
CREATE FUNCTION verify_mixed_refund_funding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f mixed_refund_funding;a mixed_commerce_allocations;root mixed_purchases;cash BIGINT;subsidy BIGINT;commission BIGINT;vendor BIGINT;actual_state TEXT;money INT;payment UUID;extra mixed_additional_captures;
BEGIN
 SELECT * INTO STRICT f FROM mixed_refund_funding WHERE id=NEW.id;SELECT * INTO STRICT a FROM mixed_commerce_allocations WHERE id=f.allocation_id;SELECT * INTO STRICT root FROM mixed_purchases WHERE id=a.purchase_id;
 IF f.quantity<0 OR f.offset<0 OR f.denominator<=0 OR f.numerator<0 OR f.numerator>f.denominator OR (f.goods_refund_id IS NULL)=(f.booking_refund_id IS NULL) THEN RAISE EXCEPTION 'Invalid original refund identity or fraction';END IF;
 IF a.kind='goods' AND (f.quantity<=0 OR f.numerator<>f.denominator OR f.additional_capture_id IS NOT NULL OR EXISTS(SELECT 1 FROM mixed_refund_funding r WHERE r.allocation_id=a.id AND r.id<>f.id AND int8range(r.offset,r.offset+r.quantity,'[)') && int8range(f.offset,f.offset+f.quantity,'[)'))) THEN RAISE EXCEPTION 'Goods refunds require disjoint original units';END IF;
 IF a.kind='delivery' THEN cash:=(a.snapshot->>'customer')::bigint;subsidy:=0;commission:=0;vendor:=cash;IF f.quantity<>1 OR f.offset<>0 OR f.numerator<>f.denominator THEN RAISE EXCEPTION 'Delivery refunds use the complete original fee';END IF;
 ELSE
  IF f.additional_capture_id IS NOT NULL THEN SELECT * INTO STRICT extra FROM mixed_additional_captures WHERE id=f.additional_capture_id;IF extra.allocation_id<>a.id THEN RAISE EXCEPTION 'Extra refund must remain on original component';END IF;cash:=extra.customer_minor_units;subsidy:=0;commission:=extra.commission_minor_units;vendor:=extra.vendor_minor_units;
  ELSE
  IF f.offset+f.quantity>(a.snapshot->>'quantity')::int THEN RAISE EXCEPTION 'Refund quantity exceeds original';END IF;
  cash:=mixed_original_amount(a.snapshot,'customerUnitMinorUnits',f.offset,f.quantity);
  subsidy:=mixed_original_amount(a.snapshot,'platformSubsidyUnitMinorUnits',f.offset,f.quantity);
  commission:=mixed_original_amount(a.snapshot,'commissionUnitMinorUnits',f.offset,f.quantity);vendor:=cash+subsidy-commission;END IF;
 IF a.kind='booking' THEN SELECT cash-COALESCE(sum(customer_minor_units),0),subsidy-COALESCE(sum(subsidy_minor_units),0),commission-COALESCE(sum(commission_minor_units),0),vendor-COALESCE(sum(vendor_minor_units),0) INTO cash,subsidy,commission,vendor FROM mixed_refund_funding WHERE allocation_id=a.id AND additional_capture_id IS NOT DISTINCT FROM f.additional_capture_id AND id<f.id;END IF;
 cash:=cash*f.numerator/f.denominator;subsidy:=subsidy*f.numerator/f.denominator;commission:=least(commission*f.numerator/f.denominator,cash+subsidy);vendor:=cash+subsidy-commission;
 END IF;
 IF f.customer_minor_units<>cash OR f.subsidy_minor_units<>subsidy OR f.commission_minor_units<>commission OR f.vendor_minor_units<>vendor THEN RAISE EXCEPTION 'Refund must use exact conserved original funding';END IF;
 IF f.goods_refund_id IS NOT NULL THEN SELECT state,amount_cents,mixed_payment_id INTO actual_state,money,payment FROM goods_refund_operations WHERE id=f.goods_refund_id;
  IF a.kind='goods' AND NOT EXISTS(SELECT 1 FROM goods_order_cancellations c JOIN goods_cancellation_lines l ON l.cancellation_id=c.id WHERE c.refund_id=f.goods_refund_id AND l.order_line_id=a.goods_order_line_id AND l.quantity=f.quantity AND l.refund_cents=f.customer_minor_units) THEN RAISE EXCEPTION 'Goods refund must match affected purchased quantities';END IF;
  IF a.kind='delivery' AND NOT EXISTS(SELECT 1 FROM goods_order_cancellations c JOIN goods_vendor_orders o ON o.id=c.order_id WHERE c.refund_id=f.goods_refund_id AND c.delivery_refund_cents=f.customer_minor_units AND o.vendor_id=a.vendor_id AND o.location_id=a.location_id AND c.delivery_refund_cents>0) THEN RAISE EXCEPTION 'Delivery refund requires affected complete original goods group';END IF;
 ELSE SELECT state,amount_cents,mixed_payment_id INTO actual_state,money,payment FROM booking_refunds WHERE id=f.booking_refund_id;IF a.booking_id IS NULL OR (NOT EXISTS(SELECT 1 FROM booking_cancellations WHERE booking_id=a.booking_id AND refund_cents=(SELECT sum(customer_minor_units) FROM mixed_refund_funding WHERE booking_refund_id=f.booking_refund_id)) AND NOT EXISTS(SELECT 1 FROM booking_refunds r JOIN booking_amendments m ON r.semantic_key='amendment:'||m.id::text WHERE r.id=f.booking_refund_id AND m.booking_id=a.booking_id AND m.delta_cents<0)) THEN RAISE EXCEPTION 'Booking refund must match independent cancellation';END IF;END IF;
 IF EXISTS(SELECT 1 FROM mixed_refund_funding r WHERE r.allocation_id=a.id AND r.additional_capture_id IS NOT DISTINCT FROM f.additional_capture_id GROUP BY r.allocation_id HAVING sum(r.customer_minor_units)>CASE WHEN f.additional_capture_id IS NOT NULL THEN extra.customer_minor_units WHEN a.kind='delivery' THEN (a.snapshot->>'customer')::bigint ELSE (a.snapshot->>'customerMinorUnits')::bigint END OR sum(r.subsidy_minor_units)>CASE WHEN f.additional_capture_id IS NOT NULL OR a.kind='delivery' THEN 0 ELSE (a.snapshot->>'platformSubsidyMinorUnits')::bigint END) THEN RAISE EXCEPTION 'Refund exceeds its original capture source';END IF;
 IF payment IS DISTINCT FROM root.payment_id THEN RAISE EXCEPTION 'Refund cannot cross Purchase payment';END IF;
 IF (f.ledger_id IS NOT NULL OR f.provider_reference IS NOT NULL OR actual_state IN ('completed','succeeded')) AND cash+subsidy>0 AND (f.provider_reference IS NULL OR f.ledger_id IS NULL OR NOT mixed_ledger_vector(f.ledger_id,a.vendor_workspace_id,f.id,'mixed-component-refund:'||f.id::text,a.id,a.vendor_id,a.location_id,-cash,-subsidy,commission,vendor)) THEN RAISE EXCEPTION 'Completed refund requires scoped compensating postings';END IF;RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER mixed_refund_funding_checked AFTER INSERT OR UPDATE ON mixed_refund_funding DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_mixed_refund_funding();
CREATE FUNCTION preserve_mixed_refund_funding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR NEW.id<>OLD.id OR NEW.allocation_id<>OLD.allocation_id OR NEW.goods_refund_id IS DISTINCT FROM OLD.goods_refund_id OR NEW.booking_refund_id IS DISTINCT FROM OLD.booking_refund_id OR NEW.quantity<>OLD.quantity OR NEW.offset<>OLD.offset OR NEW.numerator<>OLD.numerator OR NEW.denominator<>OLD.denominator OR NEW.customer_minor_units<>OLD.customer_minor_units OR NEW.subsidy_minor_units<>OLD.subsidy_minor_units OR NEW.commission_minor_units<>OLD.commission_minor_units OR NEW.vendor_minor_units<>OLD.vendor_minor_units OR NEW.created_at<>OLD.created_at OR NEW.additional_capture_id IS DISTINCT FROM OLD.additional_capture_id OR (OLD.provider_reference IS NOT NULL AND NEW.provider_reference IS DISTINCT FROM OLD.provider_reference) OR (OLD.ledger_id IS NOT NULL AND NEW.ledger_id IS DISTINCT FROM OLD.ledger_id) THEN RAISE EXCEPTION 'Original refund funding is immutable';END IF;RETURN NEW;
END; $$;
CREATE TRIGGER mixed_refund_funding_immutable BEFORE UPDATE OR DELETE ON mixed_refund_funding FOR EACH ROW EXECUTE FUNCTION preserve_mixed_refund_funding();
CREATE FUNCTION verify_mixed_refund_operation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cash BIGINT;target UUID;amount INT;total BIGINT;limit_amount BIGINT;
BEGIN
 IF NEW.mixed_payment_id IS NULL THEN RETURN NULL;END IF;target:=NEW.mixed_payment_id;amount:=NEW.amount_cents;
 SELECT amount_minor_units INTO limit_amount FROM mixed_payment_attempts WHERE id=target;
 SELECT COALESCE((SELECT sum(amount_cents) FROM goods_refund_operations WHERE mixed_payment_id=target),0)+COALESCE((SELECT sum(amount_cents) FROM booking_refunds WHERE mixed_payment_id=target),0) INTO total;
 SELECT limit_amount+COALESCE(sum(customer_minor_units),0) INTO limit_amount FROM mixed_additional_captures c JOIN mixed_commerce_allocations a ON a.id=c.allocation_id JOIN mixed_purchases p ON p.id=a.purchase_id WHERE p.payment_id=target;
 IF total>limit_amount THEN RAISE EXCEPTION 'Component refunds exceed captured principal';END IF;
 IF TG_TABLE_NAME='goods_refund_operations' THEN SELECT sum(customer_minor_units) INTO cash FROM mixed_refund_funding WHERE goods_refund_id=NEW.id;ELSE SELECT sum(customer_minor_units) INTO cash FROM mixed_refund_funding WHERE booking_refund_id=NEW.id;END IF;
 IF NEW.state='succeeded' AND EXISTS(SELECT 1 FROM mixed_refund_funding f WHERE ((TG_TABLE_NAME='goods_refund_operations' AND f.goods_refund_id=NEW.id) OR (TG_TABLE_NAME='booking_refunds' AND f.booking_refund_id=NEW.id)) AND (f.provider_reference IS NULL OR (f.customer_minor_units+f.subsidy_minor_units>0 AND f.ledger_id IS NULL))) THEN RAISE EXCEPTION 'Refund completion requires every acknowledged funding part';END IF;
 IF cash IS DISTINCT FROM amount::bigint THEN RAISE EXCEPTION 'Refund amount requires original scoped funding';END IF;RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER mixed_goods_refund_checked AFTER INSERT OR UPDATE ON goods_refund_operations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_mixed_refund_operation();
CREATE CONSTRAINT TRIGGER mixed_booking_refund_checked AFTER INSERT OR UPDATE ON booking_refunds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_mixed_refund_operation();

CREATE OR REPLACE FUNCTION guard_goods_order_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE valid BOOLEAN;
BEGIN
 IF TG_TABLE_NAME = 'goods_vendor_orders' THEN
   EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.goods_purchases p JOIN %I.goods_holds h ON h.id = p.hold_id
     JOIN %I.vendors v ON v.id = $2, jsonb_array_elements(p.snapshot->''groups'') g
     WHERE p.id = $1 AND (h.state = ''awaiting_payment'' OR (h.mixed_hold_id IS NOT NULL AND h.state = ''holding'')) AND v.workspace_id = $3
       AND (g->>''vendorId'')::uuid = $2 AND (g->>''locationId'')::uuid = $4 AND g = $5)',
       TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA)
     INTO valid USING NEW.purchase_id,NEW.vendor_id,NEW.vendor_workspace_id,NEW.location_id,NEW.snapshot;
 ELSE
   EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.goods_vendor_orders o JOIN %I.goods_purchases p ON p.id = o.purchase_id
     JOIN %I.goods_holds h ON h.id = p.hold_id JOIN %I.goods_hold_lines l ON l.hold_id = h.id,
     jsonb_array_elements(o.snapshot->''lines'') q
     WHERE o.id = $1 AND l.id = $2 AND (h.state = ''awaiting_payment'' OR (h.mixed_hold_id IS NOT NULL AND h.state = ''holding'')) AND l.vendor_id = o.vendor_id
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
CREATE FUNCTION guard_mixed_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NOT EXISTS(SELECT 1 FROM mixed_commerce_allocations WHERE purchase_id=NEW.purchase_id AND vendor_id=NEW.vendor_id) OR NOT EXISTS(SELECT 1 FROM vendor_memberships WHERE vendor_id=NEW.vendor_id AND user_id=NEW.actor_id AND role='vendor_owner' AND revoked_at IS NULL) OR NEW.document_url!~'^https://' OR NEW.invoice_number='' THEN RAISE EXCEPTION 'External invoice requires its actual seller and an HTTPS reference';END IF;RETURN NEW;END; $$;
CREATE TRIGGER mixed_invoice_scope BEFORE INSERT ON mixed_external_invoices FOR EACH ROW EXECUTE FUNCTION guard_mixed_invoice();
ALTER TABLE mixed_additional_captures ADD CONSTRAINT mixed_additional_balance CHECK(customer_minor_units>0 AND commission_minor_units>=0 AND vendor_minor_units>=0 AND customer_minor_units=commission_minor_units+vendor_minor_units);
CREATE TRIGGER mixed_additional_immutable BEFORE UPDATE OR DELETE ON mixed_additional_captures FOR EACH ROW EXECUTE FUNCTION preserve_mixed_commercial_history();
CREATE TRIGGER mixed_additional_no_truncate BEFORE TRUNCATE ON mixed_additional_captures FOR EACH STATEMENT EXECUTE FUNCTION preserve_mixed_commercial_history();

CREATE TRIGGER mixed_refund_no_truncate BEFORE TRUNCATE ON mixed_refund_funding FOR EACH STATEMENT EXECUTE FUNCTION preserve_mixed_commercial_history();
CREATE FUNCTION verify_mixed_additional_capture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a mixed_commerce_allocations;p mixed_purchases;rate INT;
BEGIN
 SELECT * INTO STRICT a FROM mixed_commerce_allocations WHERE id=NEW.allocation_id;SELECT * INTO STRICT p FROM mixed_purchases WHERE id=a.purchase_id;
 SELECT (r->>'basisPoints')::int INTO STRICT rate FROM jsonb_array_elements(p.snapshot->'commission'->'rates') r WHERE r->>'affectedVendorId'=a.vendor_id::text;
 IF NEW.source_kind<>'booking_amendment' OR NOT EXISTS(SELECT 1 FROM booking_amendments WHERE id=NEW.source_id AND booking_id=a.booking_id AND delta_cents=NEW.customer_minor_units AND payment_reference=NEW.provider_reference) OR NEW.commission_minor_units<>(NEW.customer_minor_units::bigint*rate+5000)/10000 OR NOT mixed_ledger_vector(NEW.ledger_id,a.vendor_workspace_id,NEW.id,'mixed-additional-capture:'||NEW.id::text,a.id,a.vendor_id,a.location_id,NEW.customer_minor_units,0,-NEW.commission_minor_units,-NEW.vendor_minor_units) THEN RAISE EXCEPTION 'Additional capture requires accepted component amendment and exact original-rate postings';END IF;RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER mixed_additional_checked AFTER INSERT ON mixed_additional_captures DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_mixed_additional_capture();

CREATE FUNCTION seal_mixed_materialization() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID;
BEGIN
 IF TG_TABLE_NAME='goods_holds' THEN target:=NEW.mixed_hold_id;
 ELSIF TG_TABLE_NAME='booking_holds' THEN SELECT hold_id INTO target FROM mixed_hold_booking_intents WHERE id=NEW.mixed_intent_id;
 ELSE SELECT hold_id INTO target FROM mixed_purchases WHERE id=NEW.purchase_id;END IF;
 IF EXISTS(SELECT 1 FROM mixed_checkout_holds WHERE id=target AND state='committed') THEN RAISE EXCEPTION 'Committed Purchase components cannot be appended';END IF;RETURN NEW;
END; $$;
CREATE TRIGGER mixed_goods_projection_sealed BEFORE INSERT ON goods_holds FOR EACH ROW EXECUTE FUNCTION seal_mixed_materialization();
CREATE TRIGGER mixed_booking_projection_sealed BEFORE INSERT ON booking_holds FOR EACH ROW EXECUTE FUNCTION seal_mixed_materialization();
CREATE TRIGGER mixed_allocation_sealed BEFORE INSERT ON mixed_commerce_allocations FOR EACH ROW EXECUTE FUNCTION seal_mixed_materialization();

ALTER TABLE mixed_refund_funding ADD CONSTRAINT mixed_refund_vector_check CHECK(customer_minor_units>=0 AND subsidy_minor_units>=0 AND commission_minor_units>=0 AND vendor_minor_units>=0 AND customer_minor_units+subsidy_minor_units=commission_minor_units+vendor_minor_units);
