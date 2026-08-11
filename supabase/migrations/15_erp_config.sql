-- /supabase/migrations/15_erp_config.sql

-- Enable encryption extension for storing secrets if available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure tenants table exists (for multi-tenant support)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure stores table exists (if not created by previous migrations)
CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    sap_plant_code VARCHAR(10) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ERP Configuration table (one active ERP configuration per tenant)
CREATE TABLE IF NOT EXISTS erp_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- ERP Identification
    erp_type VARCHAR(50) NOT NULL CHECK (erp_type IN ('sap_s4hana', 'sap_ecc', 'netsuite', 'dynamics365', 'mock')),
    erp_name VARCHAR(255) NOT NULL, -- Human-readable name, e.g., "SAP S/4HANA Production"
    
    -- Connection Details
    base_url TEXT NOT NULL, -- e.g., https://my-sap-system.sap.com:44300
    auth_method VARCHAR(50) NOT NULL CHECK (auth_method IN ('oauth2', 'basic', 'x509', 'api_key')),
    
    -- Auth Config (stored as JSON)
    auth_config JSONB NOT NULL,
    
    -- Connection Health
    connection_status VARCHAR(20) NOT NULL DEFAULT 'inactive' CHECK (connection_status IN ('active', 'inactive', 'error')),
    last_sync_at TIMESTAMPTZ,
    last_error_message TEXT,
    last_health_check_at TIMESTAMPTZ,
    
    -- SAP-specific mappings
    company_code VARCHAR(10),
    purchasing_org VARCHAR(10),
    purchasing_group VARCHAR(10),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_active_erp_per_tenant UNIQUE (tenant_id, connection_status) 
        DEFERRABLE INITIALLY DEFERRED
);

-- Store-to-Plant mapping (critical for multi-store setups)
CREATE TABLE IF NOT EXISTS erp_store_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    erp_config_id UUID NOT NULL REFERENCES erp_configurations(id) ON DELETE CASCADE,
    
    -- SAP-specific
    erp_plant VARCHAR(10) NOT NULL, -- WERKS
    erp_storage_location VARCHAR(10) NOT NULL DEFAULT '0001', -- LGORT
    erp_sales_org VARCHAR(10),
    erp_distribution_channel VARCHAR(10),
    
    -- For other ERPs
    erp_location_id VARCHAR(100),
    erp_warehouse_id VARCHAR(100),
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id, store_id, erp_config_id)
);

-- Retry Queue table for ERP outage resilience
CREATE TABLE IF NOT EXISTS retry_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    store_id VARCHAR(50),
    payload JSONB NOT NULL,
    retry_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory Movements table for unified tracking
CREATE TABLE IF NOT EXISTS inventory_movements (
    movement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR(50) NOT NULL,
    store_id VARCHAR(50) NOT NULL,
    movement_type VARCHAR(30) NOT NULL,
    quantity INTEGER NOT NULL,
    uom VARCHAR(10) DEFAULT 'EA',
    reference_document VARCHAR(100),
    reference_date TIMESTAMPTZ DEFAULT NOW(),
    posted_by VARCHAR(100) DEFAULT 'POS_SYSTEM',
    erp_status VARCHAR(20) DEFAULT 'PENDING_SYNC' CHECK (erp_status IN ('PENDING_SYNC', 'SYNCED', 'FAILED', 'REJECTED')),
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    erp_document_number VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_erp_config_tenant ON erp_configurations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_erp_config_status ON erp_configurations(connection_status);
CREATE INDEX IF NOT EXISTS idx_store_mapping_lookup ON erp_store_mappings(tenant_id, store_id, is_active);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_status ON inventory_movements(erp_status);

-- Row Level Security
ALTER TABLE erp_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_store_mappings ENABLE ROW LEVEL SECURITY;

-- Security Policies (allowing access or current tenant filtering)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'erp_config_isolation') THEN
        CREATE POLICY erp_config_isolation ON erp_configurations FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'store_mapping_isolation') THEN
        CREATE POLICY store_mapping_isolation ON erp_store_mappings FOR ALL USING (true);
    END IF;
END $$;

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_erp_config_updated_at') THEN
        CREATE TRIGGER update_erp_config_updated_at
            BEFORE UPDATE ON erp_configurations
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
