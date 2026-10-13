ALTER TABLE ledger_postings DROP CONSTRAINT ledger_account;
ALTER TABLE ledger_postings ADD CONSTRAINT ledger_account CHECK(account IN ('processor_clearing','customer_refund_liability','vendor_payable','platform_commission','platform_promotion_expense','platform_processor_fee_expense','platform_dispute_fee_expense'));
CREATE TABLE mixed_payment_attempts (
 id UUID PRIMARY KEY DEFAULT uuidv7(), hold_id UUID NOT NULL UNIQUE REFERENCES mixed_checkout_holds(id),
 workspace_id UUID NOT NULL, customer_id UUID NOT NULL,
 provider TEXT NOT NULL DEFAULT 'local-controlled' CHECK(provider='local-controlled'),provider_reference TEXT NOT NULL UNIQUE,
 amount_minor_units BIGINT NOT NULL CHECK(amount_minor_units BETWEEN 0 AND 9007199254740991),currency TEXT NOT NULL DEFAULT 'ETB' CHECK(currency='ETB'),
 state TEXT NOT NULL DEFAULT 'pending_provider' CHECK(state IN ('pending_provider','unknown','succeeded','failed','refund_pending','refunded','no_payment_required')),
 created_at TIMESTAMPTZ(6) NOT NULL,expires_at TIMESTAMPTZ(6) NOT NULL,
 capture_ledger_id UUID UNIQUE REFERENCES ledger_transactions(id),captured_at TIMESTAMPTZ(6),
 CHECK((capture_ledger_id IS NULL)=(captured_at IS NULL)),CHECK(expires_at>created_at)
);
CREATE INDEX mixed_payment_attempts_state_created_at_idx ON mixed_payment_attempts(state,created_at);
CREATE TABLE mixed_payment_refunds (
 id UUID PRIMARY KEY DEFAULT uuidv7(),payment_id UUID NOT NULL UNIQUE REFERENCES mixed_payment_attempts(id),
 amount_minor_units BIGINT NOT NULL CHECK(amount_minor_units>0),currency TEXT NOT NULL DEFAULT 'ETB' CHECK(currency='ETB'),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','unknown','completed')),reason TEXT NOT NULL,
 provider_reference TEXT UNIQUE,reversal_ledger_id UUID UNIQUE REFERENCES ledger_transactions(id),created_at TIMESTAMPTZ(6) NOT NULL,completed_at TIMESTAMPTZ(6),
 CHECK((state='completed' AND completed_at IS NOT NULL AND provider_reference IS NOT NULL AND reversal_ledger_id IS NOT NULL AND completed_at>=created_at) OR (state IN ('pending','unknown') AND completed_at IS NULL AND provider_reference IS NULL AND reversal_ledger_id IS NULL))
);
CREATE FUNCTION guard_mixed_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE h mixed_checkout_holds;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Mixed payment history is immutable'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT * INTO STRICT h FROM mixed_checkout_holds WHERE id=NEW.hold_id;
  IF NEW.provider_reference<>('local-mixed:'||h.id::text) OR h.state<>'holding' OR h.expires_at<=NEW.created_at OR h.workspace_id<>NEW.workspace_id OR h.customer_id<>NEW.customer_id OR h.expires_at<>NEW.expires_at OR (h.snapshot->'total'->>'minorUnits')::bigint<>NEW.amount_minor_units OR h.snapshot->'total'->>'currency'<>NEW.currency OR NEW.capture_ledger_id IS NOT NULL OR NEW.state<>(CASE WHEN NEW.amount_minor_units=0 THEN 'no_payment_required' ELSE 'pending_provider' END) THEN RAISE EXCEPTION 'Payment requires owned active hold and exact original Money/deadline'; END IF;
 ELSE
  IF NEW.id<>OLD.id OR NEW.hold_id<>OLD.hold_id OR NEW.workspace_id<>OLD.workspace_id OR NEW.customer_id<>OLD.customer_id OR NEW.provider<>OLD.provider OR NEW.provider_reference<>OLD.provider_reference OR NEW.amount_minor_units<>OLD.amount_minor_units OR NEW.currency<>OLD.currency OR NEW.created_at<>OLD.created_at OR NEW.expires_at<>OLD.expires_at OR (OLD.capture_ledger_id IS NOT NULL AND (NEW.capture_ledger_id IS DISTINCT FROM OLD.capture_ledger_id OR NEW.captured_at IS DISTINCT FROM OLD.captured_at)) THEN RAISE EXCEPTION 'Mixed payment terms and capture are immutable'; END IF;
  IF NOT((OLD.state='pending_provider' AND NEW.state IN ('unknown','succeeded','failed','refund_pending')) OR (OLD.state='unknown' AND NEW.state IN ('succeeded','failed','refund_pending')) OR (OLD.state IN ('succeeded','failed') AND NEW.state='refund_pending') OR (OLD.state='refund_pending' AND NEW.state='refunded')) THEN RAISE EXCEPTION 'Invalid mixed payment transition'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mixed_payment_guard BEFORE INSERT OR UPDATE OR DELETE ON mixed_payment_attempts FOR EACH ROW EXECUTE FUNCTION guard_mixed_payment();
CREATE FUNCTION guard_mixed_refund() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p mixed_payment_attempts;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Mixed refund history is immutable'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT * INTO STRICT p FROM mixed_payment_attempts WHERE id=NEW.payment_id;
  IF p.capture_ledger_id IS NULL OR NEW.amount_minor_units<>p.amount_minor_units OR NEW.currency<>p.currency OR NEW.state<>'pending' OR NOT EXISTS(SELECT 1 FROM mixed_checkout_holds WHERE id=p.hold_id AND state IN ('released','expired')) THEN RAISE EXCEPTION 'Refund requires captured abandoned hold and original amount'; END IF;
 ELSE
  IF NEW.id<>OLD.id OR NEW.payment_id<>OLD.payment_id OR NEW.amount_minor_units<>OLD.amount_minor_units OR NEW.currency<>OLD.currency OR NEW.created_at<>OLD.created_at OR NEW.reason<>OLD.reason OR OLD.state='completed' OR NEW.state NOT IN ('unknown','completed') OR (NEW.state='unknown' AND OLD.state='unknown') THEN RAISE EXCEPTION 'Invalid immutable mixed refund transition'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mixed_refund_guard BEFORE INSERT OR UPDATE OR DELETE ON mixed_payment_refunds FOR EACH ROW EXECUTE FUNCTION guard_mixed_refund();
CREATE FUNCTION verify_mixed_payment() RETURNS trigger LANGUAGE plpgsql AS $$
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
 IF p.state='succeeded' AND (h.state<>'holding' OR p.captured_at>=p.expires_at) THEN RAISE EXCEPTION 'Success requires timely capture and retained resources';END IF;
 SELECT * INTO r FROM mixed_payment_refunds WHERE payment_id=p.id;
 IF p.state IN ('refund_pending','refunded') AND (r.id IS NULL OR r.amount_minor_units<>p.amount_minor_units OR r.currency<>p.currency) THEN RAISE EXCEPTION 'Compensation requires exact durable refund';END IF;
 IF p.state='refunded' AND (r.state<>'completed' OR NOT EXISTS(SELECT 1 FROM ledger_transactions WHERE id=r.reversal_ledger_id AND reversal_of=p.capture_ledger_id AND economic_event_id='mixed-refund:'||r.id::text)) THEN RAISE EXCEPTION 'Refund completion requires exact capture reversal';END IF;
 IF r.state='completed' AND p.state<>'refunded' THEN RAISE EXCEPTION 'Refund and payment completion must align';END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER mixed_payment_complete AFTER INSERT OR UPDATE ON mixed_payment_attempts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_mixed_payment();
CREATE CONSTRAINT TRIGGER mixed_refund_complete AFTER INSERT OR UPDATE ON mixed_payment_refunds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_mixed_payment();
CREATE CONSTRAINT TRIGGER mixed_hold_payment_complete AFTER UPDATE ON mixed_checkout_holds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_mixed_payment();
CREATE TRIGGER mixed_payments_no_truncate BEFORE TRUNCATE ON mixed_payment_attempts FOR EACH STATEMENT EXECUTE FUNCTION preserve_mixed_hold_component();
CREATE TRIGGER mixed_refunds_no_truncate BEFORE TRUNCATE ON mixed_payment_refunds FOR EACH STATEMENT EXECUTE FUNCTION preserve_mixed_hold_component();
CREATE FUNCTION preserve_mixed_payment_inbox() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.provider<>'local-mixed-payment' THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; IF NEW.provider='local-mixed-payment' THEN RAISE EXCEPTION 'Mixed provider receipt cannot be attached after creation'; END IF; RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND ((OLD.reconciliation_state<>'pending' AND (NEW.reconciliation_state<>OLD.reconciliation_state OR NEW.processed_at IS DISTINCT FROM OLD.processed_at OR NEW.reconciled_at IS DISTINCT FROM OLD.reconciled_at)) OR (OLD.reconciliation_state='pending' AND (NEW.reconciliation_state NOT IN ('reconciled','superseded','exception') OR NEW.processed_at IS NULL OR NEW.reconciled_at IS NULL))) THEN RAISE EXCEPTION 'Mixed provider reconciliation permits one immutable outcome'; END IF;
 IF TG_OP='DELETE' OR NEW.id<>OLD.id OR NEW.provider<>OLD.provider OR NEW.provider_event_id<>OLD.provider_event_id OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference OR NEW.payload_hash<>OLD.payload_hash OR NEW.payload IS DISTINCT FROM OLD.payload OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.received_at<>OLD.received_at THEN RAISE EXCEPTION 'Mixed provider receipt history is immutable';END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mixed_payment_inbox_immutable BEFORE UPDATE OR DELETE ON provider_inbox_events FOR EACH ROW EXECUTE FUNCTION preserve_mixed_payment_inbox();

CREATE FUNCTION guard_mixed_inbox_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF EXISTS(SELECT 1 FROM provider_inbox_events WHERE provider='local-mixed-payment') THEN RAISE EXCEPTION 'Mixed provider receipt history cannot be truncated';END IF;RETURN NULL;END; $$;
CREATE TRIGGER mixed_payment_inbox_no_truncate BEFORE TRUNCATE ON provider_inbox_events FOR EACH STATEMENT EXECUTE FUNCTION guard_mixed_inbox_truncate();
