-- /supabase/migrations/23_execution_tracking.sql

-- ==================== EXECUTION BATCHES ====================
CREATE TABLE IF NOT EXISTS execution_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    erp_config_id UUID NOT NULL REFERENCES erp_configurations(id),
    
    batch_type VARCHAR(30) NOT NULL CHECK (batch_type IN ('DAILY_PR_BATCH', 'EMERGENCY_PO', 'STO_BATCH', 'GR_SYNC')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'partial_success', 'success', 'failed', 'cancelled')),
    
    -- Timing
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    
    -- Payload metrics
    items_total INTEGER DEFAULT 0,
    items_success INTEGER DEFAULT 0,
    items_failed INTEGER DEFAULT 0,
    items_skipped INTEGER DEFAULT 0,
    
    -- Financial
    total_value DECIMAL(14,4),
    currency CHAR(3) DEFAULT 'EUR',
    
    -- ERP response
    erp_batch_id VARCHAR(100),
    erp_response_code VARCHAR(10),
    erp_response_body JSONB,
    
    -- Idempotency
    idempotency_key VARCHAR(100) NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_batches_status ON execution_batches(tenant_id, status, started_at DESC);

-- ==================== EXECUTION BATCH ITEMS ====================
CREATE TABLE IF NOT EXISTS execution_batch_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES execution_batches(id) ON DELETE CASCADE,
    staged_pr_id UUID REFERENCES staged_prs(id),
    
    -- What we sent
    erp_entity_type VARCHAR(30) NOT NULL,
    erp_payload JSONB NOT NULL,
    
    -- What came back
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'retrying', 'dead_letter')),
    erp_document_number VARCHAR(50),
    erp_item_number VARCHAR(20),
    erp_message TEXT,
    
    -- Retry state
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    last_retry_at TIMESTAMPTZ,
    
    -- Idempotency
    item_idempotency_key VARCHAR(100) NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    
    UNIQUE(batch_id, item_idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_batch_items_status ON execution_batch_items(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_batch_items_staged ON execution_batch_items(staged_pr_id);

-- RLS
ALTER TABLE execution_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_batch_items ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'batch_isolation') THEN
        CREATE POLICY batch_isolation ON execution_batches FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'batch_item_isolation') THEN
        CREATE POLICY batch_item_isolation ON execution_batch_items FOR ALL USING (true);
    END IF;
END $$;
