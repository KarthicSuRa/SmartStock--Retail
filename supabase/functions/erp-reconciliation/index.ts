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

    // Execute stock reconciliation via adapter
    const result = await adapter.reconcileStock(store_id || '1001', sku)

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
