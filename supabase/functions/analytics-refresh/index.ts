// Supabase Edge Function: analytics-refresh
// Materialized Views Cron Refresh Function

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

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
    const views = payload.views || ['all']

    const results: Record<string, string> = {}
    const viewsToRefresh = views.includes('all') 
      ? ['mv_protected_revenue', 'mv_vendor_scorecards', 'mv_store_health']
      : views

    for (const view of viewsToRefresh) {
      const start = Date.now()
      const { error } = await supabase.rpc('refresh_materialized_view', {
        view_name: view,
        tenant_filter: tenantId
      })
      
      if (error) {
        results[view] = `FAILED: ${error.message}`
      } else {
        results[view] = `OK (${Date.now() - start}ms)`
      }
    }

    return new Response(JSON.stringify({
      status: 'refreshed',
      tenant_id: tenantId,
      results,
      refreshed_at: new Date().toISOString()
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    console.error('[analytics-refresh] Execution error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
