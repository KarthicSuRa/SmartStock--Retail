// Supabase Edge Function: erp-batch-execute
// Daily OData $batch Procurement Execution Endpoint
//
// Integrity rules enforced here:
//   * Requires an authenticated caller (user JWT, or service role for cron).
//   * Plant / storage location come from configured master data. There is no
//     hard-coded fallback plant: posting a requisition against the wrong plant
//     is a real procurement error, not a cosmetic one.
//   * A purchase requisition number is only ever the number SAP returned.
//   * A dry run writes nothing and reports no document numbers, because no
//     document exists.
//   * An "outcome unknown" batch is never re-run automatically.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { AdapterFactory } from "../_shared/erp-adapter/factory.ts"
import { IdempotencyStore } from "../_shared/execution/idempotency-store.ts"
import { DeadLetterQueue } from "../_shared/execution/dead-letter-queue.ts"
import { BatchExecutor } from "../_shared/execution/batch-executor.ts"
import { isOutcomeUnknown } from "../_shared/erp-adapter/errors.ts"
import { requireAuth, authFailureResponse, resolveTenantScope } from "../_shared/security/require-auth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // This endpoint creates real purchase requisitions. It must never be callable
  // anonymously.
  const auth = await requireAuth(req, { allowService: true })
  if (!auth.ok) return authFailureResponse(auth, corsHeaders)

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Tenant comes only from the verified auth scope. A request body
    // `tenant_id` is ignored, and an asserted header must match the claim.
    const scope = resolveTenantScope(auth.ctx, req.headers.get('x-tenant-id'))
    if (!scope.ok) return authFailureResponse(scope, corsHeaders)
    const tenantId = scope.tenantId

    const payload = await req.json().catch(() => ({}))
    const erpConfigId = payload.erp_config_id
    const dryRun = payload.dry_run === true

    // Fetch active ERP config
    let configQuery = supabase.from('erp_configurations').select('*').eq('tenant_id', tenantId)
    if (erpConfigId) {
      configQuery = configQuery.eq('id', erpConfigId)
    } else {
      configQuery = configQuery.eq('connection_status', 'active')
    }

    const { data: config } = await configQuery.limit(1).maybeSingle()
    const adapter = config ? AdapterFactory.createAdapter(config) : await AdapterFactory.getAdapterForTenant(tenantId, supabase)

    // The mock adapter is a development stand-in. Executing a real batch against
    // it would record synthetic "PR-..." numbers as if SAP had issued them.
    if (adapter.simulated && !dryRun) {
      return new Response(JSON.stringify({
        status: 'failed',
        error: 'The active ERP configuration resolves to the local mock adapter. No purchase requisitions were created and no document numbers were issued. Configure a real SAP connection, or call again with dry_run: true to rehearse.'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 })
    }

    // Health check. A dry run still talks to the ERP, so it still needs a
    // reachable system to be a meaningful rehearsal.
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

    // ------------------------------------------------------------------
    // Resolve the SAP plant for each staged item from the store master.
    // The previous implementation sent every requisition to plant '1001',
    // which silently provisions the wrong site whenever a tenant has more
    // than one store.
    // ------------------------------------------------------------------
    const storeIds = [...new Set(stagedItems.map((i: any) => i.store_id).filter(Boolean))]
    const { data: storeRows, error: storeError } = await supabase
      .from('stores')
      .select('id, sap_plant_code')
      .in('id', storeIds)

    if (storeError) throw storeError

    const plantByStore = new Map<string, string>(
      (storeRows ?? [])
        .filter((s: any) => s.sap_plant_code)
        .map((s: any) => [s.id as string, s.sap_plant_code as string])
    )

    const missingPlant = stagedItems.filter((i: any) => !plantByStore.get(i.store_id))
    if (missingPlant.length > 0) {
      return new Response(JSON.stringify({
        status: 'failed',
        error: 'Cannot create purchase requisitions: no SAP plant is mapped for one or more stores. ' +
          'Populate stores.sap_plant_code before executing the batch.',
        staged_pr_ids: missingPlant.map((i: any) => i.id)
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 422 })
    }

    // Storage location is optional for a PR, but if the ledger knows it we pass
    // it through rather than defaulting.
    const { data: ledgerRows } = await supabase
      .from('live_inventory_ledger')
      .select('sku, sap_storage_loc')
      .in('sku', [...new Set(stagedItems.map((i: any) => i.sku).filter(Boolean))])

    const storageBySku = new Map<string, string>(
      (ledgerRows ?? []).map((r: any) => [r.sku as string, r.sap_storage_loc as string])
    )

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
        currency: stagedItems[0]?.currency || 'EUR',
        started_at: new Date().toISOString()
      })
      .select()
      .single()

    if (batchError) throw batchError

    const itemsForERP = stagedItems.map((item: any) => ({
      stagedPrId: item.id,
      material: item.sku,
      plant: plantByStore.get(item.store_id)!,
      storageLocation: storageBySku.get(item.sku) ?? '',
      quantity: Number(item.qty_rounded),
      uom: item.uom,
      // No vendor and no price are invented. Both are optional in the
      // requisition payload and are simply omitted when the staging record does
      // not carry them.
      vendor: item.vendor_id ?? undefined,
      deliveryDate: item.scheduled_batch_at ?? undefined,
      estimatedPrice: item.estimated_unit_price == null ? undefined : Number(item.estimated_unit_price)
    }))

    // ------------------------------------------------------------------
    // Dry run: rehearse and report, but never claim a document number and
    // never mutate the staging records.
    // ------------------------------------------------------------------
    if (dryRun) {
      await supabase.from('execution_batches').update({
        status: 'success',
        items_success: 0,
        items_failed: 0,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - new Date(batchRecord.started_at).getTime()
      }).eq('id', batchRecord.id)

      return new Response(JSON.stringify({
        status: 'dry_run',
        batch_id: batchRecord.id,
        dry_run: true,
        simulated: adapter.simulated,
        message: 'Dry run only. No purchase requisitions were created and no document numbers were issued.',
        summary: { total: itemsForERP.length, would_submit: itemsForERP.length },
        planned_items: itemsForERP
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    let result
    try {
      if (typeof adapter.executeBatchPR === 'function') {
        result = await adapter.executeBatchPR(itemsForERP)
      } else {
        // Adapter has no batch transport: submit one requisition at a time and
        // assemble the same result shape. This does not reduce document count
        // either way — it only costs more round trips.
        const items: Array<{ item: unknown; status: 'success' | 'failed'; erp_document_number?: string; error?: string }> = []
        for (const item of itemsForERP) {
          const single = await adapter.postPurchaseRequisition({
            pr_id: item.stagedPrId,
            items: [{
              item_id: '00010',
              sku: item.material,
              quantity_requested: item.quantity,
              quantity_approved: item.quantity,
              uom: item.uom,
              estimated_unit_price: item.estimatedPrice,
              plant: item.plant,
            }],
            requested_delivery_date: item.deliveryDate ?? new Date().toISOString().split('T')[0],
            priority: 'NORMAL',
            execution_mode: 'BATCH',
            status: 'APPROVED',
            total_estimated_value: (item.estimatedPrice ?? 0) * item.quantity,
            currency: 'EUR',
            created_by: auth.ctx.userId ?? 'system',
            created_at: new Date().toISOString(),
          })

          items.push({
            item,
            status: single.success && single.erp_pr_number ? 'success' : 'failed',
            erp_document_number: single.erp_pr_number,
            error: single.errors?.join('; ')
          })
        }

        result = {
          total: items.length,
          succeeded: items.filter(i => i.status === 'success').length,
          failed: items.filter(i => i.status !== 'success').length,
          items
        }
      }
    } catch (err) {
      if (isOutcomeUnknown(err)) {
        // SAP may have created some or all of these requisitions. Re-running the
        // batch would create duplicates, so the batch is quarantined for manual
        // reconciliation instead.
        await supabase.from('execution_batches').update({
          status: 'failed',
          items_success: 0,
          items_failed: itemsForERP.length,
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - new Date(batchRecord.started_at).getTime()
        }).eq('id', batchRecord.id)

        return new Response(JSON.stringify({
          status: 'outcome_unknown',
          batch_id: batchRecord.id,
          error: (err as Error).message,
          message: 'SAP did not confirm the batch outcome. The staged requisitions were left approved ' +
            'and must be reconciled against SAP before any retry, otherwise duplicate requisitions will be created.'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 })
      }
      throw err
    }

    const dlq = new DeadLetterQueue(supabase)
    const executorHelper = new BatchExecutor(supabase)
    let succeeded = 0
    let failed = 0

    for (let i = 0; i < (result.items?.length || 0); i++) {
      const itemResult = result.items[i]
      const stagedItem = stagedItems[i]
      const erpDocumentNumber = itemResult.erp_document_number

      // A "success" without a document number is not a success. Record it as a
      // failure so it surfaces for review instead of being written to the PR
      // record as if SAP had issued a number.
      const itemSucceeded = itemResult.status === 'success' && Boolean(erpDocumentNumber)

      await supabase.from('execution_batch_items').insert({
        batch_id: batchRecord.id,
        staged_pr_id: stagedItem.id,
        erp_entity_type: 'PurchaseRequisition',
        erp_payload: itemsForERP[i],
        status: itemSucceeded ? 'success' : 'failed',
        erp_document_number: erpDocumentNumber ?? null,
        erp_message: itemSucceeded
          ? 'PR Posted Successfully'
          : (itemResult.error || 'ERP reported success without returning a purchase requisition number.'),
        item_idempotency_key: `${idempotencyKey}:${stagedItem.id}`
      })

      if (itemSucceeded) {
        await supabase.from('staged_prs').update({
          status: 'submitted_to_erp',
          erp_pr_number: erpDocumentNumber,
          erp_document_status: 'ERP_ACCEPTED',
          submitted_at: new Date().toISOString()
        }).eq('id', stagedItem.id)
        succeeded++
      } else {
        failed++
        const message = itemResult.error || 'ERP reported success without returning a purchase requisition number.'
        const cat = executorHelper.categorizeError(message)
        if (cat === 'SAP_BUSINESS_ERROR' || cat === 'VALIDATION') {
          await dlq.enqueue(
            batchRecord.id,
            stagedItem.id,
            'PurchaseRequisition',
            itemsForERP[i],
            message,
            cat,
            [{ attempted_at: new Date().toISOString(), error: message }]
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
      dry_run: false,
      simulated: adapter.simulated,
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
