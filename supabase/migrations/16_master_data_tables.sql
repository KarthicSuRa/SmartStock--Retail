-- /supabase/migrations/16_master_data_tables.sql

-- Ensure prerequisite tables exist
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    onboarding_status VARCHAR(50) DEFAULT 'pending',
    first_sync_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    sap_plant_code VARCHAR(10) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== MATERIAL MASTER ====================
CREATE TABLE IF NOT EXISTS material_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Canonical identifiers
    sku VARCHAR(50) NOT NULL,              -- Your internal SKU
    erp_material_number VARCHAR(50) NOT NULL, -- SAP MATNR, NetSuite internal ID
    erp_config_id UUID NOT NULL REFERENCES erp_configurations(id),
    
    -- Descriptive data
    description TEXT NOT NULL,
    description_local TEXT,                -- Local language variant
    material_group VARCHAR(50),            -- SAP MATKL
    material_group_description TEXT,
    
    -- Units of measure
    base_uom VARCHAR(10) NOT NULL,         -- EA, KG, CS
    sales_uom VARCHAR(10),
    weight_kg DECIMAL(10,3),
    volume_m3 DECIMAL(10,6),
    
    -- Barcodes & identifiers
    ean_gtin VARCHAR(20),
    upc VARCHAR(20),
    shelf_label_code VARCHAR(50),
    
    -- Product characteristics
    product_hierarchy VARCHAR(50),         -- SAP PRDHA
    brand VARCHAR(100),
    category_l1 VARCHAR(100),
    category_l2 VARCHAR(100),
    category_l3 VARCHAR(100),
    
    -- Shelf life & handling
    shelf_life_days INTEGER,
    is_perishable BOOLEAN DEFAULT FALSE,
    storage_temperature_min INTEGER,       -- Celsius
    storage_temperature_max INTEGER,
    is_hazardous BOOLEAN DEFAULT FALSE,
    
    -- Planning parameters
    reorder_point DECIMAL(12,3) DEFAULT 0,
    safety_stock DECIMAL(12,3) DEFAULT 0,
    rounding_value DECIMAL(12,3) DEFAULT 1,
    min_order_qty DECIMAL(12,3) DEFAULT 1,
    standard_price DECIMAL(12,4),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    erp_deletion_flag BOOLEAN DEFAULT FALSE, -- SAP LVORM
    
    -- Sync metadata
    first_synced_at TIMESTAMPTZ DEFAULT NOW(),
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    erp_last_changed_at TIMESTAMPTZ,       -- SAP AEDAT/ERDAT
    
    UNIQUE(tenant_id, sku, erp_config_id)
);

CREATE INDEX IF NOT EXISTS idx_material_tenant ON material_master(tenant_id);
CREATE INDEX IF NOT EXISTS idx_material_sku ON material_master(tenant_id, sku);
CREATE INDEX IF NOT EXISTS idx_material_ean ON material_master(tenant_id, ean_gtin);
CREATE INDEX IF NOT EXISTS idx_material_active ON material_master(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_material_group ON material_master(tenant_id, material_group);

-- ==================== VENDOR MASTER ====================
CREATE TABLE IF NOT EXISTS vendor_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    erp_config_id UUID NOT NULL REFERENCES erp_configurations(id),
    
    vendor_code VARCHAR(50) NOT NULL,      -- SAP LIFNR
    vendor_name TEXT NOT NULL,
    vendor_name_2 TEXT,
    
    -- Address
    street TEXT,
    city VARCHAR(100),
    postal_code VARCHAR(20),
    country_code CHAR(2),
    region VARCHAR(10),
    
    -- Contact
    phone TEXT,
    email TEXT,
    contact_person TEXT,
    
    -- Financial
    currency CHAR(3) DEFAULT 'EUR',
    payment_terms VARCHAR(50),
    incoterms VARCHAR(20),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_blocked_for_purchasing BOOLEAN DEFAULT FALSE,
    
    -- Sync metadata
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    erp_last_changed_at TIMESTAMPTZ,
    
    UNIQUE(tenant_id, vendor_code, erp_config_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_tenant ON vendor_master(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vendor_active ON vendor_master(tenant_id, is_active);

-- ==================== MATERIAL-VENDOR LINK ====================
CREATE TABLE IF NOT EXISTS material_vendor_link (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    erp_config_id UUID NOT NULL REFERENCES erp_configurations(id),
    
    material_id UUID NOT NULL REFERENCES material_master(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES vendor_master(id) ON DELETE CASCADE,
    
    -- Purchasing conditions
    is_primary_vendor BOOLEAN DEFAULT FALSE,
    contract_net_price DECIMAL(12,4),
    contract_currency CHAR(3),
    contract_valid_from DATE,
    contract_valid_to DATE,
    
    -- Order constraints
    min_order_qty DECIMAL(12,3) DEFAULT 1,     -- SAP MINBM
    rounding_value DECIMAL(12,3) DEFAULT 1,    -- SAP BSTRF
    planned_delivery_days INTEGER DEFAULT 7,   -- SAP PLIFZ
    standard_pack_qty DECIMAL(12,3),           -- Standard case/pack size
    
    -- Lead time tracking (for drift analytics)
    promised_lead_days INTEGER,
    actual_avg_lead_days DECIMAL(5,1),         -- Computed from receipt history
    lead_time_drift_pct DECIMAL(5,2),          -- (actual - promised) / promised
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Sync metadata
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    erp_last_changed_at TIMESTAMPTZ,
    
    UNIQUE(tenant_id, material_id, vendor_id, erp_config_id)
);

CREATE INDEX IF NOT EXISTS idx_mvlink_material ON material_vendor_link(material_id);
CREATE INDEX IF NOT EXISTS idx_mvlink_vendor ON material_vendor_link(vendor_id);
CREATE INDEX IF NOT EXISTS idx_mvlink_primary ON material_vendor_link(tenant_id, material_id, is_primary_vendor) 
    WHERE is_primary_vendor = TRUE;

-- ==================== STOCK BASELINE (THE TRUTH) ====================
CREATE TABLE IF NOT EXISTS stock_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    erp_config_id UUID NOT NULL REFERENCES erp_configurations(id),
    material_id UUID NOT NULL REFERENCES material_master(id) ON DELETE CASCADE,
    
    -- ERP coordinates
    erp_plant VARCHAR(10) NOT NULL,
    erp_storage_location VARCHAR(10) NOT NULL DEFAULT '0001',
    
    -- Quantities (from ERP)
    qty_unrestricted DECIMAL(12,3) NOT NULL DEFAULT 0,
    qty_in_quality_inspection DECIMAL(12,3) DEFAULT 0,
    qty_blocked DECIMAL(12,3) DEFAULT 0,
    qty_in_transit DECIMAL(12,3) DEFAULT 0,
    
    -- Computed columns
    atp_quantity DECIMAL(12,3) GENERATED ALWAYS AS (
        qty_unrestricted - qty_blocked
    ) STORED,
    
    baseline_for_ledger DECIMAL(12,3) GENERATED ALWAYS AS (
        qty_unrestricted + qty_in_quality_inspection
    ) STORED,
    
    -- Unit
    uom VARCHAR(10) NOT NULL DEFAULT 'EA',
    
    -- Valuation
    moving_average_price DECIMAL(12,4),
    standard_price DECIMAL(12,4),
    valuation_currency CHAR(3),
    
    -- Sync metadata
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    erp_last_changed_at TIMESTAMPTZ,
    sync_source VARCHAR(50) DEFAULT 'scheduled',
    
    UNIQUE(tenant_id, store_id, material_id, erp_config_id)
);

CREATE INDEX IF NOT EXISTS idx_baseline_store ON stock_baselines(tenant_id, store_id);
CREATE INDEX IF NOT EXISTS idx_baseline_material ON stock_baselines(tenant_id, material_id);
CREATE INDEX IF NOT EXISTS idx_baseline_erp ON stock_baselines(tenant_id, erp_plant, erp_storage_location);

-- Row Level Security
ALTER TABLE material_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_vendor_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_baselines ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'material_isolation') THEN
        CREATE POLICY material_isolation ON material_master FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'vendor_isolation') THEN
        CREATE POLICY vendor_isolation ON vendor_master FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'mvlink_isolation') THEN
        CREATE POLICY mvlink_isolation ON material_vendor_link FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'baseline_isolation') THEN
        CREATE POLICY baseline_isolation ON stock_baselines FOR ALL USING (true);
    END IF;
END $$;
