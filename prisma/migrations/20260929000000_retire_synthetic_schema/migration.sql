-- Retire the former local/demo runtime at the persistence boundary.
-- This migration deliberately fails if active non-real records remain.
DROP VIEW IF EXISTS "DemoWorkspace";

ALTER TABLE "sessions" DROP COLUMN IF EXISTS "demo_persona_id";
DROP TABLE IF EXISTS "demo_workspaces";
DROP TABLE IF EXISTS "demo_personas";
DROP TABLE IF EXISTS "synthetic_external_effects";

ALTER TABLE "sessions" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "workspaces"
  ADD CONSTRAINT "workspaces_kind_real_check" CHECK ("kind" = 'real') NOT VALID;
ALTER TABLE "workspaces" VALIDATE CONSTRAINT "workspaces_kind_real_check";
ALTER TABLE "workspaces" ALTER COLUMN "kind" SET DEFAULT 'real';

ALTER TABLE "users"
  ADD CONSTRAINT "users_adult_verification_state_real_check"
  CHECK ("adult_verification_state" IN ('unverified', 'pending', 'verified', 'rejected')) NOT VALID;
ALTER TABLE "users" VALIDATE CONSTRAINT "users_adult_verification_state_real_check";

ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_actor_kind_check";
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_actor_kind_user_check" CHECK ("actor_kind" = 'user') NOT VALID;
ALTER TABLE "inventory_movements" VALIDATE CONSTRAINT "inventory_movements_actor_kind_user_check";
