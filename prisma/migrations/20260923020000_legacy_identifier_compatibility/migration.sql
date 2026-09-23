-- Temporary compatibility views for the compiled Phase 00 client before the snake_case rename.
-- Each view is a direct single-table projection so PostgreSQL can route legacy writes
-- to the same canonical rows. Keep these until the rollback window is retired.

CREATE VIEW "User" AS
SELECT
  "id" AS "id",
  "email" AS "email",
  "verified_at" AS "verifiedAt",
  "created_at" AS "createdAt"
FROM "users";

CREATE VIEW "Workspace" AS
SELECT
  "id" AS "id",
  "kind" AS "kind",
  "created_at" AS "createdAt"
FROM "workspaces";

CREATE VIEW "Session" AS
SELECT
  "id" AS "id",
  "user_id" AS "userId",
  "workspace_id" AS "workspaceId",
  "expires_at" AS "expiresAt",
  "revoked_at" AS "revokedAt",
  "mfa_verified_at" AS "mfaVerifiedAt",
  "recent_auth_at" AS "recentAuthAt",
  "active_vendor_id" AS "activeVendorId",
  "active_role" AS "activeRole",
  "created_at" AS "createdAt"
FROM "sessions";

CREATE VIEW "Vendor" AS
SELECT
  "id" AS "id",
  "workspace_id" AS "workspaceId",
  "created_at" AS "createdAt"
FROM "vendors";

CREATE VIEW "Location" AS
SELECT
  "id" AS "id",
  "vendor_id" AS "vendorId"
FROM "locations";

CREATE VIEW "VendorMembership" AS
SELECT
  "id" AS "id",
  "user_id" AS "userId",
  "vendor_id" AS "vendorId",
  "role" AS "role",
  "location_ids" AS "locationIds",
  "revoked_at" AS "revokedAt"
FROM "vendor_memberships";

CREATE VIEW "IdempotencyRecord" AS
SELECT
  "id" AS "id",
  "key" AS "key",
  "scope_hash" AS "scopeHash",
  "method" AS "method",
  "workspace_id" AS "workspaceId",
  "request_hash" AS "requestHash",
  "outcome" AS "outcome",
  "created_at" AS "createdAt",
  "expires_at" AS "expiresAt"
FROM "idempotency_records";

CREATE VIEW "OutboxEvent" AS
SELECT
  "id" AS "id",
  "event_id" AS "eventId",
  "workspace_id" AS "workspaceId",
  "type" AS "type",
  "payload" AS "payload",
  "state" AS "state",
  "attempts" AS "attempts",
  "claimed_by" AS "claimedBy",
  "claimed_at" AS "claimedAt",
  "claim_token" AS "claimToken",
  "available_at" AS "availableAt",
  "occurred_at" AS "occurredAt",
  "created_at" AS "createdAt"
FROM "outbox_events";

CREATE VIEW "ProviderInboxEvent" AS
SELECT
  "id" AS "id",
  "workspace_id" AS "workspaceId",
  "provider" AS "provider",
  "provider_event_id" AS "providerEventId",
  "payload_hash" AS "payloadHash",
  "payload" AS "payload",
  "received_at" AS "receivedAt",
  "processed_at" AS "processedAt"
FROM "provider_inbox_events";

CREATE VIEW "DemoWorkspace" AS
SELECT
  "id" AS "id",
  "workspace_id" AS "workspaceId",
  "expires_at" AS "expiresAt",
  "purged_at" AS "purgedAt",
  "created_at" AS "createdAt"
FROM "demo_workspaces";

CREATE VIEW "AuditLog" AS
SELECT
  "id" AS "id",
  "workspace_id" AS "workspaceId",
  "actor_id" AS "actorId",
  "action" AS "action",
  "correlation_id" AS "correlationId",
  "metadata" AS "metadata",
  "created_at" AS "createdAt"
FROM "audit_logs";

CREATE VIEW "OutboxReceipt" AS
SELECT
  "event_id" AS "eventId",
  "workspace_id" AS "workspaceId",
  "processed_at" AS "processedAt"
FROM "outbox_receipts";
