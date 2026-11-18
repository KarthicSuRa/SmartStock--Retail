// /supabase/functions/_shared/pos/ingest.ts
// SmartStock LiveRetail V2 — Single POS Ingestion Pipeline
//
// Both public entry points (`pos-webhook` and `pos-ingestion-gateway`) delegate
// here so there is exactly one verification path, one payload parser and one
// inventory-writing path.
//
// Two layers:
//
//   handlePosIngestion  transport: resolve config → verify signature → parse
//                       provider payload → map to canonical
//   processCanonical    core: resolve identities → reduce state → write ledger
//                       → advance checkpoint
//
// Quarantine replay calls `processCanonical` directly. That is deliberate: the
// stored payload cannot carry a valid provider signature, so replay must not
// go through the HTTP signature check. It is only reachable from an
// authenticated worker, never from the public webhook URL.
//
// Ordering rule: inventory events are written to the ledger *before* the
// transaction state is advanced. If the ledger write fails we return 5xx and
// leave `pos_transactions` untouched, so the provider's retry recomputes the
// same deltas. The reverse order would advance the checkpoint and then lose
// the movement on retry.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { POSConnectorRegistry } from './connector-registry.ts';
import { POSTransactionReducer } from './transaction-reducer.ts';
import { POSIdentityMapper } from './identity-mapper.ts';
import { POSUOMConverter } from './uom-converter.ts';
import { POSBOMDecomposer } from './bom-decomposer.ts';
import { POSNonStockResolver } from './non-stock-resolver.ts';
import { POSQuarantineManager } from './quarantine-manager.ts';
import { CanonicalPOSTransaction } from './canonical-schema.ts';
import {
  POSConfigRow,
  POSPayloadError,
  parseProviderPayload,
  providerFor,
  verifyProviderWebhook,
} from './provider-webhooks.ts';

export const POS_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-pos-config-id, ' +
    'x-webhook-signature, x-shopify-hmac-sha256, x-shopify-topic, ' +
    'x-shopify-shop-domain, x-square-hmacsha256-signature, x-signature, ' +
    'x-clover-auth',
};

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type POSConfigRecord = POSConfigRow & {
  activation_mode?: string | null;
  shadow_transactions_processed?: number | null;
};

export interface ProcessResult {
  status: number;
  body: Record<string, unknown>;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...POS_CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The configuration id is the tenant capability token. Providers that cannot
 * set custom headers (Shopify, Square, Lightspeed) pass it as `?config=<uuid>`.
 */
function resolveConfigId(req: Request): string | null {
  const header = req.headers.get('x-pos-config-id')?.trim();
  if (header) return header;

  const fromQuery = new URL(req.url).searchParams.get('config')?.trim();
  return fromQuery || null;
}

export async function loadPosConfig(
  supabase: SupabaseClient,
  configId: string,
): Promise<{ config?: POSConfigRecord; error?: string; status: number }> {
  const { data, error } = await supabase
    .from('pos_configurations')
    .select(
      'id, tenant_id, store_id, pos_type, pos_name, webhook_secret, api_key, api_secret, ' +
        'is_active, activation_mode, config, shadow_transactions_processed',
    )
    .eq('id', configId)
    .maybeSingle();

  if (error) {
    console.error('[pos-ingest] configuration lookup failed:', error.message);
    return { status: 503, error: 'configuration_unavailable' };
  }
  if (!data) {
    return { status: 404, error: 'unknown_pos_config' };
  }

  const config = data as unknown as POSConfigRecord;
  if (config.is_active === false) {
    return { status: 409, error: 'pos_config_inactive' };
  }

  return { status: 200, config };
}

// ===========================================================================
// Transport layer
// ===========================================================================

export async function handlePosIngestion(
  req: Request,
  supabase: SupabaseClient,
): Promise<Response> {
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const configId = resolveConfigId(req);
  if (!configId) {
    return json(400, {
      error: 'missing_pos_config',
      detail: 'Pass the POS configuration id in ?config=<uuid> or the x-pos-config-id header.',
    });
  }
  if (!UUID_RE.test(configId)) {
    return json(400, { error: 'invalid_pos_config_id', detail: 'Expected a UUID.' });
  }

  const loaded = await loadPosConfig(supabase, configId);
  if (!loaded.config) {
    return json(loaded.status, { error: loaded.error });
  }
  const config = loaded.config;

  const provider = providerFor(config.pos_type);
  if (provider === 'unsupported') {
    return json(501, {
      error: 'unsupported_pos_type',
      detail: `POS type "${config.pos_type}" has no webhook implementation.`,
    });
  }

  const rawBody = await req.text();

  const signature = await verifyProviderWebhook(provider, rawBody, req.headers, config);
  if (!signature.ok) {
    console.warn(`[pos-ingest] rejected unverified ${provider} delivery: ${signature.reason}`);
    return json(401, { error: 'invalid_signature', reason: signature.reason });
  }

  let envelope;
  try {
    envelope = await parseProviderPayload(provider, rawBody, req.headers, config);
  } catch (error) {
    if (error instanceof POSPayloadError) {
      const status = error.kind === 'upstream' ? 503 : error.kind === 'misconfigured' ? 501 : 400;
      console.warn(`[pos-ingest] ${provider} payload rejected: ${error.message}`);
      return json(status, { error: 'payload_rejected', detail: error.message });
    }
    throw error;
  }

  const connector = POSConnectorRegistry.getConnector(config.pos_type);
  const mapper = connector.getMapper();

  let canonical: CanonicalPOSTransaction;
  try {
    canonical = await mapper.toCanonicalTransaction(envelope, {
      tenant_id: config.tenant_id,
      store_id: config.store_id,
      pos_config_id: config.id,
      currency: typeof config.config?.currency === 'string' ? config.config.currency : undefined,
      config: config.config ?? undefined,
    });
  } catch (error) {
    console.warn(`[pos-ingest] ${provider} mapping failed: ${(error as Error).message}`);
    return json(422, { error: 'mapping_failed', detail: (error as Error).message });
  }

  const result = await processCanonical(supabase, config, canonical, {
    payloadHash: await sha256Hex(rawBody),
    rawPayload: envelope.payload,
  });

  return json(result.status, result.body);
}

// ===========================================================================
// Core pipeline
// ===========================================================================

export async function processCanonical(
  supabase: SupabaseClient,
  config: POSConfigRecord,
  input: CanonicalPOSTransaction,
  options: { payloadHash: string; rawPayload: Record<string, unknown> },
): Promise<ProcessResult> {
  const canonical: CanonicalPOSTransaction = {
    ...input,
    lines: input.lines.map((line) => ({ ...line })),
    payload_hash: options.payloadHash,
  };

  // -------------------------------------------------------------------------
  // Location resolution
  // -------------------------------------------------------------------------
  canonical.store_id = await POSIdentityMapper.resolveLocation(
    supabase,
    canonical.tenant_id,
    canonical.source_system,
    canonical.store_id,
    config.store_id,
  );

  if (!UUID_RE.test(canonical.store_id)) {
    // Never write under a vendor location id masquerading as a store UUID.
    return {
      status: 422,
      body: {
        error: 'unmapped_location',
        detail: `Location "${canonical.store_id}" is not mapped to a SmartStock store.`,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Line classification, identity resolution, UOM
  // -------------------------------------------------------------------------
  let unresolvedExternalId: string | null = null;

  for (const line of canonical.lines) {
    line.inventory_behavior = await POSNonStockResolver.classifyLine(
      supabase,
      canonical.tenant_id,
      canonical.source_system,
      line,
    );

    if (line.inventory_behavior === 'NON_STOCK') {
      line.inventory_disposition = 'NO_STOCK_EFFECT';
      continue;
    }

    const externalId = line.source_sku || line.sku || line.barcode;
    if (!externalId || externalId === 'UNKNOWN_SKU') {
      unresolvedExternalId = 'UNKNOWN_SKU';
      break;
    }

    const resolved = await POSIdentityMapper.resolveProduct(
      supabase,
      canonical.tenant_id,
      canonical.source_system,
      externalId,
      line.barcode ? 'BARCODE' : 'SKU',
    );

    // `UNRESOLVED_DIRECT` means the resolver fell back to the raw vendor id.
    // Writing that as a SKU creates inventory rows for products that do not
    // exist, so it is quarantined instead.
    if (resolved.id_type === 'UNKNOWN' || resolved.id_type === 'UNRESOLVED_DIRECT') {
      unresolvedExternalId = externalId;
      break;
    }

    line.sku = resolved.smartstock_sku;

    const uom = await POSUOMConverter.convert(
      supabase,
      canonical.tenant_id,
      resolved.smartstock_sku,
      line.source_quantity,
      line.source_uom,
    );
    line.base_quantity = uom.base_quantity;
    line.base_uom = uom.base_uom;
    line.uom_conversion_factor = uom.conversion_factor;
  }

  if (unresolvedExternalId) {
    const quarantineId = await POSQuarantineManager.quarantineEvent(
      supabase,
      canonical.tenant_id,
      config.id,
      'PRODUCT_MAPPING_REQUIRED',
      unresolvedExternalId,
      canonical.source_system,
      canonical,
    );
    // 2xx on purpose: the delivery was received and persisted for replay, and
    // retrying it unchanged would produce the same unresolved result.
    return {
      status: 202,
      body: {
        status: 'quarantined',
        reason: 'PRODUCT_MAPPING_REQUIRED',
        quarantine_id: quarantineId,
        external_id: unresolvedExternalId,
        transaction_id: canonical.source_transaction_id,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Bundle decomposition
  // -------------------------------------------------------------------------
  canonical.lines = await POSBOMDecomposer.decomposeLines(
    supabase,
    canonical.tenant_id,
    canonical.lines,
  );

  // -------------------------------------------------------------------------
  // Prior state + reduction
  // -------------------------------------------------------------------------
  const { data: priorRecord, error: priorError } = await supabase
    .from('pos_transactions')
    .select(
      'source_version, latest_source_timestamp, latest_payload_hash, state, current_inventory_effect',
    )
    .eq('tenant_id', canonical.tenant_id)
    .eq('pos_config_id', config.id)
    .eq('transaction_id', canonical.source_transaction_id)
    .maybeSingle();

  if (priorError) {
    console.error('[pos-ingest] prior state read failed:', priorError.message);
    return { status: 503, body: { error: 'state_unavailable' } };
  }

  const priorState = priorRecord
    ? {
        source_transaction_id: canonical.source_transaction_id,
        source_version: priorRecord.source_version ?? undefined,
        latest_source_timestamp: priorRecord.latest_source_timestamp ?? undefined,
        latest_payload_hash: priorRecord.latest_payload_hash ?? undefined,
        status: priorRecord.state,
        current_inventory_effect:
          (priorRecord.current_inventory_effect as Record<string, number>) ?? {},
      }
    : null;

  const reduction = POSTransactionReducer.reduce(priorState, canonical);

  // -------------------------------------------------------------------------
  // Shadow mode — compute and record, never mutate stock
  // -------------------------------------------------------------------------
  if (config.activation_mode === 'SHADOW') {
    const { error: shadowError } = await supabase.from('pos_shadow_events').insert({
      tenant_id: canonical.tenant_id,
      pos_config_id: config.id,
      source_transaction_id: canonical.source_transaction_id,
      computed_inventory_effect: reduction.newInventoryEffect,
      mapping_status: 'SUCCESS',
      payload: options.rawPayload,
    });
    if (shadowError) {
      console.error('[pos-ingest] shadow write failed:', shadowError.message);
      return { status: 503, body: { error: 'shadow_write_failed' } };
    }

    await supabase
      .from('pos_configurations')
      .update({
        shadow_transactions_processed: (config.shadow_transactions_processed ?? 0) + 1,
      })
      .eq('id', config.id);

    return {
      status: 200,
      body: {
        status: 'shadow_processed',
        mode: 'SHADOW',
        transaction_id: canonical.source_transaction_id,
        version_resolution: reduction.version_resolution,
        simulated_inventory_effect: reduction.newInventoryEffect,
      },
    };
  }

  if (reduction.version_resolution === 'STALE_VERSION') {
    return {
      status: 200,
      body: {
        status: 'ignored_stale_version',
        transaction_id: canonical.source_transaction_id,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Ledger write — must succeed before the checkpoint advances
  // -------------------------------------------------------------------------
  const batchCorrelationId = crypto.randomUUID();
  const versionTag = canonical.source_version ?? 'v1';

  const canonicalEvents = reduction.deltasToApply.map((delta, index) => ({
    idempotency_key:
      `POS__${canonical.tenant_id}__${canonical.source_system}__${canonical.source_transaction_id}__` +
      `${delta.sku}__${versionTag}__${index}`,
    event_type: delta.event_type,
    tenant_id: canonical.tenant_id,
    location_id: canonical.store_id,
    // The ledger's `SourceSystem` enum expects 'POS'; provider identity is
    // preserved in `source_event_id` and `metadata.provider`.
    source_system: 'POS',
    // Include provider + version so updates/reversals on the same SKU are not
    // dropped by the ledger's (tenant_id, source_system, source_event_id) check.
    source_event_id: `${canonical.source_system}__${canonical.source_transaction_id}__${delta.sku}__${versionTag}__${index}`,
    source_sequence: canonical.source_sequence ?? null,
    business_timestamp: canonical.business_timestamp,
    quantity_delta: delta.quantity_delta,
    unit_of_measure: delta.unit_of_measure,
    correlation_id: batchCorrelationId,
    reference_type: 'POS_TRANSACTION',
    reference_id: canonical.source_transaction_id,
    schema_version: '1.0',
    raw_payload: {
      transaction_id: canonical.source_transaction_id,
      sku: delta.sku,
      pos_config_id: config.id,
    },
    metadata: {
      provider: canonical.source_system,
      pos_type: config.pos_type,
      source_version: canonical.source_version,
      target_bin: delta.target_bin ?? 'SELLABLE',
      grand_total: canonical.grand_total,
    },
  }));

  if (canonicalEvents.length > 0) {
    const gatewayUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ingestion-gateway`;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!serviceKey) {
      console.error('[pos-ingest] SUPABASE_SERVICE_ROLE_KEY is not set');
      return { status: 503, body: { error: 'ledger_unavailable' } };
    }

    let gatewayResponse: Response;
    try {
      gatewayResponse = await fetch(gatewayUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'x-source-system': 'POS',
          'x-tenant-id': canonical.tenant_id,
        },
        body: JSON.stringify(canonicalEvents),
      });
    } catch (error) {
      console.error('[pos-ingest] ledger call failed:', (error as Error).message);
      return { status: 503, body: { error: 'ledger_unavailable' } };
    }

    if (!gatewayResponse.ok || gatewayResponse.status === 207) {
      const detail = await gatewayResponse.text().catch(() => 'unknown');
      // Not swallowed: the provider must retry, otherwise stock silently drifts.
      console.error('[pos-ingest] ledger rejected events:', detail);
      return { status: 503, body: { error: 'ledger_write_failed' } };
    }
  }

  // -------------------------------------------------------------------------
  // Checkpoint
  // -------------------------------------------------------------------------
  const { error: upsertError } = await supabase.from('pos_transactions').upsert(
    {
      tenant_id: canonical.tenant_id,
      store_id: canonical.store_id,
      pos_config_id: config.id,
      transaction_id: canonical.source_transaction_id,
      source_version: canonical.source_version ?? 'v1',
      latest_source_timestamp: canonical.business_timestamp,
      latest_payload_hash: canonical.payload_hash ?? null,
      version_resolution: reduction.version_resolution,
      transaction_type: canonical.transaction_type,
      state: canonical.status,
      currency: canonical.currency,
      subtotal: canonical.subtotal ?? 0,
      tax_total: canonical.tax_total ?? 0,
      discount_total: canonical.discount_total ?? 0,
      grand_total: canonical.grand_total ?? 0,
      completed_at: canonical.business_timestamp,
      current_inventory_effect: reduction.newInventoryEffect,
      previous_inventory_effect: priorState?.current_inventory_effect ?? {},
      pos_raw_payload: options.rawPayload,
    },
    { onConflict: 'tenant_id,pos_config_id,transaction_id' },
  );

  if (upsertError) {
    // The ledger already holds the deltas and they are keyed idempotently, so a
    // retry will not double-post; it will only re-attempt this checkpoint.
    console.error('[pos-ingest] checkpoint write failed:', upsertError.message);
    return { status: 503, body: { error: 'checkpoint_write_failed' } };
  }

  return {
    status: 200,
    body: {
      status: 'processed',
      version_resolution: reduction.version_resolution,
      transaction_id: canonical.source_transaction_id,
      canonical_events_emitted: canonicalEvents.length,
      inventory_effect: reduction.newInventoryEffect,
    },
  };
}
