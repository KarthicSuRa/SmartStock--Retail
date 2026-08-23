-- =============================================================================
-- Migration 61: Intraday Inventory State Interval Fact
-- SmartStock Intelligence RC1
--
-- PURPOSE:
--   Captures continuous inventory state intervals to accurately compute stockout
--   duration, hours below safety stock, and intraday confidence without losing
--   sub-daily availability events in coarse daily snapshots.
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics.fact_inventory_state_interval (
    interval_id             BIGSERIAL PRIMARY KEY,
    tenant_id               UUID NOT NULL,
    store_key               INTEGER NOT NULL REFERENCES analytics.dim_store(store_key),
    product_key             INTEGER NOT NULL REFERENCES analytics.dim_product(product_key),

    state_start_time        TIMESTAMPTZ NOT NULL,
    state_end_time          TIMESTAMPTZ, -- NULL if currently active
    duration_seconds        INTEGER,

    sellable_qty            NUMERIC(15, 4) NOT NULL,
    estimated_on_hand       NUMERIC(15, 4) NOT NULL,
    reserved_qty            NUMERIC(15, 4) DEFAULT 0 NOT NULL,
    safety_stock_qty        NUMERIC(15, 4) DEFAULT 0 NOT NULL,

    is_stockout             BOOLEAN NOT NULL, -- sellable_qty <= 0
    is_below_safety         BOOLEAN NOT NULL, -- sellable_qty < safety_stock_qty
    confidence_score        SMALLINT NOT NULL,

    trigger_event_id        UUID,
    trigger_event_type      VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_interval_store_product ON analytics.fact_inventory_state_interval(store_key, product_key);
CREATE INDEX IF NOT EXISTS idx_interval_time_range ON analytics.fact_inventory_state_interval(state_start_time, state_end_time);
CREATE INDEX IF NOT EXISTS idx_interval_stockout ON analytics.fact_inventory_state_interval(is_stockout) WHERE is_stockout = TRUE;

-- ---------------------------------------------------------------------------
-- Function to calculate exact stockout hours in interval
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics.calculate_stockout_hours_v1(
    p_store_key INTEGER,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS NUMERIC AS $$
DECLARE
    v_total_hours NUMERIC;
BEGIN
    SELECT COALESCE(SUM(
        EXTRACT(EPOCH FROM (
            LEAST(COALESCE(state_end_time, p_end_time), p_end_time) -
            GREATEST(state_start_time, p_start_time)
        )) / 3600.0
    ), 0)
    INTO v_total_hours
    FROM analytics.fact_inventory_state_interval
    WHERE store_key = p_store_key
      AND is_stockout = TRUE
      AND state_start_time < p_end_time
      AND (state_end_time IS NULL OR state_end_time > p_start_time);

    RETURN ROUND(v_total_hours, 2);
END;
$$ LANGUAGE plpgsql STABLE;
