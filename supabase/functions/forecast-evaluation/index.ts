// Supabase Edge Function: forecast-evaluation
// Measures matured forecasts against actual sales. A model is only as good as
// its out-of-sample record; DRIFT blocks its use in auto-replenishment.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { requireAuth, authFailureResponse, resolveTenantScope } from "../_shared/security/require-auth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
}

const WAPE_DRIFT_THRESHOLD = 0.35
const P90_COVERAGE_FLOOR = 0.80
const MAX_GROUPS = 200

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

interface ForecastRow {
  store_id: string;
  material_id: string;
  material_sku?: string;
  forecast_date: string;
  model_version: string;
  p50_qty: number;
  p90_qty: number;
}

interface Metrics {
  wape: number;
  bias: number;
  p50Coverage: number;
  p90Coverage: number;
  sampleDays: number;
}

function measure(rows: ForecastRow[], actualByDate: Map<string, number>): Metrics | null {
  if (!rows.length) return null
  let absError = 0
  let signedError = 0
  let actualTotal = 0
  let p50Hits = 0
  let p90Hits = 0

  for (const row of rows) {
    const actual = actualByDate.get(row.forecast_date) ?? 0
    const p50 = Number(row.p50_qty)
    const p90 = Number(row.p90_qty)
    absError += Math.abs(actual - p50)
    signedError += p50 - actual
    actualTotal += actual
    if (actual <= p50) p50Hits++
    if (actual <= p90) p90Hits++
  }

  const wape = actualTotal > 0
    ? absError / actualTotal
    : (absError > 0 ? 1 : 0)
  const bias = actualTotal > 0 ? signedError / actualTotal : 0
  return {
    wape: Number(wape.toFixed(4)),
    bias: Number(bias.toFixed(4)),
    p50Coverage: Number((p50Hits / rows.length).toFixed(4)),
    p90Coverage: Number((p90Hits / rows.length).toFixed(4)),
    sampleDays: rows.length,
  }
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
    const today = new Date().toISOString().split('T')[0]

    const { data: matured, error: forecastError } = await supabase
      .from('demand_forecasts')
      .select('store_id, material_id, forecast_date, model_version, p50_qty, p90_qty')
      .eq('tenant_id', tenantId)
      .lt('forecast_date', today)
      .order('forecast_date', { ascending: true })
      .limit(5000)
    if (forecastError) throw forecastError

    const groups = new Map<string, ForecastRow[]>()
    for (const row of (matured ?? []) as ForecastRow[]) {
      const key = `${row.store_id}|${row.material_id}|${row.model_version}`
      const list = groups.get(key) ?? []
      list.push(row)
      groups.set(key, list)
    }

    const materialIds = Array.from(new Set(
      Array.from(groups.values()).flatMap((rows) => rows.map((r) => r.material_id)),
    ))
    const skuByMaterial = new Map<string, string>()
    if (materialIds.length) {
      const { data: materials } = await supabase
        .from('material_master')
        .select('id, sku')
        .eq('tenant_id', tenantId)
        .in('id', materialIds.slice(0, 500))
      for (const m of materials ?? []) skuByMaterial.set(m.id, m.sku)
    }

    let evaluated = 0
    let drifted = 0
    let insufficient = 0
    const summaries: any[] = []

    for (const [key, rows] of Array.from(groups.entries()).slice(0, MAX_GROUPS)) {
      const [storeId, materialId, modelVersion] = key.split('|')
      const sku = skuByMaterial.get(materialId)
      if (!sku) {
        insufficient++
        continue
      }

      const firstDate = rows.reduce((a, r) => (r.forecast_date < a ? r.forecast_date : a), rows[0].forecast_date)
      const lastDate = rows.reduce((a, r) => (r.forecast_date > a ? r.forecast_date : a), rows[0].forecast_date)
      const { data: sales } = await supabase
        .from('inventory_movements')
        .select('created_at, quantity')
        .eq('tenant_id', tenantId)
        .eq('store_id', storeId)
        .eq('sku', sku)
        .eq('movement_type', 'SALE')
        .gte('created_at', `${firstDate}T00:00:00Z`)
        .lte('created_at', `${lastDate}T23:59:59Z`)

      const actualByDate = new Map<string, number>()
      for (const sale of sales ?? []) {
        const date = String(sale.created_at).split('T')[0]
        actualByDate.set(date, (actualByDate.get(date) ?? 0) + Math.abs(Number(sale.quantity ?? 0)))
      }
      if (!actualByDate.size) {
        insufficient++
        continue
      }

      const metrics = measure(rows, actualByDate)
      if (!metrics) {
        insufficient++
        continue
      }
      const drift = metrics.wape > WAPE_DRIFT_THRESHOLD || metrics.p90Coverage < P90_COVERAGE_FLOOR

      const { error: upsertError } = await supabase.from('forecast_accuracy').upsert({
        tenant_id: tenantId,
        store_id: storeId,
        material_id: materialId,
        evaluation_date: today,
        model_version: modelVersion,
        sample_days: metrics.sampleDays,
        wape: metrics.wape,
        bias: metrics.bias,
        p50_coverage: metrics.p50Coverage,
        p90_coverage: metrics.p90Coverage,
        status: drift ? 'DRIFT' : 'MEASURED',
        note: drift
          ? `WAPE ${metrics.wape} / P90 coverage ${metrics.p90Coverage} breached thresholds for auto-replenishment.`
          : 'Forecast within accuracy thresholds.',
        measured_at: new Date().toISOString(),
      }, {
        onConflict: 'tenant_id,store_id,material_id,evaluation_date,model_version',
      })
      if (upsertError) throw upsertError
      evaluated++
      if (drift) drifted++
      if (summaries.length < 10) summaries.push({
        store_id: storeId, material_id: materialId, model_version: modelVersion, ...metrics, drift,
      })
    }

    return json({
      status: 'completed',
      tenant_id: tenantId,
      groups_seen: groups.size,
      evaluated,
      drifted,
      insufficient_data: insufficient,
      thresholds: { wape: WAPE_DRIFT_THRESHOLD, p90Coverage: P90_COVERAGE_FLOOR },
      sample: summaries,
    })
  } catch (err) {
    console.error('[forecast-evaluation] error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
