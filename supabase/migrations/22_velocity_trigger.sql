-- /supabase/migrations/22_velocity_trigger.sql

-- ==================== UPDATED LIVE INVENTORY LEDGER VIEW ====================
-- Extends live_inventory_ledger with velocity, safety stock, reorder point, and runout days

DROP VIEW IF EXISTS live_inventory_ledger CASCADE;
DROP VIEW IF EXISTS live_inventory_ledger_v2 CASCADE;

CREATE OR REPLACE VIEW live_inventory_ledger AS
WITH live_deductions AS (
    SELECT 
        sku,
        COALESCE(SUM(CASE WHEN movement_type = 'SALE' THEN ABS(quantity) ELSE 0 END), 0) as pos_live_deductions,
        COALESCE(SUM(CASE WHEN movement_type = 'DAMAGE' THEN ABS(quantity) ELSE 0 END), 0) as damage_deductions,
        COALESCE(SUM(CASE WHEN movement_type = 'ADJUSTMENT' THEN quantity ELSE 0 END), 0) as adjustment_net,
        MAX(created_at) as last_movement_at
    FROM inventory_movements
    WHERE erp_status IN ('PENDING_SYNC', 'SYNCED')
    GROUP BY sku
),
latest_velocity AS (
    SELECT DISTINCT ON (tenant_id, store_id, material_id)
        tenant_id,
        store_id,
        material_id,
        forecast_velocity_daily,
        calculated_at
    FROM sales_velocity
    ORDER BY tenant_id, store_id, material_id, calculated_at DESC
),
latest_config AS (
    SELECT DISTINCT ON (tenant_id, store_id, material_id)
        tenant_id,
        store_id,
        material_id,
        fixed_safety_stock,
        fixed_reorder_point,
        lead_time_days
    FROM reorder_config
    ORDER BY tenant_id, store_id, material_id, updated_at DESC
)
SELECT 
    sb.tenant_id,
    sb.store_id,
    s.name as store_name,
    s.sap_plant_code,
    sb.material_id,
    mm.sku,
    mm.description,
    mm.ean_gtin,
    mm.material_group,
    mm.is_perishable,
    mm.shelf_life_days,
    
    -- Core ledger formula
    sb.baseline_for_ledger as sap_baseline_qty,
    COALESCE(ld.pos_live_deductions, 0) as pos_live_deductions,
    COALESCE(ld.damage_deductions, 0) as damage_deductions,
    COALESCE(ld.adjustment_net, 0) as adjustment_net,
    
    (sb.baseline_for_ledger 
        - COALESCE(ld.pos_live_deductions, 0) 
        - COALESCE(ld.damage_deductions, 0)
        + COALESCE(ld.adjustment_net, 0)) 
    as current_calculated_stock,
    
    sb.atp_quantity as erp_atp_qty,
    sb.uom,
    sb.moving_average_price as unit_cost,
    
    -- Velocity & forecast
    COALESCE(lv.forecast_velocity_daily, 0) as forecast_velocity_daily,
    lv.calculated_at as velocity_calculated_at,
    
    -- Safety metrics
    COALESCE(lc.fixed_safety_stock, mm.safety_stock, 10) as safety_stock,
    COALESCE(lc.fixed_reorder_point, mm.reorder_point, 25) as reorder_point,
    COALESCE(lc.lead_time_days, 7) as lead_time_days,
    
    -- Runout horizon
    CASE 
        WHEN COALESCE(lv.forecast_velocity_daily, 0) > 0 
        THEN ((sb.baseline_for_ledger - COALESCE(ld.pos_live_deductions, 0) - COALESCE(ld.damage_deductions, 0) + COALESCE(ld.adjustment_net, 0)) / lv.forecast_velocity_daily)
        ELSE 999
    END as runout_days,
    
    -- Status
    CASE 
        WHEN (sb.baseline_for_ledger - COALESCE(ld.pos_live_deductions, 0) - COALESCE(ld.damage_deductions, 0) + COALESCE(ld.adjustment_net, 0)) <= COALESCE(lc.fixed_safety_stock, mm.safety_stock, 10) THEN 'CRITICAL_RISK'
        WHEN (sb.baseline_for_ledger - COALESCE(ld.pos_live_deductions, 0) - COALESCE(ld.damage_deductions, 0) + COALESCE(ld.adjustment_net, 0)) <= COALESCE(lc.fixed_reorder_point, mm.reorder_point, 25) THEN 'REPLENISHMENT_NEEDED'
        ELSE 'HEALTHY'
    END as stock_status,
    
    -- Sync metadata
    sb.last_synced_at as baseline_last_sync,
    ld.last_movement_at
    
FROM stock_baselines sb
JOIN material_master mm ON sb.material_id = mm.id
JOIN stores s ON sb.store_id = s.id
LEFT JOIN live_deductions ld ON mm.sku = ld.sku
LEFT JOIN latest_velocity lv
    ON sb.tenant_id = lv.tenant_id
    AND sb.store_id = lv.store_id
    AND sb.material_id = lv.material_id
LEFT JOIN latest_config lc
    ON sb.tenant_id = lc.tenant_id
    AND sb.store_id = lc.store_id
    AND sb.material_id = lc.material_id;
