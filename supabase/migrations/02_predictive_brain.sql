-- ============================================================
-- Migration 02: Predictive Brain — SKU Velocity & Replenishment
-- Project: SAP LiveRetail Replenishment Engine
-- Created: 2026-06-11
-- ============================================================

-- ------------------------------------------------------------
-- 1. Performance Index on pos_sales_events.created_at
--    Ensures trailing-7-day window queries stay sub-second.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pos_sales_events_created_at
  ON public.pos_sales_events (created_at DESC);

-- ------------------------------------------------------------
-- 2. Security Barrier View: v_sku_velocity_metrics
--    Calculates a high-precision daily_velocity per SKU using
--    a trailing 7-day sales window. Falls back to 1.0 for
--    SKUs with zero sales history to prevent division-by-zero.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_sku_velocity_metrics
  WITH (security_barrier = true)
AS
WITH sales_lines AS (
  SELECT
    p.created_at,
    (x->>'sku')::VARCHAR AS sku,
    (x->>'quantity')::INTEGER AS quantity_sold
  FROM public.pos_sales_events p,
  LATERAL jsonb_array_elements(p.raw_payload->'items') AS x
)
SELECT
  sku,
  -- Sum of units sold over the last 7 trailing days
  COALESCE(
    SUM(quantity_sold) FILTER (
      WHERE created_at >= (NOW() - INTERVAL '7 days')
    ),
    0
  ) AS units_sold_7d,

  -- High-precision daily velocity: total_7d / 7
  -- Fallback: if no sales history exists → default to 1.0 to
  -- prevent division-by-zero and avoid false "safe" signals.
  CASE
    WHEN COALESCE(
      SUM(quantity_sold) FILTER (
        WHERE created_at >= (NOW() - INTERVAL '7 days')
      ),
      0
    ) = 0
    THEN 1.0::NUMERIC(10, 6)
    ELSE (
      SUM(quantity_sold) FILTER (
        WHERE created_at >= (NOW() - INTERVAL '7 days')
      )::NUMERIC(10, 6) / 7.0
    )
  END AS daily_velocity,

  MAX(created_at) AS last_sale_at
FROM sales_lines
GROUP BY sku;

-- Grant read access to the authenticated role and anon
GRANT SELECT ON public.v_sku_velocity_metrics TO authenticated;
GRANT SELECT ON public.v_sku_velocity_metrics TO anon;

-- ------------------------------------------------------------
-- 3. Automated View: v_replenishment_alerts
--    Joins live_inventory_ledger with v_sku_velocity_metrics.
--    Calculates run_out_horizon_days = Stock / Velocity.
--    Flags items as CRITICAL_RISK (≤ 2 days) or
--    REPLENISHMENT_NEEDED (2 – 5 days).
-- ------------------------------------------------------------
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

  -- Velocity from the metrics view (defaults to 1.0 if no history)
  COALESCE(v.daily_velocity, 1.0)                          AS daily_velocity,
  COALESCE(v.units_sold_7d, 0)                             AS units_sold_7d,
  v.last_sale_at,

  -- Run-out horizon: how many days of stock remain at current velocity
  ROUND(
    l.current_calculated_stock::NUMERIC /
    NULLIF(COALESCE(v.daily_velocity, 1.0), 0),
    2
  )                                                        AS run_out_horizon_days,

  -- Risk classification
  CASE
    WHEN (
      l.current_calculated_stock::NUMERIC /
      NULLIF(COALESCE(v.daily_velocity, 1.0), 0)
    ) <= 2.0
    THEN 'CRITICAL_RISK'

    WHEN (
      l.current_calculated_stock::NUMERIC /
      NULLIF(COALESCE(v.daily_velocity, 1.0), 0)
    ) > 2.0
    AND (
      l.current_calculated_stock::NUMERIC /
      NULLIF(COALESCE(v.daily_velocity, 1.0), 0)
    ) <= 5.0
    THEN 'REPLENISHMENT_NEEDED'

    ELSE 'STOCK_OK'
  END                                                      AS replenishment_status,

  l.last_sap_sync_at,
  l.updated_at

FROM public.live_inventory_ledger l
LEFT JOIN public.v_sku_velocity_metrics v
  ON l.sku = v.sku

ORDER BY run_out_horizon_days ASC NULLS FIRST;

-- Grant read access
GRANT SELECT ON public.v_replenishment_alerts TO authenticated;
GRANT SELECT ON public.v_replenishment_alerts TO anon;
