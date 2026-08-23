// /supabase/functions/pos-reconciliation-worker/index.ts
// SmartStock LiveRetail V2 — Push + Pull Transaction-Level Reconciliation Worker (V1.1)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GenericPollingTransport } from "../_shared/pos/connectors/generic/polling-transport.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export type ReconciliationOutcome =
  | "MATCHED"
  | "MISSING_LOCALLY"
  | "STALE_LOCALLY"
  | "CONFLICT"
  | "SOURCE_DELETED";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { data: configs } = await supabase
      .from("pos_configurations")
      .select("*")
      .eq("is_active", true);

    const results = [];

    for (const config of configs || []) {
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
            last_sequence: cursorRecord.last_sequence ? Number(cursorRecord.last_sequence) : undefined,
          }
        : {
            last_fetched_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
          };

      // 2. Execute Polling Transport
      const polling = new GenericPollingTransport();
      let pollRes;

      try {
        pollRes = await polling.fetchUpdates(cursor, {
          tenant_id: config.tenant_id,
          store_id: config.store_id,
          config: config.config || {},
        });
      } catch (pollErr) {
        await supabase
          .from("pos_reconciliation_runs")
          .update({
            status: "FAILED",
            error_message: (pollErr as Error).message,
            run_completed_at: new Date().toISOString(),
          })
          .eq("id", runId);
        continue;
      }

      const { transactions, nextCursor } = pollRes;

      // 3. Scan existing transactions to classify outcomes
      let missingCount = 0;
      let staleCount = 0;
      let matchedCount = 0;

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
        } else if (
          remoteTxn.source_version &&
          localTxn.source_version &&
          remoteTxn.source_version !== localTxn.source_version
        ) {
          outcome = "STALE_LOCALLY";
          staleCount++;
        } else {
          outcome = "MATCHED";
          matchedCount++;
        }

        if (outcome === "MISSING_LOCALLY" || outcome === "STALE_LOCALLY") {
          // Reprocess to reconcile local state
          const gatewayUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pos-ingestion-gateway`;
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

          await fetch(gatewayUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
              "x-pos-config-id": config.id,
            },
            body: JSON.stringify({
              transaction_id: remoteTxn.source_transaction_id,
              version: remoteTxn.source_version,
              items: remoteTxn.lines.map((l) => ({
                sku: l.sku,
                quantity: l.quantity,
                uom: l.source_uom,
              })),
              timestamp: remoteTxn.business_timestamp,
            }),
          });
        }
      }

      // 4. Update Cursor & Audit Log
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
          missing_transactions_found: missingCount,
          corrections_emitted: staleCount,
          run_completed_at: new Date().toISOString(),
        })
        .eq("id", runId);

      // 5. Update Feed Health
      await supabase.from("pos_feed_health").upsert({
        tenant_id: config.tenant_id,
        pos_config_id: config.id,
        health_status: "HEALTHY",
        last_reconciled_at: new Date().toISOString(),
        gaps_repaired_today: missingCount + staleCount,
        updated_at: new Date().toISOString(),
      });

      results.push({
        config_id: config.id,
        scanned: transactions.length,
        matched: matchedCount,
        missing_repaired: missingCount,
        stale_repaired: staleCount,
      });
    }

    return new Response(JSON.stringify({ status: "success", reconciled: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ status: "error", message: (error as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
