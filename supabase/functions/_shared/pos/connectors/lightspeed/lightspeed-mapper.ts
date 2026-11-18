// /supabase/functions/_shared/pos/connectors/lightspeed/lightspeed-mapper.ts
// SmartStock LiveRetail V2 — Lightspeed Retail (X-Series) Canonical Mapper
//
// The `sale.update` webhook payload is a Vend-style Sale resource:
//
//   Sale         id, register_id, outlet_id, user_id, invoice_number, status,
//                sequence_number, sale_date, created_at, updated_at,
//                total_price, total_tax, discount_total, currency
//   SaleProduct  id, product_id, sequence, sku, name, quantity, price,
//                price_total, discount_total, tax_total, type, status
//
// `type` is "SALE" or "RETURN"; `status` is "ACTIVE", "RETURNED" or
// "IMPORTED". Lightspeed also nests the register under `register`, so the
// outlet may only be available as `register.outlet_id`.

import { IPOSCanonicalMapper, POSMapperContext, RawPOSEnvelope } from '../../connector-interface.ts';
import { CanonicalPOSTransaction, CanonicalPOSLine, POSTransactionStatus } from '../../canonical-schema.ts';

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export class LightspeedPOSMapper implements IPOSCanonicalMapper {
  async toCanonicalTransaction(
    raw: RawPOSEnvelope,
    context: POSMapperContext,
  ): Promise<CanonicalPOSTransaction> {
    const sale = raw.payload;
    const items = (sale.register_sale_products ?? sale.line_items ?? []) as Array<
      Record<string, unknown>
    >;

    const lines: CanonicalPOSLine[] = items.map((item, index) => {
      const rawQuantity = num(item.quantity);
      const isReturn =
        rawQuantity < 0 ||
        String(item.type ?? '').toUpperCase() === 'RETURN' ||
        String(item.status ?? '').toUpperCase() === 'RETURNED';
      const quantity = Math.abs(rawQuantity);

      const productId = item.product_id != null ? String(item.product_id) : undefined;
      const sku = typeof item.sku === 'string' && item.sku.length > 0 ? item.sku : undefined;

      return {
        line_id: String(item.id ?? `line-${index}`),
        // Vend identifies the product by UUID; `sku` is the merchant SKU and
        // is what the identity map is normally keyed on.
        source_sku: sku ?? productId ?? 'UNKNOWN_SKU',
        sku: undefined,
        barcode: undefined,
        description: (item.name as string) || undefined,
        quantity,
        source_quantity: quantity,
        source_uom: 'EA',
        base_quantity: quantity,
        base_uom: 'PC',
        uom_conversion_factor: 1.0,
        unit_price: num(item.price),
        // Vend names this `price_total`; the older code read `total_price`,
        // which is a sale-level field and is absent on a sale product.
        gross_price: num(item.price_total ?? num(item.price) * quantity),
        discount_amount: num(item.discount_total ?? item.discount),
        net_price: num(item.price_total ?? num(item.price) * quantity) -
          num(item.discount_total ?? item.discount),
        tax_amount: num(item.tax_total),
        line_type: isReturn ? 'RETURN' : 'MERCHANDISE',
        inventory_disposition: 'SELLABLE',
      };
    });

    const statusRaw = String(sale.status ?? '').toUpperCase();
    let status: POSTransactionStatus;
    let transactionType: CanonicalPOSTransaction['transaction_type'];

    if (statusRaw === 'VOIDED' || statusRaw === 'CANCELLED') {
      status = 'VOIDED';
      transactionType = 'VOID';
    } else if (statusRaw === 'CLOSED') {
      status = 'COMPLETED';
      transactionType = 'SALE';
    } else {
      // OPEN / HELD / LAYBY — the sale is not final, so no stock movement yet.
      status = 'OPEN';
      transactionType = 'SALE';
    }

    const register = (sale.register ?? {}) as Record<string, unknown>;
    const outletId = sale.outlet_id ?? register.outlet_id;

    return {
      schema_version: '1.1',
      transaction_id: `TXN-${context.tenant_id}-LGT-${raw.source_event_id}`,
      source_transaction_id: raw.source_event_id,
      source_system: 'LIGHTSPEED',
      source_version: sale.version != null ? String(sale.version) : (sale.updated_at as string),
      tenant_id: context.tenant_id,
      store_id: outletId != null ? String(outletId) : context.store_id,
      terminal_id: sale.register_id != null ? String(sale.register_id) : undefined,
      register_id: sale.register_id != null ? String(sale.register_id) : undefined,
      transaction_type: transactionType,
      status,
      business_timestamp:
        (sale.sale_date as string) || (sale.created_at as string) || raw.received_at,
      received_timestamp: raw.received_at,
      currency: (sale.currency as string) || context.currency || 'XXX',
      lines,
      subtotal: num(sale.total_price),
      tax_total: num(sale.total_tax),
      discount_total: num(sale.discount_total),
      grand_total: num(sale.total_price),
      source_sequence:
        sale.sequence_number != null && Number.isFinite(Number(sale.sequence_number))
          ? Number(sale.sequence_number)
          : undefined,
      metadata: {
        invoice_number: sale.invoice_number,
        outlet_name: outletId != null ? register.name : undefined,
        user_id: sale.user_id,
        vend_status: statusRaw,
      },
    };
  }
}
