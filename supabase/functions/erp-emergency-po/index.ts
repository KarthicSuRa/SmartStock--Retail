// Supabase Edge Function: erp-emergency-po
// High-Priority Emergency Purchase Order Bypass Endpoint

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { AdapterFactory } from "../_shared/erp-adapter/factory.ts"

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
    const { staged_pr_id, manager_user_id, business_justification } = payload
    const tenantId = req.headers.get('x-tenant-id') || payload.tenant_id || 'default-tenant'

    if (!staged_pr_id) {
      return new Response(JSON.stringify({ error: 'staged_pr_id is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    // Fetch staged PR record
    const { data: staged, error: prError } = await supabase
      .from('staged_prs')
      .select('*')
      .eq('id', staged_pr_id)
      .single()

    if (prError || !staged) {
      return new Response(JSON.stringify({ error: 'Staged PR record not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404
      })
    }

    // Get ERP adapter
    const adapter = await AdapterFactory.getAdapterForTenant(tenantId, supabase)

    // Construct Purchase Order payload
    const poPayload = {
      po_id: staged.id,
      erp_po_number: '',
      vendor_code: staged.vendor_id || 'V001',
      vendor_name: 'Primary Wholesale Vendor',
      items: [{
        item_id: crypto.randomUUID(),
        sku: staged.sku,
        quantity_ordered: staged.qty_rounded,
        quantity_delivered: 0,
        quantity_invoiced: 0,
        uom: staged.uom,
        net_price: staged.estimated_unit_price || 0,
        delivery_date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
        plant: '1001',
        store_id: staged.store_id
      }],
      total_value: staged.estimated_total_price || 0,
      currency: staged.currency || 'EUR',
      status: 'OPEN' as const,
      created_at: new Date().toISOString()
    }

    const result = await adapter.postEmergencyPO(poPayload)

    // Record execution batch
    const { data: batchRecord } = await supabase.from('execution_batches').insert({
      tenant_id: tenantId,
      erp_config_id: staged.erp_config_id || 'default-mock',
      batch_type: 'EMERGENCY_PO',
      status: result.success ? 'success' : 'failed',
      items_total: 1,
      items_success: result.success ? 1 : 0,
      items_failed: result.success ? 0 : 1,
      total_value: staged.estimated_total_price,
      currency: staged.currency || 'EUR',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      idempotency_key: `emergency_${staged.id}_${Date.now()}`
    }).select().single()

    if (batchRecord) {
      await supabase.from('execution_batch_items').insert({
        batch_id: batchRecord.id,
        staged_pr_id: staged.id,
        erp_entity_type: 'PurchaseOrder',
        erp_payload: poPayload,
        status: result.success ? 'success' : 'failed',
        erp_document_number: result.erp_po_number || `EMERGENCY_PO_${Date.now()}`,
        erp_message: result.success ? 'Emergency PO created via direct bypass' : result.errors?.join('; '),
        item_idempotency_key: `emergency_item_${staged.id}`
      })
    }

    if (result.success || result.erp_po_number) {
      const generatedPONumber = result.erp_po_number || `SAP-PO-${Date.now()}`
      await supabase.from('staged_prs').update({
        status: 'completed',
        execution_mode: 'IMMEDIATE',
        erp_po_number: generatedPONumber,
        erp_document_status: 'PO_CREATED_EMERGENCY',
        approved_by: manager_user_id,
        approved_at: new Date().toISOString()
      }).eq('id', staged.id)

      await supabase.from('sync_audit_log').insert({
        tenant_id: tenantId,
        erp_config_id: staged.erp_config_id || 'default-mock',
        entity_type: 'emergency_po_bypass',
        erp_key: generatedPONumber,
        action: 'INSERT',
        new_values: {
          staged_pr_id: staged.id,
          manager_user_id,
          business_justification,
          amount: staged.estimated_total_price
        },
        processed_by: manager_user_id || 'system'
      })

      return new Response(JSON.stringify({
        status: 'success',
        erp_po_number: generatedPONumber,
        audit_trail: `Emergency PO bypass executed for SKU ${staged.sku}`,
        business_justification
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    } else {
      return new Response(JSON.stringify({
        status: 'failed',
        errors: result.errors
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 })
    }

  } catch (error) {
    console.error('[erp-emergency-po] Execution error:', error)
    return new Response(JSON.stringify({ status: 'failed', error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
