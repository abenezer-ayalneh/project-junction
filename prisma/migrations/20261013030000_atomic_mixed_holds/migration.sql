CREATE TABLE mixed_checkout_holds (
 id UUID NOT NULL DEFAULT uuidv7(),quote_id UUID NOT NULL,cart_id UUID NOT NULL,customer_id UUID NOT NULL,workspace_id UUID NOT NULL,
 state TEXT NOT NULL DEFAULT 'holding',snapshot JSONB NOT NULL,created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at TIMESTAMPTZ(6) NOT NULL,released_at TIMESTAMPTZ(6),
 CONSTRAINT mixed_checkout_holds_pkey PRIMARY KEY(id),
 CONSTRAINT mixed_checkout_holds_quote_id_fkey FOREIGN KEY(quote_id) REFERENCES mixed_checkout_quotes(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
 CONSTRAINT mixed_checkout_holds_cart_id_fkey FOREIGN KEY(cart_id) REFERENCES mixed_carts(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
 CONSTRAINT mixed_hold_state CHECK(state IN ('holding','released','expired') AND ((state='holding')=(released_at IS NULL))),
 CONSTRAINT mixed_hold_deadline CHECK(expires_at=created_at+interval '15 minutes')
);
CREATE UNIQUE INDEX mixed_checkout_holds_quote_id_key ON mixed_checkout_holds(quote_id);
CREATE UNIQUE INDEX mixed_checkout_active_cart_key ON mixed_checkout_holds(cart_id) WHERE state='holding';
CREATE INDEX mixed_checkout_holds_state_expires_at_idx ON mixed_checkout_holds(state,expires_at);
CREATE TABLE mixed_hold_stock_lines (
 id UUID NOT NULL DEFAULT uuidv7(),hold_id UUID NOT NULL,component_id UUID NOT NULL,vendor_id UUID NOT NULL,vendor_workspace_id UUID NOT NULL,listing_id UUID NOT NULL,location_id UUID NOT NULL,sku TEXT,quantity INTEGER NOT NULL,
 CONSTRAINT mixed_hold_stock_lines_pkey PRIMARY KEY(id),
 CONSTRAINT mixed_hold_stock_lines_hold_id_fkey FOREIGN KEY(hold_id) REFERENCES mixed_checkout_holds(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
 CONSTRAINT mixed_stock_quantity CHECK(quantity>0)
);
CREATE UNIQUE INDEX mixed_hold_stock_item_key ON mixed_hold_stock_lines(hold_id,listing_id,location_id,sku) NULLS NOT DISTINCT;
CREATE TABLE mixed_hold_booking_intents (
 id UUID NOT NULL DEFAULT uuidv7(),hold_id UUID NOT NULL,component_id UUID NOT NULL,vendor_id UUID NOT NULL,vendor_workspace_id UUID NOT NULL,listing_id UUID NOT NULL,snapshot JSONB NOT NULL,
 CONSTRAINT mixed_hold_booking_intents_pkey PRIMARY KEY(id),
 CONSTRAINT mixed_hold_booking_intents_hold_id_fkey FOREIGN KEY(hold_id) REFERENCES mixed_checkout_holds(id) ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX mixed_hold_booking_intents_hold_id_component_id_key ON mixed_hold_booking_intents(hold_id,component_id);
ALTER TABLE inventory_movements ADD COLUMN mixed_hold_id UUID;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_mixed_hold_id_fkey FOREIGN KEY(mixed_hold_id) REFERENCES mixed_checkout_holds(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE staff_allocations ADD COLUMN mixed_intent_id UUID;
ALTER TABLE staff_allocations ADD CONSTRAINT staff_allocations_mixed_intent_id_fkey FOREIGN KEY(mixed_intent_id) REFERENCES mixed_hold_booking_intents(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE UNIQUE INDEX staff_allocations_mixed_intent_id_key ON staff_allocations(mixed_intent_id);
ALTER TABLE staff_allocations ADD CONSTRAINT staff_allocation_one_owner CHECK(hold_id IS NULL OR mixed_intent_id IS NULL);
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
);

CREATE UNIQUE INDEX inventory_mixed_hold_item_reason_key ON inventory_movements(mixed_hold_id,listing_id,location_id,sku,reason) NULLS NOT DISTINCT WHERE mixed_hold_id IS NOT NULL;
CREATE FUNCTION guard_mixed_hold() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE quote mixed_checkout_quotes;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Mixed hold history is immutable'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'holding' THEN RAISE EXCEPTION 'Mixed hold must start holding'; END IF;
  SELECT * INTO STRICT quote FROM mixed_checkout_quotes WHERE id=NEW.quote_id;
  IF quote.cart_id<>NEW.cart_id OR quote.customer_id<>NEW.customer_id OR quote.workspace_id<>NEW.workspace_id OR quote.snapshot IS DISTINCT FROM NEW.snapshot OR quote.expires_at<=NEW.created_at OR jsonb_array_length(quote.snapshot->'conflicts')<>0 OR quote.snapshot->'total'='null'::jsonb OR quote.snapshot->'promotion'='null'::jsonb OR quote.snapshot->'commission'='null'::jsonb OR NOT EXISTS(SELECT 1 FROM mixed_carts WHERE id=NEW.cart_id AND version=quote.cart_version) THEN RAISE EXCEPTION 'Mixed hold requires an owned current complete quote'; END IF;
 ELSIF OLD.state<>'holding' OR NEW.state NOT IN ('released','expired') OR NEW.id<>OLD.id OR NEW.quote_id<>OLD.quote_id OR NEW.cart_id<>OLD.cart_id OR NEW.customer_id<>OLD.customer_id OR NEW.workspace_id<>OLD.workspace_id OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.created_at<>OLD.created_at OR NEW.expires_at<>OLD.expires_at THEN RAISE EXCEPTION 'Mixed hold only permits an immutable terminal transition';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.released_at<NEW.created_at OR (NEW.state='expired' AND NEW.released_at<NEW.expires_at)) THEN RAISE EXCEPTION 'Mixed hold terminal time must match its deadline'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mixed_hold_guard BEFORE INSERT OR UPDATE OR DELETE ON mixed_checkout_holds FOR EACH ROW EXECUTE FUNCTION guard_mixed_hold();
CREATE FUNCTION protect_mixed_cart_checkout() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM mixed_checkout_holds WHERE cart_id=OLD.id AND state='holding') THEN RAISE EXCEPTION 'Release the active mixed hold before editing Cart'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mixed_cart_checkout_lock BEFORE UPDATE ON mixed_carts FOR EACH ROW EXECUTE FUNCTION protect_mixed_cart_checkout();
CREATE FUNCTION preserve_mixed_hold_component() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Mixed hold components are immutable'; END; $$;
CREATE TRIGGER mixed_stock_immutable BEFORE UPDATE OR DELETE ON mixed_hold_stock_lines FOR EACH ROW EXECUTE FUNCTION preserve_mixed_hold_component();
CREATE TRIGGER mixed_intent_immutable BEFORE UPDATE OR DELETE ON mixed_hold_booking_intents FOR EACH ROW EXECUTE FUNCTION preserve_mixed_hold_component();
CREATE FUNCTION guard_mixed_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.mixed_intent_id IS NULL THEN
  IF TG_OP='UPDATE' AND NEW.mixed_intent_id IS NOT NULL THEN RAISE EXCEPTION 'Allocation cannot be attached after creation'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' OR OLD.state<>'held' OR NEW.state NOT IN ('released','expired') OR NEW.id<>OLD.id OR NEW.mixed_intent_id IS DISTINCT FROM OLD.mixed_intent_id OR NEW.hold_id IS DISTINCT FROM OLD.hold_id OR NEW.staff_id<>OLD.staff_id OR NEW.start_at<>OLD.start_at OR NEW.end_at<>OLD.end_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Mixed Staff allocation is immutable except terminal state'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mixed_staff_guard BEFORE UPDATE OR DELETE ON staff_allocations FOR EACH ROW EXECUTE FUNCTION guard_mixed_allocation();
CREATE FUNCTION verify_mixed_hold_components() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE hid UUID; hold mixed_checkout_holds; expected_stock INTEGER; expected_books INTEGER; expected_promos INTEGER;
BEGIN
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
CREATE CONSTRAINT TRIGGER mixed_hold_complete AFTER INSERT OR UPDATE ON mixed_checkout_holds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_mixed_hold_components();
CREATE CONSTRAINT TRIGGER mixed_stock_complete AFTER INSERT ON mixed_hold_stock_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_mixed_hold_components();
CREATE CONSTRAINT TRIGGER mixed_intent_complete AFTER INSERT ON mixed_hold_booking_intents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_mixed_hold_components();
CREATE CONSTRAINT TRIGGER mixed_inventory_complete AFTER INSERT ON inventory_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_mixed_hold_components();
CREATE CONSTRAINT TRIGGER mixed_allocation_complete AFTER INSERT OR UPDATE ON staff_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_mixed_hold_components();
CREATE CONSTRAINT TRIGGER mixed_promotion_complete AFTER INSERT OR UPDATE ON promotion_reservations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_mixed_hold_components();
CREATE TRIGGER mixed_hold_no_truncate BEFORE TRUNCATE ON mixed_checkout_holds FOR EACH STATEMENT EXECUTE FUNCTION preserve_mixed_hold_component();
CREATE TRIGGER mixed_stock_no_truncate BEFORE TRUNCATE ON mixed_hold_stock_lines FOR EACH STATEMENT EXECUTE FUNCTION preserve_mixed_hold_component();
CREATE TRIGGER mixed_intent_no_truncate BEFORE TRUNCATE ON mixed_hold_booking_intents FOR EACH STATEMENT EXECUTE FUNCTION preserve_mixed_hold_component();
