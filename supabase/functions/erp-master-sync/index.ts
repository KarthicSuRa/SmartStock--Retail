// Supabase Edge Function: erp-master-sync
// Scheduled / Triggered Master Data Sync Function

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { AdapterFactory } from "../_shared/erp-adapter/factory.ts"
import { SyncOrchestrator, SyncJob } from "../_shared/sync-engine/sync-orchestrator.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-triggered-by',
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
    const erpConfigId = requestData.erp_config_id
    const mode = requestData.mode || 'delta'
    const entityTypes = requestData.entity_types || ['material_master', 'vendors', 'stock_baselines']

    // Fetch active ERP config
    let configQuery = supabase.from('erp_configurations').select('*').eq('tenant_id', tenantId)
    if (erpConfigId) {
      configQuery = configQuery.eq('id', erpConfigId)
    } else {
      configQuery = configQuery.eq('connection_status', 'active')
    }

    const { data: config, error: configError } = await configQuery.limit(1).maybeSingle()

    let adapter;
    if (configError || !config) {
      console.warn(`[erp-master-sync] No active DB ERP config found for tenant ${tenantId}, using factory fallback.`)
      adapter = await AdapterFactory.getAdapterForTenant(tenantId, supabase)
    } else {
      adapter = AdapterFactory.createAdapter(config)
    }

    // Health Check before executing sync
    const health = await adapter.healthCheck()
    if (health.status === 'down') {
      return new Response(JSON.stringify({ 
        error: 'ERP system unavailable', 
        health,
        recommendation: 'Sync queued for automatic retry when ERP recovers.'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 503 })
    }

    // Execute Sync Workflow
    const orchestrator = new SyncOrchestrator(supabase, adapter)
    const job: SyncJob = {
      tenantId,
      erpConfigId: config?.id || 'default-mock',
      entityTypes,
      mode,
      triggeredBy: (req.headers.get('x-triggered-by') as any) || requestData.triggered_by || 'schedule'
    }

    const results = await orchestrator.runSync(job)

    return new Response(JSON.stringify({
      status: results.every(r => r.status === 'success') ? 'success' : 'partial',
      tenant_id: tenantId,
      mode,
      started_at: new Date().toISOString(),
      results,
      summary: {
        total_processed: results.reduce((sum, r) => sum + r.recordsProcessed, 0),
        total_inserted: results.reduce((sum, r) => sum + r.recordsInserted, 0),
        total_updated: results.reduce((sum, r) => sum + r.recordsUpdated, 0),
        total_failed: results.reduce((sum, r) => sum + r.recordsFailed, 0),
        total_conflicts: results.reduce((sum, r) => sum + r.conflicts, 0)
      }
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    console.error('[erp-master-sync] Execution error:', error)
    return new Response(JSON.stringify({ 
      status: 'failed',
      error: (error as Error).message 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
  }
})
