import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle pre-flight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Enforce HTTP POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method Not Allowed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
    )
  }

  // 1. Authenticate user using Authorization header (JWT)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    console.warn('[sap-batch-sync] Rejected: Missing Authorization header.')
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
      console.error('[sap-batch-sync] Server configuration error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.')
      return new Response(
        JSON.stringify({ error: 'Internal server configuration error.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Initialize user client to verify JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      console.warn('[sap-batch-sync] Authentication failed:', authError?.message)
      return new Response(
        JSON.stringify({ error: 'Unauthorized: invalid token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    console.log(`[sap-batch-sync] User authenticated: ${user.email}`)

    // Parse request JSON
    const requestData = await req.json().catch(() => ({}))
    const executionMode = requestData.execution_mode

    // Initialize admin client to run database transaction and aggregation
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // CHECK FOR IMMEDIATE BYPASS MODE
    if (executionMode === 'IMMEDIATE') {
      const { sku, quantity, plant } = requestData

      if (!sku || !quantity || !plant) {
        return new Response(
          JSON.stringify({ error: 'Bad Request: sku, quantity, and plant are required for IMMEDIATE mode.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      console.log(`[sap-batch-sync] Processing high-priority IMMEDIATE bypass for SKU: ${sku}, Qty: ${quantity}, Plant: ${plant}`)

      // Generate simulated SAP PO details
      const poNum = (4500000000 + Math.floor(Math.random() * 9999999)).toString()
      const isSto = requestData.document_type === 'STO'
      const poPrefix = isSto ? 'SAP-STO-' : 'SAP-PO-'
      const poType = isSto ? 'UB' : 'NB'
      const sapPoId = `${poPrefix}${poNum}`
      
      // Compute authentic looking validation hash: SHA256 of the PO request
      const textEncoder = new TextEncoder()
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256', 
        textEncoder.encode(`${sku}:${quantity}:${plant}:${poNum}`)
      )
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const validationHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      // Construct API_PURCHASEORDER_PROCESS_SRV structure
      const purchaseOrderPayload = {
        PurchaseOrder: poNum,
        CompanyCode: "1000",
        PurchaseOrderType: poType,
        Supplier: isSto ? "INTERNAL-PLANT-HUB" : "VEND-10042",
        PurchasingGroup: "001",
        PurchasingOrganization: "1000",
        to_PurchaseOrderItem: [
          {
            PurchaseOrderItem: "10",
            Material: sku,
            Plant: plant,
            OrderQuantity: Number(quantity),
            PurchaseOrderQuantityUnit: "PC"
          }
        ]
      }

      // Look up storage location from ledger if possible
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

      // Record entry in database pending_replenishments table as PROCESSED (immediate success)
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
        console.error('[sap-batch-sync] Failed to record immediate PO to pending_replenishments:', dbError)
        throw dbError
      }

      console.log(`[sap-batch-sync] Immediate bypass PO registered successfully: ${sapPoId}`)

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Immediate SAP purchase order bypass processed and confirmed.',
          sap_po_reference: sapPoId,
          sap_validation_hash: validationHash,
          api_payload: purchaseOrderPayload
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // STANDARD BATCH OPERATIONS (FLOOR SCRAP SYNC)
    // 2. Query all outstanding rows from the buffered_scraps table
    const { data: scraps, error: scrapsError } = await adminClient
      .from('buffered_scraps')
      .select('*')
      .eq('sync_status', 'PENDING')
      .neq('status', 'DELETED')

    if (scrapsError) {
      throw scrapsError
    }

    if (!scraps || scraps.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No pending scrap records to sync.',
          sap_document_id: null,
          sap_document_year: null,
          consolidated_payload: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // 3. Consolidate these multi-row entries into an aggregated, single-document batch array
    // representing our simulated OData $batch writeback payload to SAP.
    const aggregated = new Map<string, {
      GoodsMovementType: string;
      Plant: string;
      StorageLocation: string;
      Material: string;
      EntryQuantity: number;
      EntryUnit: string;
    }>()

    for (const scrap of scraps) {
      const key = `${scrap.sap_plant_code}-${scrap.sap_storage_loc}-${scrap.sku}`
      if (aggregated.has(key)) {
        const existing = aggregated.get(key)!
        existing.EntryQuantity += scrap.quantity
      } else {
        aggregated.set(key, {
          GoodsMovementType: "551",
          Plant: scrap.sap_plant_code,
          StorageLocation: scrap.sap_storage_loc,
          Material: scrap.sku,
          EntryQuantity: scrap.quantity,
          EntryUnit: scrap.uom || "PC"
        })
      }
    }

    const batchPayload = Array.from(aggregated.values())
    console.log(`[sap-batch-sync] Consolidated ${scraps.length} scrap event(s) into ${batchPayload.length} OData batch record(s).`)

    // 4. Perform database reconciliation transaction
    // Call public.reconcile_sap_batch_sync() database function.
    const { data: reconciliationResult, error: rpcError } = await adminClient.rpc('reconcile_sap_batch_sync')

    if (rpcError) {
      console.error('[sap-batch-sync] Transaction reconciliation RPC failed:', rpcError)
      throw rpcError
    }

    console.log('[sap-batch-sync] Transaction completed successfully:', reconciliationResult)

    // Return the response with simulated SAP handshake details
    return new Response(
      JSON.stringify({
        success: true,
        message: reconciliationResult.message || 'SAP OData batch writeback completed.',
        sap_document_id: reconciliationResult.sap_document_id,
        sap_document_year: reconciliationResult.sap_document_year,
        consolidated_payload: batchPayload
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (err) {
    console.error('[sap-batch-sync] Execution error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
