// /supabase/functions/_shared/reorder-engine/sto-optimizer.ts

export interface STOCheckInput {
  tenantId: string;
  requestingStoreId: string;
  materialId: string;
  neededQty: number;
  uom: string;
}

export interface STOCheckResult {
  canFulfillViaSTO: boolean;
  sourceStoreId?: string;
  sourceStoreName?: string;
  availableQty?: number;
  transferCost?: number;
  externalPRNeeded: boolean;
  externalPRQty?: number;
  reasoning: string;
}

export class STOOptimizer {
  constructor(private supabase: any) {}

  async check(input: STOCheckInput): Promise<STOCheckResult> {
    const { tenantId, requestingStoreId, materialId, neededQty } = input;

    // Fetch candidate sister stores with excess stock
    const { data: candidates } = await this.supabase
      .from('live_inventory_ledger')
      .select('store_id, store_name, current_calculated_stock, reorder_point, safety_stock')
      .eq('tenant_id', tenantId)
      .eq('material_id', materialId)
      .neq('store_id', requestingStoreId)
      .gt('current_calculated_stock', 0);

    if (!candidates || candidates.length === 0) {
      return {
        canFulfillViaSTO: false,
        externalPRNeeded: true,
        externalPRQty: neededQty,
        reasoning: 'No sister stores carry this SKU'
      };
    }

    let bestSource: any = null;
    let bestScore = -Infinity;

    for (const store of candidates) {
      const safetyBuffer = (store.safety_stock || 0) + (store.reorder_point || 0);
      const excess = store.current_calculated_stock - safetyBuffer;
      if (excess <= 0) continue;

      const canFulfill = excess >= neededQty;
      const fulfillQty = canFulfill ? neededQty : excess;
      const score = excess;
      
      if (score > bestScore) {
        bestScore = score;
        bestSource = { ...store, fulfillQty, canFulfill };
      }
    }

    if (!bestSource) {
      return {
        canFulfillViaSTO: false,
        externalPRNeeded: true,
        externalPRQty: neededQty,
        reasoning: 'No sister store has excess stock above safety buffer'
      };
    }

    if (bestSource.canFulfill) {
      return {
        canFulfillViaSTO: true,
        sourceStoreId: bestSource.store_id,
        sourceStoreName: bestSource.store_name,
        availableQty: bestSource.fulfillQty,
        transferCost: 0,
        externalPRNeeded: false,
        reasoning: `Store ${bestSource.store_name} has ${bestSource.current_calculated_stock} units, can transfer ${neededQty}`
      };
    } else {
      return {
        canFulfillViaSTO: true,
        sourceStoreId: bestSource.store_id,
        sourceStoreName: bestSource.store_name,
        availableQty: bestSource.fulfillQty,
        externalPRNeeded: true,
        externalPRQty: neededQty - bestSource.fulfillQty,
        reasoning: `Partial STO: ${bestSource.fulfillQty} from ${bestSource.store_name}, remaining ${neededQty - bestSource.fulfillQty} via external PR`
      };
    }
  }
}
