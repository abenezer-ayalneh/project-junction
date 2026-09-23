-- The local fake receiver commits independently from worker outbox acknowledgement.
-- A stable event identity prevents a retry after an acknowledgement crash from
-- applying the same synthetic external effect twice.
CREATE TABLE "synthetic_external_effects" (
  "idempotency_key" TEXT NOT NULL PRIMARY KEY,
  "event_id" UUID NOT NULL UNIQUE,
  "workspace_id" UUID NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "delivered_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "synthetic_external_effects_workspace_id_delivered_at_idx"
  ON "synthetic_external_effects" ("workspace_id", "delivered_at");
