-- Omnichannel Digital Reservations Table
CREATE TABLE IF NOT EXISTS public.erp_omnichannel_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR(50) NOT NULL,
    plant_id VARCHAR(4) NOT NULL REFERENCES public.erp_plants(plant_id),
    reserved_qty INT NOT NULL DEFAULT 0,
    channel VARCHAR(20) DEFAULT 'BOPIS', -- Buy Online, Pick Up In Store
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Extend Ledger with last_sales_timestamp column
ALTER TABLE public.live_inventory_ledger 
ADD COLUMN IF NOT EXISTS last_sales_timestamp TIMESTAMP WITH TIME ZONE DEFAULT (now() - INTERVAL '3 days');

-- Rebuild the Core Replenishment Alerts View with Omnichannel ATP, Ghost Inventory, and Lateral STO Sourcing
CREATE OR REPLACE VIEW public.v_replenishment_alerts AS
SELECT 
    l.sku,
    l.product_name,
    l.sap_plant_code,
    l.sap_storage_loc,
    l.uom,
    l.sap_baseline_qty,
    l.pos_live_deductions,
    l.current_calculated_stock,
    COALESCE(v.daily_velocity, 1.0) AS daily_velocity,
    COALESCE(v.units_sold_7d, 0::bigint) AS units_sold_7d,
    v.last_sale_at,
    round(l.current_calculated_stock::numeric / NULLIF(COALESCE(v.daily_velocity, 1.0), 0::numeric), 2) AS run_out_horizon_days,
    CASE
        WHEN (l.current_calculated_stock::numeric / NULLIF(COALESCE(v.daily_velocity, 1.0), 0::numeric)) <= 2.0 OR l.current_calculated_stock::numeric <= (l.sap_baseline_qty::numeric * 0.1) THEN 'CRITICAL_RISK'::text
        WHEN (l.current_calculated_stock::numeric / NULLIF(COALESCE(v.daily_velocity, 1.0), 0::numeric)) > 2.0 AND (l.current_calculated_stock::numeric / NULLIF(COALESCE(v.daily_velocity, 1.0), 0::numeric)) <= 5.0 OR l.current_calculated_stock::numeric <= (l.sap_baseline_qty::numeric * 0.3) THEN 'REPLENISHMENT_NEEDED'::text
        ELSE 'STOCK_OK'::text
    END AS replenishment_status,
    l.last_sap_sync_at,
    l.updated_at,
    l.merchandise_category,
    r.netpr_price,
    r.minbm_moq,
    r.vendor_id,
    r.vendor_name,
    r.vendor_lead_days,
    r.matkl_group,
    COALESCE(inbound.total_inbound, 0::bigint)::integer AS open_inbound_qty,
    p.plant_name,
    p.plant_type,
    p.city,
    COALESCE(r.bstrf_rounding_val, 24) AS bstrf_rounding_val,
    (l.current_calculated_stock - COALESCE((SELECT sum(res.reserved_qty) FROM public.erp_omnichannel_reservations res WHERE res.sku = l.sku AND res.plant_id = l.plant_id), 0)) AS atp_stock,
    CASE
        WHEN l.current_calculated_stock > (l.sap_baseline_qty * 0.5)
             AND l.last_sales_timestamp < (now() - INTERVAL '48 hours')
             AND l.merchandise_category = 'FMCG' THEN true
        ELSE false
    END AS is_ghost_anomaly,
    (
        SELECT p2.plant_name || ' (' || p2.plant_id || ') has ' || ol.current_calculated_stock || ' units available'
        FROM public.live_inventory_ledger ol
        JOIN public.erp_plants p2 ON ol.plant_id = p2.plant_id
        WHERE ol.sku = l.sku 
          AND ol.plant_id <> l.plant_id 
          AND ol.current_calculated_stock > (ol.sap_baseline_qty * 1.5)
        LIMIT 1
    ) AS lateral_sto_source
FROM public.live_inventory_ledger l
LEFT JOIN public.erp_plants p ON l.plant_id = p.plant_id
LEFT JOIN public.v_sku_velocity_metrics v ON l.sku::text = v.sku::text
LEFT JOIN public.erp_purchase_info_records r ON l.sku::text = r.sku::text
LEFT JOIN (
    SELECT sku, sum(open_inbound_qty) AS total_inbound
    FROM public.erp_open_inbound_orders
    GROUP BY sku
) inbound ON l.sku::text = inbound.sku::text
WHERE l.current_calculated_stock::numeric <= (l.sap_baseline_qty::numeric * 0.3)
  AND NOT (l.sku::text IN (
      SELECT DISTINCT sku::text 
      FROM public.erp_staged_requisitions 
      WHERE status = 'STAGED'::pr_status_tier
  ))
  AND NOT (l.sku::text IN (
      SELECT DISTINCT sku::text
      FROM public.pending_replenishments
      WHERE status = 'STAGED'
  ))
ORDER BY (round(l.current_calculated_stock::numeric / NULLIF(COALESCE(v.daily_velocity, 1.0), 0::numeric), 2)) NULLS FIRST;
