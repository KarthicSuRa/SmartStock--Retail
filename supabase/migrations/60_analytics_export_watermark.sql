-- =============================================================================
-- Migration 60: Analytics Export Watermark & CDC State
-- SmartStock Intelligence & Analytics V1
--
-- PURPOSE:
--   Tracks incremental change-data-capture watermarks for exporting operational
--   events, cases, reconciliation runs, and count outcomes into the analytical plane.
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics.analytics_export_watermark (
    entity_name                 VARCHAR(100) PRIMARY KEY, -- inventory_events, operational_cases, reconciliation_records, count_tasks
    tenant_id                   UUID NOT NULL,
    last_processed_id           VARCHAR(100),
    last_processed_timestamp    TIMESTAMPTZ NOT NULL,
    records_exported_total      BIGINT DEFAULT 0 NOT NULL,
    last_batch_duration_ms      INTEGER DEFAULT 0 NOT NULL,
    updated_at                  TIMESTAMPTZ DEFAULT clock_timestamp() NOT NULL
);

-- Seed default watermarks
INSERT INTO analytics.analytics_export_watermark (entity_name, tenant_id, last_processed_timestamp)
VALUES 
    ('inventory_events', '00000000-0000-0000-0000-000000000000', '1970-01-01 00:00:00+00'),
    ('operational_cases', '00000000-0000-0000-0000-000000000000', '1970-01-01 00:00:00+00'),
    ('reconciliation_records', '00000000-0000-0000-0000-000000000000', '1970-01-01 00:00:00+00'),
    ('pos_telemetry', '00000000-0000-0000-0000-000000000000', '1970-01-01 00:00:00+00')
ON CONFLICT (entity_name) DO NOTHING;
