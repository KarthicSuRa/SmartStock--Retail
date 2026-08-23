-- =============================================================================
-- Migration 67: Model Registry & Governance Schema
-- SmartStock Decision Intelligence V1
--
-- PURPOSE:
--   Tracks lifecycle of all predictive models (Champion, Challenger, Shadow,
--   Deprecated) and prevents unapproved model inference in production.
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics.model_registry (
    model_id                VARCHAR(100) NOT NULL,
    model_version           VARCHAR(30) NOT NULL,
    decision_type           VARCHAR(50) NOT NULL, -- FORECAST, STOCKOUT_RISK, COUNT_PRIORITY, REPLENISHMENT_SOLVER, ANOMALY_DETECTION
    algorithm               VARCHAR(50) NOT NULL, -- PROPHET, SEASONAL_NAIVE, LIGHTGBM, ISOLATION_FOREST, OR_SOLVER
    
    status                  VARCHAR(30) DEFAULT 'EXPERIMENT' NOT NULL, -- EXPERIMENT, SHADOW, CHALLENGER, CHAMPION, DEPRECATED, RETIRED
    training_window_start   TIMESTAMPTZ,
    training_window_end     TIMESTAMPTZ,
    
    benchmark_metrics       JSONB NOT NULL, -- {"wape": 0.142, "bias": -0.021, "pr_auc": 0.89}
    feature_schema_version  INTEGER DEFAULT 1 NOT NULL,
    
    artifact_uri            VARCHAR(255),
    created_at              TIMESTAMPTZ DEFAULT clock_timestamp() NOT NULL,
    promoted_at             TIMESTAMPTZ,
    
    PRIMARY KEY(model_id, model_version)
);

-- Seed initial models
INSERT INTO analytics.model_registry
    (model_id, model_version, decision_type, algorithm, status, benchmark_metrics, feature_schema_version)
VALUES
    ('demand_forecaster', 'prophet_v2', 'FORECAST', 'PROPHET', 'CHAMPION', '{"wape": 0.142, "bias": -0.021}', 1),
    ('demand_forecaster', 'seasonal_naive_v1', 'FORECAST', 'SEASONAL_NAIVE', 'CHALLENGER', '{"wape": 0.168, "bias": 0.005}', 1),
    ('stockout_risk_scorer', 'logistic_hazard_v1', 'STOCKOUT_RISK', 'LIGHTGBM', 'CHAMPION', '{"pr_auc": 0.912, "brier_score": 0.045}', 1),
    ('replenishment_optimizer', 'mixed_integer_v1', 'REPLENISHMENT_SOLVER', 'OR_SOLVER', 'CHAMPION', '{"optimality_gap": 0.001}', 1),
    ('count_prioritizer', 'evsi_v1', 'COUNT_PRIORITY', 'OR_SOLVER', 'CHAMPION', '{"evsi_gain_pct": 24.5}', 1)
ON CONFLICT (model_id, model_version) DO NOTHING;
