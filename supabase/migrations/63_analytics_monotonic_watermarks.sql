-- =============================================================================
-- Migration 63: Monotonic Sequence Watermarks & CDC Hardening
-- SmartStock Intelligence RC1
--
-- PURPOSE:
--   Hardens incremental export pipeline by tracking monotonically increasing
--   BIGINT sequence IDs rather than vulnerable timestamp-only cursors.
-- =============================================================================

-- Add export_sequence column to analytics_export_watermark
ALTER TABLE analytics.analytics_export_watermark
    ADD COLUMN IF NOT EXISTS last_processed_sequence BIGINT DEFAULT 0 NOT NULL;

-- ---------------------------------------------------------------------------
-- Function: Retrieve and advance export watermark atomically
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics.advance_export_watermark_v1(
    p_entity_name VARCHAR(100),
    p_last_sequence BIGINT,
    p_last_timestamp TIMESTAMPTZ,
    p_records_count INTEGER,
    p_duration_ms INTEGER
)
RETURNS VOID AS $$
BEGIN
    UPDATE analytics.analytics_export_watermark
    SET
        last_processed_sequence = GREATEST(last_processed_sequence, p_last_sequence),
        last_processed_timestamp = GREATEST(last_processed_timestamp, p_last_timestamp),
        records_exported_total = records_exported_total + p_records_count,
        last_batch_duration_ms = p_duration_ms,
        updated_at = clock_timestamp()
    WHERE entity_name = p_entity_name;
END;
$$ LANGUAGE plpgsql;
