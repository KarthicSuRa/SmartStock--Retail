// /supabase/functions/_shared/pos/field-mapper.ts
// SmartStock LiveRetail V2 — Configuration-Driven POS Field Mapping Engine

import { CanonicalPOSTransaction, CanonicalPOSLine } from './canonical-schema.ts';

export interface FieldMappingConfig {
  transaction_id: string; // e.g. "receipt_no" or "column_0"
  store_id: string; // e.g. "store_code" or "column_1"
  timestamp: string; // e.g. "sale_time" or "column_2"
  sku: string; // e.g. "item_sku" or "column_3"
  quantity: string; // e.g. "qty_sold" or "column_4"
  unit_price?: string;
  type?: string;
  type_sale_values?: string[]; // e.g. ["S", "SALE", "01"]
  type_return_values?: string[]; // e.g. ["R", "RETURN", "02"]
}

export class POSFieldMapper {
  static mapRecord(
    record: Record<string, any>,
    mapping: FieldMappingConfig,
    context: { tenant_id: string; source_system: string }
  ): CanonicalPOSTransaction {
    const rawTxnId = String(record[mapping.transaction_id] || `REC-${Date.now()}`);
    const rawStore = String(record[mapping.store_id] || 'default-store');
    const rawSku = String(record[mapping.sku] || 'UNKNOWN_SKU');
    const rawQty = Number(record[mapping.quantity] || 1);
    const rawType = mapping.type ? String(record[mapping.type] || '') : 'SALE';

    const isReturn = (mapping.type_return_values || ['R', 'RETURN', 'REFUND']).includes(rawType.toUpperCase()) || rawQty < 0;
    const qty = Math.abs(rawQty);

    const line: CanonicalPOSLine = {
      line_id: `line-1`,
      sku: rawSku,
      source_sku: rawSku,
      quantity: qty,
      source_quantity: qty,
      source_uom: 'EA',
      base_quantity: qty,
      base_uom: 'EA',
      uom_conversion_factor: 1.0,
      unit_price: mapping.unit_price ? Number(record[mapping.unit_price] || 0) : undefined,
      line_type: isReturn ? 'RETURN' : 'MERCHANDISE',
    };

    return {
      schema_version: '1.0',
      transaction_id: `TXN-${context.tenant_id}-${rawTxnId}`,
      source_transaction_id: rawTxnId,
      source_system: context.source_system,
      tenant_id: context.tenant_id,
      store_id: rawStore,
      transaction_type: isReturn ? 'RETURN' : 'SALE',
      status: 'COMPLETED',
      business_timestamp: record[mapping.timestamp] ? new Date(record[mapping.timestamp]).toISOString() : new Date().toISOString(),
      received_timestamp: new Date().toISOString(),
      currency: 'EUR',
      lines: [line],
      metadata: {},
    };
  }
}
