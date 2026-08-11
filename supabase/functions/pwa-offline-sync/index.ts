// Supabase Edge Function: pwa-offline-sync
// Background Sync Handler for Offline Mobile PWA Submissions (Damage Logs, Stock Counts)

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
    const { action_type, items } = payload
    const tenantId = req.headers.get('x-tenant-id') || payload.tenant_id || 'default-tenant'

    if (!items || !Array.isArray(items)) {
      return new Response(JSON.stringify({ error: 'items array required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    let inserted = 0
    for (const item of items) {
      if (action_type === 'damage_log') {
        const { error } = await supabase.from('inventory_movements').insert({
          tenant_id: tenantId,
          sku: item.sku,
          store_id: item.store_id || '1001',
          movement_type: 'DAMAGE',
          quantity: -Math.abs(item.quantity || 1),
          uom: item.uom || 'EA',
          reference_document: item.reference_id || `OFFLINE_DAMAGE_${Date.now()}`,
          reference_date: item.scanned_at || new Date().toISOString(),
          posted_by: item.user_id || 'offline_pwa_user',
          erp_status: 'PENDING_SYNC'
        })
        if (!error) inserted++
      } else if (action_type === 'physical_count') {
        const { error } = await supabase.from('inventory_movements').insert({
          tenant_id: tenantId,
          sku: item.sku,
          store_id: item.store_id || '1001',
          movement_type: 'COUNT',
          quantity: item.quantity,
          uom: item.uom || 'EA',
          reference_document: item.reference_id || `OFFLINE_COUNT_${Date.now()}`,
          reference_date: item.scanned_at || new Date().toISOString(),
          posted_by: item.user_id || 'offline_pwa_user',
          erp_status: 'PENDING_SYNC'
        })
        if (!error) inserted++
      }
    }

    return new Response(JSON.stringify({
      status: 'synced',
      action_type,
      tenant_id: tenantId,
      processed: items.length,
      synced: inserted
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    console.error('[pwa-offline-sync] Execution error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
