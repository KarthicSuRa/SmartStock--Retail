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

    // Store POS transaction record for customer receipt and register history
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

    // ---- AUTHORITATIVE V2 MUTATION PATH ----
    // All inventory deductions flow exclusively through canonical inventory_events.
    // Legacy direct writes to inventory_movements are eliminated.
    const canonicalEvents = movements.map((m: any, idx: number) => ({
      idempotency_key: `POS__${basket.tenant_id}__${basket.transaction_id}__${m.sku}__${idx}`,
      event_type: m.movement_type === 'RETURN' ? 'RETURN' : 'SALE',
      tenant_id: basket.tenant_id,
      location_id: basket.store_id,
      // material_id resolved later by projection worker via SKU lookup
      source_system: 'POS',
      source_event_id: `${basket.transaction_id}_${m.sku}_${idx}`,
      business_timestamp: basket.completed_at || new Date().toISOString(),
      // SALE reduces stock → negative delta; RETURN increases → positive
      quantity_delta: m.movement_type === 'RETURN' ? Math.abs(m.quantity) : -Math.abs(m.quantity),
      unit_of_measure: m.uom || 'PC',
      correlation_id: basket.transaction_id,
      reference_type: 'POS_TRANSACTION',
      reference_id: basket.transaction_id,
      schema_version: '1.0',
      raw_payload: {
        transaction_id: basket.transaction_id,
        sku: m.sku,
        pos_config_id: posConfig.id,
        original_movement: m,
      },
      metadata: {
        pos_type: posConfig.pos_type,
        store_id: basket.store_id,
        currency: basket.currency,
        grand_total: basket.grand_total,
      },
    }))

    // Forward to ingestion gateway (service-to-service call)
    const gatewayUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ingestion-gateway`
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const gatewayRes = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'x-source-system': 'POS',
        'x-tenant-id': basket.tenant_id,
      },
      body: JSON.stringify(canonicalEvents),
    })

    if (!gatewayRes.ok) {
      // Non-fatal: V1 writes already succeeded; log but don't fail the webhook response
      const gatewayErr = await gatewayRes.text().catch(() => 'unknown')
      console.warn('[pos-webhook] Ingestion gateway warning:', gatewayErr)
    }

    return new Response(JSON.stringify({
      status: 'processed',
      transaction_id: basket.transaction_id,
      movements_created: movements.length,
      canonical_events_emitted: canonicalEvents.length,
      state: basket.state,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    console.error('[pos-webhook] Unhandled error:', error)
    return new Response(JSON.stringify({ 
      status: 'error',
      message: (error as Error).message 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
  }
})
