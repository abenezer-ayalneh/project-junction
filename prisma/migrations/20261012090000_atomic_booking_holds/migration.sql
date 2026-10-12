-- Keep the extension in public so disposable local schemas do not own its operator classes.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;
CREATE TABLE booking_holds (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  customer_id uuid NOT NULL REFERENCES users(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  vendor_id uuid NOT NULL REFERENCES vendors(id),
  state text NOT NULL DEFAULT 'holding' CHECK (state IN ('holding','released','expired','committed')),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  expires_at timestamptz NOT NULL,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_holds_state_expires_at_idx ON booking_holds(state,expires_at);
CREATE INDEX booking_holds_customer_id_workspace_id_idx ON booking_holds(customer_id,workspace_id);
ALTER TABLE staff_allocations ADD COLUMN hold_id uuid UNIQUE REFERENCES booking_holds(id);
ALTER TABLE staff_allocations ADD CONSTRAINT staff_allocations_no_overlap EXCLUDE USING gist (
  staff_id WITH =, tstzrange(start_at,end_at,'[)') WITH &&
) WHERE (state IN ('held','booked'));
CREATE FUNCTION preserve_booking_hold() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
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
CREATE TRIGGER booking_hold_immutable BEFORE UPDATE OR DELETE ON booking_holds
FOR EACH ROW EXECUTE FUNCTION preserve_booking_hold();
