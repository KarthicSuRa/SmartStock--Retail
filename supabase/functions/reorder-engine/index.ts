// Supabase Edge Function: reorder-engine
// Predictive evaluation and (opt-in) procurement staging.
//
// Safety rules enforced here:
//   * Demand factors with missing/stale data are NOT applied; they are visible
//     in data_quality and block auto-staging.
//   * Safety stock uses real demand CV and lead-time variability; no NaN, no
//     invented vendor, no double-counted safety stock.
//   * Auto-staging is opt-in per SKU/store, gated by confidence and value, and
//     never auto-releases a PO. STO recommendations always need a human because
//     the SAP adapter refuses UB documents.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { VelocityCalculator } from "../_shared/reorder-engine/velocity-calculator.ts"
import { ContextMultipliers, ContextualResult } from "../_shared/reorder-engine/context-multipliers.ts"
import { SafetyStockFormula } from "../_shared/reorder-engine/safety-stock-formula.ts"
import { STOOptimizer } from "../_shared/reorder-engine/sto-optimizer.ts"
import { ProcurementGenerator } from "../_shared/reorder-engine/procurement-generator.ts"
import { requireAuth, authFailureResponse, resolveTenantScope } from "../_shared/security/require-auth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
}

const MODEL_VERSION = 'reorder-v2-gated'
const OPEN_PR_STATUSES = ['staged', 'approved', 'submitted']

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
        .select('store_id, material_id, sku, description, uom, current_calculated_stock')
        .eq('tenant_id', tenantId)
        .eq('store_id', store_id)
      materials = data || []
    } else {
      const { data } = await supabase
        .from('live_inventory_ledger')
        .select('store_id, material_id, sku, description, uom, current_calculated_stock')
        .eq('tenant_id', tenantId)
      materials = data || []
    }

    const results: any[] = []
    let stagedCount = 0
    let blockedCount = 0

    for (const material of materials) {
      const matId = material.material_id || material.id
      const stoId = store_id || material.store_id
      if (!stoId || !matId) {
        results.push({ material_id: matId, error: 'store_id or material_id missing' })
        continue
      }

      try {
        const { data: config } = await supabase
          .from('reorder_config')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('store_id', stoId)
          .eq('material_id', matId)
          .maybeSingle()

        const lookbackDays = config?.velocity_lookback_days ?? 14
        const leadTimeDays = Number(config?.lead_time_days ?? 7)
        const leadTimeVariabilityPct = Number(config?.lead_time_variability_pct ?? 20)
        const serviceLevelPct = Number(config?.service_level_pct ?? 95)
        const reviewPeriodDays = Number(config?.review_period_days ?? 7)

        const velocity = await velocityCalc.calculate({
          tenantId,
          storeId: stoId,
          materialId: matId,
          lookbackDays,
          smoothingFactor: config?.velocity_smoothing_factor ?? 0.30,
        })

        const context: ContextualResult = await contextMult.calculate({
          tenantId,
          storeId: stoId,
          materialId: matId,
          forecastDate: new Date(Date.now() + leadTimeDays * 86400000),
          baseVelocity: velocity.adjustedVelocityDaily,
          disabledFactors: {
            weather: config?.disable_weather_factor === true,
            holiday: config?.disable_holiday_factor === true,
            promotion: config?.disable_promo_factor === true,
          },
        })

        // A persisted P50/P90 forecast replaces the statistical formula ONLY
        // when its measured accuracy is inside the agreed thresholds.
        const todayIso = new Date().toISOString().split('T')[0]
        const horizonEnd = new Date(Date.now() + (leadTimeDays + 30) * 86400000).toISOString().split('T')[0]
        const { data: forecastRows } = await supabase
          .from('demand_forecasts')
          .select('horizon_days, model_version, p50_qty, p90_qty')
          .eq('tenant_id', tenantId)
          .eq('store_id', stoId)
          .eq('material_id', matId)
          .gte('forecast_date', todayIso)
          .lte('forecast_date', horizonEnd)
          .order('forecast_date', { ascending: true })
          .limit(60)

        let quantilePlan: {
          expectedVelocity: number;
          safetyStockQty: number;
          reorderPoint: number;
          targetLevel: number;
          formula: string;
          modelVersion: string;
          p50: number;
          p90: number;
        } | null = null
        let forecastDrifted = false

        if (forecastRows?.length) {
          const modelVersion = String(forecastRows[0].model_version)
          const { data: accuracy } = await supabase
            .from('forecast_accuracy')
            .select('status, backtest_wape, backtest_p90_coverage, wape, p90_coverage')
            .eq('tenant_id', tenantId)
            .eq('store_id', stoId)
            .eq('material_id', matId)
            .eq('model_version', modelVersion)
            .order('evaluation_date', { ascending: false })
            .limit(1)
            .maybeSingle()

          forecastDrifted = accuracy?.status === 'DRIFT'
          const wape = accuracy?.backtest_wape ?? accuracy?.wape
          const coverage = accuracy?.backtest_p90_coverage ?? accuracy?.p90_coverage
          const trusted = !forecastDrifted &&
            (wape === null || wape === undefined || Number(wape) <= 0.35) &&
            (coverage === null || coverage === undefined || Number(coverage) >= 0.8)
          const windowRows = forecastRows.filter((r) => Number(r.horizon_days) <= leadTimeDays)

          if (trusted && windowRows.length >= Math.min(leadTimeDays, 3)) {
            const p50 = windowRows.reduce((s, r) => s + Number(r.p50_qty ?? 0), 0)
            const p90 = windowRows.reduce((s, r) => s + Number(r.p90_qty ?? 0), 0)
            const expectedVelocity = p50 / leadTimeDays
            const target = p90 + expectedVelocity * reviewPeriodDays
            quantilePlan = {
              expectedVelocity,
              safetyStockQty: Math.max(0, p90 - p50),
              reorderPoint: p90,
              targetLevel: target,
              formula: `Quantile forecast over ${windowRows.length} day(s): P90 ${p90.toFixed(2)} - P50 ${p50.toFixed(2)}`,
              modelVersion,
              p50,
              p90,
            }
          }
        }

        const statistical = safetyStock.calculate({
          forecastVelocityDaily: Math.max(0, velocity.adjustedVelocityDaily * context.compositeMultiplier),
          leadTimeDays,
          demandCoefficientOfVariation: velocity.coefficientOfVariation,
          leadTimeVariabilityPct,
          serviceLevelPct,
          reviewPeriodDays,
        })

        const forecastVelocity = quantilePlan?.expectedVelocity ??
          Math.max(0, velocity.adjustedVelocityDaily * context.compositeMultiplier)
        const safety = quantilePlan
          ? {
              safetyStock: quantilePlan.safetyStockQty,
              reorderPoint: quantilePlan.reorderPoint,
              coverageDemand: quantilePlan.p90,
              safetyStockFormula: quantilePlan.formula,
            }
          : statistical
        const targetLevel = quantilePlan?.targetLevel ?? statistical.coverageDemand + statistical.safetyStock

        const currentStock = Number(material.current_calculated_stock ?? 0)

        // Avoid double-ordering stock that is already on a staged requisition.
        const { data: openPRs, error: inboundError } = await supabase
          .from('staged_prs')
          .select('qty_rounded')
          .eq('tenant_id', tenantId)
          .eq('store_id', stoId)
          .eq('material_id', matId)
          .in('status', OPEN_PR_STATUSES)
        if (inboundError) console.warn('[reorder-engine] inbound PR lookup failed:', inboundError.message)
        const inboundQty = (openPRs ?? []).reduce(
          (sum: number, row: any) => sum + Number(row.qty_rounded ?? 0), 0,
        )

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

        if (!alertType) {
          results.push({
            material_id: matId,
            sku: material.sku,
            status: 'HEALTHY',
            runout_days: Number(runoutDays.toFixed(2)),
            velocity: Number(forecastVelocity.toFixed(2)),
          })
          continue
        }

        // Order-up-to minus stock on hand and stock already on order.
        const recommendedQty = Math.max(0, targetLevel - currentStock - inboundQty)

        const stoCheck = await stoOptimizer.check({
          tenantId,
          requestingStoreId: stoId,
          materialId: matId,
          neededQty: recommendedQty,
          uom: material.uom ?? 'EA',
        })

        // Confidence is read from the inventory integrity engine. Missing or
        // low-confidence stock must not drive an automatic commitment.
        const { data: position } = await supabase
          .from('inventory_position')
          .select('confidence_score, confidence_classification')
          .eq('tenant_id', tenantId)
          .eq('location_id', stoId)
          .eq('material_id', matId)
          .maybeSingle()
        const confidenceScore = position?.confidence_score ?? null
        const minConfidence = Number(config?.min_confidence_score ?? 70)

        const unreliableSignals = Object.values(context.dataQuality)
          .filter((s) => s === 'UNAVAILABLE' || s === 'STALE')
        let blockedReason: string | null = null

        if (recommendedQty <= 0) blockedReason = 'No net requirement after on-hand and open requisitions'
        else if (stoCheck.canFulfillViaSTO) blockedReason = 'STO recommendation requires human approval (SAP adapter refuses UB documents)'
        else if (confidenceScore === null) blockedReason = 'No inventory confidence score; cannot auto-stage'
        else if (confidenceScore < minConfidence) blockedReason = `Inventory confidence ${confidenceScore} below ${minConfidence}`
        else if (unreliableSignals.length) blockedReason = `Unreliable context signals: ${unreliableSignals.join(', ')}`
        else if (forecastDrifted) blockedReason = 'Forecast accuracy is in DRIFT; statistical fallback used and auto-staging blocked'
        else if (config?.auto_reorder_max_qty !== null && config?.auto_reorder_max_qty !== undefined &&
                 recommendedQty > Number(config.auto_reorder_max_qty)) {
          blockedReason = `Recommended quantity exceeds auto_reorder_max_qty (${config.auto_reorder_max_qty})`
        }

        const explanation = {
          model_version: MODEL_VERSION,
          base_velocity_daily: velocity.baseVelocityDaily,
          adjusted_velocity_daily: velocity.adjustedVelocityDaily,
          demand_cv: velocity.coefficientOfVariation,
          stockout_days: velocity.stockoutDays,
          trend_pct: velocity.trendPct,
          context_multipliers: {
            weather: context.weatherMultiplier,
            holiday: context.holidayMultiplier,
            promotion: context.promotionMultiplier,
            composite: context.compositeMultiplier,
          },
          data_quality: context.dataQuality,
          reasoning: context.reasoning,
          safety_stock_formula: safety.safetyStockFormula,
          forecast_source: quantilePlan?.modelVersion ?? 'statistical_fallback',
          forecast_p50_lead_time: quantilePlan?.p50 ?? null,
          forecast_p90_lead_time: quantilePlan?.p90 ?? null,
          forecast_drifted: forecastDrifted,
          lead_time_days: leadTimeDays,
          review_period_days: reviewPeriodDays,
          service_level_pct: serviceLevelPct,
          coverage_demand: safety.coverageDemand,
          target_level: targetLevel,
          current_stock: currentStock,
          inbound_qty: inboundQty,
          runout_days: Number(runoutDays.toFixed(2)),
        }

        const { data: alert } = await supabase.from('reorder_alerts').insert({
          tenant_id: tenantId,
          store_id: stoId,
          material_id: matId,
          alert_type: alertType,
          severity,
          current_stock: currentStock,
          uom: material.uom ?? 'EA',
          safety_stock: safety.safetyStock,
          reorder_point: safety.reorderPoint,
          runout_days: Number(runoutDays.toFixed(2)),
          recommended_qty: recommendedQty,
          recommended_method: stoCheck.canFulfillViaSTO ? 'STO' : (severity === 'critical' ? 'EMERGENCY_PO' : 'PR'),
          recommended_source_store_id: stoCheck.sourceStoreId ?? null,
          inbound_qty: inboundQty,
          forecast_explanation: explanation,
          model_version: MODEL_VERSION,
          confidence_score: confidenceScore,
          data_quality: context.dataQuality,
          blocked_reason: blockedReason,
          status: 'open',
        }).select().single()

        let staged = false
        const autoReorder = config?.auto_reorder === true
        if (autoReorder && !blockedReason) {
          try {
            const { stagedPrId } = await procurement.generate({
              tenantId,
              storeId: stoId,
              materialId: matId,
              sku: material.sku,
              currentStock,
              recommendedQty,
              uom: material.uom ?? 'EA',
              fulfillmentMethod: 'EXTERNAL_PR',
              vendorId: config?.preferred_vendor_id ?? undefined,
              alertId: alert?.id,
              // Critical alerts are NOT auto-released unless explicitly enabled.
              executionMode:
                severity === 'critical' && config?.auto_release_critical === true ? 'IMMEDIATE' : 'BATCH',
              urgencyReason: `${alertType}: runout in ${runoutDays.toFixed(1)} days`,
            })
            if (alert?.id) {
              await supabase.from('reorder_alerts').update({
                status: 'staged',
                staged_pr_id: stagedPrId,
                recommended_vendor_id: config?.preferred_vendor_id ?? null,
              }).eq('id', alert.id)
            }
            staged = true
            stagedCount++
          } catch (err) {
            blockedReason = (err as Error).message
            if (alert?.id) {
              await supabase.from('reorder_alerts').update({ blocked_reason: blockedReason }).eq('id', alert.id)
            }
          }
        }

        if (blockedReason) blockedCount++
        results.push({
          material_id: matId,
          sku: material.sku,
          alert: alertType,
          severity,
          current_stock: currentStock,
          runout_days: Number(runoutDays.toFixed(2)),
          recommended_qty: recommendedQty,
          fulfillment: stoCheck.canFulfillViaSTO ? 'STO' : 'EXTERNAL',
          confidence_score: confidenceScore,
          data_quality: context.dataQuality,
          staged,
          blocked_reason: blockedReason,
        })
      } catch (err) {
        // One bad SKU must not abort the whole planning run; make it visible.
        results.push({
          material_id: matId,
          sku: material.sku,
          error: (err as Error).message,
        })
      }
    }

    return json({
      status: 'completed',
      tenant_id: tenantId,
      evaluated: materials.length,
      alerts_generated: results.filter((r) => r.alert).length,
      staged: stagedCount,
      blocked: blockedCount,
      model_version: MODEL_VERSION,
      results,
    })
  } catch (error) {
    console.error('[reorder-engine] Execution error:', error)
    return json({ status: 'failed', error: (error as Error).message }, 500)
  }
})
