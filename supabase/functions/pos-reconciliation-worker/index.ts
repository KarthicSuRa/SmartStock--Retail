// /supabase/functions/pos-reconciliation-worker/index.ts
// SmartStock LiveRetail V2 — Transaction-Level Reconciliation Worker (V1.1)
//
// Scope: compare what the provider reports with what we have stored, and record
// the difference. It does not attempt a synthetic re-post: the ingestion
// endpoint verifies provider signatures, and this worker cannot produce one.
// Local repair happens when the provider redelivers the transaction (or through
// pos-replay-quarantine for transactions that were quarantined with a payload).
//
// Polling itself is only implemented for the generic transport; a provider
// without a polling implementation fails the run for that configuration rather
// than reporting it healthy.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GenericPollingTransport } from "../_shared/pos/connectors/generic/polling-transport.ts";
import { authFailureResponse, requireAuth } from "../_shared/security/require-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-tenant-id",
};

export type ReconciliationOutcome =
  | "MATCHED"
  | "MISSING_LOCALLY"
  | "STALE_LOCALLY"
  | "CONFLICT"
  | "SOURCE_DELETED";

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
  if (req.method !== "POST" && req.method !== "GET") {
    return json(405, { error: "method_not_allowed" });
  }

  // Cron / scheduler callers use the service role; an operator may trigger a
  // run from the UI with their own JWT.
  const auth = await requireAuth(req, { allowService: true, defaultTenantId: "" });
  if (!auth.ok) {
    return authFailureResponse(auth, corsHeaders);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    let configQuery = supabase
      .from("pos_configurations")
      .select("*")
      .eq("is_active", true);

    // A user-triggered run is limited to that user's tenant; a service run
    // reconciles every active configuration.
    if (auth.ctx.kind === "user") {
      configQuery = configQuery.eq("tenant_id", auth.ctx.tenantId);
    }

    const { data: configs, error: configError } = await configQuery;
    if (configError) {
      console.error("[pos-reconciliation] configuration read failed:", configError.message);
      return json(503, { error: "configuration_unavailable" });
    }

    const results = [];

    for (const config of configs ?? []) {
      const runId = crypto.randomUUID();

      await supabase.from("pos_reconciliation_runs").insert({
        id: runId,
        tenant_id: config.tenant_id,
        pos_config_id: config.id,
        status: "RUNNING",
      });

      // 1. Fetch cursor
      const { data: cursorRecord } = await supabase
        .from("pos_connector_cursors")
        .select("*")
        .eq("tenant_id", config.tenant_id)
        .eq("pos_config_id", config.id)
        .maybeSingle();

      const cursor = cursorRecord
        ? {
            last_fetched_at: cursorRecord.last_fetched_at,
            last_page_token: cursorRecord.last_page_token,
            last_sequence: cursorRecord.last_sequence
              ? Number(cursorRecord.last_sequence)
              : undefined,
          }
        : {
            last_fetched_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
          };

      // 2. Poll
      const polling = new GenericPollingTransport();
      let pollRes;

      try {
        pollRes = await polling.fetchUpdates(cursor, {
          tenant_id: config.tenant_id,
          store_id: config.store_id,
          config: config.config || {},
        });
      } catch (pollError) {
        const message = (pollError as Error).message;
        await supabase
          .from("pos_reconciliation_runs")
          .update({
            status: "FAILED",
            error_message: message,
            run_completed_at: new Date().toISOString(),
          })
          .eq("id", runId);

        // Do not leave the feed looking healthy when polling never ran.
        await supabase.from("pos_feed_health").upsert({
          tenant_id: config.tenant_id,
          pos_config_id: config.id,
          health_status: "DEGRADED",
          last_reconciled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        results.push({ config_id: config.id, status: "FAILED", error: message });
        continue;
      }

      const { transactions, nextCursor } = pollRes;

      // 3. Classify
      let missingCount = 0;
      let staleCount = 0;
      let matchedCount = 0;
      const drifted: string[] = [];

      for (const remoteTxn of transactions) {
        const { data: localTxn } = await supabase
          .from("pos_transactions")
          .select("source_version, latest_source_timestamp, state")
          .eq("tenant_id", config.tenant_id)
          .eq("pos_config_id", config.id)
          .eq("transaction_id", remoteTxn.source_transaction_id)
          .maybeSingle();

        let outcome: ReconciliationOutcome = "MATCHED";

        if (!localTxn) {
          outcome = "MISSING_LOCALLY";
          missingCount++;
          drifted.push(remoteTxn.source_transaction_id);
        } else if (
          remoteTxn.source_version &&
          localTxn.source_version &&
          remoteTxn.source_version !== localTxn.source_version
        ) {
          outcome = "STALE_LOCALLY";
          staleCount++;
          drifted.push(remoteTxn.source_transaction_id);
        } else {
          matchedCount++;
        }

        void outcome;
      }

      // 4. Cursor + audit
      await supabase.from("pos_connector_cursors").upsert({
        tenant_id: config.tenant_id,
        pos_config_id: config.id,
        last_fetched_at: nextCursor.last_fetched_at,
        last_sequence: nextCursor.last_sequence,
        updated_at: new Date().toISOString(),
      });

      await supabase
        .from("pos_reconciliation_runs")
        .update({
          status: "SUCCESS",
          transactions_scanned: transactions.length,
          // Named "found"/"emitted" because nothing is repaired here. Repair
          // requires the provider to redeliver the transaction.
          missing_transactions_found: missingCount,
          corrections_emitted: 0,
          error_message: drifted.length > 0
            ? `Awaiting provider redelivery for ${drifted.length} transaction(s): ` +
              drifted.slice(0, 20).join(", ")
            : null,
          run_completed_at: new Date().toISOString(),
        })
        .eq("id", runId);

      // 5. Feed health
      await supabase.from("pos_feed_health").upsert({
        tenant_id: config.tenant_id,
        pos_config_id: config.id,
        health_status: drifted.length > 0 ? "DEGRADED" : "HEALTHY",
        last_reconciled_at: new Date().toISOString(),
        sequence_gap_count: drifted.length,
        updated_at: new Date().toISOString(),
      });

      results.push({
        config_id: config.id,
        status: drifted.length > 0 ? "DRIFT_DETECTED" : "OK",
        scanned: transactions.length,
        matched: matchedCount,
        missing_found: missingCount,
        stale_found: staleCount,
      });
    }

    return json(200, { status: "success", reconciled: results });
  } catch (error) {
    console.error("[pos-reconciliation] unhandled error:", error);
    return json(500, { status: "error", message: (error as Error).message });
  }
});
