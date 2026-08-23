// /supabase/functions/_shared/pos/connectors/generic/generic-mapper.ts
// SmartStock LiveRetail V2 — Generic Canonical POS Mapper

import { IPOSCanonicalMapper, RawPOSEnvelope } from '../../connector-interface.ts';
import { CanonicalPOSTransaction, CanonicalPOSLine } from '../../canonical-schema.ts';

export class GenericPOSMapper implements IPOSCanonicalMapper {
  async toCanonicalTransaction(
    raw: RawPOSEnvelope,
    context: { tenant_id: string; store_id: string; pos_config_id: string }
  ): Promise<CanonicalPOSTransaction> {
    const p = raw.payload;

    const rawItems = (p.items || p.lines || p.line_items || []) as Array<Record<string, unknown>>;
    const lines: CanonicalPOSLine[] = rawItems.map((item, idx) => {
      const qty = Math.abs(Number(item.quantity || item.qty || 1));
      const isReturn = Boolean(item.is_return || (Number(item.quantity || item.qty) < 0));

      return {
        line_id: (item.line_id as string) || (item.id as string) || `line-${idx}`,
        sku: (item.sku as string) || (item.product_code as string) || (item.item_code as string),
        source_sku: (item.sku as string) || (item.item_code as string),
        barcode: (item.barcode as string) || (item.ean as string),
        description: (item.description as string) || (item.name as string),
        quantity: qty,
        source_quantity: qty,
        source_uom: (item.uom as string) || 'EA',
        base_quantity: qty,
        base_uom: (item.uom as string) || 'EA',
        uom_conversion_factor: 1.0,
        unit_price: Number(item.unit_price || item.price || 0),
        gross_price: Number(item.gross_price || item.total || 0),
        discount_amount: Number(item.discount || item.discount_amount || 0),
        net_price: Number(item.net_price || item.price || 0),
        line_type: isReturn ? 'RETURN' : 'MERCHANDISE',
        inventory_disposition: 'SELLABLE',
      };
    });

    const isCancelled = p.status === 'CANCELLED' || p.state === 'VOIDED' || p.cancelled === true;
    const isRefund = p.type === 'RETURN' || p.transaction_type === 'RETURN';

    return {
      schema_version: '1.0',
      transaction_id: `TXN-${context.tenant_id}-${raw.source_event_id}`,
      source_transaction_id: raw.source_event_id,
      source_system: raw.source_system,
      source_version: (p.version as string) || (p.updated_at as string),
      tenant_id: context.tenant_id,
      store_id: (p.store_id as string) || context.store_id,
      terminal_id: (p.terminal_id as string) || (p.register_id as string),
      transaction_type: isRefund ? 'RETURN' : isCancelled ? 'CANCEL' : 'SALE',
      status: isCancelled ? 'CANCELLED' : 'COMPLETED',
      business_timestamp: (p.timestamp as string) || (p.completed_at as string) || (p.created_at as string) || raw.received_at,
      received_timestamp: raw.received_at,
      currency: (p.currency as string) || 'EUR',
      lines,
      subtotal: Number(p.subtotal || 0),
      tax_total: Number(p.tax_total || 0),
      discount_total: Number(p.discount_total || 0),
      grand_total: Number(p.grand_total || p.total || 0),
      source_sequence: p.sequence ? Number(p.sequence) : undefined,
      metadata: (p.metadata as Record<string, unknown>) || {},
    };
  }
}
