// Supabase Edge Function: reorder-engine
// Main Predictive Evaluation & Automated Procurement Engine

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { VelocityCalculator } from "../_shared/reorder-engine/velocity-calculator.ts"
import { ContextMultipliers } from "../_shared/reorder-engine/context-multipliers.ts"
import { SafetyStockFormula } from "../_shared/reorder-engine/safety-stock-formula.ts"
import { STOOptimizer } from "../_shared/reorder-engine/sto-optimizer.ts"
import { ProcurementGenerator } from "../_shared/reorder-engine/procurement-generator.ts"

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

    const payload = await req.json().catch(() => ({}))
    const tenantId = req.headers.get('x-tenant-id') || payload.tenant_id || 'default-tenant'
    const { store_id, material_id } = payload
    
    const velocityCalc = new VelocityCalculator(supabase)
    const contextMult = new ContextMultipliers(supabase)
    const safetyStock = new SafetyStockFormula()
    const stoOptimizer = new STOOptimizer(supabase)
    const procurement = new ProcurementGenerator(supabase)

    let materials: any[] = []
    
    if (material_id) {
      const { data } = await supabase
        .from('material_master')
        .select('id, sku, description, base_uom, is_perishable, shelf_life_days')
        .eq('id', material_id)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (data) materials = [data]
    } else if (store_id) {
      const { data } = await supabase
        .from('live_inventory_ledger')
        .select('store_id, material_id, sku, description, uom, current_calculated_stock, safety_stock, reorder_point, stock_status')
        .eq('tenant_id', tenantId)
        .eq('store_id', store_id)
      materials = data || []
    } else {
      const { data } = await supabase
        .from('live_inventory_ledger')
        .select('store_id, material_id, sku, description, uom, current_calculated_stock, safety_stock, reorder_point, stock_status')
        .eq('tenant_id', tenantId)
      materials = data || []
    }

    const results: any[] = []

    for (const material of materials) {
      const matId = material.material_id || material.id
      const stoId = store_id || material.store_id || '1001'
      
      const { data: config } = await supabase
        .from('reorder_config')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('store_id', stoId)
        .eq('material_id', matId)
        .maybeSingle()

      const lookbackDays = config?.velocity_lookback_days || 14
      const smoothingFactor = config?.velocity_smoothing_factor || 0.30
      const leadTimeDays = config?.lead_time_days || 7
      const leadTimeVariabilityPct = config?.lead_time_variability_pct || 20.0
      const serviceLevelPct = config?.service_level_pct || 95.0
      const reviewPeriodDays = config?.review_period_days || 7

      const velocity = await velocityCalc.calculate({
        tenantId,
        storeId: stoId,
        materialId: matId,
        lookbackDays,
        smoothingFactor
      })

      const context = await contextMult.calculate({
        tenantId,
        storeId: stoId,
        materialId: matId,
        forecastDate: new Date(Date.now() + (leadTimeDays * 86400000)),
        baseVelocity: velocity.adjustedVelocityDaily
      })

      const forecastVelocity = Math.max(0.1, velocity.adjustedVelocityDaily * context.compositeMultiplier)

      const safety = safetyStock.calculate({
        forecastVelocityDaily: forecastVelocity,
        leadTimeDays,
        leadTimeVariabilityPct,
        serviceLevelPct,
        reviewPeriodDays
      })

      const currentStock = material.current_calculated_stock || 0
      const runoutDays = forecastVelocity > 0 ? currentStock / forecastVelocity : 999

      let alertType: string | null = null
      let severity = 'medium'

      if (currentStock <= safety.safetyStock) {
        alertType = 'CRITICAL_RISK'
        severity = 'critical'
      } else if (currentStock <= safety.reorderPoint) {
        alertType = 'REPLENISHMENT_NEEDED'
        severity = 'high'
      } else if (runoutDays <= leadTimeDays) {
        alertType = 'STOCKOUT_IMMIMENT'
        severity = 'medium'
      }

      if (alertType) {
        const targetLevel = safety.reorderPoint + safety.safetyStock + (forecastVelocity * leadTimeDays)
        const recommendedQty = Math.max(10, targetLevel - currentStock)

        const stoCheck = await stoOptimizer.check({
          tenantId,
          requestingStoreId: stoId,
          materialId: matId,
          neededQty: recommendedQty,
          uom: material.uom || 'EA'
        })

        const { data: alert } = await supabase.from('reorder_alerts').insert({
          tenant_id: tenantId,
          store_id: stoId,
          material_id: matId,
          alert_type: alertType,
          severity,
          current_stock: currentStock,
          uom: material.uom || 'EA',
          safety_stock: safety.safetyStock,
          reorder_point: safety.reorderPoint,
          runout_days: parseFloat(runoutDays.toFixed(2)),
          recommended_qty: recommendedQty,
          recommended_method: stoCheck.canFulfillViaSTO ? 'STO' : (severity === 'critical' ? 'EMERGENCY_PO' : 'PR'),
          recommended_source_store_id: stoCheck.sourceStoreId,
          status: 'open'
        }).select().single()

        // Auto-stage procurement
        const autoReorder = config?.auto_reorder ?? true
        if (autoReorder && recommendedQty > 0) {
          const { stagedPrId } = await procurement.generate({
            tenantId,
            storeId: stoId,
            materialId: matId,
            sku: material.sku,
            currentStock,
            recommendedQty,
            uom: material.uom || 'EA',
            fulfillmentMethod: stoCheck.canFulfillViaSTO ? 'STO' : 'EXTERNAL_PR',
            sourceStoreId: stoCheck.sourceStoreId,
            vendorId: config?.preferred_vendor_id,
            alertId: alert?.id,
            executionMode: severity === 'critical' ? 'IMMEDIATE' : 'BATCH',
            urgencyReason: `${alertType}: Runout in ${runoutDays.toFixed(1)} days`
          })

          if (alert?.id) {
            await supabase.from('reorder_alerts').update({
              status: 'staged',
              staged_pr_id: stagedPrId
            }).eq('id', alert.id)
          }
        }

        results.push({
          material_id: matId,
          sku: material.sku,
          alert: alertType,
          severity,
          current_stock: currentStock,
          runout_days: runoutDays.toFixed(2),
          recommended_qty: recommendedQty,
          fulfillment: stoCheck.canFulfillViaSTO ? 'STO' : 'EXTERNAL',
          staged: true
        })
      } else {
        results.push({
          material_id: matId,
          sku: material.sku,
          status: 'HEALTHY',
          runout_days: runoutDays.toFixed(2),
          velocity: forecastVelocity.toFixed(2)
        })
      }
    }

    return new Response(JSON.stringify({
      status: 'completed',
      tenant_id: tenantId,
      evaluated: materials.length,
      alerts_generated: results.filter(r => r.alert).length,
      results
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    console.error('[reorder-engine] Execution error:', error)
    return new Response(JSON.stringify({ 
      status: 'failed',
      error: (error as Error).message 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
  }
})
