// /supabase/functions/_shared/pos/connectors/lightspeed/lightspeed-mapper.ts
// SmartStock LiveRetail V2 — Lightspeed Retail (X-Series) Canonical Mapper

import { IPOSCanonicalMapper, RawPOSEnvelope } from '../../connector-interface.ts';
import { CanonicalPOSTransaction, CanonicalPOSLine } from '../../canonical-schema.ts';

export class LightspeedPOSMapper implements IPOSCanonicalMapper {
  async toCanonicalTransaction(
    raw: RawPOSEnvelope,
    context: { tenant_id: string; store_id: string; pos_config_id: string }
  ): Promise<CanonicalPOSTransaction> {
    const s = raw.payload;

    const lineItems = (s.register_sale_products || s.line_items || []) as Array<Record<string, unknown>>;
    const lines: CanonicalPOSLine[] = lineItems.map((l, idx) => {
      const rawQty = Number(l.quantity || 1);
      const isReturn = rawQty < 0 || l.status === 'RETURN';
      const qty = Math.abs(rawQty);

      return {
        line_id: String(l.id || `line-${idx}`),
        sku: (l.sku as string) || (l.product_id as string) || 'UNKNOWN_SKU',
        source_sku: String(l.product_id || l.sku || 'UNKNOWN_SKU'),
        description: (l.name as string) || 'Lightspeed Item',
        quantity: qty,
        source_quantity: qty,
        source_uom: 'EA',
        base_quantity: qty,
        base_uom: 'PC',
        uom_conversion_factor: 1.0,
        unit_price: Number(l.price || 0),
        gross_price: Number(l.price || 0) * qty,
        discount_amount: Number(l.discount || 0),
        net_price: Number(l.total_price || 0),
        line_type: isReturn ? 'RETURN' : 'MERCHANDISE',
        inventory_disposition: 'SELLABLE',
      };
    });

    const isVoid = s.status === 'VOIDED' || s.status === 'CANCELLED';

    return {
      schema_version: '1.0',
      transaction_id: `TXN-${context.tenant_id}-LGT-${raw.source_event_id}`,
      source_transaction_id: raw.source_event_id,
      source_system: 'LIGHTSPEED',
      source_version: (s.version ? String(s.version) : s.updated_at) || new Date().toISOString(),
      tenant_id: context.tenant_id,
      store_id: String(s.outlet_id || context.store_id),
      terminal_id: String(s.register_id || ''),
      transaction_type: isVoid ? 'VOID' : 'SALE',
      status: isVoid ? 'VOIDED' : 'COMPLETED',
      business_timestamp: (s.sale_date as string) || (s.created_at as string) || raw.received_at,
      received_timestamp: raw.received_at,
      currency: (s.currency as string) || 'EUR',
      lines,
      source_sequence: s.sequence_number ? Number(s.sequence_number) : undefined,
      metadata: {
        outlet_name: s.outlet_name,
        user_name: s.user_name,
      },
    };
  }
}
