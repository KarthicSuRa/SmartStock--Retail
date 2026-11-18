// /supabase/functions/pos-replay-quarantine/index.ts
// SmartStock LiveRetail V2 — POS Quarantine Replay
//
// Replays transactions that were parked because a vendor product identifier had
// no mapping. Replay runs `processCanonical` directly instead of calling the
// public webhook: the stored payload has no valid provider signature, so it
// must never pass through the signature gate. This endpoint is therefore
// authenticated (admin JWT or service token) and scoped to the caller's tenant.
//
// A quarantine entry is only marked RESOLVED when every stored event actually
// replayed. Previously it was marked RESOLVED unconditionally, even when every
// replay failed.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  loadPosConfig,
  processCanonical,
  sha256Hex,
  UUID_RE,
} from "../_shared/pos/ingest.ts";
import type { CanonicalPOSTransaction } from "../_shared/pos/canonical-schema.ts";
import { authFailureResponse, requireAuth } from "../_shared/security/require-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-tenant-id",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const auth = await requireAuth(req, { allowService: true, defaultTenantId: "" });
  if (!auth.ok) {
    return authFailureResponse(auth, corsHeaders);
  }
  if (!UUID_RE.test(auth.ctx.tenantId)) {
    return json(403, { error: "no_tenant_context" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => null) as
      | { quarantine_id?: string; tenant_id?: string }
      | null;

    const quarantineId = body?.quarantine_id;
    if (!quarantineId || !UUID_RE.test(quarantineId)) {
      return json(400, { error: "quarantine_id must be a UUID" });
    }

    // A caller may only replay its own tenant's quarantine. A client-supplied
    // tenant_id is accepted only when it matches the authenticated context.
    if (body?.tenant_id && body.tenant_id !== auth.ctx.tenantId) {
      return json(403, { error: "tenant_mismatch" });
    }
    const tenantId = auth.ctx.tenantId;

    const { data: quarantine, error: quarantineError } = await supabase
      .from("pos_identity_quarantine")
      .select("id, tenant_id, pos_config_id, status, quarantine_type, external_id")
      .eq("id", quarantineId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (quarantineError) {
      console.error("[pos-replay] quarantine lookup failed:", quarantineError.message);
      return json(503, { error: "quarantine_unavailable" });
    }
    if (!quarantine) {
      return json(404, { error: "quarantine_not_found" });
    }

    const loaded = await loadPosConfig(supabase, quarantine.pos_config_id as string);
    if (!loaded.config) {
      return json(loaded.status, { error: loaded.error ?? "unknown_pos_config" });
    }

    const { data: events, error: eventsError } = await supabase
      .from("pos_quarantined_events")
      .select("id, raw_transaction")
      .eq("quarantine_id", quarantineId)
      .eq("tenant_id", tenantId)
      .eq("replay_status", "PENDING")
      .order("created_at", { ascending: true });

    if (eventsError) {
      console.error("[pos-replay] event lookup failed:", eventsError.message);
      return json(503, { error: "quarantine_unavailable" });
    }

    let replayed = 0;
    let stillQuarantined = 0;
    const failures: Array<{ event_id: string; status: number; error: unknown }> = [];

    for (const event of events ?? []) {
      const canonical = event.raw_transaction as CanonicalPOSTransaction;
      const rawPayload =
        (canonical.raw_payload as Record<string, unknown> | undefined) ??
        (canonical as unknown as Record<string, unknown>);

      const result = await processCanonical(
        supabase,
        loaded.config,
        canonical,
        {
          payloadHash: await sha256Hex(JSON.stringify(canonical)),
          rawPayload,
        },
      );

      if (result.status === 200) {
        await supabase
          .from("pos_quarantined_events")
          .update({ replay_status: "REPLAYED", replayed_at: new Date().toISOString() })
          .eq("id", event.id);
        replayed++;
        continue;
      }

      if (result.status === 202) {
        // Still unresolved: the mapping was not added, or another line is
        // missing. Leave it PENDING so it is retried after the next fix.
        stillQuarantined++;
        continue;
      }

      failures.push({ event_id: event.id, status: result.status, error: result.body });
      await supabase
        .from("pos_quarantined_events")
        .update({
          replay_status: "FAILED",
          replayed_at: new Date().toISOString(),
        })
        .eq("id", event.id);
    }

    const { count: remaining } = await supabase
      .from("pos_quarantined_events")
      .select("id", { count: "exact", head: true })
      .eq("quarantine_id", quarantineId)
      .eq("tenant_id", tenantId)
      .eq("replay_status", "PENDING");

    const resolvedNow = (remaining ?? 0) === 0 && stillQuarantined === 0 && failures.length === 0;

    if (resolvedNow) {
      await supabase
        .from("pos_identity_quarantine")
        .update({ status: "RESOLVED", last_seen_at: new Date().toISOString() })
        .eq("id", quarantineId)
        .eq("tenant_id", tenantId);
    }

    const status = failures.length > 0 ? (replayed > 0 ? 207 : 500) : 200;

    return json(status, {
      status: resolvedNow ? "resolved" : failures.length > 0 ? "partial_failure" : "still_quarantined",
      quarantine_id: quarantineId,
      replayed_count: replayed,
      still_quarantined_count: stillQuarantined,
      failed_count: failures.length,
      failures,
    });
  } catch (error) {
    console.error("[pos-replay] unhandled error:", error);
    return json(500, { error: "internal_error", detail: (error as Error).message });
  }
});
