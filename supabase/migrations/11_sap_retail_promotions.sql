-- Migration 11: SAP Retail Promotions Integration
-- Description: Create sap_retail_promotions table and update v_replenishment_alerts view to factor active promotions.

-- 1. Create the SAP Retail Promotions Table
CREATE TABLE IF NOT EXISTS public.sap_retail_promotions (
    promotion_id VARCHAR(10) PRIMARY KEY, -- Maps to SAP AKTNR
    sku VARCHAR(50) NOT NULL,
    plant_id VARCHAR(4) NOT NULL REFERENCES public.erp_plants(plant_id),
    discount_percentage NUMERIC CHECK (discount_percentage BETWEEN 0 AND 100),
    uplift_factor NUMERIC DEFAULT 1.0, -- e.g., 2.5 means a 250% sales surge
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    campaign_name VARCHAR(100)
);

-- Enable Row Level Security on the new table
ALTER TABLE public.sap_retail_promotions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow full access for demo application
CREATE POLICY "Allow all actions on sap_retail_promotions"
ON public.sap_retail_promotions
FOR ALL
USING (true)
WITH CHECK (true);

-- 2. Overhaul public.v_replenishment_alerts view
DROP VIEW IF EXISTS public.v_replenishment_alerts CASCADE;

CREATE OR REPLACE VIEW public.v_replenishment_alerts AS
WITH computed_velocity AS (
    SELECT 
        l.sku,
        l.plant_id,
        CASE 
            WHEN promo.promotion_id IS NOT NULL THEN (l.sap_baseline_qty::numeric / 30.0) * promo.uplift_factor
            ELSE COALESCE(v.daily_velocity, 1.0)
        END AS daily_velocity,
        promo.campaign_name,
        promo.discount_percentage
    FROM live_inventory_ledger l
    LEFT JOIN v_sku_velocity_metrics v ON l.sku::text = v.sku::text
    LEFT JOIN public.sap_retail_promotions promo ON l.sku::text = promo.sku::text 
        AND l.plant_id::text = promo.plant_id::text 
        AND now() >= promo.start_date 
        AND now() <= promo.end_date
)
SELECT 
    l.sku,
    l.product_name,
    l.sap_plant_code,
    l.sap_storage_loc,
    l.uom,
    l.sap_baseline_qty,
    l.pos_live_deductions,
    l.current_calculated_stock,
    cv.daily_velocity,
    COALESCE(v.units_sold_7d, 0::bigint) AS units_sold_7d,
    v.last_sale_at,
    round(l.current_calculated_stock::numeric / NULLIF(cv.daily_velocity, 0::numeric), 2) AS run_out_horizon_days,
    CASE
        WHEN (l.current_calculated_stock::numeric / NULLIF(cv.daily_velocity, 0::numeric)) <= 2.0 OR l.current_calculated_stock::numeric <= (l.sap_baseline_qty::numeric * 0.1) THEN 'CRITICAL_RISK'::text
        WHEN (l.current_calculated_stock::numeric / NULLIF(cv.daily_velocity, 0::numeric)) > 2.0 AND (l.current_calculated_stock::numeric / NULLIF(cv.daily_velocity, 0::numeric)) <= 5.0 OR l.current_calculated_stock::numeric <= (l.sap_baseline_qty::numeric * 0.3) THEN 'REPLENISHMENT_NEEDED'::text
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
    l.current_calculated_stock - COALESCE(( SELECT sum(res.reserved_qty) AS sum
           FROM erp_omnichannel_reservations res
          WHERE res.sku::text = l.sku::text AND res.plant_id::text = l.plant_id::text), 0::bigint) AS atp_stock,
    CASE
        WHEN l.current_calculated_stock::numeric > (l.sap_baseline_qty::numeric * 0.5) AND l.last_sales_timestamp < (now() - '48:00:00'::interval) AND l.merchandise_category::text = 'FMCG'::text THEN true
        ELSE false
    END AS is_ghost_anomaly,
    ( SELECT ((((p2.plant_name::text || ' ('::text) || p2.plant_id::text) || ') has '::text) || ol.current_calculated_stock) || ' units available'::text
           FROM live_inventory_ledger ol
             JOIN erp_plants p2 ON ol.plant_id::text = p2.plant_id::text
          WHERE ol.sku::text = l.sku::text AND ol.plant_id::text <> l.plant_id::text AND ol.current_calculated_stock::numeric > (ol.sap_baseline_qty::numeric * 1.5)
         LIMIT 1) AS lateral_sto_source,
    cv.daily_velocity * COALESCE(r.vendor_lead_days, 0)::numeric + cv.daily_velocity * 3.0 AS dynamic_reorder_point,
    cv.campaign_name,
    cv.discount_percentage
FROM live_inventory_ledger l
JOIN computed_velocity cv ON l.sku::text = cv.sku::text AND l.plant_id::text = cv.plant_id::text
LEFT JOIN erp_plants p ON l.plant_id::text = p.plant_id::text
LEFT JOIN v_sku_velocity_metrics v ON l.sku::text = v.sku::text
LEFT JOIN erp_purchase_info_records r ON l.sku::text = r.sku::text
LEFT JOIN ( SELECT erp_open_inbound_orders.sku,
        sum(erp_open_inbound_orders.open_inbound_qty) AS total_inbound
       FROM erp_open_inbound_orders
      GROUP BY erp_open_inbound_orders.sku) inbound ON l.sku::text = inbound.sku::text
WHERE 
    (l.current_calculated_stock - COALESCE(( SELECT sum(res.reserved_qty) AS sum
           FROM erp_omnichannel_reservations res
          WHERE res.sku::text = l.sku::text AND res.plant_id::text = l.plant_id::text), 0::bigint))::numeric 
    <= (cv.daily_velocity * COALESCE(r.vendor_lead_days, 0)::numeric + cv.daily_velocity * 3.0) 
    AND NOT (l.sku::text IN ( SELECT DISTINCT erp_staged_requisitions.sku::text AS sku
           FROM erp_staged_requisitions
          WHERE erp_staged_requisitions.status = 'STAGED'::pr_status_tier)) 
    AND NOT (l.sku::text IN ( SELECT DISTINCT pending_replenishments.sku::text AS sku
           FROM pending_replenishments
          WHERE pending_replenishments.status::text = 'STAGED'::text))
ORDER BY (round(l.current_calculated_stock::numeric / NULLIF(cv.daily_velocity, 0::numeric), 2)) NULLS FIRST;
