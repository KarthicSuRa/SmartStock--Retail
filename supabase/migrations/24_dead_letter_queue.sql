-- /supabase/migrations/24_dead_letter_queue.sql

-- ==================== DEAD LETTER QUEUE ====================
CREATE TABLE IF NOT EXISTS dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Original context
    original_batch_id UUID REFERENCES execution_batches(id),
    original_staged_pr_id UUID REFERENCES staged_prs(id),
    
    -- What failed
    erp_entity_type VARCHAR(30) NOT NULL,
    erp_payload JSONB NOT NULL,
    final_error TEXT NOT NULL,
    error_category VARCHAR(50),
    
    -- Failure context
    failed_at TIMESTAMPTZ DEFAULT NOW(),
    retry_history JSONB DEFAULT '[]',
    
    -- Resolution
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'requeued', 'rejected', 'resolved_manual')),
    assigned_to UUID REFERENCES auth.users(id),
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),
    
    -- Requeue tracking
    requeued_batch_id UUID REFERENCES execution_batches(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dlq_open ON dead_letter_queue(tenant_id, status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_dlq_category ON dead_letter_queue(tenant_id, error_category, failed_at DESC);

-- RLS
ALTER TABLE dead_letter_queue ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'dlq_isolation') THEN
        CREATE POLICY dlq_isolation ON dead_letter_queue FOR ALL USING (true);
    END IF;
END $$;
