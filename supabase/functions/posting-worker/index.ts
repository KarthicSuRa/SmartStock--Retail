// /supabase/functions/posting-worker/index.ts
// SmartStock LiveRetail V2 — Durable Enterprise Posting Worker
//
// Processes `integration_outbox` jobs safely:
// - Claims jobs optimistically so two workers cannot post the same job
// - Executes posting via the ERP adapter
// - Never invents a document number: if SAP did not return one, the job is not
//   marked COMPLETED
// - Distinguishes "SAP rejected this" (dead letter) from "we do not know
//   whether SAP committed" (OUTCOME_UNKNOWN, never auto-retried)
// - Applies exponential backoff with jitter

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AdapterFactory } from "../_shared/erp-adapter/factory.ts";
import { isOutcomeUnknown, isNonRetryable } from "../_shared/erp-adapter/errors.ts";
import { requireAuth, authFailureResponse } from "../_shared/security/require-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tenant-id",
};

const DEFAULT_MAX_ATTEMPTS = 8;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Scheduled invocation, but still authenticated: an open endpoint here lets
  // anyone drain the outbox into SAP.
  const auth = await requireAuth(req, { allowService: true });
  if (!auth.ok) return authFailureResponse(auth, corsHeaders);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const payload = await req.json().catch(() => ({}));
    const batchLimit = Number(payload.batch_limit ?? 10);
    const workerId = `worker_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

    // 1. Find candidate jobs. Claiming happens below, per job, so the read does
    //    not need to be atomic by itself.
    const now = new Date().toISOString();
    const { data: candidates, error: claimErr } = await supabase
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
    let deadLetterCount = 0;
    let skippedCount = 0;

    for (const job of candidates || []) {
      // 2. Optimistic claim: the update only applies while the row is still
      //    PENDING/RETRYING. If another worker won the race, zero rows come
      //    back and we must not post.
      const { data: claimed } = await supabase
        .from("integration_outbox")
        .update({
          status: "PROCESSING",
          locked_at: new Date().toISOString(),
          locked_by: workerId,
          attempts: (job.attempts || 0) + 1,
        })
        .eq("id", job.id)
        .in("status", ["PENDING", "RETRYING"])
        .select("id");

      if (!claimed || claimed.length === 0) {
        skippedCount++;
        continue;
      }

      const currentAttempt = (job.attempts || 0) + 1;
      const maxAttempts = Number(job.max_attempts ?? DEFAULT_MAX_ATTEMPTS);

      try {
        const adapter = await AdapterFactory.getAdapterForTenant(job.tenant_id, supabase);
        const simulated = adapter.simulated;

        if (job.operation_type === "POST_GOODS_ISSUE_551") {
          const movements = job.payload?.movements || [];
          if (movements.length === 0) {
            throw new Error(`Outbox job ${job.id} has no movements to post.`);
          }

          const result = await adapter.postInventoryMovements(movements);

          if (result.succeeded === result.total && result.succeeded > 0) {
            const documentNumbers = result.items
              .map((i) => i.erp_document_number)
              .filter((n): n is string => Boolean(n));

            // A "success" without a document number is not a completion: it is
            // an unverified claim. Refuse to record it.
            if (documentNumbers.length !== result.total) {
              throw new Error(
                `SAP reported success for ${result.total} movement(s) but returned ${documentNumbers.length} document number(s).`,
              );
            }

            await supabase
              .from("integration_outbox")
              .update({
                status: "COMPLETED",
                completed_at: new Date().toISOString(),
                // A mock adapter creates no ERP document, so there is no ERP
                // document number to record. Storing a synthetic one in this
                // column would be indistinguishable from a real posting later.
                external_document_id: simulated ? null : documentNumbers.join(","),
                last_error_details: simulated
                  ? {
                      simulated: true,
                      note: "Mock adapter: no ERP document was created.",
                      mock_reference: documentNumbers.join(","),
                    }
                  : null,
              })
              .eq("id", job.id);
            successCount++;
          } else {
            const failures = result.items
              .filter((i) => i.status !== "success")
              .map((i) => i.error)
              .filter(Boolean);
            throw new Error(
              failures.length > 0
                ? failures.join("; ")
                : `SAP accepted ${result.succeeded}/${result.total} movement(s).`,
            );
          }
        } else if (job.operation_type === "CREATE_PURCHASE_ORDER_NB" || job.operation_type === "CREATE_STO_UB") {
          const po = job.payload?.purchase_order;
          if (!po) throw new Error(`Outbox job ${job.id} has no purchase_order payload.`);

          // STOs must not be silently downgraded to a normal PO; the adapter
          // rejects them explicitly and that message is surfaced here.
          const result = await adapter.postPurchaseOrder(po);

          if (result.success && result.erp_po_number) {
            await supabase
              .from("integration_outbox")
              .update({
                status: "COMPLETED",
                completed_at: new Date().toISOString(),
                external_document_id: simulated ? null : result.erp_po_number,
                last_error_details: simulated
                  ? {
                      simulated: true,
                      note: "Mock adapter: no ERP document was created.",
                      mock_reference: result.erp_po_number,
                    }
                  : null,
              })
              .eq("id", job.id);
            successCount++;
          } else if (result.success) {
            throw new Error("ERP reported PO success but returned no purchase order number.");
          } else {
            throw new Error((result.errors || ["ERP PO creation failed"]).join("; "));
          }
        } else {
          throw new Error(`Unsupported operation_type '${job.operation_type}' for outbox job ${job.id}.`);
        }
      } catch (err: any) {
        // ---- "We do not know whether SAP committed" -----------------------
        if (isOutcomeUnknown(err)) {
          await supabase
            .from("integration_outbox")
            .update({
              status: "OUTCOME_UNKNOWN",
              last_error_code: "OUTCOME_UNKNOWN",
              last_error_details: {
                error: err.message,
                attempt: currentAttempt,
                note: "Not retried automatically: a duplicate post would create a second document.",
                timestamp: new Date().toISOString(),
              },
            })
            .eq("id", job.id);
          unknownCount++;
          continue;
        }

        // ---- "SAP rejected this / configuration is wrong" -----------------
        if (isNonRetryable(err) || currentAttempt >= maxAttempts) {
          await supabase
            .from("integration_outbox")
            .update({
              status: "DEAD_LETTER",
              last_error_code: isNonRetryable(err) ? "NON_RETRYABLE" : "EXCEEDED_MAX_ATTEMPTS",
              last_error_details: { error: err.message, attempt: currentAttempt },
            })
            .eq("id", job.id);
          deadLetterCount++;
          continue;
        }

        // ---- Transient failure: back off --------------------------------
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

    return new Response(
      JSON.stringify({
        status: "success",
        worker_id: workerId,
        considered: candidates?.length || 0,
        skipped_already_claimed: skippedCount,
        succeeded: successCount,
        retrying: failedCount,
        dead_lettered: deadLetterCount,
        outcome_unknown: unknownCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    console.error("[posting-worker] Fatal error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: (err as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
