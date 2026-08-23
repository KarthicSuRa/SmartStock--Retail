// /supabase/functions/_shared/pos/connectors/square/square-mapper.ts
// SmartStock LiveRetail V2 — Square POS Canonical Mapper

import { IPOSCanonicalMapper, RawPOSEnvelope } from '../../connector-interface.ts';
import { CanonicalPOSTransaction, CanonicalPOSLine } from '../../canonical-schema.ts';

export class SquarePOSMapper implements IPOSCanonicalMapper {
  async toCanonicalTransaction(
    raw: RawPOSEnvelope,
    context: { tenant_id: string; store_id: string; pos_config_id: string }
  ): Promise<CanonicalPOSTransaction> {
    const o = (raw.payload.data as any)?.object?.order || (raw.payload.data as any)?.object || raw.payload;

    const lineItems = (o.line_items || []) as Array<Record<string, unknown>>;
    const lines: CanonicalPOSLine[] = lineItems.map((l, idx) => {
      const isGiftCard = l.item_type === 'GIFT_CARD';
      const rawQty = Number(l.quantity || 1);
      const isReturn = rawQty < 0 || String(l.quantity || '').startsWith('-');
      const qty = Math.abs(rawQty);

      return {
        line_id: String(l.uid || `line-${idx}`),
        sku: (l.catalog_object_id as string) || (l.variation_name as string) || 'UNKNOWN_SKU',
        source_sku: String(l.catalog_object_id || l.name || 'UNKNOWN_SKU'),
        description: (l.name as string) || 'Square Item',
        quantity: qty,
        source_quantity: qty,
        source_uom: 'EA',
        base_quantity: qty,
        base_uom: 'PC',
        uom_conversion_factor: 1.0,
        unit_price: Number((l.base_price_money as any)?.amount || 0) / 100.0,
        gross_price: Number((l.gross_sales_money as any)?.amount || 0) / 100.0,
        discount_amount: Number((l.total_discount_money as any)?.amount || 0) / 100.0,
        net_price: Number((l.total_money as any)?.amount || 0) / 100.0,
        line_type: isGiftCard ? 'NON_STOCK' : isReturn ? 'RETURN' : 'MERCHANDISE',
        inventory_disposition: isGiftCard ? 'NO_STOCK_EFFECT' : 'SELLABLE',
      };
    });

    const isCancelled = o.state === 'CANCELED' || o.state === 'VOIDED';

    return {
      schema_version: '1.0',
      transaction_id: `TXN-${context.tenant_id}-SQR-${raw.source_event_id}`,
      source_transaction_id: raw.source_event_id,
      source_system: 'SQUARE',
      source_version: (o.version ? String(o.version) : o.updated_at) || new Date().toISOString(),
      tenant_id: context.tenant_id,
      store_id: String(o.location_id || context.store_id),
      transaction_type: isCancelled ? 'CANCEL' : 'SALE',
      status: isCancelled ? 'CANCELLED' : 'COMPLETED',
      business_timestamp: (o.closed_at as string) || (o.created_at as string) || raw.received_at,
      received_timestamp: raw.received_at,
      currency: (o.total_money as any)?.currency || 'EUR',
      lines,
      subtotal: Number((o.net_amounts as any)?.total_money?.amount || 0) / 100.0,
      tax_total: Number((o.total_tax_money as any)?.amount || 0) / 100.0,
      discount_total: Number((o.total_discount_money as any)?.amount || 0) / 100.0,
      grand_total: Number((o.total_money as any)?.amount || 0) / 100.0,
      metadata: {
        square_order_state: o.state,
        ticket_name: o.ticket_name,
      },
    };
  }
}
