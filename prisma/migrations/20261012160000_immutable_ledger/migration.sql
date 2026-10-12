CREATE TABLE ledger_transactions (
 id UUID NOT NULL DEFAULT uuidv7(), workspace_id UUID NOT NULL, economic_event_id TEXT NOT NULL,
 source_id UUID NOT NULL, reason TEXT NOT NULL, currency TEXT NOT NULL, request_hash TEXT NOT NULL,
 reversal_of UUID, merchant_model JSONB NOT NULL, created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT ledger_transactions_pkey PRIMARY KEY(id),
 CONSTRAINT ledger_currency CHECK(currency ~ '^[A-Z]{3}$'),
 CONSTRAINT ledger_reason CHECK(length(trim(reason)) BETWEEN 1 AND 500),
 CONSTRAINT ledger_event CHECK(length(economic_event_id) BETWEEN 1 AND 200),
 CONSTRAINT ledger_merchant CHECK(merchant_model = '{"paymentMerchant":"junction","contractingSeller":"vendor","ordinaryProcessorFees":"junction","ordinaryDisputeFees":"junction","settlement":"sandbox_only"}'::jsonb)
);
CREATE UNIQUE INDEX ledger_transactions_workspace_id_economic_event_id_key ON ledger_transactions(workspace_id,economic_event_id);
CREATE UNIQUE INDEX ledger_transactions_reversal_of_key ON ledger_transactions(reversal_of);
CREATE TABLE ledger_postings (
 id UUID NOT NULL DEFAULT uuidv7(), transaction_id UUID NOT NULL, ordinal INTEGER NOT NULL,
 account TEXT NOT NULL, vendor_id UUID, location_id UUID, component_id UUID, minor_units BIGINT NOT NULL, currency TEXT NOT NULL,
 CONSTRAINT ledger_postings_pkey PRIMARY KEY(id),
 CONSTRAINT ledger_postings_transaction_id_fkey FOREIGN KEY(transaction_id) REFERENCES ledger_transactions(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
 CONSTRAINT ledger_amount CHECK(minor_units <> 0 AND minor_units BETWEEN -9007199254740991 AND 9007199254740991),
 CONSTRAINT ledger_ordinal CHECK(ordinal BETWEEN 0 AND 99),
 CONSTRAINT ledger_account CHECK(account IN ('processor_clearing','vendor_payable','platform_commission','platform_promotion_expense','platform_processor_fee_expense','platform_dispute_fee_expense')),
 CONSTRAINT ledger_vendor CHECK((account = 'vendor_payable') = (vendor_id IS NOT NULL)),
 CONSTRAINT ledger_location CHECK(location_id IS NULL OR vendor_id IS NOT NULL)
);
CREATE UNIQUE INDEX ledger_postings_transaction_id_ordinal_key ON ledger_postings(transaction_id,ordinal);
-- Constraint triggers validate the complete transaction at commit, including raw SQL writers.
CREATE FUNCTION verify_ledger_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid UUID; record ledger_transactions; n INTEGER;
BEGIN
 IF TG_TABLE_NAME='ledger_transactions' THEN tid := NEW.id; ELSE tid := NEW.transaction_id; END IF;
 SELECT * INTO STRICT record FROM ledger_transactions WHERE id=tid;
 IF NOT EXISTS(SELECT 1 FROM workspaces WHERE id=record.workspace_id) THEN RAISE EXCEPTION 'Unknown ledger workspace'; END IF;
 SELECT count(*) INTO n FROM ledger_postings WHERE transaction_id=tid;
 IF n NOT BETWEEN 2 AND 100 OR (SELECT sum(minor_units) FROM ledger_postings WHERE transaction_id=tid) <> 0 THEN RAISE EXCEPTION 'Unbalanced ledger transaction'; END IF;
 IF EXISTS(SELECT 1 FROM ledger_postings p LEFT JOIN vendors v ON v.id=p.vendor_id LEFT JOIN locations l ON l.id=p.location_id
 WHERE p.transaction_id=tid AND (p.currency<>record.currency OR (p.vendor_id IS NOT NULL AND (v.id IS NULL OR v.workspace_id<>record.workspace_id)) OR (p.location_id IS NOT NULL AND (l.id IS NULL OR l.vendor_id<>p.vendor_id)))) THEN RAISE EXCEPTION 'Invalid ledger scope or currency'; END IF;
 IF record.reversal_of IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM ledger_transactions o WHERE o.id=record.reversal_of AND o.workspace_id=record.workspace_id AND o.currency=record.currency AND o.reversal_of IS NULL) THEN RAISE EXCEPTION 'Invalid ledger reversal'; END IF;
  IF n <> (SELECT count(*) FROM ledger_postings WHERE transaction_id=record.reversal_of) OR EXISTS(
   SELECT 1 FROM ledger_postings p LEFT JOIN ledger_postings o ON o.transaction_id=record.reversal_of AND o.ordinal=p.ordinal
   WHERE p.transaction_id=tid AND (o.id IS NULL OR p.minor_units<>-o.minor_units OR p.account<>o.account OR p.vendor_id IS DISTINCT FROM o.vendor_id OR p.location_id IS DISTINCT FROM o.location_id OR p.component_id IS DISTINCT FROM o.component_id)
  ) THEN RAISE EXCEPTION 'Reversal must exactly negate original postings'; END IF;
 END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER ledger_transaction_balanced AFTER INSERT ON ledger_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_ledger_transaction();
CREATE CONSTRAINT TRIGGER ledger_posting_balanced AFTER INSERT ON ledger_postings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_ledger_transaction();
CREATE FUNCTION preserve_ledger_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Ledger history is immutable'; END; $$;
CREATE TRIGGER ledger_transactions_immutable BEFORE UPDATE OR DELETE ON ledger_transactions FOR EACH ROW EXECUTE FUNCTION preserve_ledger_history();
CREATE TRIGGER ledger_postings_immutable BEFORE UPDATE OR DELETE ON ledger_postings FOR EACH ROW EXECUTE FUNCTION preserve_ledger_history();
-- Prevent appending to a committed transaction, even when additions themselves balance.
CREATE FUNCTION guard_ledger_append() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ledger_transactions WHERE id=NEW.transaction_id AND xmin::text = pg_current_xact_id()::text) THEN RAISE EXCEPTION 'Cannot append to committed ledger transaction'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER ledger_no_append BEFORE INSERT ON ledger_postings FOR EACH ROW EXECUTE FUNCTION guard_ledger_append();
CREATE TRIGGER ledger_transactions_no_truncate BEFORE TRUNCATE ON ledger_transactions FOR EACH STATEMENT EXECUTE FUNCTION preserve_ledger_history();
CREATE TRIGGER ledger_postings_no_truncate BEFORE TRUNCATE ON ledger_postings FOR EACH STATEMENT EXECUTE FUNCTION preserve_ledger_history();
