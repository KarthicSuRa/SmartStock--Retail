// /supabase/functions/pos-replay-quarantine/index.ts
// SmartStock LiveRetail V2 — POS Quarantine Replay Engine

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { quarantine_id, tenant_id } = await req.json();

    if (!quarantine_id || !tenant_id) {
      return new Response(JSON.stringify({ error: "quarantine_id and tenant_id are required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // 1. Fetch pending quarantined events for this quarantine entry
    const { data: events } = await supabase
      .from("pos_quarantined_events")
      .select("*")
      .eq("quarantine_id", quarantine_id)
      .eq("tenant_id", tenant_id)
      .eq("replay_status", "PENDING");

    let replayedCount = 0;
    const gatewayUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pos-ingestion-gateway`;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    for (const evt of events || []) {
      const raw = evt.raw_transaction;

      // Re-submit to pos-ingestion-gateway
      const res = await fetch(gatewayUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          "x-pos-config-id": evt.pos_config_id,
        },
        body: JSON.stringify(raw),
      });

      if (res.ok) {
        await supabase
          .from("pos_quarantined_events")
          .update({ replay_status: "REPLAYED", replayed_at: new Date().toISOString() })
          .eq("id", evt.id);
        replayedCount++;
      }
    }

    // Mark quarantine entry as RESOLVED
    await supabase
      .from("pos_identity_quarantine")
      .update({ status: "RESOLVED" })
      .eq("id", quarantine_id);

    return new Response(
      JSON.stringify({
        status: "success",
        quarantine_id,
        replayed_count: replayedCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ status: "error", message: (error as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
