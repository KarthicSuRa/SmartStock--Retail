-- =============================================================================
-- Migration 50: Timestamp Quality & Clock-Skew Quarantine System
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Replaces hard clock-skew rejection with a 5-tier classification and
--   quarantine pipeline. Events with clock anomalies are safely persisted and
--   flagged for operational review without dropping legitimate retail sales.
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'timestamp_quality') THEN
        CREATE TYPE timestamp_quality AS ENUM (
            'NORMAL',              -- within +- 5 min
            'SUSPICIOUS_FUTURE',   -- 5m to 24h in future (persisted & projected)
            'SUSPICIOUS_PAST',     -- > 7d in past but < 30d (persisted & projected)
            'EXTREME_FUTURE',      -- > 24h in future (persisted, quarantined)
            'EXTREME_PAST'         -- > 30d in past (persisted, quarantined)
        );
    END IF;
END $$;

ALTER TABLE inventory_events
ADD COLUMN IF NOT EXISTS timestamp_quality timestamp_quality DEFAULT 'NORMAL',
ADD COLUMN IF NOT EXISTS clock_offset_ms BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS quarantined BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS quarantined_reason TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS quarantine_released_by UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS quarantine_released_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_events_quarantined
    ON inventory_events(tenant_id, quarantined)
    WHERE quarantined = TRUE;

COMMENT ON COLUMN inventory_events.timestamp_quality IS
  'Classification of event clock skew relative to SmartStock ingestion timestamp.';
