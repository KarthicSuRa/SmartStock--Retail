// /supabase/functions/_shared/pos/canonical-schema.ts
// SmartStock LiveRetail V2 — Universal POS Canonical Data Model (V1.1)

export type POSTransactionType = 'SALE' | 'RETURN' | 'EXCHANGE' | 'VOID' | 'CANCEL';

export type POSTransactionStatus =
  | 'OPEN'
  | 'AUTHORIZED'
  | 'COMPLETED'
  | 'PARTIALLY_RETURNED'
  | 'RETURNED'
  | 'PARTIALLY_VOIDED'
  | 'VOIDED'
  | 'CANCELLED'
  | 'CORRECTED';

export type POSLineType = 'MERCHANDISE' | 'RETURN' | 'VOID' | 'DISCOUNT' | 'FEE' | 'NON_STOCK';

export type POSInventoryDisposition =
  | 'SELLABLE'
  | 'DAMAGED'
  | 'QUARANTINE'
  | 'RETURN_TO_VENDOR'
  | 'SCRAP'
  | 'NO_STOCK_EFFECT';

export type POSInventoryBehavior =
  | 'STOCK'       // Standard physical merchandise
  | 'NON_STOCK'   // Gift cards, tips, delivery fees - zero inventory mutation
  | 'COMPOSITE'   // Bundle / Meal Deal - decomposed via BOM
  | 'CONFIGURED'; // Dynamic rule from pos_line_inventory_config

export interface CanonicalPOSLine {
  line_id: string;
  sku?: string; // Resolved SmartStock canonical SKU
  source_sku?: string; // Vendor's original SKU / variant / catalog ID
  barcode?: string;
  description?: string;
  quantity: number; // Always positive magnitude; direction determined by line_type
  source_quantity: number;
  source_uom: string;
  base_quantity: number; // After UOM conversion
  base_uom: string; // Canonical base UOM (e.g. 'EA', 'KG', 'L')
  uom_conversion_factor: number;
  unit_price?: number;
  gross_price?: number;
  discount_amount?: number;
  net_price?: number;
  tax_amount?: number;
  line_type: POSLineType;
  inventory_behavior?: POSInventoryBehavior;
  inventory_disposition?: POSInventoryDisposition;
  original_line_ref?: string; // For partial/linked returns
}

export interface CanonicalPOSTransaction {
  schema_version: '1.1';
  transaction_id: string; // SmartStock-assigned stable UUID / hash
  source_transaction_id: string; // Vendor's raw transaction ID
  source_system: string; // 'SHOPIFY' | 'SQUARE' | 'LIGHTSPEED' | 'NCR' | 'ORACLE' | 'GENERIC' etc.
  source_version?: string; // Vendor etag / updated_at / version integer
  source_sequence?: number;
  payload_hash?: string;
  tenant_id: string;
  store_id: string; // Resolved SmartStock store / location UUID
  terminal_id?: string;
  register_id?: string;
  transaction_type: POSTransactionType;
  status: POSTransactionStatus;
  business_timestamp: string; // UTC ISO 8601
  received_timestamp: string; // UTC ISO 8601
  currency: string;
  lines: CanonicalPOSLine[];
  subtotal?: number;
  tax_total?: number;
  discount_total?: number;
  grand_total?: number;
  employee_ref?: string;
  original_transaction_ref?: string;
  exchange_legs?: {
    return_lines: CanonicalPOSLine[];
    replacement_lines: CanonicalPOSLine[];
  };
  raw_payload?: Record<string, unknown>;
  metadata: Record<string, unknown>;
}
