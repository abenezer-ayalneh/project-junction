-- AlterTable
ALTER TABLE "booking_cancellations" ALTER COLUMN "actor_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "staff_meet_connections" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "staff_id" UUID NOT NULL,
    "private_reference" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "staff_meet_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_meetings" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "booking_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "booking_version" INTEGER NOT NULL,
    "operation_key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "connection_reference" TEXT,
    "connection_version" INTEGER,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "retry_at" TIMESTAMPTZ(6),
    "lease_until" TIMESTAMPTZ(6),
    "safety_cutoff_at" TIMESTAMPTZ(6) NOT NULL,
    "uri" TEXT,
    "provider_reference" TEXT,
    "last_error" TEXT,
    "manual_replacement" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "booking_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_meet_connections_staff_id_key" ON "staff_meet_connections"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_meet_connections_private_reference_key" ON "staff_meet_connections"("private_reference");

-- CreateIndex
CREATE UNIQUE INDEX "booking_meetings_booking_id_key" ON "booking_meetings"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_meetings_operation_key_key" ON "booking_meetings"("operation_key");

-- CreateIndex
CREATE INDEX "booking_meetings_state_retry_at_idx" ON "booking_meetings"("state", "retry_at");

-- AddForeignKey
ALTER TABLE "staff_meet_connections" ADD CONSTRAINT "staff_meet_connections_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "booking_meetings" ADD CONSTRAINT "booking_meetings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "booking_meetings" ADD CONSTRAINT "booking_meetings_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE booking_cancellations DROP CONSTRAINT booking_cancellation_actor;
ALTER TABLE booking_cancellations ADD CONSTRAINT booking_cancellation_actor CHECK(actor_kind IN ('customer','vendor','platform'));
ALTER TABLE booking_meetings ADD CONSTRAINT booking_meeting_state CHECK(state IN ('pending','provisioning','retry_scheduled','replacement_required','ready','booking_cancelled'));
ALTER TABLE booking_meetings ADD CONSTRAINT booking_meeting_provider CHECK(provider IN ('demo_meet','controlled_google_meet'));
ALTER TABLE booking_meetings ADD CONSTRAINT booking_meeting_attempts CHECK(attempts >= 0);
