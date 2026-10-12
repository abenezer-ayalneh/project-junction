-- CreateTable
CREATE TABLE "booking_cancellations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "booking_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "refund_cents" INTEGER NOT NULL,
    "policy_snapshot" JSONB NOT NULL,
    "cancelled_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "booking_cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_cancellations_booking_id_key" ON "booking_cancellations"("booking_id");

-- AddForeignKey
ALTER TABLE "booking_cancellations" ADD CONSTRAINT "booking_cancellations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE booking_cancellations ADD CONSTRAINT booking_cancellation_amount CHECK(refund_cents >= 0);
ALTER TABLE booking_cancellations ADD CONSTRAINT booking_cancellation_actor CHECK(actor_kind IN ('customer','vendor'));
CREATE TRIGGER booking_cancellation_immutable BEFORE UPDATE OR DELETE ON booking_cancellations
FOR EACH ROW EXECUTE FUNCTION preserve_booking_receipt();
