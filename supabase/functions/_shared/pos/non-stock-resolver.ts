// /supabase/functions/_shared/pos/non-stock-resolver.ts
// SmartStock LiveRetail V2 — Universal Non-Stock Line Filter & Classifier

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CanonicalPOSLine, POSInventoryBehavior } from './canonical-schema.ts';

export class POSNonStockResolver {
  private static readonly BUILTIN_NON_STOCK_PATTERNS = [
    'GIFT_CARD',
    'GIFTCARD',
    'TIP',
    'TIPS',
    'DELIVERY_FEE',
    'SERVICE_CHARGE',
    'BAG_FEE',
    'WARRANTY',
    'MEMBERSHIP',
    'DEPOSIT',
    'DISCOUNT',
    'COUPON',
    'TAX',
    'ROUNDING',
  ];

  /**
   * Classifies line inventory behavior as STOCK or NON_STOCK.
   */
  static async classifyLine(
    supabase: SupabaseClient | null,
    tenantId: string,
    sourceSystem: string,
    line: CanonicalPOSLine
  ): Promise<POSInventoryBehavior> {
    // 1. Explicit line type checks
    if (line.line_type === 'FEE' || line.line_type === 'DISCOUNT' || line.line_type === 'NON_STOCK') {
      return 'NON_STOCK';
    }

    if (line.inventory_disposition === 'NO_STOCK_EFFECT') {
      return 'NON_STOCK';
    }

    // 2. Built-in pattern recognition on SKU or Description
    const textToCheck = `${line.sku || ''} ${line.source_sku || ''} ${line.description || ''}`.toUpperCase();
    for (const pattern of this.BUILTIN_NON_STOCK_PATTERNS) {
      if (textToCheck.includes(pattern)) {
        return 'NON_STOCK';
      }
    }

    // 3. Database custom rules lookup
    if (supabase) {
      const { data } = await supabase
        .from('pos_line_inventory_config')
        .select('match_type, line_identifier_pattern, inventory_behavior')
        .eq('tenant_id', tenantId)
        .eq('source_system', sourceSystem);

      if (data && data.length > 0) {
        for (const rule of data) {
          if (rule.match_type === 'EXACT_SKU' && (line.sku === rule.line_identifier_pattern || line.source_sku === rule.line_identifier_pattern)) {
            return rule.inventory_behavior as POSInventoryBehavior;
          }
          if (rule.match_type === 'SKU_PREFIX' && (line.sku?.startsWith(rule.line_identifier_pattern) || line.source_sku?.startsWith(rule.line_identifier_pattern))) {
            return rule.inventory_behavior as POSInventoryBehavior;
          }
          if (rule.match_type === 'NAME_CONTAINS' && textToCheck.includes(rule.line_identifier_pattern.toUpperCase())) {
            return rule.inventory_behavior as POSInventoryBehavior;
          }
        }
      }
    }

    return line.inventory_behavior || 'STOCK';
  }
}
