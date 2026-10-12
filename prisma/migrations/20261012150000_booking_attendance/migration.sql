-- CreateTable
CREATE TABLE "booking_attendance" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "booking_id" UUID NOT NULL,
    "booking_version" INTEGER NOT NULL,
    "proof_nonce" TEXT,
    "proof_expires_at" TIMESTAMPTZ(6),
    "proof_attempts" INTEGER NOT NULL DEFAULT 0,
    "joined_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "no_show_reported_at" TIMESTAMPTZ(6),
    "no_show_final_at" TIMESTAMPTZ(6),
    "staff_actor_id" UUID,
    "no_show_evidence" JSONB,
    "contest_until" TIMESTAMPTZ(6),
    "contested_at" TIMESTAMPTZ(6),
    "contest_reason" TEXT,
    "earning_available_at" TIMESTAMPTZ(6),

    CONSTRAINT "booking_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_attendance_booking_id_key" ON "booking_attendance"("booking_id");

-- CreateIndex
CREATE INDEX "booking_attendance_contest_until_no_show_final_at_idx" ON "booking_attendance"("contest_until", "no_show_final_at");

-- AddForeignKey
ALTER TABLE "booking_attendance" ADD CONSTRAINT "booking_attendance_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE booking_attendance ADD CONSTRAINT booking_proof_attempts CHECK(proof_attempts BETWEEN 0 AND 5);
ALTER TABLE booking_attendance ADD CONSTRAINT booking_attendance_outcome CHECK(NOT (completed_at IS NOT NULL AND no_show_reported_at IS NOT NULL));
ALTER TABLE booking_attendance ADD CONSTRAINT booking_contested_earning CHECK(contested_at IS NULL OR earning_available_at IS NULL);
CREATE FUNCTION preserve_booking_attendance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Booking attendance history is immutable'; END IF;
 IF NEW.id<>OLD.id OR NEW.booking_id<>OLD.booking_id THEN RAISE EXCEPTION 'Attendance identity is immutable'; END IF;
 IF OLD.completed_at IS NOT NULL AND (NEW.completed_at IS DISTINCT FROM OLD.completed_at OR NEW.staff_actor_id IS DISTINCT FROM OLD.staff_actor_id) THEN RAISE EXCEPTION 'Completion evidence is immutable'; END IF;
 IF OLD.no_show_reported_at IS NOT NULL AND (NEW.no_show_reported_at IS DISTINCT FROM OLD.no_show_reported_at OR NEW.no_show_evidence IS DISTINCT FROM OLD.no_show_evidence OR NEW.staff_actor_id IS DISTINCT FROM OLD.staff_actor_id) THEN RAISE EXCEPTION 'No-show evidence is immutable'; END IF;
 IF OLD.contested_at IS NOT NULL AND (NEW.contested_at IS DISTINCT FROM OLD.contested_at OR NEW.contest_reason IS DISTINCT FROM OLD.contest_reason OR NEW.earning_available_at IS NOT NULL) THEN RAISE EXCEPTION 'Contest evidence is immutable'; END IF;
 IF OLD.no_show_final_at IS NOT NULL AND NEW.no_show_final_at IS DISTINCT FROM OLD.no_show_final_at THEN RAISE EXCEPTION 'Final no-show evidence is immutable'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER booking_attendance_immutable BEFORE UPDATE OR DELETE ON booking_attendance
FOR EACH ROW EXECUTE FUNCTION preserve_booking_attendance();
