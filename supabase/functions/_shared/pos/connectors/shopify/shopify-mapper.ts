// /supabase/functions/_shared/pos/connectors/shopify/shopify-mapper.ts
// SmartStock LiveRetail V2 — Shopify POS Canonical Mapper

import { IPOSCanonicalMapper, RawPOSEnvelope } from '../../connector-interface.ts';
import { CanonicalPOSTransaction, CanonicalPOSLine } from '../../canonical-schema.ts';

export class ShopifyPOSMapper implements IPOSCanonicalMapper {
  async toCanonicalTransaction(
    raw: RawPOSEnvelope,
    context: { tenant_id: string; store_id: string; pos_config_id: string }
  ): Promise<CanonicalPOSTransaction> {
    const o = raw.payload;

    const lineItems = (o.line_items || []) as Array<Record<string, unknown>>;
    const lines: CanonicalPOSLine[] = lineItems.map((l, idx) => {
      const rawQty = Number(l.quantity || 1);
      const isReturn = rawQty < 0 || raw.event_type.includes('refund');
      const qty = Math.abs(rawQty);

      return {
        line_id: String(l.id || `line-${idx}`),
        sku: (l.sku as string) || String(l.variant_id || 'UNKNOWN_SKU'),
        source_sku: String(l.variant_id || l.sku || 'UNKNOWN_SKU'),
        barcode: (l.barcode as string) || undefined,
        description: (l.title as string) || (l.name as string),
        quantity: qty,
        source_quantity: qty,
        source_uom: 'EA',
        base_quantity: qty,
        base_uom: 'PC',
        uom_conversion_factor: 1.0,
        unit_price: Number(l.price || 0),
        gross_price: Number(l.price || 0) * qty,
        discount_amount: Number(l.total_discount || 0),
        net_price: Number(l.price || 0) * qty - Number(l.total_discount || 0),
        line_type: isReturn ? 'RETURN' : 'MERCHANDISE',
        inventory_disposition: 'SELLABLE',
      };
    });

    const isCancelled = Boolean(o.cancelled_at) || o.financial_status === 'voided';
    const isRefund = raw.event_type.includes('refunds/create');

    return {
      schema_version: '1.0',
      transaction_id: `TXN-${context.tenant_id}-SHPFY-${raw.source_event_id}`,
      source_transaction_id: raw.source_event_id,
      source_system: 'SHOPIFY',
      source_version: (o.updated_at as string) || new Date().toISOString(),
      tenant_id: context.tenant_id,
      store_id: String(o.location_id || context.store_id),
      transaction_type: isRefund ? 'RETURN' : isCancelled ? 'CANCEL' : 'SALE',
      status: isCancelled ? 'CANCELLED' : 'COMPLETED',
      business_timestamp: (o.processed_at as string) || (o.created_at as string) || raw.received_at,
      received_timestamp: raw.received_at,
      currency: (o.currency as string) || 'EUR',
      lines,
      subtotal: Number(o.subtotal_price || 0),
      tax_total: Number(o.total_tax || 0),
      discount_total: Number(o.total_discounts || 0),
      grand_total: Number(o.total_price || 0),
      original_transaction_ref: isRefund && o.order_id ? String(o.order_id) : undefined,
      metadata: {
        financial_status: o.financial_status,
        fulfillment_status: o.fulfillment_status,
        tags: o.tags,
      },
    };
  }
}
