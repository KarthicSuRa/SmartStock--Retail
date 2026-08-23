// /supabase/functions/projection-worker/index.ts
// SmartStock LiveRetail V2 — Asynchronous Inventory Projection Worker
//
// Converts incoming inventory_events into real-time operational digital twin state
// in `inventory_position`. Supports both queue-driven async processing and full
// event replay via `rebuildInventoryProjection`.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ProjectionRules, PositionState } from "../_shared/projection/rules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tenant-id",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const payload = await req.json().catch(() => ({}));
    const action = payload.action || "PROCESS_QUEUE";

    // -------------------------------------------------------------------------
    // ACTION 1: REBUILD PROJECTION FROM EVENT HISTORY (REPLAY)
    // -------------------------------------------------------------------------
    if (action === "REBUILD") {
      const { tenant_id, location_id, material_id } = payload;
      if (!tenant_id || !location_id || !material_id) {
        return new Response(
          JSON.stringify({ error: "tenant_id, location_id, and material_id are required for REBUILD" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      const rebuiltState = await rebuildInventoryProjection(supabase, tenant_id, location_id, material_id);
      return new Response(
        JSON.stringify({ status: "success", action: "REBUILD", result: rebuiltState }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // -------------------------------------------------------------------------
    // ACTION 2: PROCESS PENDING PROJECTION QUEUE
    // -------------------------------------------------------------------------
    const batchSize = payload.batch_size || 50;
    const { data: queueItems, error: fetchErr } = await supabase
      .from("projection_queue")
      .select("*")
      .eq("status", "PENDING")
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (fetchErr) throw fetchErr;

    let processedCount = 0;

    for (const item of queueItems || []) {
      try {
        // Mark as processing
        await supabase
          .from("projection_queue")
          .update({ status: "PROCESSING", processed_at: new Date().toISOString() })
          .eq("id", item.id);

        let resolvedMaterialId = item.material_id;

        // If material_id was not provided directly, lookup from raw_payload or SKU
        if (!resolvedMaterialId) {
          const { data: eventData } = await supabase
            .from("inventory_events")
            .select("raw_payload")
            .eq("id", item.event_id)
            .single();

          const sku = eventData?.raw_payload?.sku || eventData?.raw_payload?.original_movement?.sku;
          if (sku) {
            const { data: matData } = await supabase
              .from("material_master")
              .select("id")
              .eq("tenant_id", item.tenant_id)
              .eq("sku", sku)
              .maybeSingle();
            resolvedMaterialId = matData?.id;
          }
        }

        if (!resolvedMaterialId) {
          // Cannot project without material context; mark failed
          await supabase
            .from("projection_queue")
            .update({ status: "FAILED", last_error: "Missing material_id and unresolved SKU" })
            .eq("id", item.id);
          continue;
        }

        // Fetch or create initial position
        const { data: posData } = await supabase
          .from("inventory_position")
          .select("*")
          .eq("tenant_id", item.tenant_id)
          .eq("location_id", item.location_id)
          .eq("material_id", resolvedMaterialId)
          .maybeSingle();

        const currentState: PositionState = posData
          ? {
              erp_checkpoint_qty: Number(posData.erp_checkpoint_qty || 0),
              estimated_on_hand: Number(posData.estimated_on_hand || 0),
              sellable_qty: Number(posData.sellable_qty || 0),
              reserved_qty: Number(posData.reserved_qty || 0),
              in_transit_qty: Number(posData.in_transit_qty || 0),
              last_physical_count_qty: posData.last_physical_count_qty,
              last_physical_count_at: posData.last_physical_count_at,
              confidence_score: Number(posData.confidence_score || 100),
              reconciliation_status: posData.reconciliation_status || "MATCHED",
              projection_version: Number(posData.projection_version || 1),
            }
          : {
              erp_checkpoint_qty: 0,
              estimated_on_hand: 0,
              sellable_qty: 0,
              reserved_qty: 0,
              in_transit_qty: 0,
              confidence_score: 100,
              reconciliation_status: "MATCHED",
              projection_version: 1,
            };

        // Apply canonical projection rule
        const nextState = ProjectionRules.applyEvent(currentState, {
          event_id: item.event_id,
          event_type: item.event_type,
          quantity_delta: item.quantity_delta != null ? Number(item.quantity_delta) : null,
          business_timestamp: item.business_timestamp,
        });

        // 3. Atomically upsert position and record in projection_applied_events registry
        const { error: applyErr } = await supabase.rpc("apply_projection_event", {
          p_event_id: item.event_id,
          p_tenant_id: item.tenant_id,
          p_location_id: item.location_id,
          p_material_id: resolvedMaterialId,
          p_sku: posData?.sku || "SKU-AUTO",
          p_product_name: posData?.product_name || "Auto Material",
          p_uom: posData?.uom || "PC",
          p_erp_checkpoint_qty: nextState.erp_checkpoint_qty,
          p_estimated_on_hand: nextState.estimated_on_hand,
          p_sellable_qty: nextState.sellable_qty,
          p_reserved_qty: nextState.reserved_qty,
          p_in_transit_qty: nextState.in_transit_qty,
          p_last_physical_count_qty: nextState.last_physical_count_qty ?? null,
          p_last_physical_count_at: nextState.last_physical_count_at ?? null,
          p_reconciliation_status: nextState.reconciliation_status,
          p_business_timestamp: item.business_timestamp,
          p_projection_version: nextState.projection_version,
        });

        if (applyErr) {
          // Fallback direct upsert
          await supabase.from("inventory_position").upsert({
            tenant_id: item.tenant_id,
            location_id: item.location_id,
            material_id: resolvedMaterialId,
            sku: posData?.sku || "SKU-AUTO",
            product_name: posData?.product_name || "Auto Material",
            uom: posData?.uom || "PC",
            erp_checkpoint_qty: nextState.erp_checkpoint_qty,
            estimated_on_hand: nextState.estimated_on_hand,
            sellable_qty: nextState.sellable_qty,
            reserved_qty: nextState.reserved_qty,
            in_transit_qty: nextState.in_transit_qty,
            last_physical_count_qty: nextState.last_physical_count_qty,
            last_physical_count_at: nextState.last_physical_count_at,
            reconciliation_status: nextState.reconciliation_status,
            last_event_id: item.event_id,
            last_event_at: item.business_timestamp,
            projection_version: nextState.projection_version,
            updated_at: new Date().toISOString(),
          });
        }

        // Mark queue item completed
        await supabase
          .from("projection_queue")
          .update({ status: "COMPLETED", processed_at: new Date().toISOString() })
          .eq("id", item.id);

        processedCount++;
      } catch (err) {
        console.error(`[projection-worker] Error processing queue item ${item.id}:`, err);
        await supabase
          .from("projection_queue")
          .update({
            status: "FAILED",
            attempts: (item.attempts || 0) + 1,
            last_error: (err as Error).message,
          })
          .eq("id", item.id);
      }
    }

    return new Response(
      JSON.stringify({ status: "success", processed: processedCount, queue_size: queueItems?.length || 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    console.error("[projection-worker] Worker error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: (err as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

/**
 * Replays all historical events in ascending order to rebuild the operational digital twin.
 */
async function rebuildInventoryProjection(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  locationId: string,
  materialId: string
): Promise<PositionState> {
  // 1. Fetch all valid events for this material in chronological order
  const { data: events, error } = await supabase
    .from("inventory_events")
    .select("id, event_type, quantity_delta, business_timestamp, metadata")
    .eq("tenant_id", tenantId)
    .eq("location_id", locationId)
    .eq("material_id", materialId)
    .neq("sequence_status", "INVALID")
    .order("business_timestamp", { ascending: true });

  if (error) throw error;

  let state: PositionState = {
    erp_checkpoint_qty: 0,
    estimated_on_hand: 0,
    sellable_qty: 0,
    reserved_qty: 0,
    in_transit_qty: 0,
    confidence_score: 100,
    reconciliation_status: "MATCHED",
    projection_version: 1,
  };

  for (const event of events || []) {
    state = ProjectionRules.applyEvent(state, {
      event_id: event.id,
      event_type: event.event_type,
      quantity_delta: event.quantity_delta != null ? Number(event.quantity_delta) : null,
      business_timestamp: event.business_timestamp,
      metadata: event.metadata,
    });
  }

  // Persist the rebuilt state
  await supabase.from("inventory_position").upsert({
    tenant_id: tenantId,
    location_id: locationId,
    material_id: materialId,
    erp_checkpoint_qty: state.erp_checkpoint_qty,
    estimated_on_hand: state.estimated_on_hand,
    sellable_qty: state.sellable_qty,
    reserved_qty: state.reserved_qty,
    in_transit_qty: state.in_transit_qty,
    last_physical_count_qty: state.last_physical_count_qty,
    last_physical_count_at: state.last_physical_count_at,
    reconciliation_status: state.reconciliation_status,
    projection_version: state.projection_version,
    updated_at: new Date().toISOString(),
  });

  return state;
}
