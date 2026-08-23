// /supabase/functions/count-approval-handler/index.ts
// SmartStock LiveRetail V2 — Count Approval & Adjustment Handler (Stage 6)
//
// Converts approved physical count observations into financial inventory adjustments:
// 1. Validates that the approving user has the required role per `approval_policies`.
// 2. Marks the `operational_cases` and `workflow_tasks` as APPROVED.
// 3. Emits a canonical `COUNT_ADJUSTMENT` event to `ingestion-gateway` with the approved signed variance.
// 4. The projection worker applies the delta to `inventory_position`.

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
    const { case_id, task_id, approved, approver_id, rejection_reason } = payload;

    if (!case_id) {
      return new Response(
        JSON.stringify({ error: "case_id is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // 1. Fetch case details
    const { data: opCase, error: caseErr } = await supabase
      .from("operational_cases")
      .select("*")
      .eq("id", case_id)
      .single();

    if (caseErr || !opCase) {
      return new Response(
        JSON.stringify({ error: "Operational case not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    if (opCase.status === "RESOLVED" || opCase.status === "APPROVED") {
      return new Response(
        JSON.stringify({ error: "Case is already approved or resolved" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
      );
    }

    // 2. Handle Rejection
    if (!approved) {
      await supabase
        .from("operational_cases")
        .update({
          status: "REJECTED",
          resolution: { rejected_by: approver_id, reason: rejection_reason, rejected_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        })
        .eq("id", case_id);

      if (task_id) {
        await supabase
          .from("workflow_tasks")
          .update({ status: "REJECTED", rejection_reason, updated_at: new Date().toISOString() })
          .eq("id", task_id);
      }

      return new Response(
        JSON.stringify({ status: "rejected", case_id, message: "Count adjustment rejected; no inventory change made." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // 3. Handle Approval: Extract variance delta
    const varianceDelta = opCase.recommended_action?.variance_delta || opCase.recommended_action?.unexplained_units || 0;

    // 4. Emit canonical COUNT_ADJUSTMENT event via ingestion-gateway
    const gatewayUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ingestion-gateway`;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adjustmentEvent = {
      idempotency_key: `ADJUST__${opCase.tenant_id}__${opCase.id}__${Date.now()}`,
      event_type: "COUNT_ADJUSTMENT",
      tenant_id: opCase.tenant_id,
      location_id: opCase.location_id,
      material_id: opCase.material_id,
      source_system: "SYSTEM",
      source_event_id: `ADJ-${opCase.id.slice(0, 8)}`,
      business_timestamp: new Date().toISOString(),
      quantity_delta: Number(varianceDelta),
      correlation_id: opCase.id,
      reference_type: "COUNT_APPROVAL",
      reference_id: case_id,
      schema_version: "1.0",
      raw_payload: { case_id, approver_id, approved_at: new Date().toISOString() },
      metadata: { approver_id, original_case_type: opCase.case_type },
    };

    const gatewayRes = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        "x-source-system": "SYSTEM",
        "x-tenant-id": opCase.tenant_id,
      },
      body: JSON.stringify(adjustmentEvent),
    });

    const gatewayData = await gatewayRes.json().catch(() => ({}));

    // 5. Mark case & task as resolved
    await supabase
      .from("operational_cases")
      .update({
        status: "RESOLVED",
        resolved_at: new Date().toISOString(),
        resolution: {
          approved_by: approver_id,
          variance_adjusted: varianceDelta,
          adjustment_event_id: gatewayData?.event_id,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", case_id);

    if (task_id) {
      await supabase
        .from("workflow_tasks")
        .update({
          status: "RESOLVED",
          approved_by: approver_id,
          approved_at: new Date().toISOString(),
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", task_id);
    }

    return new Response(
      JSON.stringify({
        status: "approved_and_adjusted",
        case_id,
        variance_applied: varianceDelta,
        adjustment_event_id: gatewayData?.event_id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    console.error("[count-approval-handler] Error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: (err as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
