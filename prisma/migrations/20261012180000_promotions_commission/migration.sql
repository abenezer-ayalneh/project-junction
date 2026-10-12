CREATE TABLE platform_finance_grants (
 id UUID NOT NULL DEFAULT uuidv7(), user_id UUID NOT NULL, workspace_id UUID NOT NULL, expires_at TIMESTAMPTZ(6) NOT NULL,
 revoked_at TIMESTAMPTZ(6), granted_by TEXT NOT NULL, reason TEXT NOT NULL, created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT platform_finance_grants_pkey PRIMARY KEY(id)
);
CREATE UNIQUE INDEX platform_finance_grants_user_id_workspace_id_key ON platform_finance_grants(user_id,workspace_id);
CREATE TABLE commission_rates (
 id UUID NOT NULL DEFAULT uuidv7(),workspace_id UUID NOT NULL,actor_id UUID NOT NULL,scope_key TEXT NOT NULL,vendor_id UUID,
 basis_points INTEGER NOT NULL,effective_from TIMESTAMPTZ(6) NOT NULL,effective_until TIMESTAMPTZ(6),reason TEXT NOT NULL,created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT commission_rates_pkey PRIMARY KEY(id),
 CONSTRAINT commission_rate_scope CHECK(scope_key=coalesce(vendor_id::text,'global')),
 CONSTRAINT commission_rate_value CHECK(basis_points BETWEEN 0 AND 10000),
 CONSTRAINT commission_rate_window CHECK(effective_until IS NULL OR effective_until>effective_from)
);
CREATE UNIQUE INDEX commission_rates_scope_key_effective_from_key ON commission_rates(scope_key,effective_from);
CREATE TABLE promotion_definitions (
 id UUID NOT NULL DEFAULT uuidv7(),workspace_id UUID NOT NULL,actor_id UUID NOT NULL,kind TEXT NOT NULL,vendor_id UUID,scope_key TEXT NOT NULL,code TEXT NOT NULL,
 definition JSONB NOT NULL,vendor_ids UUID[] NOT NULL,budget_minor_units BIGINT,reason TEXT NOT NULL,created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT promotion_definitions_pkey PRIMARY KEY(id),
 CONSTRAINT promotion_kind CHECK(kind IN ('vendor_coupon','platform_campaign')),
 CONSTRAINT promotion_scope CHECK((kind='vendor_coupon')=(vendor_id IS NOT NULL) AND scope_key=coalesce(vendor_id::text,'platform')),
 CONSTRAINT promotion_budget CHECK((kind='platform_campaign')=(budget_minor_units IS NOT NULL) AND (budget_minor_units IS NULL OR budget_minor_units BETWEEN 1 AND 9007199254740991)),
 CONSTRAINT promotion_code CHECK(code ~ '^[A-Z0-9_-]{2,40}$')
);
CREATE UNIQUE INDEX promotion_definitions_scope_key_code_key ON promotion_definitions(scope_key,code);
CREATE TABLE promotion_reservations (
 id UUID NOT NULL DEFAULT uuidv7(),promotion_id UUID NOT NULL,quote_id UUID NOT NULL,hold_ref UUID NOT NULL,workspace_id UUID NOT NULL,customer_id UUID NOT NULL,
 amount_minor_units BIGINT NOT NULL,state TEXT NOT NULL DEFAULT 'reserved',expires_at TIMESTAMPTZ(6) NOT NULL,completed_at TIMESTAMPTZ(6),created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT promotion_reservations_pkey PRIMARY KEY(id),
 CONSTRAINT promotion_reservations_promotion_id_fkey FOREIGN KEY(promotion_id) REFERENCES promotion_definitions(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
 CONSTRAINT promotion_reservation_amount CHECK(amount_minor_units BETWEEN 1 AND 2147483647),
 CONSTRAINT promotion_reservation_state CHECK(state IN ('reserved','released','consumed') AND ((state='reserved')=(completed_at IS NULL))),
 CONSTRAINT promotion_reservation_expiry CHECK(expires_at>created_at)
);
CREATE UNIQUE INDEX promotion_reservations_quote_id_promotion_id_key ON promotion_reservations(quote_id,promotion_id);
CREATE INDEX promotion_reservations_state_expires_at_idx ON promotion_reservations(state,expires_at);
CREATE TABLE campaign_budget_movements (
 id UUID NOT NULL DEFAULT uuidv7(),promotion_id UUID NOT NULL,reservation_id UUID NOT NULL,kind TEXT NOT NULL,reserved_delta BIGINT NOT NULL,consumed_delta BIGINT NOT NULL,created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT campaign_budget_movements_pkey PRIMARY KEY(id),
 CONSTRAINT campaign_budget_movements_promotion_id_fkey FOREIGN KEY(promotion_id) REFERENCES promotion_definitions(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
 CONSTRAINT campaign_budget_movements_reservation_id_fkey FOREIGN KEY(reservation_id) REFERENCES promotion_reservations(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
 CONSTRAINT campaign_budget_movement CHECK((kind='reserved' AND reserved_delta>0 AND consumed_delta=0) OR (kind='released' AND reserved_delta<0 AND consumed_delta=0) OR (kind='consumed' AND reserved_delta<0 AND consumed_delta=-reserved_delta))
);
CREATE UNIQUE INDEX campaign_budget_movements_reservation_id_kind_key ON campaign_budget_movements(reservation_id,kind);
CREATE INDEX campaign_budget_movements_promotion_id_idx ON campaign_budget_movements(promotion_id);
CREATE TABLE campaign_budget_balances (
 promotion_id UUID NOT NULL, capacity BIGINT NOT NULL, reserved BIGINT NOT NULL DEFAULT 0, consumed BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT campaign_budget_balances_pkey PRIMARY KEY(promotion_id),
 CONSTRAINT campaign_budget_balances_promotion_id_fkey FOREIGN KEY(promotion_id) REFERENCES promotion_definitions(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
 CONSTRAINT campaign_budget_capacity CHECK(capacity>0 AND reserved>=0 AND consumed>=0 AND reserved+consumed<=capacity)
);
CREATE FUNCTION initialize_campaign_budget() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='platform_campaign' THEN INSERT INTO campaign_budget_balances(promotion_id,capacity) VALUES(NEW.id,NEW.budget_minor_units); END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER initialize_campaign_budget AFTER INSERT ON promotion_definitions FOR EACH ROW EXECUTE FUNCTION initialize_campaign_budget();
CREATE FUNCTION preserve_checkout_financial_definition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Financial definitions and budget movements are immutable'; END; $$;
CREATE TRIGGER commission_rate_immutable BEFORE UPDATE OR DELETE ON commission_rates FOR EACH ROW EXECUTE FUNCTION preserve_checkout_financial_definition();
CREATE TRIGGER promotion_definition_immutable BEFORE UPDATE OR DELETE ON promotion_definitions FOR EACH ROW EXECUTE FUNCTION preserve_checkout_financial_definition();
CREATE TRIGGER budget_movement_immutable BEFORE UPDATE OR DELETE ON campaign_budget_movements FOR EACH ROW EXECUTE FUNCTION preserve_checkout_financial_definition();
CREATE TRIGGER commission_rate_no_truncate BEFORE TRUNCATE ON commission_rates FOR EACH STATEMENT EXECUTE FUNCTION preserve_checkout_financial_definition();
CREATE TRIGGER promotion_definition_no_truncate BEFORE TRUNCATE ON promotion_definitions FOR EACH STATEMENT EXECUTE FUNCTION preserve_checkout_financial_definition();
CREATE TRIGGER budget_movement_no_truncate BEFORE TRUNCATE ON campaign_budget_movements FOR EACH STATEMENT EXECUTE FUNCTION preserve_checkout_financial_definition();
CREATE FUNCTION guard_promotion_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE promotion promotion_definitions; quote mixed_checkout_quotes; applied JSONB; uses BIGINT; own_uses BIGINT;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Promotion reservation history is immutable'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT * INTO STRICT promotion FROM promotion_definitions WHERE id=NEW.promotion_id FOR UPDATE;
  SELECT * INTO quote FROM mixed_checkout_quotes WHERE id=NEW.quote_id AND workspace_id=NEW.workspace_id AND customer_id=NEW.customer_id;
  IF EXISTS(SELECT 1 FROM promotion_reservations WHERE quote_id=NEW.quote_id AND hold_ref<>NEW.hold_ref) THEN RAISE EXCEPTION 'Quote promotions require one common hold reference'; END IF;
  IF quote.id IS NULL OR NEW.state<>'reserved' OR quote.expires_at<=NEW.created_at OR NOT EXISTS(SELECT 1 FROM mixed_carts WHERE id=quote.cart_id AND version=quote.cart_version) OR jsonb_array_length(quote.snapshot->'conflicts')<>0 THEN RAISE EXCEPTION 'Reservation requires an owned ready current quote'; END IF;
  applied:=CASE WHEN promotion.kind='vendor_coupon' THEN quote.snapshot->'promotion'->'vendorCoupon' ELSE quote.snapshot->'promotion'->'platformCampaign' END;
  IF applied->>'promotionId' IS DISTINCT FROM NEW.promotion_id::text OR (applied->'allocated'->>'minorUnits')::bigint IS DISTINCT FROM NEW.amount_minor_units THEN RAISE EXCEPTION 'Reservation must match frozen promotion allocation'; END IF;
  IF NEW.created_at<(promotion.definition->>'validFrom')::timestamptz OR NEW.created_at>=(promotion.definition->>'validUntil')::timestamptz OR NEW.expires_at>NEW.created_at+interval '15 minutes' THEN RAISE EXCEPTION 'Promotion reservation is outside its eligibility window'; END IF;
  SELECT count(*),count(*) FILTER(WHERE customer_id=NEW.customer_id) INTO uses,own_uses FROM promotion_reservations WHERE promotion_id=NEW.promotion_id AND (state='consumed' OR (state='reserved' AND expires_at>NEW.created_at));
  IF ((promotion.definition->>'usageLimit') IS NOT NULL AND uses>=(promotion.definition->>'usageLimit')::bigint) OR ((promotion.definition->>'perCustomerLimit') IS NOT NULL AND own_uses>=(promotion.definition->>'perCustomerLimit')::bigint) THEN RAISE EXCEPTION 'Promotion usage limit reached'; END IF;
 ELSIF OLD.state<>'reserved' OR NEW.state NOT IN ('released','consumed') OR NEW.id<>OLD.id OR NEW.promotion_id<>OLD.promotion_id OR NEW.quote_id<>OLD.quote_id OR NEW.hold_ref<>OLD.hold_ref OR NEW.workspace_id<>OLD.workspace_id OR NEW.customer_id<>OLD.customer_id OR NEW.amount_minor_units<>OLD.amount_minor_units OR NEW.expires_at<>OLD.expires_at OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Promotion reservation only permits one terminal transition';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.completed_at<NEW.created_at OR (NEW.state='consumed' AND NEW.completed_at>=NEW.expires_at)) THEN RAISE EXCEPTION 'Promotion consumption must precede hold expiry'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER promotion_reservation_guard BEFORE INSERT OR UPDATE OR DELETE ON promotion_reservations FOR EACH ROW EXECUTE FUNCTION guard_promotion_reservation();
CREATE TRIGGER promotion_reservation_no_truncate BEFORE TRUNCATE ON promotion_reservations FOR EACH STATEMENT EXECUTE FUNCTION preserve_checkout_financial_definition();
CREATE FUNCTION check_campaign_budget() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid UUID; rid UUID; promotion promotion_definitions; reservation promotion_reservations; held NUMERIC; consumed NUMERIC; n INTEGER;
BEGIN
 IF TG_TABLE_NAME='promotion_reservations' THEN pid:=NEW.promotion_id; rid:=NEW.id; ELSE pid:=NEW.promotion_id; rid:=NEW.reservation_id; END IF;
 SELECT * INTO STRICT promotion FROM promotion_definitions WHERE id=pid;
 SELECT * INTO STRICT reservation FROM promotion_reservations WHERE id=rid;
 IF reservation.promotion_id<>pid THEN RAISE EXCEPTION 'Budget movement promotion mismatch'; END IF;
 IF promotion.kind='platform_campaign' THEN
  SELECT coalesce(sum(reserved_delta),0),coalesce(sum(consumed_delta),0) INTO held,consumed FROM campaign_budget_movements WHERE promotion_id=pid;
  IF held<0 OR consumed<0 OR held+consumed>promotion.budget_minor_units THEN RAISE EXCEPTION 'Campaign budget exceeded'; END IF;
  SELECT count(*) INTO n FROM campaign_budget_movements WHERE reservation_id=rid AND promotion_id=pid AND kind='reserved' AND reserved_delta=reservation.amount_minor_units AND consumed_delta=0;
  IF n<>1 THEN RAISE EXCEPTION 'Reservation requires matching budget hold'; END IF;
  IF (SELECT count(*) FROM campaign_budget_movements WHERE reservation_id=rid)<>(CASE WHEN reservation.state='reserved' THEN 1 ELSE 2 END) THEN RAISE EXCEPTION 'Budget movement count mismatch'; END IF;
  IF reservation.state<>'reserved' AND NOT EXISTS(SELECT 1 FROM campaign_budget_movements WHERE reservation_id=rid AND kind=reservation.state AND reserved_delta=-reservation.amount_minor_units AND consumed_delta=CASE WHEN reservation.state='consumed' THEN reservation.amount_minor_units ELSE 0 END) THEN RAISE EXCEPTION 'Reservation requires matching budget terminal movement'; END IF;
 ELSIF EXISTS(SELECT 1 FROM campaign_budget_movements WHERE reservation_id=rid) THEN RAISE EXCEPTION 'Vendor coupons do not spend Platform budget'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER campaign_budget_check AFTER INSERT ON campaign_budget_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_campaign_budget();
CREATE CONSTRAINT TRIGGER promotion_budget_check AFTER INSERT OR UPDATE ON promotion_reservations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_campaign_budget();
-- Every budget writer takes the same row lock, including raw SQL writers.
CREATE FUNCTION lock_campaign_budget() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM promotion_definitions WHERE id=NEW.promotion_id FOR UPDATE;
 UPDATE campaign_budget_balances SET reserved=reserved+NEW.reserved_delta,consumed=consumed+NEW.consumed_delta
 WHERE promotion_id=NEW.promotion_id AND reserved+NEW.reserved_delta>=0 AND consumed+NEW.consumed_delta>=0 AND reserved+NEW.reserved_delta+consumed+NEW.consumed_delta<=capacity;
 IF NOT FOUND THEN RAISE EXCEPTION 'Campaign budget exceeded or missing'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER budget_writer_lock BEFORE INSERT ON campaign_budget_movements FOR EACH ROW EXECUTE FUNCTION lock_campaign_budget();

CREATE FUNCTION verify_campaign_budget_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE held NUMERIC; spent NUMERIC; cap BIGINT; projection campaign_budget_balances;
BEGIN
 SELECT * INTO STRICT projection FROM campaign_budget_balances WHERE promotion_id=NEW.promotion_id;
 SELECT budget_minor_units INTO cap FROM promotion_definitions WHERE id=NEW.promotion_id AND kind='platform_campaign';
 SELECT coalesce(sum(reserved_delta),0),coalesce(sum(consumed_delta),0) INTO held,spent FROM campaign_budget_movements WHERE promotion_id=NEW.promotion_id;
 IF cap IS NULL OR cap<>projection.capacity OR held<>projection.reserved OR spent<>projection.consumed THEN RAISE EXCEPTION 'Campaign budget projection must match immutable movements'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER campaign_projection_check AFTER INSERT OR UPDATE ON campaign_budget_balances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_campaign_budget_projection();
CREATE TRIGGER campaign_projection_no_delete BEFORE DELETE ON campaign_budget_balances FOR EACH ROW EXECUTE FUNCTION preserve_checkout_financial_definition();
CREATE TRIGGER campaign_projection_no_truncate BEFORE TRUNCATE ON campaign_budget_balances FOR EACH STATEMENT EXECUTE FUNCTION preserve_checkout_financial_definition();

CREATE FUNCTION validate_checkout_finance_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM workspaces WHERE id=NEW.workspace_id AND kind='real') OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor_id) THEN RAISE EXCEPTION 'Financial definition requires real workspace and actor'; END IF;
 IF TG_TABLE_NAME='promotion_definitions' THEN
  IF NEW.kind='vendor_coupon' AND NOT EXISTS(SELECT 1 FROM vendors WHERE id=NEW.vendor_id AND workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'Coupon belongs to its Vendor workspace'; END IF;
 ELSIF NEW.vendor_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM vendors v JOIN workspaces w ON w.id=v.workspace_id WHERE v.id=NEW.vendor_id AND w.kind='real') THEN RAISE EXCEPTION 'Commission override needs a real Vendor'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER commission_definition_scope BEFORE INSERT ON commission_rates FOR EACH ROW EXECUTE FUNCTION validate_checkout_finance_scope();
CREATE TRIGGER promotion_definition_scope BEFORE INSERT ON promotion_definitions FOR EACH ROW EXECUTE FUNCTION validate_checkout_finance_scope();
