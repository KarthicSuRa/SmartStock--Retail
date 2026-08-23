// /supabase/functions/_shared/pos/bom-decomposer.ts
// SmartStock LiveRetail V2 — POS Product Bundle & Composition Decomposer

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CanonicalPOSLine } from './canonical-schema.ts';

export interface BOMComponent {
  bundle_sku: string;
  component_sku: string;
  component_quantity: number;
  component_uom: string;
}

export class POSBOMDecomposer {
  /**
   * Decomposes bundle/composite lines in a transaction into physical component lines.
   */
  static async decomposeLines(
    supabase: SupabaseClient | null,
    tenantId: string,
    lines: CanonicalPOSLine[]
  ): Promise<CanonicalPOSLine[]> {
    const decomposed: CanonicalPOSLine[] = [];

    for (const line of lines) {
      if (line.inventory_behavior !== 'COMPOSITE') {
        decomposed.push(line);
        continue;
      }

      const bundleSku = line.sku || line.source_sku || 'UNKNOWN_BUNDLE';

      // Lookup components from DB if supabase client available
      let components: BOMComponent[] = [];
      if (supabase) {
        const { data } = await supabase
          .from('pos_product_bom')
          .select('bundle_sku, component_sku, component_quantity, component_uom')
          .eq('tenant_id', tenantId)
          .eq('bundle_sku', bundleSku);

        if (data && data.length > 0) {
          components = data.map((d: any) => ({
            bundle_sku: d.bundle_sku,
            component_sku: d.component_sku,
            component_quantity: Number(d.component_quantity),
            component_uom: d.component_uom,
          }));
        }
      }

      if (components.length > 0) {
        for (let i = 0; i < components.length; i++) {
          const comp = components[i];
          const totalQty = line.quantity * comp.component_quantity;

          decomposed.push({
            line_id: `${line.line_id}_comp_${i}`,
            sku: comp.component_sku,
            source_sku: comp.component_sku,
            description: `${line.description || bundleSku} (Component: ${comp.component_sku})`,
            quantity: totalQty,
            source_quantity: totalQty,
            source_uom: comp.component_uom,
            base_quantity: totalQty,
            base_uom: comp.component_uom,
            uom_conversion_factor: 1.0,
            line_type: line.line_type,
            inventory_behavior: 'STOCK',
            inventory_disposition: line.inventory_disposition || 'SELLABLE',
            original_line_ref: line.line_id,
          });
        }
      } else {
        // Fallback: pass through if no BOM found
        decomposed.push(line);
      }
    }

    return decomposed;
  }
}
