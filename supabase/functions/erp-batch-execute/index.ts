// Supabase Edge Function: erp-batch-execute
// Daily OData $batch Procurement Execution Endpoint

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { AdapterFactory } from "../_shared/erp-adapter/factory.ts"
import { IdempotencyStore } from "../_shared/execution/idempotency-store.ts"
import { DeadLetterQueue } from "../_shared/execution/dead-letter-queue.ts"
import { BatchExecutor } from "../_shared/execution/batch-executor.ts"

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

    const payload = await req.json().catch(() => ({}))
    const tenantId = req.headers.get('x-tenant-id') || payload.tenant_id || 'default-tenant'
    const erpConfigId = payload.erp_config_id
    const dryRun = payload.dry_run || false

    // Fetch active ERP config
    let configQuery = supabase.from('erp_configurations').select('*').eq('tenant_id', tenantId)
    if (erpConfigId) {
      configQuery = configQuery.eq('id', erpConfigId)
    } else {
      configQuery = configQuery.eq('connection_status', 'active')
    }

    const { data: config } = await configQuery.limit(1).maybeSingle()
    const adapter = config ? AdapterFactory.createAdapter(config) : await AdapterFactory.getAdapterForTenant(tenantId, supabase)

    // Health check
    const health = await adapter.healthCheck()
    if (health.status === 'down') {
      return new Response(JSON.stringify({ 
        status: 'failed', 
        error: 'ERP system unavailable for batch processing',
        health 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 503 })
    }

    // Fetch approved staged PRs
    const { data: stagedItems, error: fetchError } = await supabase
      .from('staged_prs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'approved')
      .eq('execution_mode', 'BATCH')
      .is('erp_pr_number', null)
      .order('created_at')

    if (fetchError) throw fetchError
    if (!stagedItems || stagedItems.length === 0) {
      return new Response(JSON.stringify({ 
        status: 'no_items', 
        message: 'No approved batch items pending execution' 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    // Idempotency check
    const idempotency = new IdempotencyStore(supabase)
    const idempotencyKey = await idempotency.generateKey(tenantId, 'DAILY_PR_BATCH', stagedItems)
    const { processed, batchId: existingBatchId } = await idempotency.isProcessed(idempotencyKey)

    if (processed) {
      return new Response(JSON.stringify({
        status: 'already_processed',
        batch_id: existingBatchId,
        message: 'This batch payload has already been executed today'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    // Insert batch execution record
    const { data: batchRecord, error: batchError } = await supabase
      .from('execution_batches')
      .insert({
        tenant_id: tenantId,
        erp_config_id: config?.id || 'default-mock',
        batch_type: 'DAILY_PR_BATCH',
        status: 'running',
        idempotency_key: idempotencyKey,
        items_total: stagedItems.length,
        total_value: stagedItems.reduce((sum, i) => sum + Number(i.estimated_total_price || 0), 0),
        currency: 'EUR',
        started_at: new Date().toISOString()
      })
      .select()
      .single()

    if (batchError) throw batchError

    const itemsForERP = stagedItems.map((item: any) => ({
      stagedPrId: item.id,
      material: item.sku,
      plant: '1001',
      storageLocation: '0001',
      quantity: item.qty_rounded,
      uom: item.uom,
      vendor: item.vendor_id || 'VEND-001',
      deliveryDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      estimatedPrice: item.estimated_unit_price || 0
    }))

    let result;
    if (dryRun) {
      result = {
        total: itemsForERP.length,
        succeeded: itemsForERP.length,
        failed: 0,
        items: itemsForERP.map((i: any) => ({ item: i, status: 'success' as const, erp_document_number: `DRY_${crypto.randomUUID().substring(0, 8)}` }))
      }
    } else {
      result = await adapter.executeBatchPR(itemsForERP)
    }

    const dlq = new DeadLetterQueue(supabase)
    const executorHelper = new BatchExecutor(supabase)
    let succeeded = 0
    let failed = 0

    for (let i = 0; i < (result.items?.length || 0); i++) {
      const itemResult = result.items[i]
      const stagedItem = stagedItems[i]

      await supabase.from('execution_batch_items').insert({
        batch_id: batchRecord.id,
        staged_pr_id: stagedItem.id,
        erp_entity_type: 'PurchaseRequisition',
        erp_payload: itemsForERP[i],
        status: itemResult.status === 'success' ? 'success' : 'failed',
        erp_document_number: itemResult.erp_document_number || itemResult.erp_doc,
        erp_message: itemResult.error || 'PR Posted Successfully',
        item_idempotency_key: `${idempotencyKey}:${stagedItem.id}`
      })

      if (itemResult.status === 'success' || itemResult.success) {
        await supabase.from('staged_prs').update({
          status: 'submitted_to_erp',
          erp_pr_number: itemResult.erp_document_number || itemResult.erp_doc || `PR_${Date.now()}`,
          erp_document_status: 'ERP_ACCEPTED',
          submitted_at: new Date().toISOString()
        }).eq('id', stagedItem.id)
        succeeded++
      } else {
        failed++
        const cat = executorHelper.categorizeError(itemResult.error || '')
        if (cat === 'SAP_BUSINESS_ERROR' || cat === 'VALIDATION') {
          await dlq.enqueue(
            batchRecord.id,
            stagedItem.id,
            'PurchaseRequisition',
            itemsForERP[i],
            itemResult.error || 'Validation error',
            cat,
            [{ attempted_at: new Date().toISOString(), error: itemResult.error }]
          )
        }
      }
    }

    const finalStatus = failed === 0 ? 'success' : (succeeded > 0 ? 'partial_success' : 'failed')
    
    await supabase.from('execution_batches').update({
      status: finalStatus,
      items_success: succeeded,
      items_failed: failed,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - new Date(batchRecord.started_at).getTime()
    }).eq('id', batchRecord.id)

    return new Response(JSON.stringify({
      status: finalStatus,
      batch_id: batchRecord.id,
      dry_run: dryRun,
      summary: { total: stagedItems.length, succeeded, failed }
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    console.error('[erp-batch-execute] Execution error:', error)
    return new Response(JSON.stringify({ status: 'failed', error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
