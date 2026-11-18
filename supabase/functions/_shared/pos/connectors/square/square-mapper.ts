// /supabase/functions/_shared/pos/connectors/square/square-mapper.ts
// SmartStock LiveRetail V2 — Square POS Canonical Mapper
//
// Square `order.*` webhooks carry only metadata, so the order is fetched with
// RetrieveOrder before this mapper runs (see provider-webhooks.ts). The order
// object fields used here are the ones Square documents for the Orders API:
//
//   Order        id, location_id, state, version, created_at, updated_at,
//                closed_at, ticket_name, source.name, total_money,
//                total_tax_money, total_discount_money, total_tip_money,
//                net_amounts.{total_money,tax_money,discount_money},
//                line_items[]
//   OrderLineItem uid, name, quantity (string), catalog_object_id,
//                variation_name, item_type, base_price_money,
//                gross_sales_money, total_tax_money, total_discount_money,
//                total_money
//   Money        { amount: integer minor units, currency: ISO 4217 }
//
// `refund.*` notifications contain an amount only — no line-level quantities —
// so line-accurate restock is impossible from them. They are recorded as a
// no-stock-effect transaction instead of inventing quantities.

import { IPOSCanonicalMapper, POSMapperContext, RawPOSEnvelope } from '../../connector-interface.ts';
import { CanonicalPOSTransaction, CanonicalPOSLine, POSTransactionStatus } from '../../canonical-schema.ts';

interface SquareMoney {
  amount?: number;
  currency?: string;
}

function money(value: unknown): number {
  const amount = (value as SquareMoney | undefined)?.amount;
  return typeof amount === 'number' ? amount / 100 : 0;
}

function currencyOf(value: unknown, fallback: string | undefined): string {
  const code = (value as SquareMoney | undefined)?.currency;
  return typeof code === 'string' && code.length === 3 ? code : fallback || 'XXX';
}

export class SquarePOSMapper implements IPOSCanonicalMapper {
  async toCanonicalTransaction(
    raw: RawPOSEnvelope,
    context: POSMapperContext,
  ): Promise<CanonicalPOSTransaction> {
    if (raw.event_type.startsWith('refund.')) {
      return this.mapRefundNotification(raw, context);
    }

    const order = (raw.payload.order ?? raw.payload) as Record<string, unknown>;
    const lineItems = (order.line_items ?? []) as Array<Record<string, unknown>>;

    const lines: CanonicalPOSLine[] = lineItems.map((line, index) => {
      const isGiftCard = line.item_type === 'GIFT_CARD';
      const rawQuantity = Number(line.quantity ?? 0);
      const quantity = Math.abs(rawQuantity);
      const isReturn = rawQuantity < 0;

      return {
        line_id: String(line.uid ?? `line-${index}`),
        // Square identifies the item by catalog object id (a GUID), not a SKU.
        // The SKU must come from the catalog object; `source_sku` keeps the
        // Square identifier so the identity map can resolve it.
        source_sku: String(line.catalog_object_id ?? line.uid ?? 'UNKNOWN_SKU'),
        sku: undefined,
        barcode: undefined,
        description: (line.name as string) || (line.variation_name as string) || undefined,
        quantity,
        source_quantity: quantity,
        source_uom: 'EA',
        base_quantity: quantity,
        base_uom: 'PC',
        uom_conversion_factor: 1.0,
        unit_price: money(line.base_price_money),
        gross_price: money(line.gross_sales_money),
        discount_amount: money(line.total_discount_money),
        net_price: money(line.total_money),
        tax_amount: money(line.total_tax_money),
        line_type: isGiftCard ? 'NON_STOCK' : isReturn ? 'RETURN' : 'MERCHANDISE',
        inventory_behavior: isGiftCard ? 'NON_STOCK' : undefined,
        inventory_disposition: isGiftCard ? 'NO_STOCK_EFFECT' : 'SELLABLE',
      };
    });

    const state = String(order.state ?? '');
    let status: POSTransactionStatus;
    let transactionType: CanonicalPOSTransaction['transaction_type'];

    if (state === 'CANCELED') {
      status = 'CANCELLED';
      transactionType = 'CANCEL';
    } else if (state === 'COMPLETED') {
      status = 'COMPLETED';
      transactionType = 'SALE';
    } else {
      // OPEN / DRAFT: not a sale yet. Recording it as OPEN keeps the reducer
      // from deducting stock before the order is paid.
      status = 'OPEN';
      transactionType = 'SALE';
    }

    return {
      schema_version: '1.1',
      transaction_id: `TXN-${context.tenant_id}-SQR-${raw.source_event_id}`,
      source_transaction_id: raw.source_event_id,
      source_system: 'SQUARE',
      source_version: order.version != null ? String(order.version) : (order.updated_at as string),
      tenant_id: context.tenant_id,
      store_id: String(order.location_id ?? context.store_id),
      transaction_type: transactionType,
      status,
      business_timestamp:
        (order.closed_at as string) || (order.created_at as string) || raw.received_at,
      received_timestamp: raw.received_at,
      currency: currencyOf(order.total_money, context.currency),
      lines,
      subtotal: money((order.net_amounts as Record<string, unknown> | undefined)?.total_money),
      tax_total: money(order.total_tax_money),
      discount_total: money(order.total_discount_money),
      grand_total: money(order.total_money),
      metadata: {
        square_order_state: state,
        square_order_id: order.id,
        ticket_name: order.ticket_name,
        source: (order.source as Record<string, unknown> | undefined)?.name,
        // Square's event_id is the delivery-level dedupe key; it is stable
        // across the 11 retries of the same notification.
        delivery_id: raw.payload.event_id,
      },
    };
  }

  /**
   * `refund.created` / `refund.updated` carry `{ id, location_id, order_id,
   * created_at, amount_money, status }` — an amount, not line quantities.
   * We record the refund as a zero-stock-effect transaction so it is visible
   * and auditable, but never guess which items came back.
   */
  private mapRefundNotification(
    raw: RawPOSEnvelope,
    context: POSMapperContext,
  ): CanonicalPOSTransaction {
    const refund = (raw.payload.data as Record<string, unknown> | undefined)?.object as
      | Record<string, unknown>
      | undefined;
    const object = (refund?.refund ?? raw.payload.refund ?? raw.payload) as Record<string, unknown>;

    return {
      schema_version: '1.1',
      transaction_id: `TXN-${context.tenant_id}-SQR-${raw.source_event_id}`,
      source_transaction_id: raw.source_event_id,
      source_system: 'SQUARE',
      source_version: (object.updated_at as string) || (object.created_at as string),
      tenant_id: context.tenant_id,
      store_id: String(object.location_id ?? context.store_id),
      transaction_type: 'RETURN',
      status: 'COMPLETED',
      business_timestamp: (object.created_at as string) || raw.received_at,
      received_timestamp: raw.received_at,
      currency: currencyOf(object.amount_money, context.currency),
      lines: [],
      grand_total: money(object.amount_money),
      original_transaction_ref: object.order_id != null ? String(object.order_id) : undefined,
      metadata: {
        square_refund_id: object.id,
        square_refund_status: object.status,
        stock_effect: 'NONE_REFUND_AMOUNT_ONLY',
      },
    };
  }
}
