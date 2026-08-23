-- =============================================================================
-- Migration 46: Confidence Calibration & Variance Tracking
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Logs historical confidence scores alongside subsequent physical count
--   observations to calibrate confidence scoring weights and validate predictive
--   power against empirical inventory error.
-- =============================================================================

CREATE TABLE IF NOT EXISTS confidence_calibration_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    location_id         UUID NOT NULL,
    material_id         UUID NOT NULL,
    sku                 VARCHAR(50),

    recorded_at         TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    confidence_score    NUMERIC(5, 2) NOT NULL,
    confidence_factors  JSONB NOT NULL,

    -- Populated when a verified physical count occurs after this record
    count_performed_at  TIMESTAMPTZ,
    count_variance_units NUMERIC(15, 4),
    count_variance_pct   NUMERIC(8, 4)
);

CREATE INDEX IF NOT EXISTS idx_confidence_calibration
    ON confidence_calibration_log(tenant_id, location_id, recorded_at DESC);

ALTER TABLE confidence_calibration_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_calibration ON confidence_calibration_log FOR ALL TO service_role USING (true) WITH CHECK (true);
