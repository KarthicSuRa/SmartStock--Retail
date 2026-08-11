-- /supabase/migrations/26_lead_time_analytics.sql

-- ==================== LEAD TIME ACTUALS ====================
CREATE TABLE IF NOT EXISTS lead_time_actuals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    material_id UUID NOT NULL REFERENCES material_master(id),
    vendor_id UUID NOT NULL REFERENCES vendor_master(id),
    store_id UUID NOT NULL REFERENCES stores(id),
    
    -- Order details
    staged_pr_id UUID REFERENCES staged_prs(id),
    erp_po_number VARCHAR(50),
    qty_ordered DECIMAL(12,3),
    
    -- Timing
    order_submitted_at TIMESTAMPTZ,
    vendor_promised_date DATE,
    actual_delivery_date DATE,
    gr_posted_at TIMESTAMPTZ,
    
    -- Computed
    promised_lead_days INTEGER,
    actual_lead_days INTEGER,
    drift_days INTEGER,
    drift_pct DECIMAL(5,2),
    
    -- Categorization
    on_time BOOLEAN GENERATED ALWAYS AS (drift_days <= 0) STORED,
    severity VARCHAR(20) GENERATED ALWAYS AS (
        CASE 
            WHEN drift_days <= 0 THEN 'on_time'
            WHEN drift_days <= 2 THEN 'minor'
            WHEN drift_days <= 5 THEN 'moderate'
            ELSE 'severe'
        END
    ) STORED,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leadtime_vendor ON lead_time_actuals(tenant_id, vendor_id, actual_delivery_date DESC);
CREATE INDEX IF NOT EXISTS idx_leadtime_material ON lead_time_actuals(tenant_id, material_id, actual_delivery_date DESC);

-- ==================== VENDOR LEAD TIME ROLLUP ====================
CREATE TABLE IF NOT EXISTS vendor_lead_time_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES vendor_master(id),
    material_id UUID REFERENCES material_master(id),
    
    -- Statistics
    observations INTEGER DEFAULT 0,
    avg_promised_days DECIMAL(5,1),
    avg_actual_days DECIMAL(5,1),
    std_dev_days DECIMAL(5,2),
    min_days INTEGER,
    max_days INTEGER,
    on_time_pct DECIMAL(5,2),
    
    -- Drift trend
    avg_drift_days DECIMAL(5,1),
    avg_drift_pct DECIMAL(5,2),
    
    -- Recommendation
    recommended_lead_days INTEGER,
    recommended_variability_pct DECIMAL(5,2),
    
    last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id, vendor_id, material_id)
);

-- Trigger: When lead_time_actuals is inserted, update stats
CREATE OR REPLACE FUNCTION update_vendor_lead_time_stats()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO vendor_lead_time_stats (
        tenant_id, vendor_id, material_id,
        observations, avg_promised_days, avg_actual_days, std_dev_days,
        min_days, max_days, on_time_pct, avg_drift_days, avg_drift_pct,
        recommended_lead_days, recommended_variability_pct
    )
    SELECT 
        NEW.tenant_id,
        NEW.vendor_id,
        NEW.material_id,
        COUNT(*)::int,
        AVG(promised_lead_days),
        AVG(actual_lead_days),
        COALESCE(STDDEV(actual_lead_days), 0),
        MIN(actual_lead_days)::int,
        MAX(actual_lead_days)::int,
        (COUNT(*) FILTER (WHERE on_time) / GREATEST(1, COUNT(*))::decimal) * 100,
        AVG(drift_days),
        AVG(drift_pct),
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY actual_lead_days)::int,
        CASE WHEN AVG(actual_lead_days) > 0 
             THEN (COALESCE(STDDEV(actual_lead_days), 0) / AVG(actual_lead_days)) * 100 
             ELSE 20 
        END
    FROM lead_time_actuals
    WHERE tenant_id = NEW.tenant_id 
      AND vendor_id = NEW.vendor_id 
      AND (material_id = NEW.material_id OR NEW.material_id IS NULL)
      AND actual_delivery_date >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY tenant_id, vendor_id, material_id
    ON CONFLICT (tenant_id, vendor_id, material_id) 
    DO UPDATE SET
        observations = EXCLUDED.observations,
        avg_promised_days = EXCLUDED.avg_promised_days,
        avg_actual_days = EXCLUDED.avg_actual_days,
        std_dev_days = EXCLUDED.std_dev_days,
        min_days = EXCLUDED.min_days,
        max_days = EXCLUDED.max_days,
        on_time_pct = EXCLUDED.on_time_pct,
        avg_drift_days = EXCLUDED.avg_drift_days,
        avg_drift_pct = EXCLUDED.avg_drift_pct,
        recommended_lead_days = EXCLUDED.recommended_lead_days,
        recommended_variability_pct = EXCLUDED.recommended_variability_pct,
        last_calculated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_update_lead_time_stats') THEN
        CREATE TRIGGER trg_update_lead_time_stats
            AFTER INSERT ON lead_time_actuals
            FOR EACH ROW
            EXECUTE FUNCTION update_vendor_lead_time_stats();
    END IF;
END $$;

-- RLS
ALTER TABLE lead_time_actuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_lead_time_stats ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'lt_isolation') THEN
        CREATE POLICY lt_isolation ON lead_time_actuals FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'lt_stats_isolation') THEN
        CREATE POLICY lt_stats_isolation ON vendor_lead_time_stats FOR ALL USING (true);
    END IF;
END $$;
