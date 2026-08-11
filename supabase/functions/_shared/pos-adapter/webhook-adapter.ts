// /supabase/functions/_shared/pos-adapter/webhook-adapter.ts

import { IPOSAdapter, POSBasket, POSConfig, POSMovement } from "./types.ts";

export class WebhookPOSAdapter implements IPOSAdapter {
  constructor(private config: POSConfig) {}

  async ingest(payload: any): Promise<POSBasket> {
    if (this.config.pos_type === 'shopify') {
      return this.parseShopify(payload);
    }
    if (this.config.pos_type === 'square') {
      return this.parseSquare(payload);
    }
    return this.parseGeneric(payload);
  }

  private parseShopify(payload: any): POSBasket {
    return {
      transaction_id: payload.id ? payload.id.toString() : `SHPFY-${Date.now()}`,
      pos_terminal_id: payload.location_id?.toString() || 'online',
      store_id: this.config.store_id,
      tenant_id: this.config.tenant_id,
      started_at: payload.created_at || new Date().toISOString(),
      completed_at: payload.processed_at || payload.created_at || new Date().toISOString(),
      timezone: 'UTC',
      currency: payload.currency || 'EUR',
      subtotal: parseFloat(payload.subtotal_price || 0),
      tax_total: parseFloat(payload.total_tax || 0),
      discount_total: parseFloat(payload.total_discounts || 0),
      grand_total: parseFloat(payload.total_price || 0),
      state: payload.cancelled_at ? 'VOIDED' : 'COMPLETED',
      payments: payload.payment_gateway_names?.map((pg: string) => ({
        method: pg.toLowerCase().includes('cash') ? 'CASH' : 'CARD',
        amount: parseFloat(payload.total_price || 0),
      })) || [],
      items: payload.line_items?.map((line: any) => ({
        line_id: line.id?.toString() || `line-${Math.random().toString(36).substring(2)}`,
        sku: line.sku || line.variant_id?.toString() || 'UNKNOWN_SKU',
        ean_gtin: line.barcode,
        description: line.title || 'Product Item',
        quantity: line.quantity || 1,
        uom: 'EA',
        unit_price: parseFloat(line.price || 0),
        gross_price: parseFloat(line.price || 0) * (line.quantity || 1),
        discount_amount: parseFloat(line.total_discount || 0),
        net_price: (parseFloat(line.price || 0) * (line.quantity || 1)) - parseFloat(line.total_discount || 0),
        tax_amount: 0,
        is_return: (line.quantity || 1) < 0,
        is_void: false,
      })) || [],
      pos_raw_payload: payload,
    };
  }

  private parseSquare(payload: any): POSBasket {
    const order = payload.data?.object?.order || payload;
    return {
      transaction_id: order.id || `SQR-${Date.now()}`,
      pos_terminal_id: order.location_id || 'main-terminal',
      store_id: this.config.store_id,
      tenant_id: this.config.tenant_id,
      started_at: order.created_at || new Date().toISOString(),
      completed_at: order.closed_at || order.created_at || new Date().toISOString(),
      timezone: 'UTC',
      currency: order.total_money?.currency || 'EUR',
      subtotal: (order.net_amounts?.total_money?.amount || 0) / 100,
      tax_total: (order.total_tax_money?.amount || 0) / 100,
      discount_total: (order.total_discount_money?.amount || 0) / 100,
      grand_total: (order.total_money?.amount || 0) / 100,
      state: order.state === 'CANCELED' ? 'VOIDED' : 'COMPLETED',
      payments: [],
      items: order.line_items?.map((line: any) => ({
        line_id: line.uid || `sqr-line-${Math.random().toString(36).substring(2)}`,
        sku: line.catalog_object_id || line.variation_name || 'UNKNOWN_SKU',
        ean_gtin: undefined,
        description: line.name || 'Square Line Item',
        quantity: parseInt(line.quantity || 1),
        uom: 'EA',
        unit_price: (line.base_price_money?.amount || 0) / 100,
        gross_price: (line.gross_sales_money?.amount || 0) / 100,
        discount_amount: (line.total_discount_money?.amount || 0) / 100,
        net_price: (line.total_money?.amount || 0) / 100,
        tax_amount: (line.total_tax_money?.amount || 0) / 100,
        is_return: String(line.quantity || '1').startsWith('-'),
        is_void: false,
      })) || [],
      pos_raw_payload: payload,
    };
  }

  private parseGeneric(payload: any): POSBasket {
    return {
      transaction_id: payload.transaction_id || `GEN-${Date.now()}`,
      pos_terminal_id: payload.pos_terminal_id || 'pos-1',
      store_id: this.config.store_id,
      tenant_id: this.config.tenant_id,
      started_at: payload.started_at || new Date().toISOString(),
      completed_at: payload.completed_at || new Date().toISOString(),
      timezone: payload.timezone || 'UTC',
      currency: payload.currency || 'EUR',
      subtotal: payload.subtotal || payload.grand_total || 0,
      tax_total: payload.tax_total || 0,
      discount_total: payload.discount_total || 0,
      grand_total: payload.grand_total || 0,
      state: payload.state || 'COMPLETED',
      payments: payload.payments || [],
      items: (payload.items || []).map((item: any, idx: number) => ({
        line_id: item.line_id || `line-${idx}`,
        sku: item.sku,
        ean_gtin: item.ean_gtin,
        description: item.description || item.sku,
        quantity: item.quantity,
        uom: item.uom || 'EA',
        unit_price: item.unit_price || 0,
        gross_price: item.gross_price || (item.unit_price || 0) * item.quantity,
        discount_amount: item.discount_amount || 0,
        net_price: item.net_price || (item.unit_price || 0) * item.quantity,
        tax_amount: item.tax_amount || 0,
        is_return: item.is_return || item.quantity < 0,
        is_void: item.is_void || false,
      })),
      pos_raw_payload: payload,
    };
  }

  async validate(basket: POSBasket): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    if (!basket.transaction_id) errors.push('Missing transaction_id');
    if (!basket.items || basket.items.length === 0) errors.push('Empty basket');
    if (basket.grand_total < 0 && basket.state !== 'REFUNDED') {
      errors.push('Negative total without refund state');
    }
    const completed = new Date(basket.completed_at);
    if (completed > new Date(Date.now() + 60000)) {
      errors.push('Transaction date is in the future');
    }
    return { valid: errors.length === 0, errors };
  }

  async isDuplicate(transactionId: string): Promise<boolean> {
    return false;
  }

  async toMovements(basket: POSBasket): Promise<POSMovement[]> {
    const movements: POSMovement[] = [];
    for (const item of basket.items) {
      if (item.is_void) continue;
      
      movements.push({
        movement_id: crypto.randomUUID(),
        tenant_id: basket.tenant_id,
        store_id: basket.store_id,
        sku: item.sku,
        quantity: item.is_return ? Math.abs(item.quantity) : -Math.abs(item.quantity),
        uom: item.uom,
        movement_type: item.is_return ? 'RETURN' : 'SALE',
        unit_price: item.unit_price,
        total_price: item.is_return ? item.net_price : -item.net_price,
        transaction_id: basket.transaction_id,
        line_id: item.line_id,
        pos_config_id: this.config.id,
        posted_at: basket.completed_at,
      });

      if (item.discount_amount > 0) {
        movements.push({
          movement_id: crypto.randomUUID(),
          tenant_id: basket.tenant_id,
          store_id: basket.store_id,
          sku: item.sku,
          quantity: 0,
          uom: item.uom,
          movement_type: 'DISCOUNT',
          unit_price: 0,
          total_price: -item.discount_amount,
          transaction_id: basket.transaction_id,
          line_id: `${item.line_id}_discount`,
          pos_config_id: this.config.id,
          posted_at: basket.completed_at,
        });
      }
    }
    return movements;
  }

  async checkPrice(ean: string, storeId: string): Promise<any> {
    return { sku: 'MOCK-SKU', price: 9.99, currency: 'EUR' };
  }

  async checkStock(ean: string, storeId: string): Promise<any> {
    return { available: true, qty: 100 };
  }
}
