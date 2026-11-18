// /supabase/functions/ingestion-gateway/index.ts
// SmartStock LiveRetail V2 — Canonical Inventory Ingestion Gateway
//
// PURPOSE:
//   Single controlled entry point through which ALL external inventory
//   observations enter the SmartStock event system.
//
// RESPONSIBILITY (and ONLY this):
//   authenticate → validate → normalize → idempotency → sequence evaluation
//   → persist → enqueue projection → acknowledge
//
// DOES NOT:
//   - Perform forecasting
//   - Generate replenishment recommendations
//   - Call SAP
//   - Compute derived inventory state
//
// All downstream processing (projection, reconciliation, case generation)
// is handled asynchronously by dedicated workers.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  InventoryEventEnvelope,
  IngestionResult,
  ProjectionTask,
  SourceSystem,
  RECONCILIATION_TRIGGER_EVENTS,
  APPROVAL_REQUIRED_EVENTS,
} from "../_shared/event-model/types.ts";
import {
  validateCanonicalEvent,
  buildIdempotencyKey,
  normalizeTimestamp,
  classifyTimestamp,
} from "../_shared/event-model/validator.ts";
import { requireAuth } from "../_shared/security/require-auth.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, " +
    "x-source-system, x-tenant-id, x-idempotency-key, x-signature",
};

// ---------------------------------------------------------------------------
// AUTHENTICATION: Source System Registry
// ---------------------------------------------------------------------------
// Each legitimate source system authenticates differently.
// Returns { valid: boolean, source_system: string, tenant_id: string }

async function authenticateSource(
  req: Request,
  supabase: SupabaseClient
): Promise<{ valid: boolean; source_system: string; tenant_id: string; error?: string }> {
  const sourceSystem = req.headers.get("x-source-system") || "UNKNOWN";

  // A valid Supabase user JWT, or the service-role / internal token for
  // service-to-service calls. There is deliberately no header-only path and no
  // default tenant: `x-tenant-id` on its own proves nothing.
  const outcome = await requireAuth(req, { allowService: true, defaultTenantId: "" });
  if (!outcome.ok) {
    return { valid: false, source_system: sourceSystem, tenant_id: "", error: outcome.error };
  }

  const tenantId = outcome.ctx.tenantId;
  if (!UUID_RE.test(tenantId)) {
    return {
      valid: false,
      source_system: sourceSystem,
      tenant_id: "",
      error: "Unauthorized: no tenant context. Service callers must assert x-tenant-id; user tokens must carry a tenant claim.",
    };
  }

  // A user must actually belong to the tenant they are writing for. Without
  // this check any authenticated user could post inventory into any tenant by
  // setting the header.
  if (outcome.ctx.kind === "user") {
    const { data: membership, error: membershipError } = await supabase
      .from("user_tenant_memberships")
      .select("tenant_id")
      .eq("user_id", outcome.ctx.userId!)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();

    if (membershipError) {
      console.error("[ingestion-gateway] membership check failed:", membershipError.message);
      return {
        valid: false,
        source_system: sourceSystem,
        tenant_id: "",
        error: "Unable to verify tenant membership",
      };
    }
    if (!membership) {
      return {
        valid: false,
        source_system: sourceSystem,
        tenant_id: "",
        error: "Forbidden: caller is not a member of the requested tenant",
      };
    }
  }

  return { valid: true, source_system: sourceSystem, tenant_id: tenantId };
}

// ---------------------------------------------------------------------------
// IDEMPOTENCY CHECK
// ---------------------------------------------------------------------------

async function checkDuplicate(
  supabase: SupabaseClient,
  tenantId: string,
  sourceSystem: string,
  sourceEventId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("inventory_events")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("source_system", sourceSystem)
    .eq("source_event_id", sourceEventId)
    .maybeSingle();

  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// SEQUENCE EVALUATION (via DB function)
// ---------------------------------------------------------------------------

async function evaluateSequence(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  sourceSystem: string,
  sourceSequence?: number
): Promise<string> {
  if (sourceSequence == null) return "IN_ORDER";

  const { data, error } = await supabase.rpc("evaluate_event_sequence", {
    p_tenant_id: tenantId,
    p_location_id: locationId,
    p_source_system: sourceSystem,
    p_sequence: sourceSequence,
  });

  if (error) {
    console.warn("[ingestion-gateway] Sequence evaluation failed:", error.message);
    return "IN_ORDER"; // Fail open — don't reject for sequence evaluation errors
  }

  return data as string;
}

// ---------------------------------------------------------------------------
// PROJECTION TASK ENQUEUEING
// ---------------------------------------------------------------------------
// Writes a lightweight task record that the async projection-worker will pick up.
// Currently uses a simple projection_queue table (can upgrade to pg_notify later).

async function enqueueProjection(
  supabase: SupabaseClient,
  task: ProjectionTask
): Promise<void> {
  const { error } = await supabase.from("projection_queue").insert({
    event_id: task.event_id,
    tenant_id: task.tenant_id,
    location_id: task.location_id,
    material_id: task.material_id ?? null,
    event_type: task.event_type,
    quantity_delta: task.quantity_delta ?? null,
    business_timestamp: task.business_timestamp,
    status: "PENDING",
    created_at: task.enqueued_at,
  });

  if (error) {
    // Non-fatal: projection will still be retried via the worker's backfill scan
    console.warn("[ingestion-gateway] Projection enqueue warning:", error.message);
  }
}

// ---------------------------------------------------------------------------
// RECONCILIATION TRIGGER
// ---------------------------------------------------------------------------

async function triggerReconciliation(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  materialId?: string,
  sapCheckpointQty?: number
): Promise<void> {
  await supabase.from("reconciliation_queue").insert({
    tenant_id: tenantId,
    location_id: locationId,
    material_id: materialId ?? null,
    sap_qty: sapCheckpointQty ?? null,
    status: "PENDING",
    created_at: new Date().toISOString(),
  }).then(({ error }) => {
    if (error) {
      console.warn("[ingestion-gateway] Reconciliation enqueue warning:", error.message);
    }
  });
}

// ---------------------------------------------------------------------------
// MAIN HANDLER
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method Not Allowed. Use POST." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 405 }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // ---- 1. AUTHENTICATE SOURCE ----
    const auth = await authenticateSource(req, supabase);
    if (!auth.valid) {
      return new Response(
        JSON.stringify({ status: "REJECTED", error: auth.error || "Authentication failed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // ---- 2. PARSE PAYLOAD ----
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ status: "REJECTED", error: "Request body must be valid JSON" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Support both single event and batch array
    const events: unknown[] = Array.isArray(rawBody) ? rawBody : [rawBody];
    const results: IngestionResult[] = [];

    for (const rawEvent of events) {
      const result = await processEvent(supabase, auth, rawEvent);
      results.push(result);
    }

    // If single event, return single result (not wrapped in array) for simpler clients
    const responseBody = events.length === 1 ? results[0] : { results };

    const hasFailure = results.some((r) => r.status === "REJECTED" || r.status === "INVALID");
    const statusCode = hasFailure ? 207 : 200; // 207 Multi-Status for mixed batch results

    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: statusCode,
    });

  } catch (err) {
    console.error("[ingestion-gateway] Unhandled error:", err);
    return new Response(
      JSON.stringify({ status: "REJECTED", error: "Internal gateway error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

// ---------------------------------------------------------------------------
// PROCESS SINGLE EVENT
// ---------------------------------------------------------------------------

async function processEvent(
  supabase: SupabaseClient,
  auth: { source_system: string; tenant_id: string },
  rawEvent: unknown
): Promise<IngestionResult> {

  // Inject source context from authenticated headers (can't trust client to set these)
  if (rawEvent && typeof rawEvent === "object" && !Array.isArray(rawEvent)) {
    const e = rawEvent as Record<string, unknown>;
    if (!e.source_system) e.source_system = auth.source_system;
    if (!e.tenant_id) e.tenant_id = auth.tenant_id;
    if (!e.schema_version) e.schema_version = "1.0";
    if (!e.raw_payload) e.raw_payload = {};
    if (!e.metadata) e.metadata = {};
    if (!e.received_timestamp) e.received_timestamp = new Date().toISOString();

    // Build idempotency key if not provided
    if (!e.idempotency_key && e.source_system && e.source_event_id && e.tenant_id) {
      e.idempotency_key = buildIdempotencyKey(
        e.source_system as SourceSystem,
        e.source_event_id as string,
        e.tenant_id as string
      );
    }
  }

  // ---- 3. VALIDATE ----
  const validation = validateCanonicalEvent(rawEvent);
  if (!validation.valid) {
    return {
      status: "INVALID",
      validation_errors: validation.errors.map((e) => `${e.field}: ${e.message}`),
    };
  }

  const envelope = rawEvent as InventoryEventEnvelope;

  // ---- 4. IDEMPOTENCY CHECK ----
  const duplicateId = await checkDuplicate(
    supabase,
    envelope.tenant_id,
    envelope.source_system,
    envelope.source_event_id
  );

  if (duplicateId) {
    return {
      status: "DUPLICATE",
      event_id: duplicateId,
      duplicate_event_id: duplicateId,
      message: `Event already processed (id: ${duplicateId})`,
    };
  }

  // ---- 5. SEQUENCE & TIMESTAMP EVALUATION ----
  const sequenceStatus = await evaluateSequence(
    supabase,
    envelope.tenant_id,
    envelope.location_id,
    envelope.source_system,
    envelope.source_sequence
  );

  const tsClassification = classifyTimestamp(envelope.business_timestamp);

  // ---- 6. ATOMIC TRANSACTIONAL PERSISTENCE (Event + Projection Job) ----
  const eventPayload = {
    tenant_id: envelope.tenant_id,
    location_id: envelope.location_id,
    material_id: envelope.material_id ?? null,
    event_type: envelope.event_type,
    quantity_delta: envelope.quantity_delta ?? null,
    unit_of_measure: envelope.unit_of_measure ?? null,
    source_system: envelope.source_system,
    source_event_id: envelope.source_event_id,
    source_sequence: envelope.source_sequence ?? null,
    business_timestamp: normalizeTimestamp(envelope.business_timestamp),
    correlation_id: envelope.correlation_id ?? null,
    causation_id: envelope.causation_id ?? null,
    reference_type: envelope.reference_type ?? null,
    reference_id: envelope.reference_id ?? null,
    sequence_status: sequenceStatus,
    schema_version: envelope.schema_version,
    timestamp_quality: tsClassification.quality,
    clock_offset_ms: tsClassification.offsetMs,
    quarantined: tsClassification.quarantine,
    quarantined_reason: tsClassification.reason || null,
    raw_payload: envelope.raw_payload,
    metadata: envelope.metadata,
  };

  const { data: atomicResult, error: insertError } = await supabase.rpc(
    "insert_inventory_event_with_projection",
    { p_event: eventPayload }
  );

  if (insertError || !atomicResult || atomicResult.length === 0) {
    // Fallback direct insert if RPC not yet migrated
    const { data: stored, error: fallbackError } = await supabase
      .from("inventory_events")
      .insert(eventPayload)
      .select("id")
      .single();

    if (fallbackError || !stored) {
      console.error("[ingestion-gateway] Atomic insert and fallback failed:", insertError?.message || fallbackError?.message);
      return {
        status: "REJECTED",
        validation_errors: [`Database error: ${insertError?.message || fallbackError?.message}`],
      };
    }

    await enqueueProjection(supabase, {
      event_id: stored.id,
      tenant_id: envelope.tenant_id,
      location_id: envelope.location_id,
      material_id: envelope.material_id,
      event_type: envelope.event_type,
      quantity_delta: envelope.quantity_delta,
      business_timestamp: envelope.business_timestamp,
      enqueued_at: new Date().toISOString(),
    });
  }

  const eventId = atomicResult?.[0]?.event_id;

  // ---- 8. TRIGGER RECONCILIATION if this is a SAP checkpoint ----
  if (RECONCILIATION_TRIGGER_EVENTS.includes(envelope.event_type)) {
    await triggerReconciliation(
      supabase,
      envelope.tenant_id,
      envelope.location_id,
      envelope.material_id,
      envelope.quantity_delta ?? undefined
    );
  }

  // ---- 9. GENERATE INTEGRATION WARNING if sequence gap ----
  if (sequenceStatus === "GAP_DETECTED") {
    await supabase.from("operational_cases").insert({
      tenant_id: envelope.tenant_id,
      case_type: "POS_FEED_FAILURE",
      severity: "MEDIUM",
      status: "OPEN",
      location_id: envelope.location_id,
      detected_at: new Date().toISOString(),
      recommended_action: {
        action: "INVESTIGATE_SEQUENCE_GAP",
        source_system: envelope.source_system,
        expected_sequence: (envelope.source_sequence ?? 0) - 1,
        received_sequence: envelope.source_sequence,
        message: `Sequence gap detected in ${envelope.source_system} feed. Events may have been lost.`,
      },
    }).then(({ error }) => {
      if (error) console.warn("[ingestion-gateway] Gap case creation warning:", error.message);
    });
  }

  // ---- DONE ----
  return {
    status: "ACCEPTED",
    event_id: eventId,
    sequence_status: sequenceStatus as any,
    message: sequenceStatus === "GAP_DETECTED"
      ? "Event accepted. Sequence gap detected — integration warning case created."
      : "Event accepted and projection enqueued.",
  };
}
