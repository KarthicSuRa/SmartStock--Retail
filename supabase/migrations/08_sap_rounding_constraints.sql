-- Alter erp_purchase_info_records to add bstrf_rounding_val
ALTER TABLE public.erp_purchase_info_records 
ADD COLUMN IF NOT EXISTS bstrf_rounding_val INTEGER DEFAULT 24;

-- Rebuild the Core Replenishment Alerts View with the actual column
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
    COALESCE(r.bstrf_rounding_val, 24) AS bstrf_rounding_val
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
