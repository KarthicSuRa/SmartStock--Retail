// /supabase/functions/pos-ingestion-gateway/index.ts
// SmartStock LiveRetail V2 — Universal POS Ingestion Gateway (V1.1 Enterprise)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { POSConnectorRegistry } from "../_shared/pos/connector-registry.ts";
import { POSTransactionReducer } from "../_shared/pos/transaction-reducer.ts";
import { POSIdentityMapper } from "../_shared/pos/identity-mapper.ts";
import { POSUOMConverter } from "../_shared/pos/uom-converter.ts";
import { POSBOMDecomposer } from "../_shared/pos/bom-decomposer.ts";
import { POSNonStockResolver } from "../_shared/pos/non-stock-resolver.ts";
import { POSQuarantineManager } from "../_shared/pos/quarantine-manager.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-pos-config-id, x-webhook-signature, x-shopify-hmac-sha256, x-square-signature",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const posConfigId = req.headers.get("x-pos-config-id");

    let posConfig: any = null;
    if (posConfigId) {
      const { data } = await supabase
        .from("pos_configurations")
        .select("*")
        .eq("id", posConfigId)
        .eq("is_active", true)
        .maybeSingle();
      posConfig = data;
    }

    if (!posConfig) {
      posConfig = {
        id: "default-pos-config",
        tenant_id: "default-tenant",
        store_id: "1001",
        pos_type: "generic_webhook",
        activation_mode: "LIVE",
        config: {},
        is_active: true,
      };
    }

    const rawBody = await req.text();
    const connector = POSConnectorRegistry.getConnector(posConfig.pos_type);
    const webhookHandler = connector.getWebhookHandler?.();

    if (webhookHandler) {
      const isValidSig = await webhookHandler.verifySignature(
        rawBody,
        req.headers,
        posConfig.webhook_secret
      );
      if (!isValidSig) {
        return new Response(
          JSON.stringify({ error: "Invalid webhook signature" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
        );
      }
    }

    const rawEnvelope = webhookHandler
      ? await webhookHandler.parse(rawBody, req.headers)
      : {
          source_system: posConfig.pos_type,
          source_event_id: `EVT-${Date.now()}`,
          event_type: "SALE",
          payload: JSON.parse(rawBody),
          received_at: new Date().toISOString(),
        };

    const mapper = connector.getMapper();
    const canonicalTxn = await mapper.toCanonicalTransaction(rawEnvelope, {
      tenant_id: posConfig.tenant_id,
      store_id: posConfig.store_id,
      pos_config_id: posConfig.id,
    });

    // 1. Resolve Location ID
    canonicalTxn.store_id = await POSIdentityMapper.resolveLocation(
      supabase,
      canonicalTxn.tenant_id,
      canonicalTxn.source_system,
      canonicalTxn.store_id,
      posConfig.store_id
    );

    // 2. Classify Non-Stock lines & resolve product identities
    let hasUnresolvedProduct = false;
    let unresolvedExternalId = '';

    for (const line of canonicalTxn.lines) {
      // WS 4: Universal non-stock classification
      line.inventory_behavior = await POSNonStockResolver.classifyLine(
        supabase,
        canonicalTxn.tenant_id,
        canonicalTxn.source_system,
        line
      );

      if (line.inventory_behavior === 'NON_STOCK') {
        continue;
      }

      // WS 7: Resolve product identity
      const resolved = await POSIdentityMapper.resolveProduct(
        supabase,
        canonicalTxn.tenant_id,
        canonicalTxn.source_system,
        line.source_sku || line.sku || line.barcode || "UNKNOWN",
        line.barcode ? "BARCODE" : "SKU"
      );

      if (resolved.smartstock_sku === 'UNKNOWN_SKU' || resolved.id_type === 'UNKNOWN') {
        hasUnresolvedProduct = true;
        unresolvedExternalId = line.source_sku || line.sku || 'UNKNOWN';
      }

      line.sku = resolved.smartstock_sku;

      const uomRes = await POSUOMConverter.convert(
        supabase,
        canonicalTxn.tenant_id,
        line.sku,
        line.source_quantity,
        line.source_uom
      );
      line.base_quantity = uomRes.base_quantity;
      line.base_uom = uomRes.base_uom;
      line.uom_conversion_factor = uomRes.conversion_factor;
    }

    // 3. WS 7: Identity Quarantine if unresolved product found
    if (hasUnresolvedProduct) {
      const qId = await POSQuarantineManager.quarantineEvent(
        supabase,
        canonicalTxn.tenant_id,
        posConfig.id,
        'PRODUCT_MAPPING_REQUIRED',
        unresolvedExternalId,
        canonicalTxn.source_system,
        canonicalTxn
      );
      return new Response(
        JSON.stringify({
          status: "quarantined",
          reason: "PRODUCT_MAPPING_REQUIRED",
          quarantine_id: qId,
          transaction_id: canonicalTxn.source_transaction_id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 202 }
      );
    }

    // 4. WS 3: Decompose bundle / composite lines
    canonicalTxn.lines = await POSBOMDecomposer.decomposeLines(
      supabase,
      canonicalTxn.tenant_id,
      canonicalTxn.lines
    );

    // 5. Fetch prior persisted state from pos_transactions for state reduction & version check
    const { data: priorRecord } = await supabase
      .from("pos_transactions")
      .select("source_version, latest_source_timestamp, latest_payload_hash, state, current_inventory_effect")
      .eq("tenant_id", canonicalTxn.tenant_id)
      .eq("pos_config_id", posConfig.id)
      .eq("transaction_id", canonicalTxn.source_transaction_id)
      .maybeSingle();

    const priorState = priorRecord
      ? {
          source_transaction_id: canonicalTxn.source_transaction_id,
          source_version: priorRecord.source_version,
          latest_source_timestamp: priorRecord.latest_source_timestamp,
          latest_payload_hash: priorRecord.latest_payload_hash,
          status: priorRecord.state,
          current_inventory_effect: priorRecord.current_inventory_effect || {},
        }
      : null;

    // 6. Reduce transaction state to compute exact incremental deltas
    const reduction = POSTransactionReducer.reduce(priorState, canonicalTxn);

    // 7. WS 8: Shadow Mode check
    if (posConfig.activation_mode === 'SHADOW') {
      await supabase.from('pos_shadow_events').insert({
        tenant_id: canonicalTxn.tenant_id,
        pos_config_id: posConfig.id,
        source_transaction_id: canonicalTxn.source_transaction_id,
        computed_inventory_effect: reduction.newInventoryEffect,
        mapping_status: 'SUCCESS',
        payload: rawEnvelope.payload,
      });

      await supabase
        .from('pos_configurations')
        .update({
          shadow_transactions_processed: (posConfig.shadow_transactions_processed || 0) + 1,
        })
        .eq('id', posConfig.id);

      return new Response(
        JSON.stringify({
          status: "shadow_processed",
          mode: "SHADOW",
          transaction_id: canonicalTxn.source_transaction_id,
          simulated_inventory_effect: reduction.newInventoryEffect,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // 8. Update pos_transactions table with new version and inventory effect
    await supabase.from("pos_transactions").upsert({
      tenant_id: canonicalTxn.tenant_id,
      store_id: canonicalTxn.store_id,
      pos_config_id: posConfig.id,
      transaction_id: canonicalTxn.source_transaction_id,
      source_version: canonicalTxn.source_version || "v1",
      latest_source_timestamp: canonicalTxn.business_timestamp,
      latest_payload_hash: canonicalTxn.payload_hash || null,
      version_resolution: reduction.version_resolution,
      transaction_type: canonicalTxn.transaction_type,
      state: canonicalTxn.status,
      currency: canonicalTxn.currency,
      subtotal: canonicalTxn.subtotal || 0,
      tax_total: canonicalTxn.tax_total || 0,
      discount_total: canonicalTxn.discount_total || 0,
      grand_total: canonicalTxn.grand_total || 0,
      completed_at: canonicalTxn.business_timestamp,
      current_inventory_effect: reduction.newInventoryEffect,
      previous_inventory_effect: priorState?.current_inventory_effect || {},
      pos_raw_payload: rawEnvelope.payload,
    });

    // 9. Emit canonical events to ingestion gateway for each incremental delta
    const canonicalEvents = reduction.deltasToApply.map((delta, idx) => ({
      idempotency_key: `POS__${canonicalTxn.tenant_id}__${canonicalTxn.source_transaction_id}__${delta.sku}__${canonicalTxn.source_version || "v1"}__${idx}`,
      event_type: delta.event_type,
      tenant_id: canonicalTxn.tenant_id,
      location_id: canonicalTxn.store_id,
      source_system: canonicalTxn.source_system,
      source_event_id: `${canonicalTxn.source_transaction_id}_${delta.sku}_${idx}`,
      source_sequence: canonicalTxn.source_sequence || null,
      business_timestamp: canonicalTxn.business_timestamp,
      quantity_delta: delta.quantity_delta,
      unit_of_measure: delta.unit_of_measure,
      correlation_id: canonicalTxn.source_transaction_id,
      reference_type: "POS_TRANSACTION",
      reference_id: canonicalTxn.source_transaction_id,
      schema_version: "1.1",
      raw_payload: {
        transaction_id: canonicalTxn.source_transaction_id,
        sku: delta.sku,
        pos_config_id: posConfig.id,
      },
      metadata: {
        pos_type: posConfig.pos_type,
        source_version: canonicalTxn.source_version,
        target_bin: delta.target_bin || 'SELLABLE',
        grand_total: canonicalTxn.grand_total,
      },
    }));

    if (canonicalEvents.length > 0) {
      const gatewayUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ingestion-gateway`;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      await fetch(gatewayUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          "x-source-system": "POS",
          "x-tenant-id": canonicalTxn.tenant_id,
        },
        body: JSON.stringify(canonicalEvents),
      });
    }

    return new Response(
      JSON.stringify({
        status: "processed",
        version_resolution: reduction.version_resolution,
        transaction_id: canonicalTxn.source_transaction_id,
        canonical_events_emitted: canonicalEvents.length,
        inventory_effect: reduction.newInventoryEffect,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("[pos-ingestion-gateway] Error:", error);
    return new Response(
      JSON.stringify({ status: "error", message: (error as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
