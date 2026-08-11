-- /supabase/migrations/19_velocity_and_forecast.sql

-- Ensure prerequisites exist
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    sap_plant_code VARCHAR(10) UNIQUE NOT NULL,
    country_code CHAR(2) DEFAULT 'NL',
    region_code VARCHAR(10),
    lat DECIMAL(10,7),
    lng DECIMAL(10,7),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== SALES VELOCITY HISTORY ====================
CREATE TABLE IF NOT EXISTS sales_velocity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES material_master(id) ON DELETE CASCADE,
    
    -- Time window
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    period_days INTEGER NOT NULL DEFAULT 7,
    
    -- Base velocity (units per day)
    base_velocity_daily DECIMAL(10,4) NOT NULL,
    adjusted_velocity_daily DECIMAL(10,4) NOT NULL,
    
    -- Contextual factors applied
    weather_multiplier DECIMAL(4,2) DEFAULT 1.0,
    holiday_multiplier DECIMAL(4,2) DEFAULT 1.0,
    promotion_multiplier DECIMAL(4,2) DEFAULT 1.0,
    composite_multiplier DECIMAL(4,2) GENERATED ALWAYS AS (
        weather_multiplier * holiday_multiplier * promotion_multiplier
    ) STORED,
    
    -- Final forecast
    forecast_velocity_daily DECIMAL(10,4) NOT NULL,
    
    -- Statistical confidence
    data_points INTEGER NOT NULL,
    stockout_days INTEGER DEFAULT 0,
    coefficient_of_variation DECIMAL(5,4),
    
    -- Trend
    velocity_vs_prev_period_pct DECIMAL(6,2),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_velocity_lookup ON sales_velocity(tenant_id, store_id, material_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_velocity_trend ON sales_velocity(tenant_id, store_id, material_id, period_end DESC);

-- ==================== CONTEXTUAL FACTORS CACHE ====================
CREATE TABLE IF NOT EXISTS weather_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    forecast_for_date DATE NOT NULL,
    
    -- Weather data
    temp_max_c DECIMAL(4,1),
    temp_min_c DECIMAL(4,1),
    temp_avg_c DECIMAL(4,1),
    humidity_pct INTEGER,
    precipitation_mm DECIMAL(5,1),
    weather_condition VARCHAR(50),
    
    -- Derived retail impact score (-1 to +1)
    retail_impact_score DECIMAL(3,2) DEFAULT 0.0,
    
    raw_api_response JSONB,
    
    UNIQUE(tenant_id, store_id, forecast_for_date)
);

CREATE INDEX IF NOT EXISTS idx_weather_date ON weather_cache(tenant_id, store_id, forecast_for_date);

CREATE TABLE IF NOT EXISTS holiday_calendar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    holiday_date DATE NOT NULL,
    holiday_name VARCHAR(200),
    country_code CHAR(2) NOT NULL,
    region_code VARCHAR(10),
    
    -- Impact
    is_retail_peak BOOLEAN DEFAULT FALSE,
    is_store_closed BOOLEAN DEFAULT FALSE,
    sales_uplift_factor DECIMAL(4,2) DEFAULT 1.0,
    
    category VARCHAR(50),
    
    UNIQUE(tenant_id, country_code, region_code, holiday_date)
);

CREATE INDEX IF NOT EXISTS idx_holiday_date ON holiday_calendar(tenant_id, country_code, holiday_date);

CREATE TABLE IF NOT EXISTS promotional_calendar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    erp_config_id UUID NOT NULL REFERENCES erp_configurations(id),
    material_id UUID NOT NULL REFERENCES material_master(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    
    -- SAP promotion reference
    erp_promotion_id VARCHAR(50),
    erp_condition_record VARCHAR(50),
    
    promotion_name VARCHAR(200),
    promotion_type VARCHAR(50),
    
    -- Dates
    valid_from DATE NOT NULL,
    valid_to DATE NOT NULL,
    
    -- Impact
    discount_pct DECIMAL(5,2),
    uplift_factor DECIMAL(4,2) DEFAULT 1.0,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    synced_from_erp_at TIMESTAMPTZ,
    
    UNIQUE(tenant_id, erp_promotion_id, material_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_promo_active ON promotional_calendar(tenant_id, material_id, valid_from, valid_to) 
    WHERE is_active = TRUE;

-- ==================== REORDER ALERTS ====================
CREATE TABLE IF NOT EXISTS reorder_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES material_master(id) ON DELETE CASCADE,
    
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    alert_type VARCHAR(30) NOT NULL CHECK (alert_type IN ('CRITICAL_RISK', 'REPLENISHMENT_NEEDED', 'STOCKOUT_IMMIMENT', 'EXPIRY_RISK')),
    severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    
    -- Current state
    current_stock DECIMAL(12,3) NOT NULL,
    uom VARCHAR(10) NOT NULL,
    safety_stock DECIMAL(12,3),
    reorder_point DECIMAL(12,3),
    runout_days DECIMAL(5,2),
    
    -- Recommendation
    recommended_qty DECIMAL(12,3),
    recommended_vendor_id UUID REFERENCES vendor_master(id),
    recommended_method VARCHAR(20) CHECK (recommended_method IN ('STO', 'PR', 'EMERGENCY_PO')),
    recommended_source_store_id UUID REFERENCES stores(id),
    
    -- Status
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'staged', 'executed', 'dismissed')),
    acknowledged_by UUID REFERENCES auth.users(id),
    acknowledged_at TIMESTAMPTZ,
    
    -- Link to procurement
    staged_pr_id UUID,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_open ON reorder_alerts(tenant_id, store_id, status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_alerts_critical ON reorder_alerts(tenant_id, alert_type, severity) WHERE alert_type = 'CRITICAL_RISK';

-- RLS
ALTER TABLE sales_velocity ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE holiday_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotional_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE reorder_alerts ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'velocity_isolation') THEN
        CREATE POLICY velocity_isolation ON sales_velocity FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'weather_isolation') THEN
        CREATE POLICY weather_isolation ON weather_cache FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'holiday_isolation') THEN
        CREATE POLICY holiday_isolation ON holiday_calendar FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'promo_isolation') THEN
        CREATE POLICY promo_isolation ON promotional_calendar FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'alert_isolation') THEN
        CREATE POLICY alert_isolation ON reorder_alerts FOR ALL USING (true);
    END IF;
END $$;
