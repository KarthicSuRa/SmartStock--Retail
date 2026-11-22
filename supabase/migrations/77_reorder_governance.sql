-- Governance columns for the planning engine: every recommendation records
-- the inputs, model version, data quality and confidence that produced it, and
-- auto-release is opt-in rather than implicit.

ALTER TABLE reorder_alerts
    ADD COLUMN IF NOT EXISTS forecast_explanation JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS model_version TEXT,
    ADD COLUMN IF NOT EXISTS confidence_score INTEGER,
    ADD COLUMN IF NOT EXISTS data_quality JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
    ADD COLUMN IF NOT EXISTS inbound_qty DECIMAL(12,3) DEFAULT 0;

ALTER TABLE reorder_config
    ADD COLUMN IF NOT EXISTS min_confidence_score INTEGER DEFAULT 70,
    ADD COLUMN IF NOT EXISTS auto_release_critical BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN reorder_alerts.forecast_explanation IS
    'Inputs, multipliers, safety-stock formula and feature values behind the recommendation.';
COMMENT ON COLUMN reorder_alerts.data_quality IS
    'Per-signal status (APPLIED/NONE/UNAVAILABLE/STALE/DISABLED) for weather, holiday and promotion.';
COMMENT ON COLUMN reorder_config.auto_release_critical IS
    'Opt-in: when false, critical alerts are still staged for human approval.';
