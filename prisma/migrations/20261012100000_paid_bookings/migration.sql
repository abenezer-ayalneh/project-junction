-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "booking_policy" TEXT NOT NULL DEFAULT 'standard';

-- CreateTable
CREATE TABLE "booking_payments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "hold_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'processing',
    "attendee" JSONB,
    "policy_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_payment_receipts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "payment_id" UUID NOT NULL,
    "outcome" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "booking_payment_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "hold_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "allocation_id" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'confirmed',
    "version" INTEGER NOT NULL DEFAULT 1,
    "confirmed_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_refunds" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "payment_id" UUID NOT NULL,
    "semantic_key" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "reference" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_payments_hold_id_key" ON "booking_payments"("hold_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_payment_receipts_payment_id_key" ON "booking_payment_receipts"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_hold_id_key" ON "bookings"("hold_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_payment_id_key" ON "bookings"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_allocation_id_key" ON "bookings"("allocation_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_refunds_semantic_key_key" ON "booking_refunds"("semantic_key");

-- AddForeignKey
ALTER TABLE "booking_payments" ADD CONSTRAINT "booking_payments_hold_id_fkey" FOREIGN KEY ("hold_id") REFERENCES "booking_holds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "booking_payment_receipts" ADD CONSTRAINT "booking_payment_receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "booking_payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_hold_id_fkey" FOREIGN KEY ("hold_id") REFERENCES "booking_holds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "booking_payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "staff_allocations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "booking_refunds" ADD CONSTRAINT "booking_refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "booking_payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE listings ADD CONSTRAINT listing_booking_policy CHECK (booking_policy IN ('flexible','standard'));
ALTER TABLE booking_payments ADD CONSTRAINT booking_payment_amount CHECK (amount_cents > 0);
ALTER TABLE booking_payments ADD CONSTRAINT booking_payment_state CHECK (state IN ('processing','unknown','failed','succeeded','refund_pending','refunded'));
ALTER TABLE booking_payment_receipts ADD CONSTRAINT booking_receipt_outcome CHECK (outcome IN ('succeeded','failed'));
ALTER TABLE booking_refunds ADD CONSTRAINT booking_refund_amount CHECK (amount_cents > 0);
ALTER TABLE booking_refunds ADD CONSTRAINT booking_refund_state CHECK (state IN ('pending','succeeded'));
CREATE FUNCTION preserve_booking_purchase() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Booking purchase history is immutable'; END IF;
  IF NEW.id <> OLD.id OR NEW.hold_id <> OLD.hold_id OR NEW.payment_id <> OLD.payment_id
     OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.confirmed_at <> OLD.confirmed_at THEN
    RAISE EXCEPTION 'Booking purchase terms are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER booking_purchase_immutable BEFORE UPDATE OR DELETE ON bookings
FOR EACH ROW EXECUTE FUNCTION preserve_booking_purchase();
CREATE FUNCTION preserve_booking_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Booking payment receipt is immutable'; END;
$$;
CREATE TRIGGER booking_receipt_immutable BEFORE UPDATE OR DELETE ON booking_payment_receipts
FOR EACH ROW EXECUTE FUNCTION preserve_booking_receipt();
CREATE FUNCTION preserve_booking_payment_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Booking payment history is immutable'; END IF;
  IF NEW.id <> OLD.id OR NEW.hold_id <> OLD.hold_id OR NEW.amount_cents <> OLD.amount_cents
     OR NEW.attendee IS DISTINCT FROM OLD.attendee OR NEW.policy_snapshot IS DISTINCT FROM OLD.policy_snapshot
     OR NEW.created_at <> OLD.created_at THEN RAISE EXCEPTION 'Booking payment terms are immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER booking_payment_terms_immutable BEFORE UPDATE OR DELETE ON booking_payments
FOR EACH ROW EXECUTE FUNCTION preserve_booking_payment_terms();
