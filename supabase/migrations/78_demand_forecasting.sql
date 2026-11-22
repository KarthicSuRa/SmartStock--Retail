-- Demand forecasting foundation: persisted forecasts, feature snapshots and
-- out-of-sample accuracy. No model is trusted until it has measured error.

CREATE TABLE IF NOT EXISTS demand_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES material_master(id) ON DELETE CASCADE,

    forecast_date DATE NOT NULL,
    horizon_days INTEGER NOT NULL CHECK (horizon_days > 0),
    model_version TEXT NOT NULL,

    p50_qty DECIMAL(12,3) NOT NULL CHECK (p50_qty >= 0),
    p90_qty DECIMAL(12,3) NOT NULL CHECK (p90_qty >= p50_qty),

    feature_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (tenant_id, store_id, material_id, forecast_date, model_version)
);

CREATE INDEX IF NOT EXISTS idx_demand_forecasts_lookup
    ON demand_forecasts(tenant_id, store_id, material_id, forecast_date);
CREATE INDEX IF NOT EXISTS idx_demand_forecasts_maturity
    ON demand_forecasts(tenant_id, forecast_date);

CREATE TABLE IF NOT EXISTS forecast_accuracy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES material_master(id) ON DELETE CASCADE,

    evaluation_date DATE NOT NULL,
    model_version TEXT NOT NULL,
    sample_days INTEGER NOT NULL DEFAULT 0,

    wape DECIMAL(8,4),
    bias DECIMAL(8,4),
    p50_coverage DECIMAL(5,4),
    p90_coverage DECIMAL(5,4),

    -- Backtest metrics computed at generation time, before forecasts mature.
    backtest_wape DECIMAL(8,4),
    backtest_bias DECIMAL(8,4),
    backtest_p90_coverage DECIMAL(5,4),

    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'MEASURED', 'DRIFT', 'INSUFFICIENT_DATA')),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    measured_at TIMESTAMPTZ,

    UNIQUE (tenant_id, store_id, material_id, evaluation_date, model_version)
);

CREATE INDEX IF NOT EXISTS idx_forecast_accuracy_lookup
    ON forecast_accuracy(tenant_id, store_id, material_id, evaluation_date DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_accuracy_drift
    ON forecast_accuracy(tenant_id, status) WHERE status = 'DRIFT';

ALTER TABLE demand_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_accuracy ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'demand_forecasts_service') THEN
        CREATE POLICY demand_forecasts_service ON demand_forecasts
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'forecast_accuracy_service') THEN
        CREATE POLICY forecast_accuracy_service ON forecast_accuracy
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

COMMENT ON COLUMN demand_forecasts.p50_qty IS 'Median demand forecast for this store-material-day.';
COMMENT ON COLUMN demand_forecasts.p90_qty IS '90th-percentile demand; the gap above p50 is the uncertainty buffer.';
COMMENT ON COLUMN forecast_accuracy.status IS
    'DRIFT means out-of-sample error breached the configured threshold; the model must not be used for auto-replenishment.';
