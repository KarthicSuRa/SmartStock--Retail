-- /supabase/migrations/018_barcode_resolution.sql

-- ==================== BARCODE ALIAS TABLE ====================
-- One material can have multiple barcodes (GTIN, case code, inner pack, display box)

CREATE TABLE IF NOT EXISTS barcode_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    material_id UUID REFERENCES material_master(id) ON DELETE CASCADE,
    
    barcode VARCHAR(50) NOT NULL,           -- The actual scanned string
    barcode_type VARCHAR(20) NOT NULL CHECK (barcode_type IN (
        'EAN13', 'UPCA', 'EAN8', 'CODE128', 'CODE39', 'QR', 'DATAMATRIX', 'GS1_128', 'ITF14'
    )),
    
    alias_type VARCHAR(20) NOT NULL CHECK (alias_type IN (
        'PRIMARY_GTIN',          -- Consumer unit (what customer buys)
        'CASE_GTIN',             -- Case of 24
        'INNER_PACK',            -- Pack of 6
        'DISPLAY_UNIT',          -- Shelf-ready display
        'VARIABLE_WEIGHT',       -- Embedded weight/price
        'INTERNAL_SKU',          -- Store's own code
        'SUPPLIER_CODE',         -- Vendor's internal code
        'LOT_LABEL'              -- Batch-specific (pharma/food)
    )),
    
    -- For variable-weight items
    is_variable_weight BOOLEAN DEFAULT FALSE,
    weight_embedded_start INTEGER,          -- Character position
    weight_embedded_length INTEGER,
    weight_embedded_divisor DECIMAL(10,4) DEFAULT 1000, -- grams → kg
    
    -- For quantity multipliers
    quantity_multiplier INTEGER DEFAULT 1,  -- Case of 24 = multiplier 24
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id, barcode)
);

CREATE INDEX IF NOT EXISTS idx_barcode_lookup ON barcode_aliases(tenant_id, barcode);
CREATE INDEX IF NOT EXISTS idx_barcode_material ON barcode_aliases(tenant_id, material_id);

-- ==================== UNKNOWN BARCODE QUEUE ====================
-- When scanned barcode isn't found, queue for master data team

CREATE TABLE IF NOT EXISTS unknown_barcodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    
    scanned_barcode VARCHAR(50) NOT NULL,
    scanned_barcode_type VARCHAR(20),
    scanned_at TIMESTAMPTZ DEFAULT NOW(),
    scanned_by UUID REFERENCES auth.users(id),
    
    context VARCHAR(50), -- 'damage_log', 'stock_count', 'receiving', 'customer_lookup'
    photo_uri TEXT,      -- Photo of the item for identification
    
    -- Resolution
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'identified', 'rejected')),
    resolved_material_id UUID REFERENCES material_master(id),
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    
    -- Auto-create suggestion
    suggested_description TEXT, -- From OCR or user input
    suggested_vendor TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unknown_open ON unknown_barcodes(tenant_id, status) WHERE status = 'open';

-- RLS
ALTER TABLE barcode_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE unknown_barcodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY barcode_alias_isolation ON barcode_aliases FOR ALL 
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID);
CREATE POLICY unknown_barcode_isolation ON unknown_barcodes FOR ALL 
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID);
