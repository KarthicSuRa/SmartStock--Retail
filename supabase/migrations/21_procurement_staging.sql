-- /supabase/migrations/21_procurement_staging.sql

-- ==================== STAGED PURCHASE REQUISITIONS ====================
CREATE TABLE IF NOT EXISTS staged_prs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    
    -- Grouping for batch optimization
    batch_group_id UUID,
    vendor_id UUID REFERENCES vendor_master(id),
    
    -- Material
    material_id UUID NOT NULL REFERENCES material_master(id),
    sku VARCHAR(50) NOT NULL,
    description TEXT,
    
    -- Quantities
    qty_requested DECIMAL(12,3) NOT NULL,
    qty_rounded DECIMAL(12,3) NOT NULL,
    uom VARCHAR(10) NOT NULL,
    
    -- Financials
    estimated_unit_price DECIMAL(12,4),
    estimated_total_price DECIMAL(14,4) GENERATED ALWAYS AS (
        qty_rounded * COALESCE(estimated_unit_price, 0)
    ) STORED,
    currency CHAR(3) DEFAULT 'EUR',
    
    -- Source decision
    fulfillment_method VARCHAR(20) NOT NULL CHECK (fulfillment_method IN ('STO', 'EXTERNAL_PR', 'EMERGENCY_PO')),
    source_store_id UUID REFERENCES stores(id),
    
    -- Status lifecycle
    status VARCHAR(30) DEFAULT 'staged' CHECK (status IN (
        'staged', 'manager_review', 'approved', 'rejected', 
        'submitted_to_erp', 'erp_accepted', 'erp_rejected', 'completed'
    )),
    
    -- Execution mode
    execution_mode VARCHAR(20) DEFAULT 'BATCH' CHECK (execution_mode IN ('BATCH', 'IMMEDIATE')),
    
    -- Urgency
    urgency_reason VARCHAR(200),
    alert_id UUID REFERENCES reorder_alerts(id),
    
    -- ERP tracking
    erp_pr_number VARCHAR(50),
    erp_po_number VARCHAR(50),
    erp_document_status VARCHAR(50),
    
    -- Audit
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    
    scheduled_batch_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_staged_active ON staged_prs(tenant_id, store_id, status) 
    WHERE status IN ('staged', 'manager_review', 'approved');
CREATE INDEX IF NOT EXISTS idx_staged_batch ON staged_prs(tenant_id, scheduled_batch_at, status) 
    WHERE status = 'approved' AND execution_mode = 'BATCH';
CREATE INDEX IF NOT EXISTS idx_staged_vendor ON staged_prs(tenant_id, vendor_id, status);

-- Financial yield view (for Procurement Control Center dashboard)
CREATE OR REPLACE VIEW procurement_yield AS
SELECT 
    tenant_id,
    store_id,
    vendor_id,
    COUNT(*) as item_count,
    SUM(qty_rounded) as total_units,
    SUM(estimated_total_price) as total_value,
    AVG(EXTRACT(EPOCH FROM created_at)) as avg_created_epoch
FROM staged_prs
WHERE status IN ('staged', 'manager_review', 'approved')
GROUP BY tenant_id, store_id, vendor_id;

-- RLS
ALTER TABLE staged_prs ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'staged_prs_isolation') THEN
        CREATE POLICY staged_prs_isolation ON staged_prs FOR ALL USING (true);
    END IF;
END $$;
