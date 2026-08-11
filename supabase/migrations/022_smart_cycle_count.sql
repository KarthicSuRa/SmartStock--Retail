-- /supabase/migrations/022_smart_cycle_count.sql

-- Track when each SKU was last physically counted
CREATE TABLE IF NOT EXISTS physical_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES material_master(id) ON DELETE CASCADE,
    
    counted_by UUID REFERENCES auth.users(id),
    counted_at TIMESTAMPTZ DEFAULT NOW(),
    physical_qty DECIMAL(12,3) NOT NULL,
    system_qty DECIMAL(12,3) NOT NULL,
    variance DECIMAL(12,3) GENERATED ALWAYS AS (physical_qty - system_qty) STORED,
    variance_pct DECIMAL(5,2) GENERATED ALWAYS AS (
        CASE WHEN system_qty != 0 THEN ((physical_qty - system_qty) / system_qty) * 100 ELSE 0 END
    ) STORED,
    
    count_method VARCHAR(20) DEFAULT 'manual' CHECK (count_method IN ('manual', 'voice', 'scanner', 'photo_ai')),
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_physical_counts_lookup ON physical_counts(tenant_id, store_id, material_id, counted_at DESC);
CREATE INDEX IF NOT EXISTS idx_physical_counts_date ON physical_counts(tenant_id, store_id, counted_at);

-- The recommendation engine view
CREATE OR REPLACE VIEW daily_count_recommendations AS
WITH last_count AS (
    SELECT DISTINCT ON (tenant_id, store_id, material_id)
        tenant_id,
        store_id,
        material_id,
        counted_at,
        variance_pct
    FROM physical_counts
    ORDER BY tenant_id, store_id, material_id, counted_at DESC
),
sku_metrics AS (
    SELECT 
        lil.tenant_id,
        lil.store_id,
        lil.material_id,
        lil.sku,
        lil.description,
        lil.current_calculated_stock,
        lil.forecast_velocity_daily,
        lil.unit_cost,
        lil.stock_status,
        -- Monthly velocity value
        COALESCE(lil.forecast_velocity_daily, 0) * COALESCE(lil.unit_cost, 0) * 30 as monthly_velocity_value,
        -- Days since last count
        COALESCE(EXTRACT(DAY FROM (NOW() - lc.counted_at)), 999) as days_since_last_count,
        -- Last variance (ghost inventory indicator)
        COALESCE(ABS(lc.variance_pct), 0) as last_variance_abs_pct,
        -- ABC classification based on velocity x value
        CASE 
            WHEN (COALESCE(lil.forecast_velocity_daily, 0) * COALESCE(lil.unit_cost, 0) * 30) > 1000 THEN 'A'
            WHEN (COALESCE(lil.forecast_velocity_daily, 0) * COALESCE(lil.unit_cost, 0) * 30) > 200 THEN 'B'
            ELSE 'C'
        END as abc_class
    FROM live_inventory_ledger lil
    LEFT JOIN last_count lc 
        ON lil.tenant_id = lc.tenant_id 
        AND lil.store_id = lc.store_id 
        AND lil.material_id = lc.material_id
    WHERE lil.is_active = TRUE
)
SELECT 
    tenant_id,
    store_id,
    material_id,
    sku,
    description,
    current_calculated_stock,
    monthly_velocity_value,
    days_since_last_count,
    last_variance_abs_pct,
    abc_class,
    -- Priority score: higher = count today
    CASE 
        -- High-value items not counted recently
        WHEN abc_class = 'A' AND days_since_last_count > 7 THEN 100
        WHEN abc_class = 'B' AND days_since_last_count > 14 THEN 80
        WHEN abc_class = 'C' AND days_since_last_count > 30 THEN 60
        -- Items with known variance (ghost inventory suspects)
        WHEN last_variance_abs_pct > 10 THEN 90
        -- Critical stock items (verify accuracy)
        WHEN stock_status = 'CRITICAL_RISK' THEN 85
        -- Default decay
        ELSE GREATEST(0, 50 - (days_since_last_count / 2))
    END as priority_score,
    CASE 
        WHEN abc_class = 'A' AND days_since_last_count > 7 THEN 'COUNT_TODAY'
        WHEN abc_class = 'B' AND days_since_last_count > 14 THEN 'COUNT_TODAY'
        WHEN last_variance_abs_pct > 10 THEN 'COUNT_TODAY'
        WHEN stock_status = 'CRITICAL_RISK' THEN 'COUNT_TODAY'
        WHEN days_since_last_count > 30 THEN 'COUNT_THIS_WEEK'
        ELSE 'HEALTHY'
    END as recommendation
FROM sku_metrics
WHERE current_calculated_stock > 0  -- Don't count zero-stock items
ORDER BY priority_score DESC;

-- RLS
ALTER TABLE physical_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY physical_count_isolation ON physical_counts FOR ALL 
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID);
