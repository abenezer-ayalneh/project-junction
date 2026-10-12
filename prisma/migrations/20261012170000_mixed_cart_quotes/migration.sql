CREATE TABLE mixed_carts (
 id UUID NOT NULL DEFAULT uuidv7(), workspace_id UUID NOT NULL, customer_id UUID NOT NULL,
 version INTEGER NOT NULL DEFAULT 1, selection JSONB NOT NULL, created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT mixed_carts_pkey PRIMARY KEY(id),
 CONSTRAINT mixed_cart_version CHECK(version>0),
 CONSTRAINT mixed_cart_components CHECK((jsonb_typeof(selection->'bookings')='array' AND jsonb_array_length(selection->'bookings')<=5 AND jsonb_typeof(selection->'goodsGroups')='array' AND jsonb_array_length(selection->'goodsGroups')<=10) IS TRUE)
);
CREATE UNIQUE INDEX mixed_carts_workspace_id_customer_id_key ON mixed_carts(workspace_id,customer_id);
CREATE TABLE mixed_checkout_quotes (
 id UUID NOT NULL DEFAULT uuidv7(), cart_id UUID NOT NULL, cart_version INTEGER NOT NULL,
 workspace_id UUID NOT NULL, customer_id UUID NOT NULL, selection JSONB NOT NULL, snapshot JSONB NOT NULL,
 expires_at TIMESTAMPTZ(6) NOT NULL, created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT mixed_checkout_quotes_pkey PRIMARY KEY(id),
 CONSTRAINT mixed_checkout_quotes_cart_id_fkey FOREIGN KEY(cart_id) REFERENCES mixed_carts(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
 CONSTRAINT mixed_quote_version CHECK(cart_version>0),
 CONSTRAINT mixed_quote_expiry CHECK(expires_at>created_at)
);
CREATE INDEX mixed_checkout_quotes_workspace_id_customer_id_created_at_idx ON mixed_checkout_quotes(workspace_id,customer_id,created_at);
CREATE FUNCTION guard_mixed_cart() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.version<>1 THEN RAISE EXCEPTION 'Initial Cart revision must be one'; END IF;
  IF NOT EXISTS(SELECT 1 FROM workspaces WHERE id=NEW.workspace_id) OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.customer_id) THEN RAISE EXCEPTION 'Unknown Cart owner'; END IF;
 ELSIF TG_OP='DELETE' THEN RAISE EXCEPTION 'Preserve Cart identity and quotes';
 ELSIF NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.customer_id<>OLD.customer_id OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Cart requires stable owner and next version';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.selection->'bookings') b WHERE b->'quantity' IS DISTINCT FROM '1'::jsonb) THEN RAISE EXCEPTION 'Booking intents have quantity one'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mixed_cart_guard BEFORE INSERT OR UPDATE OR DELETE ON mixed_carts FOR EACH ROW EXECUTE FUNCTION guard_mixed_cart();
CREATE FUNCTION guard_mixed_quote() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Quote snapshots are immutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM mixed_carts WHERE id=NEW.cart_id AND workspace_id=NEW.workspace_id AND customer_id=NEW.customer_id AND version=NEW.cart_version AND selection=NEW.selection) THEN RAISE EXCEPTION 'Quote must match scoped Cart revision'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mixed_quote_immutable BEFORE INSERT OR UPDATE OR DELETE ON mixed_checkout_quotes FOR EACH ROW EXECUTE FUNCTION guard_mixed_quote();

CREATE FUNCTION preserve_mixed_checkout_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Mixed checkout history cannot be truncated'; END; $$;
CREATE TRIGGER mixed_carts_no_truncate BEFORE TRUNCATE ON mixed_carts FOR EACH STATEMENT EXECUTE FUNCTION preserve_mixed_checkout_history();
CREATE TRIGGER mixed_quotes_no_truncate BEFORE TRUNCATE ON mixed_checkout_quotes FOR EACH STATEMENT EXECUTE FUNCTION preserve_mixed_checkout_history();
