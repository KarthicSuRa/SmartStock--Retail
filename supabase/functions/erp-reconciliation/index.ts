// Supabase Edge Function: erp-reconciliation
// On-Demand Stock Reconciliation Engine

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { AdapterFactory } from "../_shared/erp-adapter/factory.ts"

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

    const { tenant_id, store_id, sku } = await req.json()
    const tenantId = req.headers.get('x-tenant-id') || tenant_id || 'default-tenant'

    // Get ERP adapter
    const adapter = await AdapterFactory.getAdapterForTenant(tenantId, supabase)

    // Execute stock reconciliation via adapter. The adapter reports the SAP
    // side only; the local twin is joined here because this function owns the
    // database client.
    const result = await adapter.reconcileStock(store_id || '1001', sku)

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    // Resolve the store reference to an inventory_position.location_id.
    // Callers may pass either stores.id (UUID) or the SAP plant code (WERKS).
    let locationId: string | null = null
    if (store_id) {
      if (uuidRe.test(store_id)) {
        locationId = store_id
      } else {
        const { data: storeRow } = await supabase
          .from('stores')
          .select('id')
          .eq('sap_plant_code', store_id)
          .maybeSingle()
        locationId = storeRow?.id ?? null
      }
    }

    if (locationId) {
      let positionQuery = supabase
        .from('inventory_position')
        .select('sku, sellable_qty, estimated_on_hand')
        .eq('location_id', locationId)
      if (uuidRe.test(tenantId)) positionQuery = positionQuery.eq('tenant_id', tenantId)
      if (sku) positionQuery = positionQuery.eq('sku', sku)

      const { data: positions, error: positionError } = await positionQuery
      if (positionError) {
        // Reconciliation must stay honest: report that the local side could
        // not be read instead of pretending the variance is zero.
        console.error('[erp-reconciliation] inventory_position read failed:', positionError)
      } else {
        const rows = positions ?? []
        const localTotal = rows.reduce(
          (sum: number, row: any) => sum + Number(row.sellable_qty ?? 0),
          0,
        )
        result.local_total = localTotal
        result.variance = localTotal - result.erp_total
        result.variance_percentage = result.erp_total
          ? Math.round((result.variance / result.erp_total) * 100)
          : 0

        const localBySku = new Map<string, number>(
          rows.map((row: any) => [row.sku, Number(row.sellable_qty ?? 0)]),
        )
        result.discrepancies = result.discrepancies.map((d) => {
          const localQty = localBySku.get(d.sku) ?? 0
          return { ...d, local_qty: localQty, diff: localQty - d.erp_qty }
        })
      }
    }

    // Log to sync audit trail if variance is detected
    if (Math.abs(result.variance) > 0.01) {
      await supabase.from('sync_audit_log').insert({
        tenant_id: tenantId,
        erp_config_id: 'default-mock',
        entity_type: 'stock_reconciliation',
        erp_key: sku || store_id || 'STORE_WIDE',
        action: 'CONFLICT',
        old_values: { local_total: result.local_total },
        new_values: { erp_total: result.erp_total, variance: result.variance },
        conflict_strategy: 'erp_wins',
        conflict_reason: `Reconciliation variance: ${result.variance} (${result.variance_percentage}%)`
      })
    }

    return new Response(JSON.stringify({
      status: 'completed',
      tenant_id: tenantId,
      store_id: store_id || '1001',
      sku,
      erp_total: result.erp_total,
      local_total: result.local_total,
      variance: result.variance,
      variance_percentage: result.variance_percentage,
      discrepancies: result.discrepancies,
      recommendation: Math.abs(result.variance_percentage) > 5 
        ? 'Critical variance detected. Physical stock audit recommended.' 
        : 'Stock within normal tolerance threshold.'
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    console.error('[erp-reconciliation] Execution error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
