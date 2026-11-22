// Supabase Edge Function: demand-forecast
// Generates P50/P90 store-material demand forecasts with an out-of-sample
// backtest, and persists both for later accuracy measurement.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  ContextFeature, forecastDemand,
} from "../_shared/forecast/baseline-forecaster.ts"
import { ContextMultipliers } from "../_shared/reorder-engine/context-multipliers.ts"
import { requireAuth, authFailureResponse, resolveTenantScope } from "../_shared/security/require-auth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
}

const HISTORY_DAYS = 84
const DEFAULT_HORIZON = 14

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const auth = await requireAuth(req, { allowService: true })
  if (!auth.ok) return authFailureResponse(auth, corsHeaders)
  const scope = resolveTenantScope(auth.ctx, req.headers.get('x-tenant-id'))
  if (!scope.ok) return authFailureResponse(scope, corsHeaders)
  const tenantId = scope.tenantId

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const payload = await req.json().catch(() => ({}))
    const storeId: string | undefined = payload.store_id
    const materialId: string | undefined = payload.material_id
    const horizonDays = Math.min(90, Math.max(1, Number(payload.horizon_days ?? DEFAULT_HORIZON)))

    if (!storeId || !materialId) {
      return json({ error: 'store_id and material_id are required' }, 422)
    }

    const { data: material } = await supabase
      .from('material_master')
      .select('id, sku')
      .eq('id', materialId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (!material?.sku) return json({ error: 'material not found for this tenant' }, 404)

    const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString()
    const { data: sales, error: salesError } = await supabase
      .from('inventory_movements')
      .select('created_at, quantity')
      .eq('tenant_id', tenantId)
      .eq('store_id', storeId)
      .eq('sku', material.sku)
      .eq('movement_type', 'SALE')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
    if (salesError) throw salesError

    const { data: stockHistory } = await supabase
      .from('stock_baselines')
      .select('last_synced_at, qty_unrestricted')
      .eq('tenant_id', tenantId)
      .eq('store_id', storeId)
      .eq('material_id', materialId)
      .gte('last_synced_at', since)

    const stockoutDays = new Set<string>(
      (stockHistory ?? [])
        .filter((row: any) => Number(row.qty_unrestricted ?? 0) <= 1)
        .map((row: any) => String(row.last_synced_at).split('T')[0]),
    )
    const byDate = new Map<string, number>()
    for (const row of sales ?? []) {
      const date = String(row.created_at).split('T')[0]
      byDate.set(date, (byDate.get(date) ?? 0) + Math.abs(Number(row.quantity ?? 0)))
    }
    const history = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, qty]) => ({ date, qty, stockout: stockoutDays.has(date) }))

    if (history.length < 14) {
      return json({
        status: 'insufficient_data',
        error: 'At least 14 days of sales history are required before a forecast is trusted.',
        days: history.length,
      }, 422)
    }

    // Context factors for each future day. Missing signals stay neutral and
    // are reported by ContextMultipliers rather than being invented.
    const context = new ContextMultipliers(supabase)
    const features: ContextFeature[] = []
    for (let h = 1; h <= horizonDays; h++) {
      const date = new Date(Date.now() + h * 86400000).toISOString().split('T')[0]
      const result = await context.calculate({
        tenantId,
        storeId,
        materialId,
        forecastDate: new Date(`${date}T00:00:00Z`),
        baseVelocity: 0,
      })
      features.push({
        date,
        weather: result.weatherMultiplier,
        holiday: result.holidayMultiplier,
        promotion: result.promotionMultiplier,
      })
    }

    const forecast = forecastDemand({ history, features, horizonDays })
    const today = new Date().toISOString().split('T')[0]

    const rows = forecast.points.map((p) => ({
      tenant_id: tenantId,
      store_id: storeId,
      material_id: materialId,
      forecast_date: p.date,
      horizon_days: p.horizonDays,
      model_version: forecast.modelVersion,
      p50_qty: p.p50,
      p90_qty: p.p90,
      feature_snapshot: {
        level: p.level,
        weekday_factor: p.weekdayFactor,
        trend_factor: p.trendFactor,
        context_factor: p.contextFactor,
        uncertainty_multiplier: forecast.diagnostics.uncertaintyMultiplier,
      },
    }))
    const { error: upsertError } = await supabase
      .from('demand_forecasts')
      .upsert(rows, {
        onConflict: 'tenant_id,store_id,material_id,forecast_date,model_version',
      })
    if (upsertError) throw upsertError

    const backtest = forecast.backtest
    if (backtest) {
      const drift = backtest.wape > 0.35 || backtest.p90Coverage < 0.8 ||
        backtest.wape >= backtest.naiveWape
      await supabase.from('forecast_accuracy').upsert({
        tenant_id: tenantId,
        store_id: storeId,
        material_id: materialId,
        evaluation_date: today,
        model_version: forecast.modelVersion,
        sample_days: backtest.sampleDays,
        backtest_wape: backtest.wape,
        backtest_bias: backtest.bias,
        backtest_p90_coverage: backtest.p90Coverage,
        status: drift ? 'DRIFT' : 'PENDING',
        note: drift
          ? 'Backtest did not beat the naive baseline or missed the P90 coverage target; do not use for automation.'
          : 'Backtest passed; awaiting matured forecast measurements.',
      }, {
        onConflict: 'tenant_id,store_id,material_id,evaluation_date,model_version',
      })
    }

    return json({
      status: 'completed',
      tenant_id: tenantId,
      store_id: storeId,
      material_id: materialId,
      model_version: forecast.modelVersion,
      diagnostics: forecast.diagnostics,
      backtest: backtest ?? { status: 'insufficient_data' },
      forecast_points: forecast.points.length,
      first_points: forecast.points.slice(0, 7),
    })
  } catch (err) {
    console.error('[demand-forecast] error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
