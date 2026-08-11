-- /supabase/migrations/28_audit_dashboard.sql

-- ==================== AUDIT DASHBOARD: FINANCIAL MUTATIONS ====================
CREATE OR REPLACE VIEW audit_financial_mutations AS
SELECT 
    sal.id as audit_id,
    sal.processed_at,
    sal.processed_by,
    u.email as processed_by_email,
    sal.entity_type,
    sal.erp_key,
    sal.action,
    
    CASE 
        WHEN sal.entity_type = 'PurchaseRequisition' AND sal.action = 'INSERT' THEN
            COALESCE((sal.new_values->>'estimated_total_price')::decimal, 0)
        WHEN sal.entity_type = 'emergency_po_bypass' THEN
            COALESCE((sal.new_values->>'amount')::decimal, 0)
        WHEN sal.entity_type = 'stock_reconciliation' AND sal.action = 'CONFLICT' THEN
            COALESCE((sal.new_values->>'variance')::decimal, 0) * 
            COALESCE((SELECT moving_average_price FROM stock_baselines sb 
                      JOIN material_master mm ON sb.material_id = mm.id 
                      WHERE mm.sku = sal.erp_key AND sb.tenant_id = sal.tenant_id LIMIT 1), 0)
        ELSE 0
    END as financial_impact,
    
    sal.old_values,
    sal.new_values,
    sal.conflict_strategy,
    sal.conflict_reason,
    
    eb.batch_type as execution_batch_type,
    eb.status as execution_status
    
FROM sync_audit_log sal
LEFT JOIN auth.users u ON sal.processed_by = u.id::text
LEFT JOIN execution_batches eb ON sal.tenant_id = eb.tenant_id 
    AND sal.processed_at BETWEEN eb.started_at AND eb.completed_at
ORDER BY sal.processed_at DESC;

-- ==================== AUDIT DASHBOARD: USER ACTIONS ====================
CREATE OR REPLACE VIEW audit_user_actions AS
SELECT 
    asess.user_id,
    u.email,
    asess.session_type,
    asess.ip_address,
    asess.geo_country,
    asess.created_at as action_time,
    
    (SELECT COUNT(*) FROM sync_audit_log sal 
     WHERE sal.processed_by = asess.user_id::text
       AND sal.processed_at BETWEEN asess.created_at AND asess.created_at + INTERVAL '8 hours'
    ) as mutations_in_session,
    
    (SELECT MAX(processed_at) FROM sync_audit_log sal2
     WHERE sal2.processed_by = asess.user_id::text
       AND sal2.entity_type IN ('emergency_po_bypass', 'stock_reconciliation')
    ) as last_sensitive_action
    
FROM audit_sessions asess
LEFT JOIN auth.users u ON asess.user_id = u.id
ORDER BY asess.created_at DESC;

-- ==================== AUDIT DASHBOARD: CONFLICT RESOLUTION ====================
CREATE OR REPLACE VIEW audit_conflict_resolution AS
SELECT 
    scq.id as conflict_id,
    scq.entity_type,
    scq.erp_key,
    scq.conflict_type,
    scq.severity,
    scq.status,
    scq.local_values,
    scq.erp_values,
    scq.proposed_resolution,
    
    resolver.email as resolved_by_email,
    scq.resolution_notes,
    scq.resolved_at,
    
    EXTRACT(EPOCH FROM (scq.resolved_at - scq.created_at))/3600 as hours_to_resolve,
    
    COALESCE((scq.erp_values->>'contract_net_price')::decimal, 0) - 
    COALESCE((scq.local_values->>'contract_net_price')::decimal, 0) as price_variance
    
FROM sync_conflict_queue scq
LEFT JOIN auth.users resolver ON scq.resolved_by = resolver.id
ORDER BY scq.created_at DESC;
