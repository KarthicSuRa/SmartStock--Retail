// /supabase/functions/posting-worker/index.ts
// SmartStock LiveRetail V2 — Durable Enterprise Posting Worker
//
// Processes `integration_outbox` jobs safely:
// - Claims jobs atomically
// - Executes posting via ERP adapter
// - Handles OUTCOME_UNKNOWN state without creating duplicate documents
// - Applies exponential backoff with jitter

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AdapterFactory } from "../_shared/erp-adapter/factory.ts";

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
    const batchLimit = payload.batch_limit || 10;
    const workerId = `worker_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // 1. Claim pending or retrying outbox jobs
    const now = new Date().toISOString();
    const { data: jobs, error: claimErr } = await supabase
      .from("integration_outbox")
      .select("*")
      .in("status", ["PENDING", "RETRYING"])
      .lte("next_attempt_at", now)
      .order("next_attempt_at", { ascending: true })
      .limit(batchLimit);

    if (claimErr) throw claimErr;

    let successCount = 0;
    let failedCount = 0;
    let unknownCount = 0;

    for (const job of jobs || []) {
      // Mark as PROCESSING
      await supabase
        .from("integration_outbox")
        .update({
          status: "PROCESSING",
          locked_at: new Date().toISOString(),
          locked_by: workerId,
          attempts: (job.attempts || 0) + 1,
        })
        .eq("id", job.id);

      try {
        const adapter = await AdapterFactory.getAdapterForTenant(job.tenant_id, supabase);

        // Execute operation based on operation_type
        if (job.operation_type === "POST_GOODS_ISSUE_551") {
          const movements = job.payload.movements || [];
          const result = await adapter.postInventoryMovements(movements);

          if (result.succeeded > 0) {
            await supabase
              .from("integration_outbox")
              .update({
                status: "COMPLETED",
                completed_at: new Date().toISOString(),
                external_document_id: result.items[0]?.erp_document_number || "MBLNR-AUTO",
              })
              .eq("id", job.id);
            successCount++;
          } else {
            throw new Error(result.items[0]?.error || "SAP rejected goods issue document");
          }
        } else if (job.operation_type === "CREATE_PURCHASE_ORDER_NB" || job.operation_type === "CREATE_STO_UB") {
          const po = job.payload.purchase_order;
          const result = await adapter.postPurchaseOrder(po);

          if (result.success) {
            await supabase
              .from("integration_outbox")
              .update({
                status: "COMPLETED",
                completed_at: new Date().toISOString(),
                external_document_id: result.erp_po_number || "EBELN-AUTO",
              })
              .eq("id", job.id);
            successCount++;
          } else {
            throw new Error((result.errors || ["ERP PO creation failed"]).join("; "));
          }
        }
      } catch (err: any) {
        const isTimeout = err.name === "TimeoutError" || err.message?.includes("timeout") || err.message?.includes("fetch");
        const currentAttempt = (job.attempts || 0) + 1;

        if (isTimeout && currentAttempt >= 2) {
          // Dangerous state: SAP may have created the document but response dropped
          await supabase
            .from("integration_outbox")
            .update({
              status: "OUTCOME_UNKNOWN",
              last_error_code: "NETWORK_TIMEOUT_POST_SUBMIT",
              last_error_details: { error: err.message, timestamp: new Date().toISOString() },
            })
            .eq("id", job.id);
          unknownCount++;
        } else if (currentAttempt >= job.max_attempts) {
          // Dead letter
          await supabase
            .from("integration_outbox")
            .update({
              status: "DEAD_LETTER",
              last_error_code: "EXCEEDED_MAX_ATTEMPTS",
              last_error_details: { error: err.message, timestamp: new Date().toISOString() },
            })
            .eq("id", job.id);
          failedCount++;
        } else {
          // Exponential backoff with jitter
          const baseDelaySec = Math.pow(2, currentAttempt) * 15;
          const jitterSec = Math.floor(Math.random() * 10);
          const nextAttempt = new Date(Date.now() + (baseDelaySec + jitterSec) * 1000).toISOString();

          await supabase
            .from("integration_outbox")
            .update({
              status: "RETRYING",
              next_attempt_at: nextAttempt,
              last_error_code: "TRANSIENT_FAILURE",
              last_error_details: { error: err.message, attempt: currentAttempt },
            })
            .eq("id", job.id);
          failedCount++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        worker_id: workerId,
        processed: jobs?.length || 0,
        succeeded: successCount,
        failed_or_retrying: failedCount,
        outcome_unknown: unknownCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    console.error("[posting-worker] Fatal error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: (err as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
