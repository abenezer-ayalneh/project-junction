CREATE TABLE earning_revisions (
 id uuid PRIMARY KEY DEFAULT uuidv7(),
 allocation_id uuid NOT NULL REFERENCES mixed_commerce_allocations(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
 version integer NOT NULL CHECK(version>0),
 snapshot jsonb NOT NULL,
 observed_at timestamptz(6) NOT NULL,
 UNIQUE(allocation_id,version)
);

-- Availability partitions the existing seller payable. It is not a new sale or cash posting.
-- All amounts come from immutable C06 unit funding, never caller supplied balances.
CREATE FUNCTION earning_expected(aid uuid, at_time timestamptz) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a mixed_commerce_allocations%ROWTYPE; b bookings%ROWTYPE; att booking_attendance%ROWTYPE;
 gross bigint; refunded bigint; refund_pending bigint; remaining bigint; frozen bigint:=0;
 eligible timestamptz; handed timestamptz; days integer; unit_offset integer:=0; units integer;
 segment jsonb; ignored integer; consumed integer; case_row record; freeze_value bigint;
 sources jsonb:='[]'::jsonb; pending bigint:=0; available bigint:=0;
BEGIN
 SELECT * INTO STRICT a FROM mixed_commerce_allocations WHERE id=aid;
 gross:=CASE WHEN a.kind='delivery' THEN (a.snapshot->>'vendor')::bigint ELSE (a.snapshot->>'vendorEarningMinorUnits')::bigint END;
 gross:=gross+COALESCE((SELECT sum(vendor_minor_units) FROM mixed_additional_captures WHERE allocation_id=aid),0);
 SELECT COALESCE(sum(vendor_minor_units) FILTER(WHERE ledger_id IS NOT NULL),0),
 COALESCE(sum(vendor_minor_units) FILTER(WHERE ledger_id IS NULL),0),COALESCE(sum(quantity) FILTER(WHERE additional_capture_id IS NULL),0)
 INTO refunded,refund_pending,unit_offset FROM mixed_refund_funding WHERE allocation_id=aid;
 remaining:=gross-refunded-refund_pending;
 IF remaining<0 THEN RAISE EXCEPTION 'Earning refunds exceed original funding'; END IF;
 IF a.kind='booking' THEN
  SELECT * INTO STRICT b FROM bookings WHERE id=a.booking_id;
  SELECT * INTO att FROM booking_attendance WHERE booking_id=b.id;
  IF b.state IN ('completed','no_show_final') AND att.contested_at IS NULL THEN eligible:=att.earning_available_at; END IF;
  -- Retained cancellation consideration has no attendance. Keep it pending until
  -- the original service end and snapshotted contest delay (conservative local rule).
  IF b.state='cancelled' THEN eligible:=((COALESCE(b.current_snapshot,b.snapshot)->>'end')::timestamptz)
   +make_interval(hours=>(COALESCE(b.current_snapshot,b.snapshot)#>>'{policy,contestHours}')::integer); END IF;
  IF b.state='contested' OR att.contested_at IS NOT NULL THEN
   frozen:=remaining;
   IF frozen>0 THEN sources:=jsonb_build_array(jsonb_build_object('kind','booking_contest','sourceId',att.id,'minorUnits',frozen)); END IF;
  END IF;
 ELSE
  IF a.kind='goods' THEN
   SELECT COALESCE(ph.handed_off_at,dh.handed_off_at),(l.snapshot#>>'{policy,changeOfMindDays}')::integer
   INTO handed,days FROM goods_order_lines l JOIN goods_fulfillments f ON f.order_id=l.order_id
   LEFT JOIN goods_pickup_handoffs ph ON ph.fulfillment_id=f.id
   LEFT JOIN goods_delivery_progress dp ON dp.fulfillment_id=f.id LEFT JOIN goods_delivery_handoffs dh ON dh.progress_id=dp.id
   WHERE l.id=a.goods_order_line_id;
   FOR case_row IN SELECT * FROM goods_return_cases WHERE order_line_id=a.goods_order_line_id
    AND state NOT IN ('declined','resolved_no_refund','refund_pending') ORDER BY created_at,id LOOP
    units:=case_row.quantity; freeze_value:=0;
    -- Reserve still-unrefunded original units in the same stable sequence as refunds.
    FOR segment IN SELECT value FROM jsonb_array_elements(a.snapshot->'unitSegments') LOOP
     ignored:=LEAST(unit_offset,(segment->>'quantity')::integer); unit_offset:=unit_offset-ignored;
     consumed:=LEAST(units,(segment->>'quantity')::integer-ignored); units:=units-consumed;
     freeze_value:=freeze_value+consumed*(segment->>'vendorEarningUnitMinorUnits')::bigint;
    END LOOP;
    IF units<>0 THEN RAISE EXCEPTION 'Earning freeze exceeds unclaimed quantity'; END IF;
    -- Next active case reserves the next slice, independent of case UUID ordering.
    unit_offset:=COALESCE((SELECT sum(quantity) FROM mixed_refund_funding WHERE allocation_id=aid),0)
     +COALESCE((SELECT sum(quantity) FROM goods_return_cases WHERE order_line_id=a.goods_order_line_id
       AND state NOT IN ('declined','resolved_no_refund','refund_pending') AND (created_at,id)<=(case_row.created_at,case_row.id)),0);
    frozen:=frozen+freeze_value;
    sources:=sources||jsonb_build_array(jsonb_build_object('kind','goods_return','sourceId',case_row.id,'minorUnits',freeze_value));
   END LOOP;
  ELSE
   -- Delivery consideration follows successful handoff and the longest line window.
   SELECT COALESCE(ph.handed_off_at,dh.handed_off_at),max((l.snapshot#>>'{policy,changeOfMindDays}')::integer)
   INTO handed,days FROM mixed_commerce_allocations ga JOIN goods_order_lines l ON l.id=ga.goods_order_line_id
   JOIN goods_fulfillments f ON f.order_id=l.order_id LEFT JOIN goods_pickup_handoffs ph ON ph.fulfillment_id=f.id
   LEFT JOIN goods_delivery_progress dp ON dp.fulfillment_id=f.id LEFT JOIN goods_delivery_handoffs dh ON dh.progress_id=dp.id
   WHERE ga.purchase_id=a.purchase_id AND ga.component_id=a.component_id AND ga.kind='goods'
   GROUP BY ph.handed_off_at,dh.handed_off_at;
  END IF;
  IF handed IS NOT NULL AND days IN (7,14) THEN eligible:=handed+make_interval(days=>days); END IF;
 END IF;
 IF frozen>remaining THEN RAISE EXCEPTION 'Earning freeze exceeds remaining funding'; END IF;
 IF eligible IS NOT NULL AND eligible<=at_time THEN available:=remaining-frozen; ELSE pending:=remaining-frozen; END IF;
 RETURN jsonb_build_object('gross',gross,'pending',pending,'available',available,'frozen',frozen,
 'refundPending',refund_pending,'refunded',refunded,'eligibleAt',eligible,'freezes',sources);
END; $$;

CREATE FUNCTION validate_earning_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior earning_revisions%ROWTYPE;
BEGIN
 -- Lock before reading the revision chain and authority: concurrent worker/refund/case
 -- writers use the same commerce lock, including raw revision inserts.
 PERFORM pg_advisory_xact_lock(hashtextextended('junction:goods-checkout',0));
 SELECT * INTO prior FROM earning_revisions WHERE allocation_id=NEW.allocation_id ORDER BY version DESC LIMIT 1;
 IF NEW.version<>COALESCE(prior.version,0)+1 OR (prior.id IS NOT NULL AND NEW.observed_at<prior.observed_at)
 OR NEW.snapshot IS DISTINCT FROM earning_expected(NEW.allocation_id,NEW.observed_at)
 OR (prior.id IS NOT NULL AND prior.snapshot=NEW.snapshot) THEN
  RAISE EXCEPTION 'Earning revision must match authoritative funding, cases and policy deadline';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER earning_revision_validate BEFORE INSERT ON earning_revisions FOR EACH ROW EXECUTE FUNCTION validate_earning_revision();
CREATE TRIGGER earning_revision_immutable BEFORE UPDATE OR DELETE ON earning_revisions FOR EACH ROW EXECUTE FUNCTION preserve_mixed_commercial_history();
CREATE TRIGGER earning_revision_no_truncate BEFORE TRUNCATE ON earning_revisions FOR EACH STATEMENT EXECUTE FUNCTION preserve_mixed_commercial_history();
