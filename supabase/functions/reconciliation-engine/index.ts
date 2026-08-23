// /supabase/functions/reconciliation-engine/index.ts
// SmartStock LiveRetail V2 — Continuous ERP Reconciliation Engine
//
// Triggered on every SAP_CHECKPOINT:
// 1. Compares expected operational inventory against authoritative SAP checkpoint quantity
// 2. Classifies variance as explained (known pending outbox scraps/transfers) vs unexplained
// 3. Persists audit record in `inventory_reconciliations`
// 4. Emits `SAP_VARIANCE` operational case if unexplained variance is found

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
    const { tenant_id, location_id, material_id, sap_qty } = payload;

    if (!tenant_id || !location_id || !material_id || sap_qty == null) {
      return new Response(
        JSON.stringify({ error: "tenant_id, location_id, material_id, and sap_qty are required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // 1. Fetch current operational position
    const { data: position } = await supabase
      .from("inventory_position")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("location_id", location_id)
      .eq("material_id", material_id)
      .maybeSingle();

    const expectedQty = Number(position?.estimated_on_hand || 0);
    const sapCheckpointQty = Number(sap_qty);
    const totalVariance = sapCheckpointQty - expectedQty;

    // 2. Identify known pending adjustments (buffered scraps, unposted damage)
    const { data: pendingScraps } = await supabase
      .from("buffered_scraps")
      .select("quantity")
      .eq("sap_plant_code", location_id)
      .eq("sku", position?.sku || "")
      .eq("sync_status", "PENDING");

    const pendingScrapsQty = (pendingScraps || []).reduce((acc: number, cur: any) => acc + (cur.quantity || 0), 0);
    const explainedVariance = -pendingScrapsQty;
    const unexplainedVariance = totalVariance - explainedVariance;

    let status = "MATCHED";
    if (totalVariance === 0) {
      status = "MATCHED";
    } else if (unexplainedVariance === 0) {
      status = "EXPLAINED_VARIANCE";
    } else {
      status = "UNEXPLAINED_VARIANCE";
    }

    // 3. Create operational case if unexplained variance
    let caseId: string | null = null;
    if (status === "UNEXPLAINED_VARIANCE") {
      const { data: opCase } = await supabase
        .from("operational_cases")
        .insert({
          tenant_id,
          case_type: "SAP_VARIANCE",
          severity: Math.abs(unexplainedVariance) > 5 ? "HIGH" : "MEDIUM",
          status: "OPEN",
          location_id,
          material_id,
          financial_exposure: Math.abs(unexplainedVariance) * 15.0,
          detected_at: new Date().toISOString(),
          recommended_action: {
            action: "CYCLE_COUNT_REQUIRED",
            reason: `Unexplained variance of ${unexplainedVariance} units between SAP and SmartStock estimate`,
            sap_quantity: sapCheckpointQty,
            expected_quantity: expectedQty,
            unexplained_units: unexplainedVariance,
          },
        })
        .select("id")
        .maybeSingle();

      caseId = opCase?.id || null;
    }

    // 4. Insert reconciliation record
    const { data: recRecord, error: recErr } = await supabase
      .from("inventory_reconciliations")
      .insert({
        tenant_id,
        location_id,
        material_id,
        sku: position?.sku,
        expected_qty: expectedQty,
        sap_qty: sapCheckpointQty,
        total_variance: totalVariance,
        explained_variance: explainedVariance,
        unexplained_variance: unexplainedVariance,
        status,
        explanation: {
          pending_scraps_offset: pendingScrapsQty,
          unexplained_variance: unexplainedVariance,
          timestamp: new Date().toISOString(),
        },
        operational_case_id: caseId,
      })
      .select()
      .single();

    if (recErr) throw recErr;

    // 5. Update inventory_position reconciliation status
    await supabase
      .from("inventory_position")
      .update({
        reconciliation_status: status,
        last_reconciliation_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenant_id)
      .eq("location_id", location_id)
      .eq("material_id", material_id);

    return new Response(
      JSON.stringify({ status: "success", reconciliation: recRecord }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    console.error("[reconciliation-engine] Error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: (err as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
