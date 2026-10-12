-- CreateTable
CREATE TABLE "booking_substitutions" (
    "decision_due_at" TIMESTAMPTZ(6) NOT NULL,
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "booking_id" UUID NOT NULL,
    "replacement_staff_id" UUID NOT NULL,
    "expected_booking_version" INTEGER NOT NULL,
    "actor_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "decided_at" TIMESTAMPTZ(6),

    CONSTRAINT "booking_substitutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_waitlists" (
    "checked_at" TIMESTAMPTZ(6),
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "customer_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "selection" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'waiting',
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "notified_at" TIMESTAMPTZ(6),

    CONSTRAINT "booking_waitlists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_substitutions_booking_id_state_idx" ON "booking_substitutions"("booking_id", "state");

-- CreateIndex
CREATE INDEX "booking_substitutions_state_decision_due_at_idx" ON "booking_substitutions"("state", "decision_due_at");

-- CreateIndex
CREATE INDEX "booking_waitlists_state_created_at_idx" ON "booking_waitlists"("state", "created_at");

-- AddForeignKey
ALTER TABLE "booking_substitutions" ADD CONSTRAINT "booking_substitutions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "booking_substitutions" ADD CONSTRAINT "booking_substitutions_replacement_staff_id_fkey" FOREIGN KEY ("replacement_staff_id") REFERENCES "staff_members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "booking_waitlists" ADD CONSTRAINT "booking_waitlists_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "booking_waitlists" ADD CONSTRAINT "booking_waitlists_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE booking_substitutions ADD CONSTRAINT booking_substitution_state CHECK(state IN ('pending','accepted','declined','withdrawn'));
ALTER TABLE booking_waitlists ADD CONSTRAINT booking_waitlist_state CHECK(state IN ('waiting','notified','removed'));
CREATE UNIQUE INDEX booking_one_pending_substitution ON booking_substitutions(booking_id) WHERE state='pending';
CREATE FUNCTION preserve_booking_waitlist() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Waitlist history is immutable'; END IF;
 IF NEW.id <> OLD.id OR NEW.customer_id <> OLD.customer_id OR NEW.workspace_id <> OLD.workspace_id
 OR NEW.listing_id <> OLD.listing_id OR NEW.selection IS DISTINCT FROM OLD.selection OR NEW.created_at <> OLD.created_at
 THEN RAISE EXCEPTION 'Waitlist selection is immutable'; END IF;
 IF OLD.state='removed' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Removed waitlist is terminal'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER booking_waitlist_immutable BEFORE UPDATE OR DELETE ON booking_waitlists
FOR EACH ROW EXECUTE FUNCTION preserve_booking_waitlist();
