ALTER TABLE platform_finance_grants ADD COLUMN settlement_workspace_ids uuid[] NOT NULL DEFAULT '{}';
CREATE TABLE finance_records (
 id uuid PRIMARY KEY DEFAULT uuidv7(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
 kind text NOT NULL CHECK(kind IN ('reconciliation','exception','exception_resolution','policy_proposal','fee_proposal','correction_proposal','approval','batch','transfer','transfer_observation','transfer_terminal')),
 operation_key text NOT NULL, source_id uuid, actor_id uuid REFERENCES users(id), payload jsonb NOT NULL,
 created_at timestamptz(6) NOT NULL, UNIQUE(workspace_id,operation_key)
);
CREATE INDEX finance_records_scope_kind ON finance_records(workspace_id,kind);
CREATE TRIGGER finance_record_immutable BEFORE UPDATE OR DELETE ON finance_records FOR EACH ROW EXECUTE FUNCTION preserve_mixed_commercial_history();
CREATE TRIGGER finance_record_no_truncate BEFORE TRUNCATE ON finance_records FOR EACH STATEMENT EXECUTE FUNCTION preserve_mixed_commercial_history();
CREATE FUNCTION validate_finance_record() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE proposal finance_records%ROWTYPE; transfer finance_records%ROWTYPE; lot jsonb; available bigint; used bigint; a mixed_commerce_allocations%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('junction:goods-checkout',0));
 IF NEW.kind='approval' THEN
  SELECT * INTO STRICT proposal FROM finance_records WHERE id=NEW.source_id AND workspace_id=NEW.workspace_id;
  IF proposal.kind NOT IN ('policy_proposal','fee_proposal','correction_proposal') OR NEW.actor_id IS NULL OR proposal.actor_id=NEW.actor_id
   OR NEW.operation_key<>'approve:'||proposal.id::text THEN RAISE EXCEPTION 'Finance approval requires a distinct actor and exact proposal'; END IF;
 END IF;
 IF NEW.kind='transfer' THEN
  IF (NEW.payload->>'amount')::bigint<=0 OR NEW.payload->>'currency'<>'ETB' OR jsonb_array_length(NEW.payload->'lots')=0 THEN RAISE EXCEPTION 'Invalid transfer'; END IF;
  available:=0;
  FOR lot IN SELECT value FROM jsonb_array_elements(NEW.payload->'lots') LOOP
   SELECT * INTO STRICT a FROM mixed_commerce_allocations WHERE id=(lot->>'allocationId')::uuid AND vendor_workspace_id=NEW.workspace_id;
   SELECT COALESCE(sum((j.value->>'amount')::bigint),0) INTO used FROM finance_records r CROSS JOIN LATERAL jsonb_array_elements(r.payload->'lots') AS j(value)
    WHERE r.kind='transfer' AND r.workspace_id=NEW.workspace_id AND j.value->>'allocationId'=a.id::text
    AND NOT EXISTS(SELECT 1 FROM finance_records o WHERE o.kind='transfer_terminal' AND o.source_id=r.id AND o.payload->>'outcome'='failed');
   IF (lot->>'amount')::bigint<=0 OR (lot->>'amount')::bigint>GREATEST((earning_expected(a.id,NEW.created_at)->>'available')::bigint-used,0)
    THEN RAISE EXCEPTION 'Transfer exceeds current unallocated earning'; END IF;
   available:=available+(lot->>'amount')::bigint;
  END LOOP;
  IF available<>(NEW.payload->>'amount')::bigint OR (SELECT count(*) FROM jsonb_array_elements(NEW.payload->'lots'))<>(SELECT count(DISTINCT l->>'allocationId') FROM jsonb_array_elements(NEW.payload->'lots') l)
   THEN RAISE EXCEPTION 'Transfer allocation must conserve unique lots'; END IF;
 END IF;
 IF NEW.kind='transfer_terminal' THEN
  SELECT * INTO STRICT transfer FROM finance_records WHERE id=NEW.source_id AND kind='transfer' AND workspace_id=NEW.workspace_id;
  IF NEW.operation_key<>'terminal:'||transfer.id::text OR NEW.payload->>'outcome' NOT IN ('succeeded','failed') THEN RAISE EXCEPTION 'Invalid terminal transfer observation'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER finance_record_validate BEFORE INSERT ON finance_records FOR EACH ROW EXECUTE FUNCTION validate_finance_record();

-- Terminal observations and the named transfer template must commit together.
CREATE FUNCTION check_finance_transfer_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t finance_records%ROWTYPE; l jsonb; expected bigint; total bigint;
BEGIN
 IF NEW.kind<>'transfer_terminal' THEN RETURN NULL; END IF;
 SELECT * INTO STRICT t FROM finance_records WHERE id=NEW.source_id;
 FOR l IN SELECT value FROM jsonb_array_elements(t.payload->'lots') LOOP
  expected:=CASE WHEN NEW.payload->>'outcome'='succeeded' THEN (l->>'amount')::bigint ELSE 0 END;
  SELECT COALESCE(sum(p.minor_units),0) INTO total FROM ledger_postings p JOIN ledger_transactions lt ON lt.id=p.transaction_id
   WHERE lt.source_id=t.id AND lt.workspace_id=t.workspace_id AND p.account='vendor_payable' AND p.component_id=(l->>'allocationId')::uuid;
  IF total<>expected THEN RAISE EXCEPTION 'Transfer terminal requires exact ledger allocation'; END IF;
  IF expected>0 AND NOT EXISTS(SELECT 1 FROM ledger_transactions lt JOIN ledger_postings vp ON vp.transaction_id=lt.id JOIN ledger_postings pc ON pc.transaction_id=lt.id
   JOIN mixed_commerce_allocations a ON a.id=(l->>'allocationId')::uuid WHERE lt.source_id=t.id AND lt.workspace_id=t.workspace_id
   AND lt.economic_event_id='finance-transfer:'||t.id::text||':'||a.id::text AND vp.account='vendor_payable' AND vp.minor_units=expected AND vp.component_id=a.id AND vp.vendor_id=a.vendor_id AND vp.location_id IS NOT DISTINCT FROM a.location_id
   AND pc.account='processor_clearing' AND pc.minor_units=-expected AND pc.component_id=a.id AND pc.vendor_id IS NULL AND (SELECT count(*) FROM ledger_postings WHERE transaction_id=lt.id)=2)
   THEN RAISE EXCEPTION 'Transfer requires the exact named posting template'; END IF;
 END LOOP;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER finance_transfer_ledger AFTER INSERT ON finance_records DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_finance_transfer_ledger();
CREATE FUNCTION validate_finance_transfer_batch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch finance_records%ROWTYPE; policy finance_records%ROWTYPE; vendor uuid; l jsonb; reserve bigint; authority bigint; used bigint; expected bigint:=0; allowed bigint:=0; debt bigint:=0; a record;
BEGIN
 IF NEW.kind<>'transfer' THEN RETURN NEW; END IF;
 SELECT * INTO STRICT batch FROM finance_records WHERE id=NEW.source_id AND workspace_id=NEW.workspace_id AND kind='batch';
 SELECT * INTO STRICT policy FROM finance_records WHERE id=(batch.payload->>'policyId')::uuid AND workspace_id=NEW.workspace_id AND kind='policy_proposal';
 IF NOT EXISTS(SELECT 1 FROM finance_records WHERE kind='approval' AND source_id=policy.id) THEN RAISE EXCEPTION 'Transfer requires approved policy'; END IF;
 vendor:=(NEW.payload->>'vendorId')::uuid;
 SELECT (v->>'amount')::bigint INTO STRICT expected FROM jsonb_array_elements(batch.payload->'vendors') v WHERE v->>'vendorId'=vendor::text AND (v->>'eligible')::boolean;
 IF NEW.operation_key<>'transfer:'||batch.id::text||':'||vendor::text OR expected<>(NEW.payload->>'amount')::bigint
 OR expected<(policy.payload->>'minimumMinorUnits')::bigint THEN RAISE EXCEPTION 'Transfer requires exact eligible batch'; END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(NEW.payload->'lots') LOOP
  IF NOT EXISTS(SELECT 1 FROM mixed_commerce_allocations WHERE id=(l->>'allocationId')::uuid AND vendor_id=vendor AND vendor_workspace_id=NEW.workspace_id)
   THEN RAISE EXCEPTION 'Transfer seller scope mismatch'; END IF;
 END LOOP;
 FOR a IN SELECT id,earning_expected(id,NEW.created_at) s FROM mixed_commerce_allocations WHERE vendor_id=vendor AND vendor_workspace_id=NEW.workspace_id LOOP
  SELECT COALESCE(sum((j.value->>'amount')::bigint),0) INTO used FROM finance_records r CROSS JOIN LATERAL jsonb_array_elements(r.payload->'lots') AS j(value)
   WHERE r.kind='transfer' AND r.workspace_id=NEW.workspace_id AND j.value->>'allocationId'=a.id::text
   AND NOT EXISTS(SELECT 1 FROM finance_records o WHERE o.kind='transfer_terminal' AND o.source_id=r.id AND o.payload->>'outcome'='failed');
  allowed:=allowed+GREATEST((a.s->>'available')::bigint-used,0);
  authority:=(a.s->>'gross')::bigint-(a.s->>'refunded')::bigint-(a.s->>'refundPending')::bigint-(a.s->>'frozen')::bigint-used;
  debt:=debt+GREATEST(-authority,0);
 END LOOP;
 IF expected>GREATEST(allowed-debt,0) THEN RAISE EXCEPTION 'Transfer must offset affected seller debt'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER finance_record_validate_batch BEFORE INSERT ON finance_records FOR EACH ROW EXECUTE FUNCTION validate_finance_transfer_batch();
