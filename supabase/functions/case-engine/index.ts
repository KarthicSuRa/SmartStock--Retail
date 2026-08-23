// /supabase/functions/case-engine/index.ts
// SmartStock LiveRetail V2 — Operational Case / Exception Engine
//
// Converts inventory intelligence, stockout risks, and integration variances
// into structured operational cases with financial exposure and owners.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const tenantId = payload.tenant_id || "default-tenant";
    const locationId = payload.location_id || "1001";

    let generatedCount = 0;

    // 1. Scan for Imminent Stockouts
    const { data: lowStockPositions } = await supabase
      .from("inventory_position")
      .select("tenant_id, location_id, material_id, sku, estimated_on_hand, erp_checkpoint_qty")
      .eq("tenant_id", tenantId)
      .eq("location_id", locationId)
      .lte("estimated_on_hand", 5);

    for (const pos of lowStockPositions || []) {
      const { data: existing } = await supabase
        .from("operational_cases")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("location_id", locationId)
        .eq("material_id", pos.material_id)
        .eq("case_type", "STOCKOUT_RISK")
        .in("status", ["OPEN", "ASSIGNED", "IN_PROGRESS"])
        .maybeSingle();

      if (!existing) {
        await supabase.from("operational_cases").insert({
          tenant_id: tenantId,
          location_id: locationId,
          material_id: pos.material_id,
          sku: pos.sku,
          case_type: "STOCKOUT_RISK",
          severity: Number(pos.estimated_on_hand) <= 2 ? "CRITICAL" : "HIGH",
          status: "OPEN",
          financial_exposure: 420.0,
          detected_at: new Date().toISOString(),
          due_at: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
          assigned_role: "store_manager",
          recommended_action: {
            action: "EMERGENCY_REPLENISHMENT_OR_STO",
            current_stock: pos.estimated_on_hand,
            suggested_order_qty: 48,
          },
        });
        generatedCount++;
      }
    }

    // 2. Scan for Expiring Batches
    const { data: expiringBatches } = await supabase
      .from("material_batches")
      .select("id, tenant_id, store_id, material_id, sku, batch_number, quantity, expiry_date")
      .eq("tenant_id", tenantId)
      .eq("store_id", locationId)
      .lte("expiry_date", new Date(Date.now() + 5 * 86400000).toISOString())
      .gt("quantity", 0);

    for (const batch of expiringBatches || []) {
      const { data: existing } = await supabase
        .from("operational_cases")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("location_id", locationId)
        .eq("material_id", batch.material_id)
        .eq("case_type", "EXPIRY_RISK")
        .in("status", ["OPEN", "ASSIGNED", "IN_PROGRESS"])
        .maybeSingle();

      if (!existing) {
        await supabase.from("operational_cases").insert({
          tenant_id: tenantId,
          location_id: locationId,
          material_id: batch.material_id,
          sku: batch.sku,
          case_type: "EXPIRY_RISK",
          severity: "HIGH",
          status: "OPEN",
          financial_exposure: (batch.quantity || 1) * 12.5,
          detected_at: new Date().toISOString(),
          due_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
          assigned_role: "floor_staff",
          recommended_action: {
            action: "APPLY_MARKDOWN_OR_DONATION",
            batch_number: batch.batch_number,
            quantity: batch.quantity,
            expiry_date: batch.expiry_date,
            recommended_markdown_pct: 25,
          },
        });
        generatedCount++;
      }
    }

    return new Response(
      JSON.stringify({ status: "success", cases_evaluated: true, generated_count: generatedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    console.error("[case-engine] Error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: (err as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
