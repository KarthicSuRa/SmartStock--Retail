// /supabase/functions/_shared/pos/barcode-decoder.ts
// SmartStock LiveRetail V2 — Grocery Weighted Barcode & PLU Decoder

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface DecodedBarcode {
  is_weighted: boolean;
  plu_sku: string;
  quantity: number;
  uom: string;
  embedded_price?: number;
}

export class POSBarcodeDecoder {
  /**
   * Decodes variable-weight and price-embedded barcodes commonly used in grocery (e.g. EAN-13 prefix 20-29).
   */
  static async decode(
    supabase: SupabaseClient | null,
    tenantId: string,
    barcode: string
  ): Promise<DecodedBarcode | null> {
    if (!barcode || barcode.length < 12) {
      return null;
    }

    const prefix2 = barcode.substring(0, 2);

    // Standard GS1 variable measure prefix: 20-29
    if (['20', '21', '22', '23', '24', '25', '26', '27', '28', '29'].includes(prefix2)) {
      // 1. Check custom rules in pos_barcode_rules if DB available
      if (supabase) {
        const { data: rule } = await supabase
          .from('pos_barcode_rules')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('prefix', prefix2)
          .maybeSingle();

        if (rule) {
          const plu = barcode.substring(rule.plu_start_pos, rule.plu_start_pos + rule.plu_length);
          const rawQty = parseInt(barcode.substring(rule.quantity_start_pos, rule.quantity_start_pos + rule.quantity_length), 10);
          const qty = isNaN(rawQty) ? 1.0 : rawQty / Number(rule.quantity_divisor || 1000);

          return {
            is_weighted: true,
            plu_sku: `PLU-${plu}`,
            quantity: qty,
            uom: rule.quantity_uom || 'KG',
          };
        }
      }

      // 2. Standard EAN-13 Weight-Embedded Heuristic:
      // Positions: [Prefix: 2 chars] [PLU: 5 chars] [Weight: 5 chars in grams] [Check: 1 char]
      // Example: 2100418012835 -> PLU: 00418, Weight: 01283g = 1.283 KG
      const plu = barcode.substring(2, 7);
      const weightInGrams = parseInt(barcode.substring(7, 12), 10);
      const qty = isNaN(weightInGrams) ? 1.0 : weightInGrams / 1000.0;

      return {
        is_weighted: true,
        plu_sku: `PLU-${plu}`,
        quantity: qty,
        uom: 'KG',
      };
    }

    return null;
  }
}
