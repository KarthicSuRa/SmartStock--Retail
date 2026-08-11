// Supabase Edge Function: gdpr-export
// GDPR Data Portability & User Data Export Endpoint

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
    const { user_id } = payload
    const tenantId = req.headers.get('x-tenant-id') || payload.tenant_id || 'default-tenant'

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    const exportData: Record<string, any> = {
      exported_at: new Date().toISOString(),
      user_id,
      tenant_id: tenantId,
      profile: {},
      activity: {},
      audit_trail: {}
    }

    const { data: user } = await supabase.auth.admin.getUserById(user_id)
    exportData.profile = {
      email: user.user?.email,
      created_at: user.user?.created_at,
      app_metadata: user.user?.app_metadata
    }

    const { data: assignments } = await supabase
      .from('user_store_assignments')
      .select('*')
      .eq('user_id', user_id)
      .eq('tenant_id', tenantId)
    exportData.activity.store_assignments = assignments || []

    const { data: audits } = await supabase
      .from('sync_audit_log')
      .select('*')
      .eq('processed_by', user_id)
      .eq('tenant_id', tenantId)
    exportData.audit_trail.actions = audits || []

    const { data: sessions } = await supabase
      .from('audit_sessions')
      .select('*')
      .eq('user_id', user_id)
      .eq('tenant_id', tenantId)
    exportData.audit_trail.sessions = sessions || []

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error('[gdpr-export] Execution error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
