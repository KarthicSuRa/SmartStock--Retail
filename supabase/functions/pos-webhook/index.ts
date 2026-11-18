// /supabase/functions/pos-webhook/index.ts
// SmartStock LiveRetail V2 — legacy POS webhook URL.
//
// Kept as an alias so existing provider subscriptions (and the URL configured
// in `pos_configurations.webhook_url`) keep working. It runs the exact same
// pipeline as `pos-ingestion-gateway`; it never had signature verification of
// its own and must not have a separate implementation.
//
// Configure the provider with `.../pos-webhook?config=<pos_configurations.id>`.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handlePosIngestion, POS_CORS_HEADERS } from "../_shared/pos/ingest.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: POS_CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    console.error("[pos-webhook] missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 503,
      headers: { ...POS_CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    return await handlePosIngestion(req, supabase);
  } catch (error) {
    console.error("[pos-webhook] unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "internal_error", detail: (error as Error).message }),
      { status: 500, headers: { ...POS_CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
