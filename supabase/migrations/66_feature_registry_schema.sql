-- =============================================================================
-- Migration 66: Feature Platform & Registry Schema
-- SmartStock Decision Intelligence V1
--
-- PURPOSE:
--   Prevents training-serving skew by maintaining a canonical feature registry
--   and persisting immutable feature snapshots for each decision evaluation.
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics.feature_registry (
    feature_name            VARCHAR(100) PRIMARY KEY,
    version                 INTEGER DEFAULT 1 NOT NULL,
    category                VARCHAR(50) NOT NULL, -- INVENTORY, DEMAND_VELOCITY, NETWORK, SUPPLIER
    data_type               VARCHAR(30) NOT NULL, -- NUMERIC, BOOLEAN, STRING, JSONB
    freshness_sla_seconds   INTEGER DEFAULT 300 NOT NULL,
    sql_definition          TEXT NOT NULL,
    plain_english_def       TEXT NOT NULL,
    is_active               BOOLEAN DEFAULT TRUE NOT NULL
);

-- Seed core feature definitions
INSERT INTO analytics.feature_registry 
    (feature_name, version, category, data_type, freshness_sla_seconds, sql_definition, plain_english_def)
VALUES
    ('sellable_qty', 1, 'INVENTORY', 'NUMERIC', 60, 'inventory_position.sellable_qty', 'Current live sellable inventory on hand'),
    ('inventory_confidence', 1, 'INVENTORY', 'NUMERIC', 60, 'inventory_position.confidence_score', 'Operational digital twin confidence (0-100)'),
    ('sales_velocity_24h', 1, 'DEMAND_VELOCITY', 'NUMERIC', 300, 'SUM(sales_qty) in last 24 business hours', 'Rate of sales per hour over trailing 24 hours'),
    ('forecast_p50_24h', 1, 'DEMAND_VELOCITY', 'NUMERIC', 3600, 'Prophet/Naive P50 24-hour demand prediction', 'Median projected demand over next 24 hours'),
    ('forecast_p90_24h', 1, 'DEMAND_VELOCITY', 'NUMERIC', 3600, 'Prophet/Naive P90 24-hour demand prediction', '90th percentile peak projected demand'),
    ('days_of_supply', 1, 'INVENTORY', 'NUMERIC', 300, 'sellable_qty / GREATEST(sales_velocity_24h, 0.1)', 'Current sellable days of supply at current run-rate'),
    ('hours_to_stockout', 1, 'INVENTORY', 'NUMERIC', 300, 'sellable_qty / GREATEST(sales_velocity_1h, 0.05)', 'Projected hours before sellable stock reaches 0'),
    ('source_surplus_dos', 1, 'NETWORK', 'NUMERIC', 300, 'source_store.days_of_supply - source_safety_stock_dos', 'Excess days of supply available for transfer at source store'),
    ('supplier_lead_time_variance', 1, 'SUPPLIER', 'NUMERIC', 86400, 'STDDEV(actual_lead_days - configured_lead_days)', 'Historical volatility in supplier delivery punctuality')
ON CONFLICT (feature_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS analytics.feature_snapshots (
    snapshot_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    store_id                VARCHAR(50) NOT NULL,
    sku                     VARCHAR(50) NOT NULL,
    feature_payload         JSONB NOT NULL, -- Map of feature_name -> value
    feature_schema_version  INTEGER DEFAULT 1 NOT NULL,
    created_at              TIMESTAMPTZ DEFAULT clock_timestamp() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feature_snapshots_store_sku ON analytics.feature_snapshots(tenant_id, store_id, sku);
