-- /supabase/migrations/29_analytics_views.sql

-- ==================== MATERIALIZED VIEW: PROTECTED REVENUE ====================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_protected_revenue AS
WITH stockout_preventions AS (
    SELECT 
        ra.tenant_id,
        ra.store_id,
        ra.material_id,
        ra.alert_type,
        ra.generated_at,
        ra.recommended_qty,
        ra.current_stock,
        
        COALESCE(lil.forecast_velocity_daily, 0) * 
        COALESCE(lil.unit_cost, 0) * 
        (ra.recommended_qty + ra.current_stock) as potential_revenue_at_risk,
        
        CASE 
            WHEN ra.staged_pr_id IS NOT NULL THEN
                COALESCE(sp.qty_rounded, 0) * COALESCE(lil.unit_cost, 0) * 1.3
            ELSE 0
        END as protected_revenue,
        
        CASE 
            WHEN ra.staged_pr_id IS NOT NULL AND sp.status IN ('submitted_to_erp', 'completed') THEN TRUE
            ELSE FALSE
        END as prevention_successful
        
    FROM reorder_alerts ra
    LEFT JOIN live_inventory_ledger lil 
        ON ra.tenant_id = lil.tenant_id 
        AND ra.store_id = lil.store_id 
        AND ra.material_id = lil.material_id
    LEFT JOIN staged_prs sp ON ra.staged_pr_id = sp.id
    WHERE ra.alert_type IN ('CRITICAL_RISK', 'STOCKOUT_IMMIMENT')
)
SELECT 
    tenant_id,
    store_id,
    DATE_TRUNC('month', generated_at) as month,
    COUNT(*) as alerts_generated,
    COUNT(*) FILTER (WHERE prevention_successful) as alerts_prevented,
    SUM(potential_revenue_at_risk) as total_revenue_at_risk,
    SUM(protected_revenue) as total_protected_revenue,
    CASE 
        WHEN SUM(potential_revenue_at_risk) > 0 
        THEN (SUM(protected_revenue) / SUM(potential_revenue_at_risk)) * 100
        ELSE 0
    END as prevention_yield_pct
FROM stockout_preventions
GROUP BY tenant_id, store_id, DATE_TRUNC('month', generated_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_protected_revenue ON mv_protected_revenue(tenant_id, store_id, month);

-- ==================== MATERIALIZED VIEW: VENDOR SCORECARDS ====================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_vendor_scorecards AS
SELECT 
    lta.tenant_id,
    lta.vendor_id,
    vm.vendor_name,
    vm.vendor_code,
    
    COUNT(*) as total_deliveries,
    COUNT(*) FILTER (WHERE lta.on_time) as on_time_deliveries,
    ROUND((COUNT(*) FILTER (WHERE lta.on_time)::decimal / NULLIF(COUNT(*), 0)) * 100, 2) as on_time_pct,
    
    AVG(lta.actual_lead_days) as avg_actual_lead_days,
    AVG(lta.promised_lead_days) as avg_promised_lead_days,
    AVG(lta.drift_days) as avg_drift_days,
    
    ROUND(
        (COUNT(*) FILTER (WHERE lta.on_time)::decimal / NULLIF(COUNT(*), 0)) * 50 +
        (1 - LEAST(COALESCE(AVG(lta.drift_pct), 0) / 100, 1)) * 30 +
        (1 - LEAST(COALESCE(STDDEV(lta.actual_lead_days), 0) / NULLIF(AVG(lta.actual_lead_days), 0), 1)) * 20,
        2
    ) as reliability_score,
    
    AVG(COALESCE(gr.variance_qty, 0)) as avg_gr_variance,
    COUNT(*) FILTER (WHERE gr.matching_status = 'under_received') as under_delivery_count,
    
    SUM(lta.qty_ordered * mm.standard_price) as total_procurement_value
    
FROM lead_time_actuals lta
JOIN vendor_master vm ON lta.vendor_id = vm.id
LEFT JOIN goods_receipts gr ON lta.staged_pr_id = gr.matched_staged_pr_id
JOIN material_master mm ON lta.material_id = mm.id
WHERE lta.actual_delivery_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY lta.tenant_id, lta.vendor_id, vm.vendor_name, vm.vendor_code;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_vendor_scorecard ON mv_vendor_scorecards(tenant_id, vendor_id);

-- ==================== MATERIALIZED VIEW: STORE HEALTH ====================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_store_health AS
SELECT 
    sb.tenant_id,
    sb.store_id,
    s.name as store_name,
    
    COUNT(DISTINCT sb.material_id) as total_skus,
    COUNT(DISTINCT sb.material_id) FILTER (WHERE lil.stock_status = 'CRITICAL_RISK') as critical_skus,
    COUNT(DISTINCT sb.material_id) FILTER (WHERE lil.stock_status = 'REPLENISHMENT_NEEDED') as replenishment_skus,
    
    AVG(CASE WHEN lil.current_calculated_stock = sb.qty_unrestricted THEN 1 ELSE 0 END) * 100 as sync_accuracy_pct,
    
    (SELECT COUNT(*) FROM staged_prs sp 
     WHERE sp.tenant_id = sb.tenant_id AND sp.store_id = sb.store_id 
     AND sp.status IN ('staged', 'approved')) as pending_procurement_count,
    
    (SELECT SUM(estimated_total_price) FROM staged_prs sp2
     WHERE sp2.tenant_id = sb.tenant_id AND sp2.store_id = sb.store_id
     AND sp2.status IN ('staged', 'approved')) as pending_procurement_value
    
FROM stock_baselines sb
JOIN stores s ON sb.store_id = s.id
LEFT JOIN live_inventory_ledger lil ON sb.tenant_id = lil.tenant_id 
    AND sb.store_id = lil.store_id AND sb.material_id = lil.material_id
GROUP BY sb.tenant_id, sb.store_id, s.name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_store_health ON mv_store_health(tenant_id, store_id);

-- RPC for materialized view refresh
CREATE OR REPLACE FUNCTION refresh_materialized_view(view_name text, tenant_filter uuid DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    IF view_name = 'mv_protected_revenue' THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_protected_revenue;
    ELSIF view_name = 'mv_vendor_scorecards' THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_vendor_scorecards;
    ELSIF view_name = 'mv_store_health' THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_store_health;
    END IF;
END;
$$ LANGUAGE plpgsql;
