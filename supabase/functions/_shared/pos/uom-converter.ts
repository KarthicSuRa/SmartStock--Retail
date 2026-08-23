// /supabase/functions/_shared/pos/uom-converter.ts
// SmartStock LiveRetail V2 — Universal UOM Conversion Engine

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface UOMConversionResult {
  base_quantity: number;
  base_uom: string;
  conversion_factor: number;
  is_fractional: boolean;
}

export class POSUOMConverter {
  /**
   * Converts a POS source quantity and UOM to SmartStock base inventory units.
   */
  static async convert(
    supabase: SupabaseClient | null,
    tenantId: string,
    sku: string,
    sourceQuantity: number,
    sourceUOM = 'EA'
  ): Promise<UOMConversionResult> {
    const normSourceUOM = sourceUOM.toUpperCase().trim();
    const isFractional = !Number.isInteger(sourceQuantity);

    // 1. Same unit / Default standard units
    if (['EA', 'PC', 'UNIT', 'PIECE'].includes(normSourceUOM)) {
      return {
        base_quantity: sourceQuantity,
        base_uom: 'PC',
        conversion_factor: 1.0,
        is_fractional: isFractional,
      };
    }

    // 2. Metric weight preservation (KG / G)
    if (normSourceUOM === 'KG') {
      return {
        base_quantity: sourceQuantity,
        base_uom: 'KG',
        conversion_factor: 1.0,
        is_fractional: true,
      };
    }

    if (normSourceUOM === 'G' || normSourceUOM === 'GR') {
      return {
        base_quantity: sourceQuantity / 1000.0,
        base_uom: 'KG',
        conversion_factor: 0.001,
        is_fractional: true,
      };
    }

    // 3. Database conversion rule lookup
    if (supabase) {
      const { data } = await supabase
        .from('pos_uom_conversions')
        .select('base_uom, factor')
        .eq('tenant_id', tenantId)
        .eq('sku', sku)
        .eq('source_uom', normSourceUOM)
        .maybeSingle();

      if (data) {
        const factor = Number(data.factor);
        return {
          base_quantity: sourceQuantity * factor,
          base_uom: data.base_uom,
          conversion_factor: factor,
          is_fractional: isFractional || !Number.isInteger(sourceQuantity * factor),
        };
      }
    }

    // 4. Fallback: Common heuristic conversions if not in DB
    if (normSourceUOM === 'CASE' || normSourceUOM === 'CS') {
      // Default case pack factor 12 if unspecified
      return {
        base_quantity: sourceQuantity * 12.0,
        base_uom: 'PC',
        conversion_factor: 12.0,
        is_fractional: false,
      };
    }

    if (normSourceUOM === '6PACK' || normSourceUOM === '6PK') {
      return {
        base_quantity: sourceQuantity * 6.0,
        base_uom: 'PC',
        conversion_factor: 6.0,
        is_fractional: false,
      };
    }

    // Pass through
    return {
      base_quantity: sourceQuantity,
      base_uom: normSourceUOM,
      conversion_factor: 1.0,
      is_fractional: isFractional,
    };
  }
}
