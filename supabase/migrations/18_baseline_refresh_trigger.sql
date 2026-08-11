-- /supabase/migrations/18_baseline_refresh_trigger.sql

-- ==================== LIVE INVENTORY LEDGER VIEW ====================
-- Calculated live inventory view joining ERP stock baselines with real-time POS & floor movement deductions

CREATE OR REPLACE VIEW live_inventory_ledger_v2 AS
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
)
SELECT 
    sb.tenant_id,
    sb.store_id,
    s.name as store_name,
    s.sap_plant_code,
    sb.material_id,
    mm.sku,
    mm.description as product_name,
    mm.ean_gtin,
    mm.material_group,
    mm.is_perishable,
    mm.shelf_life_days,
    
    -- Core dynamic formula
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
    
    -- Sync timestamps
    sb.last_synced_at as last_sap_sync_at,
    ld.last_movement_at,
    
    -- Safety metrics & stock status
    CASE 
        WHEN (sb.baseline_for_ledger - COALESCE(ld.pos_live_deductions, 0) - COALESCE(ld.damage_deductions, 0) + COALESCE(ld.adjustment_net, 0)) <= COALESCE(mm.safety_stock, 10) THEN 'CRITICAL_RISK'
        WHEN (sb.baseline_for_ledger - COALESCE(ld.pos_live_deductions, 0) - COALESCE(ld.damage_deductions, 0) + COALESCE(ld.adjustment_net, 0)) <= COALESCE(mm.reorder_point, 25) THEN 'REPLENISHMENT_NEEDED'
        ELSE 'STOCK_OK'
    END as replenishment_status
    
FROM stock_baselines sb
JOIN material_master mm ON sb.material_id = mm.id
JOIN stores s ON sb.store_id = s.id
LEFT JOIN live_deductions ld ON mm.sku = ld.sku;

-- ==================== TRIGGER: Notify Realtime on Baseline Update ====================
CREATE OR REPLACE FUNCTION notify_baseline_change()
RETURNS TRIGGER AS $$
DECLARE
    payload JSONB;
    material_sku VARCHAR(50);
BEGIN
    SELECT sku INTO material_sku FROM material_master WHERE id = NEW.material_id;
    
    payload = jsonb_build_object(
        'event', 'baseline_updated',
        'tenant_id', NEW.tenant_id,
        'store_id', NEW.store_id,
        'material_id', NEW.material_id,
        'sku', material_sku,
        'old_baseline', OLD.baseline_for_ledger,
        'new_baseline', NEW.baseline_for_ledger,
        'sync_source', NEW.sync_source,
        'synced_at', NEW.last_synced_at
    );
    
    PERFORM pg_notify(
        'live-ledger-updates',
        payload::text
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notify_baseline_change') THEN
        CREATE TRIGGER trg_notify_baseline_change
            AFTER UPDATE ON stock_baselines
            FOR EACH ROW
            WHEN (OLD.baseline_for_ledger IS DISTINCT FROM NEW.baseline_for_ledger)
            EXECUTE FUNCTION notify_baseline_change();
    END IF;
END $$;

-- ==================== FUNCTION: Manual Physical Count Reconciliation ====================
CREATE OR REPLACE FUNCTION reconcile_physical_count(
    p_tenant_id UUID,
    p_store_id UUID,
    p_sku VARCHAR(50),
    p_physical_qty DECIMAL(12,3),
    p_counted_by UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
    variance DECIMAL(12,3),
    old_calculated_stock DECIMAL(12,3),
    new_calculated_stock DECIMAL(12,3),
    action_taken TEXT
) AS $$
DECLARE
    v_material_id UUID;
    v_old_calculated DECIMAL(12,3);
    v_variance DECIMAL(12,3);
BEGIN
    SELECT id INTO v_material_id FROM material_master 
    WHERE tenant_id = p_tenant_id AND sku = p_sku;
    
    IF v_material_id IS NULL THEN
        RAISE EXCEPTION 'SKU % not found for tenant', p_sku;
    END IF;
    
    SELECT current_calculated_stock INTO v_old_calculated
    FROM live_inventory_ledger_v2
    WHERE tenant_id = p_tenant_id AND store_id = p_store_id AND sku = p_sku;
    
    v_variance := p_physical_qty - COALESCE(v_old_calculated, 0);
    
    IF v_variance != 0 THEN
        INSERT INTO inventory_movements (
            sku, store_id, movement_type, quantity, uom,
            reference_document, reference_date, posted_by, erp_status, created_at
        ) VALUES (
            p_sku, 
            p_store_id::text, 
            'COUNT', 
            v_variance,
            'EA',
            'PHYSICAL_COUNT_' || gen_random_uuid(),
            NOW(),
            p_counted_by::text,
            'PENDING_SYNC',
            NOW()
        );
        
        INSERT INTO sync_audit_log (
            tenant_id, erp_config_id, entity_type, entity_id, erp_key,
            action, new_values, processed_by
        ) VALUES (
            p_tenant_id,
            (SELECT erp_config_id FROM stock_baselines 
             WHERE tenant_id = p_tenant_id AND store_id = p_store_id AND material_id = v_material_id LIMIT 1),
            'physical_count',
            v_material_id,
            p_sku,
            'UPDATE',
            jsonb_build_object(
                'old_calculated', v_old_calculated,
                'physical_count', p_physical_qty,
                'variance', v_variance,
                'notes', p_notes
            ),
            p_counted_by::text
        );
    END IF;
    
    RETURN QUERY SELECT 
        v_variance,
        v_old_calculated,
        p_physical_qty,
        CASE 
            WHEN v_variance = 0 THEN 'No variance - stock accurate'
            WHEN v_variance > 0 THEN 'Stock adjustment: +' || v_variance::text || ' added to ledger'
            ELSE 'Stock adjustment: ' || v_variance::text || ' removed from ledger (shrinkage)'
        END;
END;
$$ LANGUAGE plpgsql;
