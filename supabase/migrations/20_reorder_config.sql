-- /supabase/migrations/20_reorder_config.sql

-- ==================== REORDER CONFIGURATION (Per Store-Material) ====================
CREATE TABLE IF NOT EXISTS reorder_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES material_master(id) ON DELETE CASCADE,
    
    -- Service level target (99% = 2.33 sigma, 95% = 1.65)
    service_level_pct DECIMAL(5,2) DEFAULT 95.00,
    
    -- Fixed values (if dynamic calc disabled)
    fixed_safety_stock DECIMAL(12,3),
    fixed_reorder_point DECIMAL(12,3),
    
    -- Dynamic calculation overrides
    review_period_days INTEGER DEFAULT 7,
    lead_time_days INTEGER DEFAULT 7,
    lead_time_variability_pct DECIMAL(5,2) DEFAULT 20.00,
    
    -- Velocity settings
    velocity_lookback_days INTEGER DEFAULT 14,
    velocity_smoothing_factor DECIMAL(3,2) DEFAULT 0.30,
    
    -- Auto-procurement
    auto_reorder BOOLEAN DEFAULT FALSE,
    auto_reorder_max_qty DECIMAL(12,3),
    preferred_vendor_id UUID REFERENCES vendor_master(id),
    
    -- Contextual overrides
    disable_weather_factor BOOLEAN DEFAULT FALSE,
    disable_holiday_factor BOOLEAN DEFAULT FALSE,
    disable_promo_factor BOOLEAN DEFAULT FALSE,
    
    -- Last calculated
    last_calculated_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id, store_id, material_id)
);

CREATE INDEX IF NOT EXISTS idx_reorder_config_store ON reorder_config(tenant_id, store_id);
CREATE INDEX IF NOT EXISTS idx_reorder_config_material ON reorder_config(tenant_id, material_id);

-- Default config trigger: auto-create when stock baseline is added
CREATE OR REPLACE FUNCTION create_default_reorder_config()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO reorder_config (
        tenant_id, store_id, material_id,
        lead_time_days, service_level_pct
    )
    SELECT 
        NEW.tenant_id,
        NEW.store_id,
        NEW.material_id,
        COALESCE(mvl.planned_delivery_days, 7),
        95.00
    FROM material_vendor_link mvl
    WHERE mvl.material_id = NEW.material_id
      AND mvl.is_primary_vendor = TRUE
      AND mvl.tenant_id = NEW.tenant_id
    ON CONFLICT (tenant_id, store_id, material_id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_auto_reorder_config') THEN
        CREATE TRIGGER trg_auto_reorder_config
            AFTER INSERT ON stock_baselines
            FOR EACH ROW
            EXECUTE FUNCTION create_default_reorder_config();
    END IF;
END $$;

-- RLS
ALTER TABLE reorder_config ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'reorder_config_isolation') THEN
        CREATE POLICY reorder_config_isolation ON reorder_config FOR ALL USING (true);
    END IF;
END $$;
