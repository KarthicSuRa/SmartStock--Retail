// /supabase/functions/confidence-engine/index.ts
// SmartStock LiveRetail V2 — Rule-Based Inventory Confidence Engine (Phase 6)
//
// Answers: "How much should we trust this inventory quantity?"
// Evaluates explicit signals and writes back a 0-100 score + explanation JSON.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tenant-id",
};

export interface ConfidenceEvaluation {
  score: number;
  classification: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
}

export function evaluateConfidence(signals: {
  daysSincePhysicalCount?: number | null;
  hasUnexplainedSapVariance: boolean;
  hasPendingOfflineEvents: boolean;
  hasSequenceGap: boolean;
  hasRecentShrinkAnomaly: boolean;
}): ConfidenceEvaluation {
  let score = 100;
  const reasons: string[] = [];

  // 1. Age of physical count
  if (signals.daysSincePhysicalCount != null) {
    if (signals.daysSincePhysicalCount > 30) {
      score -= 20;
      reasons.push(`Physical count is over 30 days old (${signals.daysSincePhysicalCount} days)`);
    } else if (signals.daysSincePhysicalCount > 7) {
      score -= 10;
      reasons.push(`Physical count is ${signals.daysSincePhysicalCount} days old`);
    } else if (signals.daysSincePhysicalCount <= 3) {
      score = Math.min(100, score + 10);
      reasons.push(`Count recently verified (${signals.daysSincePhysicalCount} days ago)`);
    }
  } else {
    score -= 15;
    reasons.push("No physical cycle count on record");
  }

  // 2. Unexplained ERP variance
  if (signals.hasUnexplainedSapVariance) {
    score -= 25;
    reasons.push("Unexplained SAP baseline variance detected");
  }

  // 3. Pending offline mutations
  if (signals.hasPendingOfflineEvents) {
    score -= 10;
    reasons.push("Pending offline PWA events awaiting synchronization");
  }

  // 4. Sequence gaps
  if (signals.hasSequenceGap) {
    score -= 10;
    reasons.push("POS sequence gap detected in transaction feed");
  }

  // 5. Shrink anomaly
  if (signals.hasRecentShrinkAnomaly) {
    score -= 15;
    reasons.push("Unusual damage or shrink spike flagged by anomaly engine");
  }

  // Clamp 0-100
  score = Math.max(0, Math.min(100, score));

  let classification: "HIGH" | "MEDIUM" | "LOW" = "HIGH";
  if (score < 70) {
    classification = "LOW";
  } else if (score < 90) {
    classification = "MEDIUM";
  }

  if (reasons.length === 0) {
    reasons.push("All integrity checks healthy; zero discrepancies");
  }

  return { score, classification, reasons };
}

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
    const { tenant_id, location_id, material_id } = payload;

    const query = supabase
      .from("inventory_position")
      .select("tenant_id, location_id, material_id, sku, last_physical_count_at, reconciliation_status");

    if (tenant_id) query.eq("tenant_id", tenant_id);
    if (location_id) query.eq("location_id", location_id);
    if (material_id) query.eq("material_id", material_id);

    const { data: positions, error } = await query;
    if (error) throw error;

    let updatedCount = 0;

    for (const pos of positions || []) {
      const daysSinceCount = pos.last_physical_count_at
        ? Math.floor((Date.now() - new Date(pos.last_physical_count_at).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      const evalResult = evaluateConfidence({
        daysSincePhysicalCount: daysSinceCount,
        hasUnexplainedSapVariance: pos.reconciliation_status === "UNEXPLAINED_VARIANCE",
        hasPendingOfflineEvents: false,
        hasSequenceGap: false,
        hasRecentShrinkAnomaly: false,
      });

      await supabase
        .from("inventory_position")
        .update({
          confidence_score: evalResult.score,
          confidence_classification: evalResult.classification,
          confidence_explanation: {
            score: evalResult.score,
            classification: evalResult.classification,
            reasons: evalResult.reasons,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", pos.tenant_id)
        .eq("location_id", pos.location_id)
        .eq("material_id", pos.material_id);

      // If confidence drops to LOW, generate an operational case
      if (evalResult.classification === "LOW") {
        await supabase.from("operational_cases").insert({
          tenant_id: pos.tenant_id,
          case_type: "INVENTORY_UNCERTAINTY",
          severity: "MEDIUM",
          status: "OPEN",
          location_id: pos.location_id,
          material_id: pos.material_id,
          confidence: evalResult.score,
          detected_at: new Date().toISOString(),
          recommended_action: {
            action: "CYCLE_COUNT_REQUIRED",
            reasons: evalResult.reasons,
          },
        }).then(() => {});
      }

      updatedCount++;
    }

    return new Response(
      JSON.stringify({ status: "success", positions_evaluated: updatedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    console.error("[confidence-engine] Error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: (err as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
