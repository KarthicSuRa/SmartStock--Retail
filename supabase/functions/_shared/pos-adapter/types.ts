// /supabase/functions/_shared/pos-adapter/types.ts

export interface POSConfig {
  id: string;
  tenant_id: string;
  pos_type: 'webhook_cloud' | 'polling_legacy' | 'file_drop' | 'sap_cAR' | 'square' | 'shopify' | 'manual_entry';
  config: Record<string, any>;
  store_id: string;
  is_active: boolean;
  webhook_secret?: string;
}

export interface POSBasket {
  transaction_id: string;
  pos_terminal_id: string;
  store_id: string;
  tenant_id: string;
  
  // Timing
  started_at: string;
  completed_at: string;
  timezone: string;
  
  // Financial
  currency: string;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  grand_total: number;
  
  // State
  state: 'COMPLETED' | 'VOIDED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
  previous_transaction_id?: string; // For refunds linking to original
  
  // Payment breakdown
  payments: POSPayment[];
  
  // Items
  items: POSBasketItem[];
  
  // Metadata
  cashier_id?: string;
  loyalty_card?: string;
  customer_id?: string;
  receipt_number?: string;
  pos_raw_payload: any;
}

export interface POSPayment {
  method: 'CASH' | 'CARD' | 'MOBILE' | 'VOUCHER' | 'LOYALTY_POINTS';
  amount: number;
  card_last_four?: string;
  transaction_reference?: string;
}

export interface POSBasketItem {
  line_id: string;
  sku: string;
  ean_gtin?: string;
  description: string;
  quantity: number;
  uom: string;
  
  // Pricing
  unit_price: number;
  gross_price: number;
  discount_amount: number;
  net_price: number;
  tax_amount: number;
  
  // Modifiers (QSR / fashion)
  modifiers?: POSModifier[];
  
  // State
  is_return: boolean;
  is_void: boolean;
  original_line_id?: string; // For returns
  
  // Promotions
  applied_promotions?: POSAppliedPromotion[];
}

export interface POSModifier {
  modifier_group: string;
  modifier_name: string;
  price_adjustment: number;
}

export interface POSAppliedPromotion {
  promotion_id: string;
  promotion_name: string;
  discount_amount: number;
  type: 'percentage' | 'fixed_amount' | 'buy_x_get_y';
}

export interface IPOSAdapter {
  ingest(payload: any): Promise<POSBasket | POSBasket[]>;
  validate(basket: POSBasket): Promise<{ valid: boolean; errors: string[] }>;
  isDuplicate(transactionId: string): Promise<boolean>;
  toMovements(basket: POSBasket): Promise<POSMovement[]>;
  checkPrice(ean: string, storeId: string): Promise<{ sku: string; price: number; currency: string } | null>;
  checkStock(ean: string, storeId: string): Promise<{ available: boolean; qty: number }>;
}

export interface POSMovement {
  movement_id: string;
  tenant_id: string;
  store_id: string;
  sku: string;
  quantity: number; // Negative for sales, positive for returns
  uom: string;
  movement_type: 'SALE' | 'RETURN' | 'VOID' | 'DISCOUNT' | 'TAX';
  unit_price: number;
  total_price: number;
  transaction_id: string;
  line_id: string;
  pos_config_id: string;
  posted_at: string;
}
