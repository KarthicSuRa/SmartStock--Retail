-- =============================================================================
-- Migration 43: Atomic Projection Application Function
-- SmartStock LiveRetail V2
--
-- PURPOSE:
--   Atomically updates inventory_position and registers the event in
--   projection_applied_events within a single database transaction.
-- =============================================================================

CREATE OR REPLACE FUNCTION apply_projection_event(
    p_event_id          UUID,
    p_tenant_id         UUID,
    p_location_id       UUID,
    p_material_id       UUID,
    p_sku               VARCHAR,
    p_product_name      VARCHAR,
    p_uom               VARCHAR,
    p_erp_checkpoint_qty NUMERIC,
    p_estimated_on_hand NUMERIC,
    p_sellable_qty      NUMERIC,
    p_reserved_qty      NUMERIC,
    p_in_transit_qty    NUMERIC,
    p_last_physical_count_qty NUMERIC,
    p_last_physical_count_at TIMESTAMPTZ,
    p_reconciliation_status VARCHAR,
    p_business_timestamp TIMESTAMPTZ,
    p_projection_version BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    -- 1. Check if event was already applied
    IF EXISTS (
        SELECT 1 FROM projection_applied_events
        WHERE event_id = p_event_id AND projection_name = 'inventory_position'
    ) THEN
        RETURN FALSE; -- Already applied, skip mutation
    END IF;

    -- 2. Upsert updated position
    INSERT INTO inventory_position (
        tenant_id,
        location_id,
        material_id,
        sku,
        product_name,
        uom,
        erp_checkpoint_qty,
        estimated_on_hand,
        sellable_qty,
        reserved_qty,
        in_transit_qty,
        last_physical_count_qty,
        last_physical_count_at,
        reconciliation_status,
        last_event_id,
        last_event_at,
        projection_version,
        updated_at
    )
    VALUES (
        p_tenant_id,
        p_location_id,
        p_material_id,
        COALESCE(p_sku, 'SKU-AUTO'),
        COALESCE(p_product_name, 'Material Auto'),
        COALESCE(p_uom, 'PC'),
        p_erp_checkpoint_qty,
        p_estimated_on_hand,
        p_sellable_qty,
        p_reserved_qty,
        p_in_transit_qty,
        p_last_physical_count_qty,
        p_last_physical_count_at,
        p_reconciliation_status,
        p_event_id,
        p_business_timestamp,
        p_projection_version,
        NOW()
    )
    ON CONFLICT (tenant_id, location_id, material_id)
    DO UPDATE SET
        sku = EXCLUDED.sku,
        erp_checkpoint_qty = EXCLUDED.erp_checkpoint_qty,
        estimated_on_hand = EXCLUDED.estimated_on_hand,
        sellable_qty = EXCLUDED.sellable_qty,
        reserved_qty = EXCLUDED.reserved_qty,
        in_transit_qty = EXCLUDED.in_transit_qty,
        last_physical_count_qty = EXCLUDED.last_physical_count_qty,
        last_physical_count_at = EXCLUDED.last_physical_count_at,
        reconciliation_status = EXCLUDED.reconciliation_status,
        last_event_id = EXCLUDED.last_event_id,
        last_event_at = EXCLUDED.last_event_at,
        projection_version = EXCLUDED.projection_version,
        updated_at = NOW();

    -- 3. Mark event applied in registry
    INSERT INTO projection_applied_events (event_id, projection_name, projection_version, applied_at)
    VALUES (p_event_id, 'inventory_position', p_projection_version, NOW());

    RETURN TRUE;
END;
$$;
