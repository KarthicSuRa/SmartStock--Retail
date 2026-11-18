// /supabase/functions/pos-ingestion-gateway/index.ts
// SmartStock LiveRetail V2 — POS webhook entry point (Shopify / Square /
// Lightspeed / generic). Verification, parsing and ledger writes all live in
// `_shared/pos/ingest.ts` so this endpoint and `pos-webhook` cannot diverge.
//
// The tenant is selected by the POS configuration UUID, passed either as
// `?config=<uuid>` (required for providers that cannot set custom headers) or
// as the `x-pos-config-id` header. There is no default tenant.

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
    console.error("[pos-ingestion-gateway] missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 503,
      headers: { ...POS_CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    return await handlePosIngestion(req, supabase);
  } catch (error) {
    console.error("[pos-ingestion-gateway] unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "internal_error", detail: (error as Error).message }),
      { status: 500, headers: { ...POS_CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
