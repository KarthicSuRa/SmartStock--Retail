// Supabase Edge Function: erp-reconciliation
// On-Demand Stock Reconciliation Engine

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

  // Reconciliation reads SAP and writes the audit trail: never anonymous.
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

    // The body tenant_id is deliberately ignored for user callers; the verified
    // claim (via requireAuth/resolveTenantScope) is the only tenant source.
    const { store_id, sku } = await req.json()

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    // inventory_position.tenant_id and sync_audit_log.tenant_id are UUID
    // columns. Never filter or write them with a non-UUID (e.g. the
    // `default-tenant` placeholder): the write would fail or, worse, a local
    // total would be computed for no tenant at all.
    if (!uuidRe.test(tenantId)) {
      return new Response(JSON.stringify({
        error: 'tenant_id must be a UUID for the inventory_position / sync_audit_log tenant_id columns (these are UUID columns)',
        tenant_id: tenantId
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 422 })
    }

    // Resolve the store reference to an inventory_position.location_id before
    // any ERP work. Callers may pass either stores.id (UUID) or the SAP plant
    // code (WERKS). If a supplied store_id cannot be resolved we must fail
    // loudly: skipping the local side and reporting zero variance is a lie.
    let locationId: string | null = null
    if (store_id) {
      if (uuidRe.test(store_id)) {
        locationId = store_id
      } else {
        const { data: storeRow } = await supabase
          .from('stores')
          .select('id')
          .eq('sap_plant_code', store_id)
          .maybeSingle()
        locationId = storeRow?.id ?? null
      }

      if (!locationId) {
        return new Response(JSON.stringify({
          error: 'store_id could not be resolved to an inventory location',
          store_id
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 422 })
      }
    }

    // Get ERP adapter
    const adapter = await AdapterFactory.getAdapterForTenant(tenantId, supabase)

    // Execute stock reconciliation via adapter. The adapter reports the SAP
    // side only; the local twin is joined here because this function owns the
    // database client.
    const result = await adapter.reconcileStock(store_id || '1001', sku)

    // 'ok'       - local side was read and variance was computed.
    // 'unavailable' - the inventory_position read failed.
    // 'not_scoped'  - no store location was supplied, so no local read occurred.
    let localSideStatus: 'ok' | 'unavailable' | 'not_scoped' = 'not_scoped'

    if (locationId) {
      let positionQuery = supabase
        .from('inventory_position')
        .select('sku, sellable_qty, estimated_on_hand')
        .eq('location_id', locationId)
        .eq('tenant_id', tenantId)
      if (sku) positionQuery = positionQuery.eq('sku', sku)

      const { data: positions, error: positionError } = await positionQuery
      if (positionError) {
        // Reconciliation must stay honest: report that the local side could
        // not be read instead of pretending the variance is zero.
        console.error('[erp-reconciliation] inventory_position read failed:', positionError)
        localSideStatus = 'unavailable'
      } else {
        localSideStatus = 'ok'
        const rows = positions ?? []
        const localTotal = rows.reduce(
          (sum: number, row: any) => sum + Number(row.sellable_qty ?? 0),
          0,
        )
        result.local_total = localTotal
        result.variance = localTotal - result.erp_total
        result.variance_percentage = result.erp_total
          ? Math.round((result.variance / result.erp_total) * 100)
          : 0

        const localBySku = new Map<string, number>(
          rows.map((row: any) => [row.sku, Number(row.sellable_qty ?? 0)]),
        )
        result.discrepancies = result.discrepancies.map((d) => {
          const localQty = localBySku.get(d.sku) ?? 0
          return { ...d, local_qty: localQty, diff: localQty - d.erp_qty }
        })
      }
    }

    // Log to sync audit trail only when a real local-side variance was computed.
    if (localSideStatus === 'ok' && Math.abs(result.variance) > 0.01) {
      const { data: activeConfig } = await supabase
        .from('erp_configurations')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('connection_status', 'active')
        .limit(1)
        .maybeSingle()

      await supabase.from('sync_audit_log').insert({
        tenant_id: tenantId,
        erp_config_id: activeConfig?.id ?? undefined,
        entity_type: 'stock_reconciliation',
        erp_key: sku || store_id || 'STORE_WIDE',
        action: 'CONFLICT',
        old_values: { local_total: result.local_total },
        new_values: { erp_total: result.erp_total, variance: result.variance },
        conflict_strategy: 'erp_wins',
        conflict_reason: `Reconciliation variance: ${result.variance} (${result.variance_percentage}%)`
      })
    }

    const localSideReadable = localSideStatus === 'ok'
    const recommendation = localSideStatus === 'unavailable'
      ? 'Local inventory position could not be read; variance could not be determined.'
      : localSideStatus === 'not_scoped'
        ? 'No inventory location was scoped; ERP totals only. No local variance was computed.'
        : Math.abs(result.variance_percentage) > 5
          ? 'Critical variance detected. Physical stock audit recommended.'
          : 'Stock within normal tolerance threshold.'

    return new Response(JSON.stringify({
      status: 'completed',
      tenant_id: tenantId,
      store_id: store_id || '1001',
      sku,
      erp_total: result.erp_total,
      local_total: localSideReadable ? result.local_total : null,
      variance: localSideReadable ? result.variance : null,
      variance_percentage: localSideReadable ? result.variance_percentage : null,
      local_side_status: localSideStatus,
      discrepancies: localSideReadable
        ? result.discrepancies
        : result.discrepancies.map((d) => ({ ...d, local_qty: null, diff: null })),
      recommendation
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    console.error('[erp-reconciliation] Execution error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
