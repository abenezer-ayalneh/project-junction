ALTER TABLE listings ADD COLUMN scheduling_rules jsonb,
  ADD COLUMN scheduling_rules_version integer NOT NULL DEFAULT 0;
ALTER TABLE listings ADD CONSTRAINT listings_scheduling_rules_check CHECK (
  scheduling_rules_version >= 0 AND (scheduling_rules IS NULL OR (kind = 'service' AND jsonb_typeof(scheduling_rules) = 'object'))
);
ALTER TABLE locations ADD COLUMN schedule_calendar jsonb, ADD COLUMN schedule_version integer NOT NULL DEFAULT 0;
ALTER TABLE locations ADD CONSTRAINT locations_schedule_check CHECK (schedule_version >= 0 AND (schedule_calendar IS NULL OR jsonb_typeof(schedule_calendar) = 'object'));
ALTER TABLE staff_members ADD COLUMN schedule jsonb, ADD COLUMN schedule_version integer NOT NULL DEFAULT 0;
ALTER TABLE staff_members ADD CONSTRAINT staff_schedule_check CHECK (schedule_version >= 0 AND (schedule IS NULL OR jsonb_typeof(schedule) = 'object'));
ALTER TABLE vendor_memberships ADD COLUMN scheduling_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE staff_allocations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  staff_id uuid NOT NULL REFERENCES staff_members(id),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('held', 'booked', 'released', 'expired', 'cancelled')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_allocation_interval_check CHECK (end_at > start_at),
  CONSTRAINT staff_allocation_expiry_check CHECK (state <> 'held' OR expires_at IS NOT NULL)
);
CREATE INDEX staff_allocations_staff_id_start_at_end_at_idx ON staff_allocations(staff_id, start_at, end_at);
