-- =============================================================================
-- Migration 51: Replay & Disaster Recovery Audit Log Schema
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Logs all admin-initiated projection rebuild and replay operations,
--   including before/after quantity deltas and event coverage.
-- =============================================================================

CREATE TABLE IF NOT EXISTS replay_audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requested_by    UUID NOT NULL,
    tenant_id       UUID NOT NULL,
    location_id     UUID NOT NULL,
    material_id     UUID NOT NULL,
    reason          TEXT NOT NULL,
    dry_run         BOOLEAN NOT NULL DEFAULT FALSE,
    before_position JSONB,
    after_position  JSONB,
    events_applied  INTEGER,
    requested_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE replay_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_replay_log ON replay_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
