-- =============================================================================
-- Migration 42: Projection Applied Events Registry (Idempotency Guard)
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Guarantees exactly-once effect for projection worker execution. Even if a
--   worker retries a job multiple times after a crash, each event mutation is
--   applied to inventory_position exactly once.
-- =============================================================================

CREATE TABLE IF NOT EXISTS projection_applied_events (
    event_id            UUID NOT NULL REFERENCES inventory_events(id) ON DELETE CASCADE,
    projection_name     VARCHAR(100) NOT NULL DEFAULT 'inventory_position',
    applied_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    projection_version  BIGINT NOT NULL,

    PRIMARY KEY (event_id, projection_name)
);

CREATE INDEX IF NOT EXISTS idx_applied_events_lookup
    ON projection_applied_events(event_id, projection_name);

ALTER TABLE projection_applied_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_applied_events ON projection_applied_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);
