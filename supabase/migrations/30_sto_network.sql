-- /supabase/migrations/30_sto_network.sql

-- ==================== STO TRANSFERS RECORD ====================
CREATE TABLE IF NOT EXISTS sto_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    requesting_store_id UUID NOT NULL REFERENCES stores(id),
    source_store_id UUID NOT NULL REFERENCES stores(id),
    material_id UUID NOT NULL REFERENCES material_master(id),
    sku VARCHAR(100) NOT NULL,
    
    quantity DECIMAL(12,3) NOT NULL,
    uom VARCHAR(10) NOT NULL,
    
    distance_km DECIMAL(8,2),
    transfer_cost DECIMAL(10,2),
    transfer_time_hours DECIMAL(6,1),
    carbon_cost_kg_co2 DECIMAL(8,2),
    priority_score DECIMAL(5,3),
    
    status VARCHAR(20) DEFAULT 'staged' CHECK (status IN ('staged', 'approved', 'in_transit', 'completed', 'cancelled')),
    erp_sto_number VARCHAR(50),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sto_requesting ON sto_transfers(tenant_id, requesting_store_id, status);
CREATE INDEX IF NOT EXISTS idx_sto_source ON sto_transfers(tenant_id, source_store_id, status);

-- RLS
ALTER TABLE sto_transfers ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sto_isolation') THEN
        CREATE POLICY sto_isolation ON sto_transfers FOR ALL USING (true);
    END IF;
END $$;
