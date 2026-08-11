-- /supabase/migrations/17_sync_tracking.sql

-- ==================== SYNC STATE (Delta Tracking) ====================
CREATE TABLE IF NOT EXISTS sync_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    erp_config_id UUID NOT NULL REFERENCES erp_configurations(id),
    
    entity_type VARCHAR(50) NOT NULL,      -- 'material_master', 'vendors', 'stock_baselines', 'purchase_orders'
    last_sync_at TIMESTAMPTZ NOT NULL,
    last_sync_token TEXT,                  -- ERP-specific cursor/pagination token
    last_record_timestamp TIMESTAMPTZ,     -- Highest ERP change timestamp processed
    records_processed INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    records_unchanged INTEGER DEFAULT 0,
    
    last_filter_applied TEXT,
    
    status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'partial', 'failed', 'running')),
    error_message TEXT,
    duration_ms INTEGER,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id, erp_config_id, entity_type)
);

-- ==================== SYNC AUDIT LOG (Immutable) ====================
CREATE TABLE IF NOT EXISTS sync_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    erp_config_id UUID NOT NULL REFERENCES erp_configurations(id),
    
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,                        -- Local UUID of the record
    erp_key VARCHAR(100) NOT NULL,         -- ERP primary key (MATNR, LIFNR)
    action VARCHAR(20) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'CONFLICT', 'SKIP')),
    
    old_values JSONB,
    new_values JSONB,
    
    conflict_strategy VARCHAR(50),
    conflict_reason TEXT,
    
    sync_run_id UUID REFERENCES sync_state(id),
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    processed_by VARCHAR(100) DEFAULT 'system',
    
    requires_review BOOLEAN DEFAULT FALSE,
    review_status VARCHAR(20) DEFAULT 'none' CHECK (review_status IN ('none', 'pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON sync_audit_log(tenant_id, processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON sync_audit_log(tenant_id, entity_type, erp_key);
CREATE INDEX IF NOT EXISTS idx_audit_review ON sync_audit_log(tenant_id, requires_review, review_status) 
    WHERE requires_review = TRUE;

-- ==================== CONFLICT QUEUE (Manual Review) ====================
CREATE TABLE IF NOT EXISTS sync_conflict_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    erp_key VARCHAR(100) NOT NULL,
    
    local_values JSONB NOT NULL,
    erp_values JSONB NOT NULL,
    proposed_resolution JSONB,
    
    conflict_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved_erp', 'resolved_local', 'resolved_merge')),
    assigned_to UUID REFERENCES auth.users(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_conflict_open ON sync_conflict_queue(tenant_id, status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_conflict_severity ON sync_conflict_queue(tenant_id, severity, created_at DESC);

-- RLS
ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_conflict_queue ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sync_state_isolation') THEN
        CREATE POLICY sync_state_isolation ON sync_state FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'audit_isolation') THEN
        CREATE POLICY audit_isolation ON sync_audit_log FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'conflict_isolation') THEN
        CREATE POLICY conflict_isolation ON sync_conflict_queue FOR ALL USING (true);
    END IF;
END $$;
