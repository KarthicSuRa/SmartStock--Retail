// Supabase Edge Function: auth-store-claims
// JWT Store Claims Enrichment Function

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

    const payload = await req.json()
    const { user_id, tenant_id } = payload

    if (!user_id || !tenant_id) {
      return new Response(JSON.stringify({ error: 'user_id and tenant_id are required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    const { data: assignments, error: assignError } = await supabase
      .from('user_store_assignments')
      .select('store_id, access_level, can_approve_pr, can_execute_emergency_po, can_adjust_safety_stock')
      .eq('user_id', user_id)
      .eq('tenant_id', tenant_id)

    if (assignError) throw assignError

    const { data: membership } = await supabase
      .from('user_tenant_memberships')
      .select('primary_role_id, tenant_roles:primary_role_id (role_name, can_view_all_stores, can_access_audit_log, can_view_financial_yield)')
      .eq('user_id', user_id)
      .eq('tenant_id', tenant_id)
      .maybeSingle()

    const storeClaims = assignments?.map(a => ({
      store_id: a.store_id,
      level: a.access_level,
      perms: {
        approve: a.can_approve_pr,
        emergency: a.can_execute_emergency_po,
        adjust_safety: a.can_adjust_safety_stock
      }
    })) || []

    const claims = {
      tenant_id,
      role: membership?.tenant_roles?.role_name || 'floor_staff',
      stores: storeClaims,
      global_perms: {
        view_all: membership?.tenant_roles?.can_view_all_stores || false,
        audit: membership?.tenant_roles?.can_access_audit_log || false,
        financials: membership?.tenant_roles?.can_view_financial_yield || false
      },
      issued_at: Date.now()
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user_id,
      { app_metadata: { live_retail_claims: claims } }
    )

    if (updateError) throw updateError

    await supabase.from('audit_sessions').insert({
      tenant_id,
      user_id,
      session_type: 'login',
      user_agent: req.headers.get('user-agent') || 'system'
    })

    return new Response(JSON.stringify({
      status: 'claims_enriched',
      stores_assigned: storeClaims.length,
      role: claims.role
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    console.error('[auth-store-claims] Execution error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
