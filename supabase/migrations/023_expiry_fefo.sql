-- /supabase/migrations/023_expiry_fefo.sql

-- Track batch-level inventory (for FEFO)
CREATE TABLE IF NOT EXISTS inventory_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES material_master(id) ON DELETE CASCADE,
    
    batch_number VARCHAR(50) NOT NULL,
    manufacturing_date DATE,
    expiry_date DATE NOT NULL,
    
    initial_qty DECIMAL(12,3) NOT NULL,
    remaining_qty DECIMAL(12,3) NOT NULL,
    uom VARCHAR(10),
    
    -- FEFO priority
    days_until_expiry INTEGER GENERATED ALWAYS AS (expiry_date - CURRENT_DATE) STORED,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'transferred', 'written_off', 'sold')),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, store_id, material_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_batches_expiry ON inventory_batches(tenant_id, store_id, expiry_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_batches_material ON inventory_batches(tenant_id, material_id, expiry_date);

-- FEFO transfer recommendations view
CREATE OR REPLACE VIEW fefo_transfer_recommendations AS
WITH batch_risk AS (
    SELECT 
        ib.tenant_id,
        ib.store_id as source_store_id,
        s.name as source_store_name,
        ib.material_id,
        mm.sku,
        mm.description,
        ib.batch_number,
        ib.expiry_date,
        ib.remaining_qty,
        ib.days_until_expiry,
        sv.forecast_velocity_daily,
        CASE 
            WHEN COALESCE(sv.forecast_velocity_daily, 0) > 0 
            THEN ib.remaining_qty / sv.forecast_velocity_daily 
            ELSE 999 
        END as days_of_stock_remaining,
        GREATEST(0, ib.remaining_qty - (ib.days_until_expiry * COALESCE(sv.forecast_velocity_daily, 0))) as excess_at_risk
    FROM inventory_batches ib
    JOIN material_master mm ON ib.material_id = mm.id
    JOIN stores s ON ib.store_id = s.id
    LEFT JOIN sales_velocity sv 
        ON ib.tenant_id = sv.tenant_id 
        AND ib.store_id = sv.store_id 
        AND ib.material_id = sv.material_id
    WHERE ib.status = 'active'
      AND ib.days_until_expiry <= 14
      AND ib.remaining_qty > 0
),
sister_stores AS (
    SELECT 
        br.*,
        target.id as target_store_id,
        target.name as target_store_name,
        target_sv.forecast_velocity_daily as target_velocity,
        GREATEST(0, (br.days_until_expiry * COALESCE(target_sv.forecast_velocity_daily, 0)) - COALESCE(target_stock.current_calculated_stock, 0)) as target_absorption_capacity
    FROM batch_risk br
    CROSS JOIN stores target
    LEFT JOIN sales_velocity target_sv 
        ON br.tenant_id = target_sv.tenant_id 
        AND target.id = target_sv.store_id 
        AND br.material_id = target_sv.material_id
    LEFT JOIN live_inventory_ledger target_stock
        ON br.tenant_id = target_stock.tenant_id
        AND target.id = target_stock.store_id
        AND br.material_id = target_stock.material_id
    WHERE target.tenant_id = br.tenant_id
      AND target.id != br.source_store_id
      AND target.is_active = TRUE
)
SELECT 
    tenant_id,
    source_store_id,
    source_store_name,
    material_id,
    sku,
    description,
    batch_number,
    expiry_date,
    remaining_qty,
    days_until_expiry,
    excess_at_risk,
    target_store_id,
    target_store_name,
    target_velocity,
    target_absorption_capacity,
    LEAST(excess_at_risk, target_absorption_capacity, remaining_qty) as suggested_transfer_qty,
    CASE 
        WHEN days_until_expiry <= 3 THEN 'URGENT'
        WHEN days_until_expiry <= 7 THEN 'HIGH'
        ELSE 'MEDIUM'
    END as priority,
    excess_at_risk * COALESCE(mm.standard_price, 0) as value_at_risk
FROM sister_stores
JOIN material_master mm ON sister_stores.material_id = mm.id
WHERE LEAST(excess_at_risk, target_absorption_capacity, remaining_qty) > 0
ORDER BY 
    CASE WHEN days_until_expiry <= 3 THEN 1 WHEN days_until_expiry <= 7 THEN 2 ELSE 3 END,
    value_at_risk DESC;

ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY batch_isolation ON inventory_batches FOR ALL 
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID);
