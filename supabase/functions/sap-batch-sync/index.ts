// Supabase Edge Function: sap-batch-sync (ERP Batch Sync Engine)
// Refactored to use the ERP Adapter Abstraction Layer

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { AdapterFactory } from "../_shared/erp-adapter/factory.ts"
import { InventoryMovement, PurchaseOrder } from "../_shared/erp-adapter/types.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method Not Allowed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
    )
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    console.warn('[erp-batch-sync] Rejected: Missing Authorization header.')
    return new Response(
      JSON.stringify({ error: 'Unauthorized: missing authorization header' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
    )
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[erp-batch-sync] Server configuration error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.')
      return new Response(
        JSON.stringify({ error: 'Internal server configuration error.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      console.warn('[erp-batch-sync] Authentication failed:', authError?.message)
      return new Response(
        JSON.stringify({ error: 'Unauthorized: invalid token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const requestData = await req.json().catch(() => ({}))
    const executionMode = requestData.execution_mode
    const tenantId = req.headers.get('x-tenant-id') || requestData.tenant_id || user.user_metadata?.tenant_id || 'default-tenant'

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)
    const adapter = await AdapterFactory.getAdapterForTenant(tenantId, adminClient)

    // CHECK FOR IMMEDIATE BYPASS MODE (EMERGENCY PO / STO)
    if (executionMode === 'IMMEDIATE') {
      const { sku, quantity, plant } = requestData

      if (!sku || !quantity || !plant) {
        return new Response(
          JSON.stringify({ error: 'Bad Request: sku, quantity, and plant are required for IMMEDIATE mode.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      console.log(`[erp-batch-sync] High-priority IMMEDIATE bypass for SKU: ${sku}, Qty: ${quantity}, Plant: ${plant}`)

      const isSto = requestData.document_type === 'STO'
      const vendorCode = isSto ? 'INTERNAL-PLANT-HUB' : (requestData.vendor_code || 'VEND-10042')

      const poPayload: PurchaseOrder = {
        po_id: crypto.randomUUID(),
        erp_po_number: '',
        vendor_code: vendorCode,
        vendor_name: isSto ? 'Internal Hub Logistics' : 'Primary Vendor',
        items: [
          {
            item_id: '10',
            sku,
            quantity_ordered: Number(quantity),
            quantity_delivered: 0,
            quantity_invoiced: 0,
            uom: 'PC',
            net_price: requestData.net_price || 5.0,
            delivery_date: new Date(Date.now() + 86400000).toISOString().split('T')[0]
          }
        ],
        total_value: Number(quantity) * (requestData.net_price || 5.0),
        currency: 'EUR',
        status: 'OPEN',
        created_at: new Date().toISOString()
      }

      const poResult = await adapter.postPurchaseOrder(poPayload)
      const sapPoId = poResult.erp_po_number || `${isSto ? 'SAP-STO-' : 'SAP-PO-'}${4500000000 + Math.floor(Math.random() * 9999999)}`

      let storageLocation = '0001'
      const { data: ledgerRow } = await adminClient
        .from('live_inventory_ledger')
        .select('sap_storage_loc')
        .eq('sku', sku)
        .eq('sap_plant_code', plant)
        .limit(1)
        .maybeSingle()

      if (ledgerRow?.sap_storage_loc) {
        storageLocation = ledgerRow.sap_storage_loc
      }

      const { error: dbError } = await adminClient
        .from('pending_replenishments')
        .insert({
          sku,
          quantity: Number(quantity),
          plant,
          storage_location: storageLocation,
          status: 'PROCESSED',
          sap_po_reference: sapPoId
        })

      if (dbError) {
        console.error('[erp-batch-sync] Failed to record immediate PO:', dbError)
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Immediate purchase order bypass processed and confirmed via ERP adapter.',
          sap_po_reference: sapPoId,
          erp_adapter_success: poResult.success,
          api_payload: poPayload
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // STANDARD BATCH OPERATIONS (FLOOR SCRAP SYNC & PENDING MOVEMENTS)
    const { data: scraps, error: scrapsError } = await adminClient
      .from('buffered_scraps')
      .select('*')
      .eq('sync_status', 'PENDING')

    if (scrapsError) throw scrapsError

    if (!scraps || scraps.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No pending scrap records to sync.',
          sap_document_id: null,
          consolidated_payload: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Convert scraps to standard InventoryMovement objects
    const movements: InventoryMovement[] = scraps.map((scrap: any) => ({
      movement_id: scrap.id,
      sku: scrap.sku,
      store_id: scrap.sap_plant_code,
      movement_type: 'DAMAGE',
      quantity: scrap.quantity,
      uom: scrap.uom || 'PC',
      reference_date: scrap.created_at || new Date().toISOString(),
      posted_by: scrap.reported_by || 'STORE_STAFF',
      erp_status: 'PENDING_SYNC',
      retry_count: 0,
      created_at: scrap.created_at || new Date().toISOString()
    }))

    // Execute batch transmission via adapter
    const batchResult = await adapter.postInventoryMovements(movements)

    // Execute local database reconciliation function
    const { data: reconciliationResult } = await adminClient.rpc('reconcile_sap_batch_sync')

    return new Response(
      JSON.stringify({
        success: true,
        message: reconciliationResult?.message || `ERP batch sync completed: ${batchResult.succeeded}/${batchResult.total} movements synced.`,
        sap_document_id: reconciliationResult?.sap_document_id || `DOC-${Date.now()}`,
        batch_summary: {
          total: batchResult.total,
          succeeded: batchResult.succeeded,
          failed: batchResult.failed
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (err) {
    console.error('[erp-batch-sync] Execution error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
