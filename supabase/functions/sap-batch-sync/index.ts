// Supabase Edge Function: sap-batch-sync (ERP Batch Sync Engine)
// Refactored to use the ERP Adapter Abstraction Layer
//
// Integrity rules enforced here:
//   1. A SAP document number is only ever the number SAP returned. There is no
//      synthesised fallback anywhere in this file.
//   2. Local reconciliation is only invoked with SAP-confirmed document numbers.
//   3. Simulated (mock) adapters never write a document number into the ledger.
//   4. STOs are refused rather than silently downgraded to a purchase order.

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

    // ==================== IMMEDIATE BYPASS (EMERGENCY PO) ====================
    if (executionMode === 'IMMEDIATE') {
      const { sku, quantity, plant } = requestData

      if (requestData.document_type === 'STO') {
        // A stock transport order is not a purchase order. Posting a normal PO
        // would create a document that looks like an STO but moves no stock.
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Stock transport orders are not supported by this adapter. Use API_STOCKTRANSPORTORDER (S/4HANA Cloud Public Edition 2602+) or the customer-specific STO process.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 422 }
        )
      }

      if (!sku || !quantity || !plant) {
        return new Response(
          JSON.stringify({ error: 'Bad Request: sku, quantity, and plant are required for IMMEDIATE mode.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      // A supplier and a price are commercial facts. Inventing either one would
      // write a real purchase commitment against a made-up vendor or value.
      if (!requestData.vendor_code) {
        return new Response(
          JSON.stringify({ error: 'Bad Request: vendor_code is required to create a purchase order.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }
      if (requestData.net_price == null || Number.isNaN(Number(requestData.net_price))) {
        return new Response(
          JSON.stringify({ error: 'Bad Request: net_price is required to create a purchase order.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      console.log(`[erp-batch-sync] High-priority IMMEDIATE bypass for SKU: ${sku}, Qty: ${quantity}, Plant: ${plant}`)

      const netPrice = Number(requestData.net_price)
      const qty = Number(quantity)

      const poPayload: PurchaseOrder = {
        po_id: crypto.randomUUID(),
        erp_po_number: '',
        po_type: 'NB',
        vendor_code: requestData.vendor_code,
        vendor_name: requestData.vendor_name || '',
        items: [
          {
            item_id: '00010',
            sku,
            quantity_ordered: qty,
            quantity_delivered: 0,
            quantity_invoiced: 0,
            uom: requestData.uom || 'PC',
            net_price: netPrice,
            delivery_date: requestData.delivery_date || new Date(Date.now() + 86400000).toISOString().split('T')[0],
            plant,
          }
        ],
        total_value: qty * netPrice,
        currency: requestData.currency || 'EUR',
        status: 'OPEN',
        created_at: new Date().toISOString()
      }

      const poResult = await adapter.postPurchaseOrder(poPayload)

      if (!poResult.success || !poResult.erp_po_number) {
        return new Response(
          JSON.stringify({
            success: false,
            error: poResult.errors?.join('; ') || 'ERP did not return a purchase order number.',
            simulated: adapter.simulated
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
        )
      }

      // Real number, returned by the ERP. Never synthesised.
      const sapPoReference = poResult.erp_po_number

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
          quantity: qty,
          plant,
          storage_location: storageLocation,
          status: 'PROCESSED',
          // A simulated run must never leave a number that looks like SAP's.
          sap_po_reference: adapter.simulated ? null : sapPoReference
        })

      if (dbError) {
        console.error('[erp-batch-sync] Failed to record immediate PO:', dbError)
      }

      return new Response(
        JSON.stringify({
          success: true,
          simulated: adapter.simulated,
          message: adapter.simulated
            ? 'Simulated purchase order created in the mock adapter. No SAP document exists.'
            : 'Purchase order created in SAP.',
          sap_po_reference: adapter.simulated ? null : sapPoReference,
          local_record_written: !dbError
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // ==================== STANDARD BATCH (FLOOR SCRAP SYNC) ====================
    const { data: scraps, error: scrapsError } = await adminClient
      .from('buffered_scraps')
      .select('*')
      .eq('sync_status', 'PENDING')

    if (scrapsError) throw scrapsError

    if (!scraps || scraps.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          simulated: adapter.simulated,
          message: 'No pending scrap records to sync.',
          sap_document_ids: [],
          batch_summary: { total: 0, succeeded: 0, failed: 0 }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

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
      created_at: scrap.created_at || new Date().toISOString(),
      // Values the floor already captured; never re-derived here.
      storage_location: scrap.sap_storage_loc || undefined,
      sap_reason_code: scrap.scrap_reason_code || undefined,
    }))

    const batchResult = await adapter.postInventoryMovements(movements)

    // Only SAP-confirmed postings may be reconciled, and a simulated adapter
    // confirms nothing in SAP.
    const confirmed: Array<{ id: string; material_document: string; material_document_year?: string }> = []
    if (!adapter.simulated) {
      for (const row of batchResult.items) {
        if (row.status === 'success' && row.erp_document_number) {
          const movement = row.item as InventoryMovement
          confirmed.push({
            id: movement.movement_id,
            material_document: row.erp_document_number,
            material_document_year: row.erp_document_year,
          })
        }
      }
    }

    let reconciliation: { synced?: number; skipped?: number } = { synced: 0, skipped: 0 }
    if (confirmed.length > 0) {
      const { data, error: rpcError } = await adminClient.rpc('reconcile_sap_batch_sync', {
        p_synced: confirmed,
      })
      if (rpcError) {
        // The documents exist in SAP but the local ledger was not updated.
        // Surface it as an error rather than reporting success.
        console.error('[erp-batch-sync] Reconciliation RPC failed:', rpcError)
        return new Response(
          JSON.stringify({
            success: false,
            simulated: adapter.simulated,
            error: `SAP accepted ${confirmed.length} document(s) but local reconciliation failed: ${rpcError.message}`,
            sap_document_ids: confirmed.map((c) => c.material_document),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
      }
      reconciliation = data ?? reconciliation
    }

    const failed = batchResult.failed
    const responseStatus = batchResult.succeeded === 0 && failed > 0 ? 502 : 200

    return new Response(
      JSON.stringify({
        success: batchResult.succeeded > 0,
        simulated: adapter.simulated,
        message: adapter.simulated
          ? `Simulated run: ${batchResult.succeeded}/${batchResult.total} movement(s) accepted by the mock adapter. Nothing was posted to SAP.`
          : `${batchResult.succeeded}/${batchResult.total} movement(s) posted to SAP.`,
        sap_document_ids: confirmed.map((c) => c.material_document),
        batch_summary: {
          total: batchResult.total,
          succeeded: batchResult.succeeded,
          failed
        },
        reconciliation,
        errors: batchResult.items
          .filter((i) => i.status !== 'success')
          .map((i) => i.error)
          .filter(Boolean)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: responseStatus }
    )

  } catch (err) {
    console.error('[erp-batch-sync] Execution error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
