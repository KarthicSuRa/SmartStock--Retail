// /supabase/functions/_shared/pos/connectors/clover/clover-connector.ts
// SmartStock LiveRetail V2 — Clover POS Connector (Built with defineConnector SDK)

import { defineConnector } from '../../sdk/define-connector.ts';

export const CloverPOSConnector = defineConnector({
  id: 'clover',
  displayName: 'Clover Platform POS',
  capabilities: {
    transport: 'WEBHOOK',
    quality_level: 'B',
    realtime_webhooks: true,
    transaction_polling: true,
    returns_supported: true,
    voids_supported: true,
  },
  parseWebhook: async (rawBody: string, headers: Headers) => {
    const json = JSON.parse(rawBody);
    return {
      source_system: 'CLOVER',
      source_event_id: String(json.id || json.orderId || `CLV-${Date.now()}`),
      event_type: headers.get('x-clover-event-type') || 'ORDER_COMPLETED',
      payload: json,
      received_at: new Date().toISOString(),
    };
  },
  mapTransaction: async (raw, context) => {
    const o = raw.payload;
    const items = (o.lineItems?.elements || o.items || []) as Array<Record<string, unknown>>;

    return {
      schema_version: '1.1',
      transaction_id: `TXN-${context.tenant_id}-CLV-${raw.source_event_id}`,
      source_transaction_id: raw.source_event_id,
      source_system: 'CLOVER',
      tenant_id: context.tenant_id,
      store_id: String(o.merchantId || context.store_id),
      transaction_type: o.state === 'CANCELLED' ? 'CANCEL' : 'SALE',
      status: o.state === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED',
      business_timestamp: o.createdTime ? new Date(Number(o.createdTime)).toISOString() : raw.received_at,
      received_timestamp: raw.received_at,
      currency: o.currency || 'EUR',
      lines: items.map((i, idx) => ({
        line_id: String(i.id || `line-${idx}`),
        sku: (i.item?.id as string) || (i.name as string) || 'UNKNOWN_SKU',
        source_sku: (i.item?.id as string) || (i.name as string),
        description: (i.name as string) || 'Clover Item',
        quantity: Math.abs(Number(i.unitQty || i.quantity || 1)),
        source_quantity: Math.abs(Number(i.unitQty || i.quantity || 1)),
        source_uom: 'EA',
        base_quantity: Math.abs(Number(i.unitQty || i.quantity || 1)),
        base_uom: 'PC',
        uom_conversion_factor: 1.0,
        unit_price: Number(i.price || 0) / 100.0,
        line_type: 'MERCHANDISE',
      })),
      metadata: {},
    };
  },
});
