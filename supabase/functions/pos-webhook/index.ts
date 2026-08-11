// Supabase Edge Function: pos-webhook (Production Multi-POS Ingestion Endpoint)

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { POSAdapterFactory } from '../_shared/pos-adapter/factory.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-pos-config-id, x-webhook-signature',
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

    const posConfigId = req.headers.get('x-pos-config-id')
    const signature = req.headers.get('x-webhook-signature')
    
    let posConfig: any = null
    if (posConfigId) {
      const { data } = await supabase
        .from('pos_configurations')
        .select('*')
        .eq('id', posConfigId)
        .eq('is_active', true)
        .maybeSingle()
      posConfig = data
    }

    if (!posConfig) {
      posConfig = {
        id: 'default-pos-config',
        tenant_id: 'default-tenant',
        store_id: '1001',
        pos_type: 'webhook_cloud',
        config: {},
        is_active: true
      }
    }

    const payload = await req.json()
    const adapter = POSAdapterFactory.createAdapter(posConfig)
    const ingested = await adapter.ingest(payload)
    const basket = Array.isArray(ingested) ? ingested[0] : ingested
    
    const validation = await adapter.validate(basket)
    if (!validation.valid) {
      await supabase.from('pos_rejected_transactions').insert({
        tenant_id: basket.tenant_id,
        transaction_id: basket.transaction_id,
        rejection_reasons: validation.errors,
        payload: basket.pos_raw_payload,
      })
      return new Response(JSON.stringify({ 
        status: 'rejected', 
        errors: validation.errors 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 422 })
    }

    const { count } = await supabase
      .from('pos_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('transaction_id', basket.transaction_id)
      .eq('pos_config_id', posConfig.id)
    
    if ((count || 0) > 0) {
      return new Response(JSON.stringify({ 
        status: 'duplicate', 
        transaction_id: basket.transaction_id 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    const movements = await adapter.toMovements(basket)

    await supabase.from('pos_transactions').insert({
      tenant_id: basket.tenant_id,
      store_id: basket.store_id,
      pos_config_id: posConfig.id,
      transaction_id: basket.transaction_id,
      state: basket.state,
      currency: basket.currency,
      subtotal: basket.subtotal,
      tax_total: basket.tax_total,
      discount_total: basket.discount_total,
      grand_total: basket.grand_total,
      completed_at: basket.completed_at,
      pos_raw_payload: basket.pos_raw_payload,
    })

    if (movements.length > 0) {
      const { error: moveError } = await supabase.from('inventory_movements').insert(
        movements.map(m => ({
          tenant_id: m.tenant_id,
          store_id: m.store_id,
          sku: m.sku,
          quantity: m.quantity,
          movement_type: m.movement_type,
          reference_id: m.transaction_id,
          created_at: m.posted_at
        }))
      )

      if (moveError) console.error('Ledger movement insertion error:', moveError)
    }

    return new Response(JSON.stringify({
      status: 'processed',
      transaction_id: basket.transaction_id,
      movements_created: movements.length,
      state: basket.state,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    console.error('POS webhook error:', error)
    return new Response(JSON.stringify({ 
      status: 'error',
      message: (error as Error).message 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
  }
})
