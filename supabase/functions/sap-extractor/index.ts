import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { requireAuth, authFailureResponse, resolveTenantScope } from "../_shared/security/require-auth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
}

Deno.serve(async (req) => {
  // Handle pre-flight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Scheduled sync endpoint: still requires a caller identity so it cannot be
  // triggered by anyone who happens to know the URL.
  const auth = await requireAuth(req, { allowService: true })
  if (!auth.ok) return authFailureResponse(auth, corsHeaders)

  // Tenant is resolved from the verified claim only. A request body
  // `tenant_id` is ignored and an asserted header must match the claim.
  // This extraction path writes global staging tables, but it must still not
  // be usable by a caller claiming to act for a different tenant.
  const scope = resolveTenantScope(auth.ctx, req.headers.get('x-tenant-id'))
  if (!scope.ok) return authFailureResponse(scope, corsHeaders)
  const tenantId = scope.tenantId

  try {
    // Parse JSON body for POST requests
    let body: any = {};
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch (e) {
        console.warn('Could not parse POST body JSON', e);
      }
    }

    // Handle batch transmission routing
    if (body?.action === 'TRANSMIT_BATCH') {
      // This path previously logged the payload and returned a random UUID as
      // "sap_batch_id", which let callers believe requisitions had reached SAP.
      // Nothing is transmitted here, so the endpoint now says exactly that.
      return new Response(
        JSON.stringify({
          success: false,
          not_implemented: true,
          error: 'TRANSMIT_BATCH is not implemented. Purchase requisitions are created through erp-batch-execute (API_PURCHASEREQ_PROCESS_SRV); no documents were transmitted by this call.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 501 }
      );
    }

    // 1. Secure Configuration Extraction from Deno environment boundaries
    const sapBaseUrl = Deno.env.get('SAP_GATEWAY_BASE_URL') || ''
    const sapBasicAuthToken = Deno.env.get('SAP_BASIC_AUTH_TOKEN') || ''
    const sapClientId = Deno.env.get('SAP_CLIENT_ID') || ''

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[sap-extractor] Missing internal Supabase credentials.')
      return new Response(
        JSON.stringify({ error: 'Internal configuration error: Supabase variables missing.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Initialize Supabase admin client with high-privilege service role
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Log the initiation process
    console.log(`[sap-extractor] Initializing SAP OData sync for tenant ${tenantId}. Target Gateway URL: ${sapBaseUrl || 'MOCK_MODE'}`)

    let infoRecordsResults = []
    let openOrdersResults = []

    /** Supplier number -> display name, resolved from API_BUSINESS_PARTNER. */
    const supplierNameById = new Map<string, string>()

    // If SAP credentials exist, fetch from SAP S/4HANA OData V2 APIs
    if (sapBaseUrl && sapBasicAuthToken) {
      const authHeader = `Basic ${sapBasicAuthToken}`
      const clientSuffix = sapClientId ? `&sap-client=${sapClientId}` : ''

      // API 1: Purchasing Info Records (pricing, MOQ, planned delivery time).
      //
      // Service and entity verified against SAP's released API catalogue:
      //   API_INFORECORD_PROCESS_SRV / A_PurchasingInfoRecord
      //   navigation to_PurgInfoRecdOrgPlantData  (A_PurgInfoRecdOrgPlantData)
      //
      // Header carries Supplier + Material; the per-plant commercial terms live
      // on the plant-data navigation as NetPriceAmount,
      // MinimumPurchaseOrderQuantity and MaterialPlannedDeliveryDurn.
      //
      // The previous entity name "A_PurInfoRecPlantData" does not exist in this
      // service, and "NetPrice"/"MinimumOrderQuantity"/"PlannedDeliveryDuration"
      // are not its field names.
      const infoRecUrl =
        `${sapBaseUrl}/sap/opu/odata/sap/API_INFORECORD_PROCESS_SRV/A_PurchasingInfoRecord` +
        `?$format=json&$expand=to_PurgInfoRecdOrgPlantData${clientSuffix}`
      console.log(`[sap-extractor] Fetching SAP Info Records from: ${infoRecUrl}`)

      // A headers object designed to safely inject authentication token
      const headers = {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }

      const infoRecRes = await fetch(infoRecUrl, { method: 'GET', headers })
      if (!infoRecRes.ok) {
        throw new Error(`SAP Info Records OData service responded with status ${infoRecRes.status}`)
      }
      const infoRecJson = await infoRecRes.json()
      infoRecordsResults = infoRecJson?.d?.results || []
      console.log(`[sap-extractor] Successfully harvested ${infoRecordsResults.length} SAP Info Records.`)

      // Supplier display names live on API_BUSINESS_PARTNER/A_Supplier, not on
      // the info record. Fetched separately; failure is non-fatal because the
      // supplier number is still a truthful identifier.
      try {
        const supplierUrl =
          `${sapBaseUrl}/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_Supplier` +
          `?$format=json&$select=Supplier,SupplierName${clientSuffix}`
        const supplierRes = await fetch(supplierUrl, { method: 'GET', headers })
        if (supplierRes.ok) {
          const supplierJson = await supplierRes.json()
          for (const s of supplierJson?.d?.results ?? []) {
            if (s?.Supplier) supplierNameById.set(String(s.Supplier), String(s.SupplierName ?? ''))
          }
          console.log(`[sap-extractor] Resolved ${supplierNameById.size} supplier name(s) from API_BUSINESS_PARTNER.`)
        } else {
          console.warn(`[sap-extractor] Supplier name lookup returned HTTP ${supplierRes.status}; supplier numbers will be used as-is.`)
        }
      } catch (err) {
        console.warn('[sap-extractor] Supplier name lookup failed; supplier numbers will be used as-is:', err)
      }

      // API 2: Fetch Open Delivery Orders (Transit Logs)
      const openOrdersUrl = `${sapBaseUrl}/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrderItem?$format=json&$filter=OpenInboundDeliveryQty gt 0${clientSuffix}`
      console.log(`[sap-extractor] Fetching SAP Open Purchase Orders from: ${openOrdersUrl}`)

      const openOrdersRes = await fetch(openOrdersUrl, { method: 'GET', headers })
      if (!openOrdersRes.ok) {
        throw new Error(`SAP Open Purchase Orders OData service responded with status ${openOrdersRes.status}`)
      }
      const openOrdersJson = await openOrdersRes.json()
      openOrdersResults = openOrdersJson?.d?.results || []
      console.log(`[sap-extractor] Successfully harvested ${openOrdersResults.length} SAP Open Purchase Orders.`)

    } else {
      // Credentials missing. Previously this branch loaded hard-coded vendor
      // and material data into the staging tables, which made invented master
      // data indistinguishable from SAP data downstream. It now refuses to run.
      console.warn('[sap-extractor] SAP credentials missing. Refusing to write simulated master data.')
      return new Response(
        JSON.stringify({
          success: false,
          configured: false,
          error: 'SAP_GATEWAY_BASE_URL and SAP_BASIC_AUTH_TOKEN are not configured. No master data was read and no staging rows were written.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 503 }
      )
    }

    // 2. Relational Data Mapping & Database Upserts
    //
    // Every column below is NOT NULL in the staging schema. A row that SAP did
    // not fully populate is dropped and reported rather than back-filled with
    // 'N/A', a vendor name invented from the vendor number, or a price of 0 —
    // all of which would silently become procurement reality downstream.
    const rejectedInfoRecords: string[] = []

    const infoRecordsToUpsert = infoRecordsResults.flatMap((item: any) => {
      // Plant-level terms are nested under to_PurgInfoRecdOrgPlantData.
      const plantData = item.to_PurgInfoRecdOrgPlantData?.results?.[0]
        ?? (Array.isArray(item.to_PurgInfoRecdOrgPlantData) ? item.to_PurgInfoRecdOrgPlantData[0] : undefined)

      const supplierNumber = item.Supplier ?? item.Vendor
      const supplierName = supplierNameById.get(String(supplierNumber ?? ''))

      const missing = [
        !item.Material && 'Material',
        !item.MaterialGroup && 'MaterialGroup',
        !supplierNumber && 'Supplier',
        !plantData && 'to_PurgInfoRecdOrgPlantData',
        plantData && plantData.NetPriceAmount == null && 'NetPriceAmount',
        plantData && plantData.MinimumPurchaseOrderQuantity == null && 'MinimumPurchaseOrderQuantity',
        plantData && plantData.MaterialPlannedDeliveryDurn == null && 'MaterialPlannedDeliveryDurn',
      ].filter(Boolean)

      if (missing.length > 0) {
        rejectedInfoRecords.push(`${item.Material ?? '(no material)'}: missing ${missing.join(', ')}`)
        return []
      }

      return [{
        sku: item.Material,
        matkl_group: item.MaterialGroup,
        vendor_id: String(supplierNumber),
        // A supplier number is an identifier, not a name. Use the resolved name
        // when API_BUSINESS_PARTNER supplied one, otherwise keep the number.
        vendor_name: supplierName || String(supplierNumber),
        netpr_price: Number(plantData.NetPriceAmount),
        minbm_moq: Number(plantData.MinimumPurchaseOrderQuantity),
        vendor_lead_days: Number(plantData.MaterialPlannedDeliveryDurn),
        updated_at: new Date().toISOString()
      }]
    })

    const rejectedOpenOrders: string[] = []

    const openOrdersToInsert = openOrdersResults.flatMap((item: any) => {
      const quantity = item.OpenInboundDeliveryQty ?? item.OpenQuantity

      // No delivery date and no quantity means there is nothing truthful to
      // stage, and the column is NOT NULL.
      if (!item.Material || quantity == null || !item.DeliveryDate) {
        rejectedOpenOrders.push(
          `${item.Material ?? '(no material)'}: missing ${[
            !item.Material && 'Material',
            quantity == null && 'open quantity',
            !item.DeliveryDate && 'DeliveryDate',
          ].filter(Boolean).join(', ')}`
        )
        return []
      }

      return [{
        sku: item.Material,
        open_inbound_qty: Number(quantity),
        estimated_delivery_date: new Date(item.DeliveryDate).toISOString().split('T')[0]
      }]
    })

    if (rejectedInfoRecords.length > 0) {
      console.warn(`[sap-extractor] Skipped ${rejectedInfoRecords.length} incomplete info record(s):`, rejectedInfoRecords)
    }
    if (rejectedOpenOrders.length > 0) {
      console.warn(`[sap-extractor] Skipped ${rejectedOpenOrders.length} incomplete open inbound order(s):`, rejectedOpenOrders)
    }

    // Commit high-performance database updates
    let pirCount = 0
    let oioCount = 0

    if (infoRecordsToUpsert.length > 0) {
      console.log(`[sap-extractor] Committing upsert for ${infoRecordsToUpsert.length} ERP Purchase Info Records...`)
      const { error: pirError } = await adminClient
        .from('erp_purchase_info_records')
        .upsert(infoRecordsToUpsert, { onConflict: 'sku' })

      if (pirError) {
        console.error('[sap-extractor] Error upserting erp_purchase_info_records:', pirError)
        throw pirError
      }
      pirCount = infoRecordsToUpsert.length
    }

    // Replace the transit snapshot only when SAP actually returned rows.
    // An empty response is far more likely to be a filter/permission problem
    // than a genuinely empty pipeline, and wiping the table on it destroys the
    // last known-good state.
    if (openOrdersToInsert.length === 0) {
      console.warn('[sap-extractor] SAP returned zero open inbound orders. Leaving existing staging rows untouched.')
    } else {
      console.log('[sap-extractor] Clearing outdated erp_open_inbound_orders entries...')
      const { error: clearError } = await adminClient
        .from('erp_open_inbound_orders')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

      if (clearError) {
        console.error('[sap-extractor] Error clearing erp_open_inbound_orders:', clearError)
        throw clearError
      }

      console.log(`[sap-extractor] Committing insert for ${openOrdersToInsert.length} ERP Open Inbound Orders...`)
      const { error: oioError } = await adminClient
        .from('erp_open_inbound_orders')
        .insert(openOrdersToInsert)

      if (oioError) {
        console.error('[sap-extractor] Error inserting erp_open_inbound_orders:', oioError)
        throw oioError
      }
      oioCount = openOrdersToInsert.length
    }

    console.log('[sap-extractor] Database staging synchronization completed successfully.')

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenantId,
        message: 'SAP S4/HANA master data extraction and staging database synchronisation completed successfully.',
        sync_summary: {
          purchase_info_records_upserted: pirCount,
          open_inbound_orders_staged: oioCount,
          info_records_skipped_incomplete: rejectedInfoRecords.length,
          open_inbound_orders_skipped_incomplete: rejectedOpenOrders.length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('[sap-extractor] Fatal sync handler failure:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
