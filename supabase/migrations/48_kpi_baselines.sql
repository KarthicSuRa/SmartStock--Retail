-- =============================================================================
-- Migration 48: Pilot KPI Engine & Baseline Tracker
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Tracks pre-pilot baseline metrics against post-deployment operational gains
--   (inventory accuracy %, stockout hours, resolution velocity, waste reduction).
-- =============================================================================

CREATE TABLE IF NOT EXISTS pilot_kpi_baselines (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    metric_name         VARCHAR(100) NOT NULL,
    unit                VARCHAR(20) NOT NULL,

    baseline_value      NUMERIC(14, 2) NOT NULL,
    current_value       NUMERIC(14, 2) NOT NULL,
    target_value        NUMERIC(14, 2) NOT NULL,

    improvement_pct     NUMERIC(8, 2) GENERATED ALWAYS AS (
        CASE
            WHEN baseline_value = 0 THEN 0
            ELSE ((current_value - baseline_value) / ABS(baseline_value)) * 100
        END
    ) STORED,

    updated_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE pilot_kpi_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_kpis ON pilot_kpi_baselines FOR ALL USING (true);
