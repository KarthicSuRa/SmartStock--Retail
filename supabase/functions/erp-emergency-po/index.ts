// Supabase Edge Function: erp-emergency-po
// High-Priority Emergency Purchase Order Bypass Endpoint

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { AdapterFactory } from "../_shared/erp-adapter/factory.ts"
import { requireAuth, authFailureResponse, resolveTenantScope } from "../_shared/security/require-auth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // This is a direct SAP PO bypass: never callable anonymously.
  const auth = await requireAuth(req, { allowService: true })
  if (!auth.ok) return authFailureResponse(auth, corsHeaders)

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const scope = resolveTenantScope(auth.ctx, req.headers.get('x-tenant-id'))
    if (!scope.ok) return authFailureResponse(scope, corsHeaders)
    const tenantId = scope.tenantId

    const payload = await req.json()
    const { staged_pr_id, manager_user_id, business_justification } = payload

    if (!staged_pr_id) {
      return new Response(JSON.stringify({ error: 'staged_pr_id is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    // Fetch staged PR record, scoped to the authenticated tenant. The
    // `default-tenant` placeholder is not a real tenant filter.
    let stagedQuery = supabase
      .from('staged_prs')
      .select('*')
      .eq('id', staged_pr_id)
    if (tenantId && tenantId !== 'default-tenant') {
      stagedQuery = stagedQuery.eq('tenant_id', tenantId)
    }
    const { data: staged, error: prError } = await stagedQuery.single()

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

    // A PO number is only real when SAP actually returned one. `success: true`
    // without a number is not a successful PO creation, and a number alone is
    // not enough to claim the bypass succeeded.
    const poSucceeded = result.success === true && Boolean(result.erp_po_number)

    // Record execution batch
    const { data: batchRecord } = await supabase.from('execution_batches').insert({
      tenant_id: tenantId,
      erp_config_id: staged.erp_config_id || 'default-mock',
      batch_type: 'EMERGENCY_PO',
      status: poSucceeded ? 'success' : 'failed',
      items_total: 1,
      items_success: poSucceeded ? 1 : 0,
      items_failed: poSucceeded ? 0 : 1,
      total_value: staged.estimated_total_price,
      currency: staged.currency || 'EUR',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      // Deterministic: retrying the same staged PR must not create a new batch.
      idempotency_key: `emergency_${staged.id}`
    }).select().single()

    if (batchRecord) {
      await supabase.from('execution_batch_items').insert({
        batch_id: batchRecord.id,
        staged_pr_id: staged.id,
        erp_entity_type: 'PurchaseOrder',
        erp_payload: poPayload,
        status: poSucceeded ? 'success' : 'failed',
        // Never invent a document number. Absence stays absent.
        erp_document_number: result.erp_po_number || undefined,
        erp_message: poSucceeded
          ? 'Emergency PO created via direct bypass'
          : (result.errors?.join('; ') || 'ERP did not confirm a purchase order number.'),
        item_idempotency_key: `emergency_item_${staged.id}`
      })
    }

    if (poSucceeded) {
      const confirmedPONumber = result.erp_po_number!
      await supabase.from('staged_prs').update({
        status: 'completed',
        execution_mode: 'IMMEDIATE',
        erp_po_number: confirmedPONumber,
        erp_document_status: 'PO_CREATED_EMERGENCY',
        approved_by: manager_user_id,
        approved_at: new Date().toISOString()
      }).eq('id', staged.id)

      await supabase.from('sync_audit_log').insert({
        tenant_id: tenantId,
        erp_config_id: staged.erp_config_id || 'default-mock',
        entity_type: 'emergency_po_bypass',
        erp_key: confirmedPONumber,
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
        erp_po_number: confirmedPONumber,
        audit_trail: `Emergency PO bypass executed for SKU ${staged.sku}`,
        business_justification
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    } else {
      // Nothing was confirmed: do not mark the PR PO_CREATED and do not claim
      // a generated number. Return the ERP errors so the caller can retry safely.
      return new Response(JSON.stringify({
        status: 'failed',
        error: 'ERP did not return a confirmed purchase order number; no PO_CREATED status was recorded.',
        errors: result.errors ?? []
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
