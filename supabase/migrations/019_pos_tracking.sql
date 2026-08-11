-- /supabase/migrations/019_pos_tracking.sql

-- ==================== POS CONFIGURATIONS ====================

CREATE TABLE IF NOT EXISTS pos_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    
    pos_type VARCHAR(50) NOT NULL CHECK (pos_type IN (
        'webhook_cloud', 'polling_legacy', 'file_drop', 
        'sap_cAR', 'square', 'shopify', 'lightspeed', 'manual_entry'
    )),
    pos_name VARCHAR(100) NOT NULL,
    
    -- Connection
    webhook_url TEXT,
    webhook_secret TEXT,
    api_key TEXT,
    api_secret TEXT,
    polling_endpoint TEXT,
    polling_interval_minutes INTEGER DEFAULT 15,
    file_drop_path TEXT,
    
    -- Mapping
    sku_mapping_strategy VARCHAR(20) DEFAULT 'ean_lookup' CHECK (sku_mapping_strategy IN ('ean_lookup', 'sku_direct', 'catalog_id')),
    
    is_active BOOLEAN DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== POS TRANSACTIONS ====================

CREATE TABLE IF NOT EXISTS pos_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    pos_config_id UUID NOT NULL REFERENCES pos_configurations(id),
    
    transaction_id VARCHAR(100) NOT NULL,
    state VARCHAR(20) NOT NULL,
    
    currency CHAR(3),
    subtotal DECIMAL(12,2),
    tax_total DECIMAL(12,2),
    discount_total DECIMAL(12,2),
    grand_total DECIMAL(12,2),
    
    completed_at TIMESTAMPTZ,
    timezone VARCHAR(50),
    
    pos_raw_payload JSONB,
    
    UNIQUE(tenant_id, pos_config_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_txn_lookup ON pos_transactions(tenant_id, store_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_txn_id ON pos_transactions(tenant_id, transaction_id);

-- ==================== POS REJECTED TRANSACTIONS ====================

CREATE TABLE IF NOT EXISTS pos_rejected_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    transaction_id VARCHAR(100),
    rejection_reasons TEXT[],
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE pos_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_rejected_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY pos_config_isolation ON pos_configurations FOR ALL 
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID);
CREATE POLICY pos_txn_isolation ON pos_transactions FOR ALL 
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID);
CREATE POLICY pos_reject_isolation ON pos_rejected_transactions FOR ALL 
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID);
