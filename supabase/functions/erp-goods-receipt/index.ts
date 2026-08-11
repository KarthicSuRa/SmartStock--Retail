// Supabase Edge Function: erp-goods-receipt
// Inbound Goods Receipt Sync and PO Reconciliation Endpoint

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { AdapterFactory } from "../_shared/erp-adapter/factory.ts"
import { GoodsReceiptMatcher } from "../_shared/execution/gr-matcher.ts"

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
    const since = payload.since

    const adapter = await AdapterFactory.getAdapterForTenant(tenantId, supabase)
    const grs = await adapter.fetchGoodsReceipts(since)

    const matcher = new GoodsReceiptMatcher(supabase)
    const results = []

    for (const gr of grs) {
      const enrichedGR = {
        ...gr,
        tenant_id: tenantId,
        erp_config_id: 'default-mock'
      }

      const matchResult = await matcher.matchIncomingGR(enrichedGR)
      results.push({
        gr_number: gr.erp_gr_number,
        sku: gr.sku,
        matched: matchResult.matched,
        variance: matchResult.variance
      })
    }

    return new Response(JSON.stringify({
      status: 'completed',
      tenant_id: tenantId,
      fetched: grs.length,
      matched: results.filter(r => r.matched).length,
      results
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    console.error('[erp-goods-receipt] Execution error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
