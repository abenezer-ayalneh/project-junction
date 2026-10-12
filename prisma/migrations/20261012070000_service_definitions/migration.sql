-- Additive service-definition seam; legacy Service listings remain unconfigured.
ALTER TABLE listings ADD COLUMN service_configuration jsonb,
  ADD COLUMN service_configuration_version integer NOT NULL DEFAULT 0;
ALTER TABLE listings ADD CONSTRAINT listings_service_configuration_check CHECK (
  service_configuration_version >= 0 AND
  (service_configuration IS NULL OR (kind = 'service' AND jsonb_typeof(service_configuration) = 'object'))
);
ALTER TABLE staff_members ADD COLUMN display_name text,
  ADD COLUMN profile_version integer NOT NULL DEFAULT 0,
  ADD COLUMN public_consent_at timestamptz;
ALTER TABLE staff_members ADD CONSTRAINT staff_profile_check CHECK (
  profile_version >= 0 AND (display_name IS NULL OR length(display_name) BETWEEN 2 AND 120)
  AND (public_consent_at IS NULL OR (user_id IS NOT NULL AND display_name IS NOT NULL))
);
