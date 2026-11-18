// /supabase/functions/_shared/pos/connectors/shopify/shopify-mapper.ts
// SmartStock LiveRetail V2 — Shopify (POS + online) Canonical Mapper
//
// Shopify's Order and Refund resources are different shapes. `orders/*`
// delivers an Order with `line_items`; `refunds/create` delivers a Refund
// with `refund_line_items[].line_item`. Treating a refund as an order (the
// previous behaviour) produced zero lines and silently dropped the restock.
//
// Order line items carry the variant SKU in `sku`; `barcode` is a
// ProductVariant field and is not present on an order line.

import { IPOSCanonicalMapper, POSMapperContext, RawPOSEnvelope } from '../../connector-interface.ts';
import { CanonicalPOSTransaction, CanonicalPOSLine, POSTransactionStatus } from '../../canonical-schema.ts';

function orderStatus(order: Record<string, unknown>): POSTransactionStatus {
  const financial = String(order.financial_status ?? '');

  // A paid order that is later cancelled is reversed by the refund flow.
  // Reversing it here as well would double-count the restock.
  if (order.cancelled_at && financial !== 'paid' && financial !== 'partially_paid') {
    return 'CANCELLED';
  }
  if (financial === 'voided') return 'VOIDED';
  if (financial === 'paid' || financial === 'partially_paid') return 'COMPLETED';
  if (financial === 'refunded' || financial === 'partially_refunded') return 'COMPLETED';
  return 'OPEN';
}

function lineFromOrderLine(
  line: Record<string, unknown>,
  index: number,
): CanonicalPOSLine {
  const quantity = Math.abs(Number(line.quantity ?? 0));
  const unitPrice = Number(line.price ?? 0);
  const discount = Number(line.total_discount ?? 0);
  const taxLines = Array.isArray(line.tax_lines) ? line.tax_lines : [];
  const tax = taxLines.reduce(
    (total: number, entry: Record<string, unknown>) => total + Number(entry.price ?? 0),
    0,
  );

  const sku = typeof line.sku === 'string' && line.sku.length > 0 ? line.sku : undefined;
  const variantId = line.variant_id != null ? String(line.variant_id) : undefined;
  const externalSku = sku ?? variantId ?? 'UNKNOWN_SKU';

  return {
    line_id: String(line.id ?? `line-${index}`),
    sku: externalSku,
    source_sku: externalSku,
    description: (line.title as string) || (line.name as string) || undefined,
    quantity,
    source_quantity: quantity,
    source_uom: 'EA',
    base_quantity: quantity,
    base_uom: 'PC',
    uom_conversion_factor: 1.0,
    unit_price: unitPrice,
    gross_price: unitPrice * quantity,
    discount_amount: discount,
    net_price: unitPrice * quantity - discount,
    tax_amount: tax,
    line_type: quantity < 0 ? 'RETURN' : 'MERCHANDISE',
    inventory_disposition: 'SELLABLE',
  };
}

export class ShopifyPOSMapper implements IPOSCanonicalMapper {
  async toCanonicalTransaction(
    raw: RawPOSEnvelope,
    context: POSMapperContext,
  ): Promise<CanonicalPOSTransaction> {
    const isRefund = raw.event_type === 'refunds/create';
    const payload = raw.payload;

    if (isRefund) {
      return this.mapRefund(raw, context);
    }

    const order = payload;
    const lineItems = (order.line_items ?? []) as Array<Record<string, unknown>>;
    const lines = lineItems.map(lineFromOrderLine);
    const status = orderStatus(order);

    return {
      schema_version: '1.1',
      transaction_id: `TXN-${context.tenant_id}-SHPFY-${raw.source_event_id}`,
      source_transaction_id: raw.source_event_id,
      source_system: 'SHOPIFY',
      // The order's own timestamp is the version. Refund deliveries are
      // separate transactions and never rewrite this one.
      source_version: (order.updated_at as string) || (order.created_at as string) || raw.received_at,
      tenant_id: context.tenant_id,
      store_id: String(order.location_id ?? context.store_id),
      transaction_type:
        status === 'CANCELLED' ? 'CANCEL' : status === 'VOIDED' ? 'VOID' : 'SALE',
      status,
      business_timestamp:
        (order.processed_at as string) || (order.created_at as string) || raw.received_at,
      received_timestamp: raw.received_at,
      // Shopify order currency is `currency` in the REST payload. Never
      // substitute an unrelated currency from configuration.
      currency: (order.currency as string) || context.currency || 'XXX',
      lines,
      subtotal: Number(order.subtotal_price ?? 0),
      tax_total: Number(order.total_tax ?? 0),
      discount_total: Number(order.total_discounts ?? 0),
      grand_total: Number(order.total_price ?? 0),
      metadata: {
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status,
        source_name: order.source_name,
        delivery_id: raw.headers?.['x-shopify-webhook-id'],
        api_version: raw.headers?.['x-shopify-api-version'],
      },
    };
  }

  /**
   * `refunds/create` carries a Refund resource: the refunded quantities live
   * in `refund_line_items`, each pointing at the original order line. Only
   * `restock_type` values that actually return stock to the shelf create a
   * positive inventory delta; `no_restock` explicitly does not.
   */
  private mapRefund(
    raw: RawPOSEnvelope,
    context: POSMapperContext,
  ): CanonicalPOSTransaction {
    const refund = raw.payload;
    const refundLines = (refund.refund_line_items ?? []) as Array<Record<string, unknown>>;

    const lines: CanonicalPOSLine[] = refundLines.map((entry, index) => {
      const original = (entry.line_item ?? {}) as Record<string, unknown>;
      const quantity = Math.abs(Number(entry.quantity ?? 0));
      const restockType = String(entry.restock_type ?? 'no_restock');
      const sku = typeof original.sku === 'string' && original.sku.length > 0
        ? original.sku
        : original.variant_id != null
        ? String(original.variant_id)
        : 'UNKNOWN_SKU';

      return {
        line_id: String(entry.id ?? `refund-line-${index}`),
        sku,
        source_sku: sku,
        description: (original.title as string) || (original.name as string) || undefined,
        quantity,
        source_quantity: quantity,
        source_uom: 'EA',
        base_quantity: quantity,
        base_uom: 'PC',
        uom_conversion_factor: 1.0,
        unit_price: Number(original.price ?? 0),
        gross_price: Number(entry.subtotal ?? 0),
        net_price: Number(entry.subtotal ?? 0),
        tax_amount: Number(entry.total_tax ?? 0),
        line_type: 'RETURN',
        // `no_restock` means the item is not going back on the shelf.
        inventory_disposition: restockType === 'no_restock' ? 'NO_STOCK_EFFECT' : 'SELLABLE',
        original_line_ref: original.id != null ? String(original.id) : undefined,
      };
    });

    return {
      schema_version: '1.1',
      transaction_id: `TXN-${context.tenant_id}-SHPFY-${raw.source_event_id}`,
      source_transaction_id: raw.source_event_id,
      source_system: 'SHOPIFY',
      source_version: (refund.created_at as string) || raw.received_at,
      tenant_id: context.tenant_id,
      store_id: String(
        (refund.order_id != null ? context.store_id : context.store_id),
      ),
      transaction_type: 'RETURN',
      status: 'COMPLETED',
      business_timestamp: (refund.created_at as string) || raw.received_at,
      received_timestamp: raw.received_at,
      currency: context.currency || 'XXX',
      lines,
      original_transaction_ref: refund.order_id != null ? `order-${refund.order_id}` : undefined,
      metadata: {
        refund_id: refund.id,
        order_id: refund.order_id,
        delivery_id: raw.headers?.['x-shopify-webhook-id'],
      },
    };
  }
}
