-- /supabase/migrations/020_forecast_accuracy.sql

-- ==================== FORECAST ACCURACY TRACKING ====================

CREATE TABLE IF NOT EXISTS forecast_accuracy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES material_master(id) ON DELETE CASCADE,
    
    forecast_date DATE NOT NULL,
    forecasted_velocity DECIMAL(10,4),
    forecasted_runout_days DECIMAL(5,2),
    
    actual_velocity DECIMAL(10,4),      -- Computed after the fact
    actual_runout_date DATE,            -- When did stock actually hit zero?
    
    -- Error metrics
    mape DECIMAL(5,2),                  -- Mean Absolute Percentage Error
    bias DECIMAL(5,2),                  -- Systematic over/under-forecasting
    
    -- Action taken
    did_stockout BOOLEAN DEFAULT FALSE,
    was_overstock BOOLEAN DEFAULT FALSE, -- Had >2x safety stock at reorder point
    
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, store_id, material_id, forecast_date)
);

CREATE INDEX IF NOT EXISTS idx_forecast_accuracy_lookup ON forecast_accuracy(tenant_id, store_id, forecast_date DESC);

-- Auto-adjustment trigger for dynamic service-level tuning
CREATE OR REPLACE FUNCTION auto_adjust_safety_stock()
RETURNS TRIGGER AS $$
DECLARE
    current_config RECORD;
    new_service_level DECIMAL(5,2);
BEGIN
    IF NEW.actual_velocity IS NULL THEN 
        RETURN NEW; 
    END IF;
    
    SELECT * INTO current_config FROM reorder_config
    WHERE tenant_id = NEW.tenant_id
      AND store_id = NEW.store_id
      AND material_id = NEW.material_id;
    
    IF NOT FOUND THEN 
        RETURN NEW; 
    END IF;
    
    -- If stockout occurred despite forecast, bump service level to protect inventory
    IF NEW.did_stockout AND NEW.forecasted_runout_days > 0 THEN
        new_service_level := LEAST(current_config.service_level_pct + 2.0, 99.9);
        
        UPDATE reorder_config
        SET service_level_pct = new_service_level,
            updated_at = NOW()
        WHERE id = current_config.id;
    END IF;
    
    -- If overstocked, ease service level to free up working capital
    IF NEW.was_overstock AND current_config.service_level_pct > 85.0 THEN
        new_service_level := GREATEST(current_config.service_level_pct - 1.0, 85.0);
        
        UPDATE reorder_config
        SET service_level_pct = new_service_level,
            updated_at = NOW()
        WHERE id = current_config.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_adjust_safety_stock ON forecast_accuracy;
CREATE TRIGGER trg_auto_adjust_safety_stock
    AFTER UPDATE OF actual_velocity ON forecast_accuracy
    FOR EACH ROW
    EXECUTE FUNCTION auto_adjust_safety_stock();

ALTER TABLE forecast_accuracy ENABLE ROW LEVEL SECURITY;
CREATE POLICY forecast_acc_isolation ON forecast_accuracy FOR ALL 
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID);
