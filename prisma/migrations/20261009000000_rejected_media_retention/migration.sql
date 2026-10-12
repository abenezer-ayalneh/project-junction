ALTER TABLE media_assets
  ADD COLUMN rejected_at timestamptz(6),
  ADD COLUMN retention_due_at timestamptz(6),
  ADD COLUMN retention_policy text,
  ADD COLUMN retention_hold_reason text,
  ADD COLUMN retention_deleted_at timestamptz(6),
  ADD COLUMN retention_delete_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN retention_next_attempt_at timestamptz(6);

-- Historical evidence is preserved until a scoped reviewer explicitly releases it.
UPDATE media_assets SET
  rejected_at = COALESCE(moderated_at, processed_at, uploaded_at, created_at),
  retention_due_at = now() + interval '30 days',
  retention_policy = 'rejected-media-v1',
  retention_hold_reason = 'Legacy rejected media: preservation review required'
WHERE state = 'rejected';

CREATE INDEX media_assets_state_retention_due_at_retention_next_attempt_at_idx
  ON media_assets(state, retention_due_at, retention_next_attempt_at);
