-- =============================================================================
-- Migration 54: Dynamic Confidence Scoring Weights Configuration
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Enables enterprise administrators to fine-tune signal penalty weights
--   based on empirical calibration observations.
-- =============================================================================

CREATE TABLE IF NOT EXISTS confidence_weight_config (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    factor_name     VARCHAR(100) NOT NULL,
    penalty_weight  NUMERIC(6, 2) NOT NULL,
    description     TEXT,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    UNIQUE(tenant_id, factor_name)
);

ALTER TABLE confidence_weight_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_weight_cfg ON confidence_weight_config FOR ALL TO service_role USING (true) WITH CHECK (true);
