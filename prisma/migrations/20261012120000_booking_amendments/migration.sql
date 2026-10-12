-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "current_snapshot" JSONB,
ADD COLUMN     "customer_amendments" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "booking_amendments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "booking_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_kind" TEXT NOT NULL,
    "previous_snapshot" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "delta_cents" INTEGER NOT NULL,
    "payment_reference" TEXT,
    "amended_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "booking_amendments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_amendments_payment_reference_key" ON "booking_amendments"("payment_reference");

-- CreateIndex
CREATE UNIQUE INDEX "booking_amendments_booking_id_version_key" ON "booking_amendments"("booking_id", "version");

-- AddForeignKey
ALTER TABLE "booking_amendments" ADD CONSTRAINT "booking_amendments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE bookings ADD CONSTRAINT booking_amendment_count CHECK(customer_amendments >= 0);
CREATE TRIGGER booking_amendment_immutable BEFORE UPDATE OR DELETE ON booking_amendments
FOR EACH ROW EXECUTE FUNCTION preserve_booking_receipt();
