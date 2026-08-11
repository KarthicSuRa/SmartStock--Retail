// Supabase Edge Function: erp-seed-trigger
// Onboarding & Initial Full Seed Workflow for New Tenants

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { AdapterFactory } from "../_shared/erp-adapter/factory.ts"
import { SyncOrchestrator, SyncJob } from "../_shared/sync-engine/sync-orchestrator.ts"

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

    const payload = await req.json()
    const { tenant_id, erp_config_id, store_mappings } = payload

    if (!tenant_id || !erp_config_id) {
      return new Response(JSON.stringify({ error: 'tenant_id and erp_config_id are required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    // 1. Insert/Update store mappings
    if (store_mappings && Array.isArray(store_mappings)) {
      for (const mapping of store_mappings) {
        await supabase.from('erp_store_mappings').upsert({
          tenant_id,
          erp_config_id,
          store_id: mapping.store_id,
          erp_plant: mapping.erp_plant,
          erp_storage_location: mapping.erp_storage_location || '0001',
          is_active: true
        }, { onConflict: 'tenant_id,store_id,erp_config_id' })
      }
    }

    // 2. Fetch ERP config
    const { data: config } = await supabase
      .from('erp_configurations')
      .select('*')
      .eq('id', erp_config_id)
      .maybeSingle()

    const adapter = config ? AdapterFactory.createAdapter(config) : await AdapterFactory.getAdapterForTenant(tenant_id, supabase)
    const orchestrator = new SyncOrchestrator(supabase, adapter)

    // 3. Trigger FULL sync for onboarding
    const seedJob: SyncJob = {
      tenantId: tenant_id,
      erpConfigId: erp_config_id,
      entityTypes: ['material_master', 'vendors', 'stock_baselines'],
      mode: 'full',
      triggeredBy: 'seed'
    }

    const results = await orchestrator.runSync(seedJob)

    // 4. Mark tenant onboarding status as seeded
    await supabase.from('tenants').upsert({
      id: tenant_id,
      name: payload.tenant_name || `Tenant-${tenant_id.substring(0, 8)}`,
      onboarding_status: 'seeded',
      first_sync_completed_at: new Date().toISOString()
    })

    return new Response(JSON.stringify({
      status: 'seeded',
      tenant_id,
      results,
      message: 'Initial ERP seed completed successfully. Live inventory ledger is now active.'
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    console.error('[erp-seed-trigger] Execution error:', error)
    return new Response(JSON.stringify({ 
      status: 'failed',
      error: (error as Error).message 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
  }
})
