-- =============================================================================
-- Migration 59: Analytical Insights Engine
-- SmartStock Intelligence & Analytics V1
--
-- PURPOSE:
--   Stores automated business insights generated from trend analysis, anomaly
--   detection, and network imbalance scans. Connects insights directly to
--   operational investigations.
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics.analytical_insights (
    insight_id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL,
    insight_type                VARCHAR(50) NOT NULL, -- STOCKOUT_TREND, RECURRING_DISCREPANCY, NETWORK_IMBALANCE, ANOMALY_DAMAGE, SUPPLIER_LEAD_TIME, WASTE_TREND
    scope_type                  VARCHAR(30) NOT NULL, -- STORE, REGION, PRODUCT, CATEGORY, NETWORK
    scope_id                    VARCHAR(100) NOT NULL,

    title                       VARCHAR(255) NOT NULL,
    metric_name                 VARCHAR(100) NOT NULL,
    current_value               NUMERIC(15, 4) NOT NULL,
    baseline_value              NUMERIC(15, 4) NOT NULL,
    change_pct                  NUMERIC(6, 2) NOT NULL,
    significance                VARCHAR(20) DEFAULT 'HIGH' NOT NULL, -- CRITICAL, HIGH, MEDIUM, LOW

    estimated_business_impact_eur NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    explanation                 TEXT NOT NULL,
    recommended_action          TEXT NOT NULL,
    action_route                VARCHAR(255), -- e.g. /actions?case_type=STOCKOUT_RISK&region=NL_WEST

    generated_at                TIMESTAMPTZ DEFAULT clock_timestamp() NOT NULL,
    expires_at                  TIMESTAMPTZ,
    status                      VARCHAR(30) DEFAULT 'ACTIVE' NOT NULL -- ACTIVE, INVESTIGATING, RESOLVED, DISMISSED
);

CREATE INDEX IF NOT EXISTS idx_insights_tenant_status ON analytics.analytical_insights(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_insights_scope ON analytics.analytical_insights(scope_type, scope_id);
