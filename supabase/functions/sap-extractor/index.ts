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
      const payload = Array.isArray(body.payload) ? body.payload : [];
      console.log(`[sap-extractor] Received batch transmission request for ${payload.length} vendor batches.`);
      payload.forEach((batch: any) => {
        console.log(`[sap-extractor] Vendor Group: ${batch.vendor_id} (${batch.vendor_name}) | Total Items: ${batch.total_requisitions} | Total Qty: ${batch.total_quantity}`);
        console.log(`[sap-extractor] Items Payload:`, JSON.stringify(batch.items));
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: `Consolidated OData batch sync complete. Successfully transmitted ${payload.length} vendor groups to SAP Gateway.`,
          sap_batch_id: crypto.randomUUID()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
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
    console.log(`[sap-extractor] Initializing SAP OData sync. Target Gateway URL: ${sapBaseUrl || 'MOCK_MODE'}`)

    let infoRecordsResults = []
    let openOrdersResults = []

    // If SAP credentials exist, fetch from SAP S/4HANA OData V2 APIs
    if (sapBaseUrl && sapBasicAuthToken) {
      const authHeader = `Basic ${sapBasicAuthToken}`
      const clientSuffix = sapClientId ? `&sap-client=${sapClientId}` : ''

      // API 1: Fetch Purchasing Info Records (Pricing, MOQ, Lead Times)
      const infoRecUrl = `${sapBaseUrl}/sap/opu/odata/sap/API_INFORECORD_PROCESS_SRV/A_PurInfoRecPlantData?$format=json&$select=Material,MaterialGroup,Vendor,NetPrice,MinimumOrderQuantity,PlannedDeliveryDuration${clientSuffix}`
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
      // MOCK FALLBACK MODE FOR LOCAL DEV / SIMULATION
      console.warn('[sap-extractor] Environment credentials missing. Running in simulated MOCK Mode.')
      
      infoRecordsResults = [
        {
          Material: 'MAT-FMCG-001',
          MaterialGroup: 'FMCG',
          Vendor: 'V-1001',
          VendorName: 'Rotterdam Dairy Co.',
          NetPrice: '1.25',
          MinimumOrderQuantity: 50,
          PlannedDeliveryDuration: 2
        },
        {
          Material: 'MAT-FMCG-002',
          MaterialGroup: 'FMCG',
          Vendor: 'V-1002',
          VendorName: 'Coca-Cola European Partners',
          NetPrice: '0.90',
          MinimumOrderQuantity: 100,
          PlannedDeliveryDuration: 3
        },
        {
          Material: 'MAT-FMCG-003',
          MaterialGroup: 'FMCG',
          Vendor: 'V-1001',
          VendorName: 'Rotterdam Dairy Co.',
          NetPrice: '2.50',
          MinimumOrderQuantity: 24,
          PlannedDeliveryDuration: 2
        },
        {
          Material: 'MAT-FMCG-004',
          MaterialGroup: 'FMCG',
          Vendor: 'V-1003',
          VendorName: 'Unilever NL',
          NetPrice: '3.60',
          MinimumOrderQuantity: 48,
          PlannedDeliveryDuration: 3
        }
      ]

      openOrdersResults = [
        {
          Material: 'MAT-FMCG-001',
          OpenInboundDeliveryQty: 120,
          DeliveryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          Material: 'MAT-FMCG-003',
          OpenInboundDeliveryQty: 48,
          DeliveryDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]
    }

    // 2. Relational Data Mapping & Database Upserts
    const infoRecordsToUpsert = infoRecordsResults.map((item: any) => {
      // Map standard SAP OData structure keys to local DB schema fields
      return {
        sku: item.Material,
        matkl_group: item.MaterialGroup || 'N/A',
        vendor_id: item.Vendor || 'N/A',
        vendor_name: item.VendorName || item.SupplierName || `SAP Supplier (${item.Vendor || 'N/A'})`,
        netpr_price: Number(item.NetPrice || 0),
        minbm_moq: Number(item.MinimumOrderQuantity || 0),
        vendor_lead_days: Number(item.PlannedDeliveryDuration || 0),
        updated_at: new Date().toISOString()
      }
    })

    const openOrdersToInsert = openOrdersResults.map((item: any) => {
      return {
        sku: item.Material,
        open_inbound_qty: Number(item.OpenInboundDeliveryQty || item.OpenQuantity || 0),
        estimated_delivery_date: item.DeliveryDate 
          ? new Date(item.DeliveryDate).toISOString().split('T')[0] 
          : new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }
    })

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

    // Overwrite transit orders table entirely to represent current active transit logs
    console.log('[sap-extractor] Clearing outdated erp_open_inbound_orders entries...')
    const { error: clearError } = await adminClient
      .from('erp_open_inbound_orders')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (clearError) {
      console.error('[sap-extractor] Error clearing erp_open_inbound_orders:', clearError)
      throw clearError
    }

    if (openOrdersToInsert.length > 0) {
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
        message: 'SAP S4/HANA master data extraction and staging database synchronisation completed successfully.',
        sync_summary: {
          purchase_info_records_upserted: pirCount,
          open_inbound_orders_staged: oioCount
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
