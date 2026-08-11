-- /supabase/migrations/25_gr_matching.sql

-- ==================== GOODS RECEIPTS (Inbound from SAP) ====================
CREATE TABLE IF NOT EXISTS goods_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    erp_config_id UUID NOT NULL REFERENCES erp_configurations(id),
    
    -- SAP document references
    erp_gr_number VARCHAR(50) NOT NULL,
    erp_gr_year VARCHAR(4),
    erp_po_number VARCHAR(50),
    erp_po_item VARCHAR(10),
    
    -- Material & location
    material_id UUID NOT NULL REFERENCES material_master(id),
    store_id UUID NOT NULL REFERENCES stores(id),
    erp_plant VARCHAR(10),
    erp_storage_location VARCHAR(10),
    
    -- Quantities
    quantity_received DECIMAL(12,3) NOT NULL,
    uom VARCHAR(10),
    
    -- Batch/serial
    batch_number VARCHAR(50),
    manufacturing_date DATE,
    expiry_date DATE,
    
    -- Status
    matching_status VARCHAR(20) DEFAULT 'unmatched' CHECK (matching_status IN ('unmatched', 'matched', 'over_received', 'under_received', 'discrepancy')),
    
    -- Link to local PO/PR
    matched_staged_pr_id UUID REFERENCES staged_prs(id),
    matched_by UUID REFERENCES auth.users(id),
    matched_at TIMESTAMPTZ,
    
    -- Variance
    expected_qty DECIMAL(12,3),
    variance_qty DECIMAL(12,3),
    variance_reason TEXT,
    
    posted_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id, erp_gr_number, erp_gr_year, material_id)
);

CREATE INDEX IF NOT EXISTS idx_gr_unmatched ON goods_receipts(tenant_id, matching_status) WHERE matching_status = 'unmatched';
CREATE INDEX IF NOT EXISTS idx_gr_po ON goods_receipts(tenant_id, erp_po_number);
CREATE INDEX IF NOT EXISTS idx_gr_expiry ON goods_receipts(tenant_id, expiry_date) WHERE expiry_date IS NOT NULL;

-- Helper RPC for baseline refresh on GR arrival
CREATE OR REPLACE FUNCTION refresh_store_baseline(
    p_tenant_id UUID,
    p_store_id UUID,
    p_material_id UUID
)
RETURNS VOID AS $$
BEGIN
    UPDATE stock_baselines
    SET last_synced_at = NOW()
    WHERE tenant_id = p_tenant_id
      AND store_id = p_store_id
      AND material_id = p_material_id;
END;
$$ LANGUAGE plpgsql;

-- RLS
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'gr_isolation') THEN
        CREATE POLICY gr_isolation ON goods_receipts FOR ALL USING (true);
    END IF;
END $$;
