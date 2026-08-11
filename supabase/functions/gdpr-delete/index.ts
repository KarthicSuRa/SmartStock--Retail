// Supabase Edge Function: gdpr-delete
// GDPR Right to Erasure / User Anonymization Endpoint

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { GDPRManager } from "../_shared/security/gdpr-manager.ts"

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
    const { user_id, admin_user_id, reason } = payload
    const tenantId = req.headers.get('x-tenant-id') || payload.tenant_id || 'default-tenant'

    if (!user_id || !admin_user_id) {
      return new Response(JSON.stringify({ error: 'user_id and admin_user_id are required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    const gdpr = new GDPRManager(supabase)
    const anonymizedMarker = await gdpr.anonymizeUser(tenantId, user_id, admin_user_id, reason || 'GDPR Erasure Request')

    await supabase.auth.admin.updateUserById(user_id, {
      ban_duration: '876000h'
    })

    return new Response(JSON.stringify({
      status: 'erased',
      user_id,
      tenant_id: tenantId,
      anonymized_marker: anonymizedMarker,
      message: 'User identity anonymized across all audit logs while preserving financial integrity.'
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    console.error('[gdpr-delete] Execution error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
