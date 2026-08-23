// /supabase/functions/projection-comparator/index.ts
// SmartStock LiveRetail V2 — Dual-Run Parity Comparator (Stage 2)
//
// Periodically audits live V1 ledger values against V2 event-projected positions
// to prove 99.99% convergence before retiring legacy calculation writes.

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

    // 1. Fetch V1 records
    const { data: v1Items } = await supabase
      .from("live_inventory_ledger")
      .select("sku, sap_plant_code, current_calculated_stock");

    // 2. Fetch V2 records
    const { data: v2Items } = await supabase
      .from("inventory_position")
      .select("sku, location_id, estimated_on_hand")
      .eq("tenant_id", tenantId);

    const v1Map = new Map((v1Items || []).map((i) => [i.sku, Number(i.current_calculated_stock || 0)]));
    const v2Map = new Map((v2Items || []).map((i) => [i.sku, Number(i.estimated_on_hand || 0)]));

    const allSkus = new Set([...v1Map.keys(), ...v2Map.keys()]);
    let matchedCount = 0;
    let unexplainedCount = 0;

    const recordsToInsert = [];

    for (const sku of allSkus) {
      const v1Qty = v1Map.has(sku) ? v1Map.get(sku)! : null;
      const v2Qty = v2Map.has(sku) ? v2Map.get(sku)! : null;

      let status = "MATCHED";
      let explanation: any = {};

      if (v1Qty === null) {
        status = "V1_MISSING";
      } else if (v2Qty === null) {
        status = "V2_MISSING";
      } else {
        const diff = v2Qty - v1Qty;
        if (diff === 0) {
          status = "MATCHED";
          matchedCount++;
        } else {
          // Check for explained offsets (e.g. pending scraps)
          status = "UNEXPLAINED";
          unexplainedCount++;
          explanation = { diff, reason: "Divergence between V1 static formula and V2 projected state" };
        }
      }

      recordsToInsert.push({
        tenant_id: tenantId,
        location_id: locationId,
        sku,
        v1_legacy_qty: v1Qty,
        v2_estimated_qty: v2Qty,
        agreement_status: status,
        explanation,
        sampled_at: new Date().toISOString(),
      });
    }

    if (recordsToInsert.length > 0) {
      await supabase.from("projection_comparison").insert(recordsToInsert);
    }

    const parityPct = allSkus.size > 0 ? ((matchedCount / allSkus.size) * 100).toFixed(2) : "100.00";

    return new Response(
      JSON.stringify({
        status: "success",
        total_skus_compared: allSkus.size,
        matched: matchedCount,
        unexplained: unexplainedCount,
        parity_percentage: `${parityPct}%`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    console.error("[projection-comparator] Error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: (err as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
