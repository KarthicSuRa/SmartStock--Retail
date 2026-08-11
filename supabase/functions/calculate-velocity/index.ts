// Supabase Edge Function: calculate-velocity
// Hourly/Daily Velocity Recalculation Function

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { VelocityCalculator } from "../_shared/reorder-engine/velocity-calculator.ts"
import { ContextMultipliers } from "../_shared/reorder-engine/context-multipliers.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const requestData = await req.json().catch(() => ({}))
    const tenantId = req.headers.get('x-tenant-id') || requestData.tenant_id || 'default-tenant'
    const storeId = requestData.store_id

    const velocityCalc = new VelocityCalculator(supabase)
    const contextMult = new ContextMultipliers(supabase)

    // Fetch items from live inventory ledger
    let query = supabase.from('live_inventory_ledger').select('store_id, material_id, sku').eq('tenant_id', tenantId)
    if (storeId) {
      query = query.eq('store_id', storeId)
    }

    const { data: ledgerItems, error: ledgerError } = await query
    if (ledgerError) throw ledgerError

    let processed = 0
    for (const item of ledgerItems || []) {
      const velocity = await velocityCalc.calculate({
        tenantId,
        storeId: item.store_id,
        materialId: item.material_id,
        lookbackDays: 14,
        smoothingFactor: 0.30
      })

      const context = await contextMult.calculate({
        tenantId,
        storeId: item.store_id,
        materialId: item.material_id,
        forecastDate: new Date(Date.now() + 7 * 86400000),
        baseVelocity: velocity.adjustedVelocityDaily
      })

      const forecastVelocity = velocity.adjustedVelocityDaily * context.compositeMultiplier

      await supabase.from('sales_velocity').insert({
        tenant_id: tenantId,
        store_id: item.store_id,
        material_id: item.material_id,
        period_start: new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0],
        period_end: new Date().toISOString().split('T')[0],
        period_days: 14,
        base_velocity_daily: velocity.baseVelocityDaily,
        adjusted_velocity_daily: velocity.adjustedVelocityDaily,
        weather_multiplier: context.weatherMultiplier,
        holiday_multiplier: context.holidayMultiplier,
        promotion_multiplier: context.promotionMultiplier,
        forecast_velocity_daily: forecastVelocity,
        data_points: velocity.dataPoints,
        stockout_days: velocity.stockoutDays,
        coefficient_of_variation: velocity.coefficientOfVariation,
        velocity_vs_prev_period_pct: velocity.trendPct
      })

      processed++
    }

    return new Response(JSON.stringify({
      status: 'completed',
      tenant_id: tenantId,
      items_calculated: processed,
      timestamp: new Date().toISOString()
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    console.error('[calculate-velocity] Execution error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
